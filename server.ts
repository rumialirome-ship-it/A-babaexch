import express from "express";
import path from "path";
import cors from "cors";
import jwt from "jsonwebtoken";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import * as database from "./server/database";
import { authMiddleware, AuthRequest } from "./server/authMiddleware";

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

async function startServer() {
  app.use(cors());
  app.use(express.json());

  const isProd = process.env.NODE_ENV === "production";
  
  console.error(`--- [SERVER] Starting on PORT: ${PORT} ---`);
  console.error(`--- [SERVER] NODE_ENV: ${process.env.NODE_ENV} ---`);
  console.error(`--- [SERVER] isProd: ${isProd} ---`);

  // --- AUTOMATIC GAME RESET SCHEDULER ---
  const PKT_OFFSET_HOURS = 5;
  const RESET_HOUR_PKT = 16; // 4:00 PM PKT
  let resetTimer: NodeJS.Timeout | null = null;

  function scheduleNextGameReset() {
      if (resetTimer) clearTimeout(resetTimer);
      
      const now = new Date();
      const resetHourUTC = RESET_HOUR_PKT - PKT_OFFSET_HOURS;
      let resetTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), resetHourUTC, 0, 5, 0));

      if (now >= resetTime) {
          resetTime.setUTCDate(resetTime.getUTCDate() + 1);
      }

      const delay = resetTime.getTime() - now.getTime();
      console.error('--- [SCHEDULER] Next reset at: ' + resetTime.toUTCString() + ' ---');
      
      resetTimer = setTimeout(() => {
          try { 
              database.resetAllGames(); 
          } catch (e: any) { 
              console.error('--- [SCHEDULER] Error: ' + (e.message || e) + ' ---'); 
          }
          scheduleNextGameReset();
      }, delay);
  }

  // --- AUTHENTICATION ROUTES ---
  app.post('/api/auth/login', (req, res) => {
      try {
          if (!req.body || !req.body.loginId) return res.status(400).json({ message: 'Input required.' });
          const result = database.findAccountForLogin(req.body.loginId);
          if (result.account && result.account.password === req.body.password) {
              const table = result.role!.toLowerCase() + 's';
              const fullAccount = database.findAccountById(result.account.id, table);
              const token = jwt.sign({ id: result.account.id, role: result.role }, JWT_SECRET, { expiresIn: '1d' });
              return res.json({ token: token, role: result.role, account: fullAccount });
          }
          res.status(401).json({ message: 'ID or Password incorrect.' });
      } catch (e: any) {
          console.error('--- [SERVER] Login crash: ' + (e.message || e) + ' ---');
          res.status(500).json({ message: 'Server error' });
      }
  });

  app.get('/api/auth/verify', authMiddleware, (req: AuthRequest, res) => {
      try {
          const user = req.user!;
          const role = user.role;
          const table = role.toLowerCase() + 's';
          const account = database.findAccountById(user.id, table);
          if (!account) return res.status(404).json({ message: 'User not found.' });
          
          let extra: any = {
              games: database.getAllFromTable('games')
          };
          if (role === 'DEALER') {
              extra.users = database.findUsersByDealerId(user.id);
              extra.bets = database.findBetsByDealerId(user.id);
          } else if (role === 'USER') {
              extra.bets = database.findBetsByUserId(user.id);
          } else if (role === 'ADMIN') {
              extra.dealers = database.getAllFromTable('dealers', true);
              extra.users = database.getAllFromTable('users', true);
              extra.bets = database.getAllFromTable('bets');
          }
          res.json(Object.assign({ account: account, role: role }, extra));
      } catch (e) {
          res.sendStatus(500);
      }
  });

  // --- DATA ROUTES ---
  app.get('/api/games', (req, res) => {
      try {
          const data = database.getAllFromTable('games');
          console.error(`--- [SERVER] GET /api/games | Count: ${data ? data.length : 0} ---`);
          if (data && data.length > 0) {
              console.error(`--- [SERVER] First Game ID: ${data[0].id}, Name: ${data[0].name} ---`);
          } else {
              console.error(`--- [SERVER] WARNING: No games found in database! ---`);
          }
          res.json(data || []);
      } catch (e: any) {
          console.error(`--- [SERVER] GET /api/games CRASH: ${e.message} ---`);
          res.status(500).json({ error: 'DB Error' });
      }
  });

  const getDealerId = (req: AuthRequest) => {
      if (req.user!.role === 'ADMIN' && req.headers['x-impersonate-dealer-id']) {
          return req.headers['x-impersonate-dealer-id'] as string;
      }
      return req.user!.id;
  };

  app.get('/api/health', (req, res) => {
      const stats = database.getStats();
      res.json({ 
          status: 'ok', 
          time: new Date().toISOString(),
          port: PORT, 
          env: process.env.NODE_ENV, 
          database: stats 
      });
  });

  app.get('/api/user/data', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'USER') return res.sendStatus(403);
      res.json({ 
          account: database.findAccountById(req.user!.id, 'users'), 
          games: database.getAllFromTable('games'), 
          bets: database.findBetsByUserId(req.user!.id) 
      });
  });

  app.get('/api/dealer/data', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'DEALER' && req.user!.role !== 'ADMIN') return res.sendStatus(403);
      const dId = getDealerId(req);
      res.json({ 
          account: database.findAccountById(dId, 'dealers'), 
          users: database.findUsersByDealerId(dId), 
          games: database.getAllFromTable('games'),
          bets: database.findBetsByDealerId(dId) 
      });
  });

  app.get('/api/admin/data', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'ADMIN') return res.sendStatus(403);
      res.json({ 
          account: database.findAccountById(req.user!.id, 'admins'), 
          dealers: database.getAllFromTable('dealers', true), 
          users: database.getAllFromTable('users', true), 
          games: database.getAllFromTable('games'), 
          bets: database.getAllFromTable('bets') 
      });
  });

  // --- ACTION ROUTES ---
  app.post('/api/user/bets', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'USER') return res.sendStatus(403);
      const body = req.body;
      try {
          if (body.isMultiGame && body.multiGameBets) {
              const results: any[] = [];
              database.runInTransaction(() => {
                  const keys = Object.keys(body.multiGameBets);
                  for (var i = 0; i < keys.length; i++) {
                      const gameId = keys[i];
                      const entry = body.multiGameBets[gameId];
                      const processed = database.placeBulkBets(req.user!.id, gameId, entry.betGroups);
                      if (processed && Array.isArray(processed)) {
                          for (var j = 0; j < processed.length; j++) {
                              results.push(processed[j]);
                          }
                      }
                  }
              });
              res.status(201).json(results);
          } else {
              res.status(201).json(database.placeBulkBets(req.user!.id, body.gameId, body.betGroups));
          }
      } catch (e: any) {
          res.status(400).json({ message: e.message || 'Processing failed' });
      }
  });

  app.post('/api/dealer/bets/bulk', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'DEALER' && req.user!.role !== 'ADMIN') return res.sendStatus(403);
      const dId = getDealerId(req);
      try { res.status(201).json(database.placeBulkBets(req.body.userId, req.body.gameId, req.body.betGroups)); }
      catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post('/api/dealer/users', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'DEALER' && req.user!.role !== 'ADMIN') return res.sendStatus(403);
      const dId = getDealerId(req);
      try { res.status(201).json(database.createUser(req.body.userData, dId, req.body.initialDeposit)); }
      catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put('/api/dealer/users/:id', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'DEALER' && req.user!.role !== 'ADMIN') return res.sendStatus(403);
      const dId = getDealerId(req);
      try { res.json(database.updateUser(req.body, req.params.id, dId)); }
      catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete('/api/dealer/users/:id', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'DEALER' && req.user!.role !== 'ADMIN') return res.sendStatus(403);
      const dId = getDealerId(req);
      try { database.deleteUserByDealer(req.params.id, dId); res.sendStatus(204); }
      catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post('/api/dealer/topup/user', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'DEALER' && req.user!.role !== 'ADMIN') return res.sendStatus(403);
      const dId = getDealerId(req);
      try {
          const { userId, amount } = req.body;
          const user = database.findUserByDealer(userId, dId);
          if (!user) throw new Error('User not found in your network.');

          database.runInTransaction(() => {
              database.addLedgerEntry(dId, 'DEALER', 'User funding: ' + userId, amount, 0);
              database.addLedgerEntry(userId, 'USER', 'Wallet refill', 0, amount);
          });
          res.json({ message: "Success" });
      } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post('/api/dealer/withdraw/user', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'DEALER' && req.user!.role !== 'ADMIN') return res.sendStatus(403);
      const dId = getDealerId(req);
      try {
          const { userId, amount } = req.body;
          const user = database.findUserByDealer(userId, dId);
          if (!user) throw new Error('User not found in your network.');
          
          database.runInTransaction(() => {
              database.addLedgerEntry(userId, 'USER', 'Withdrawal by Dealer', amount, 0);
              database.addLedgerEntry(dId, 'DEALER', 'User withdrawal credit: ' + userId, 0, amount);
          });
          res.json({ message: "Success" });
      } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.put('/api/dealer/users/:id/toggle-restriction', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'DEALER' && req.user!.role !== 'ADMIN') return res.sendStatus(403);
      const dId = getDealerId(req);
      try { res.json(database.toggleUserRestrictionByDealer(req.params.id, dId)); }
      catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put('/api/dealer/profile', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'DEALER' && req.user!.role !== 'ADMIN') return res.sendStatus(403);
      const dId = getDealerId(req);
      try { res.json(database.updateDealerProfile(dId, req.body)); }
      catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // --- ADMIN ROUTES ---
  app.get('/api/admin/summary', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'ADMIN') return res.sendStatus(403);
      res.json(database.getFinancialSummary());
  });

  app.get('/api/admin/number-summary', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'ADMIN') return res.sendStatus(403);
      res.json(database.getNumberStakeSummary(req.query));
  });

  app.post('/api/admin/dealers', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'ADMIN') return res.sendStatus(403);
      try { res.status(201).json(database.createDealer(req.body)); }
      catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.put('/api/admin/dealers/:id', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'ADMIN') return res.sendStatus(403);
      try { res.json(database.updateDealer(req.body, req.params.id)); }
      catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.put('/api/admin/users/:id', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'ADMIN') return res.sendStatus(403);
      try { res.json(database.updateUserByAdmin(req.body, req.params.id)); }
      catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.put('/api/admin/profile', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'ADMIN') return res.sendStatus(403);
      try { res.json(database.updateAdmin(req.body, req.user!.id)); }
      catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post('/api/admin/topup-self', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'ADMIN') return res.sendStatus(403);
      try {
          const { amount } = req.body;
          if (!amount || amount <= 0) throw new Error('Invalid amount');
          res.json(database.topupAdminWallet(req.user!.id, amount));
      } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post('/api/admin/topup/dealer', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'ADMIN') return res.sendStatus(403);
      try {
          const { dealerId, amount } = req.body;
          database.runInTransaction(() => {
              database.addLedgerEntry(req.user!.id, 'ADMIN', `Funding Dealer ${dealerId}`, amount, 0);
              database.addLedgerEntry(dealerId, 'DEALER', 'Deposit from Admin', 0, amount);
          });
          res.json({ message: "Success" });
      } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post('/api/admin/withdraw/dealer', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'ADMIN') return res.sendStatus(403);
      try {
          const { dealerId, amount } = req.body;
          database.runInTransaction(() => {
              database.addLedgerEntry(dealerId, 'DEALER', 'Withdrawal by Admin', amount, 0);
              database.addLedgerEntry(req.user!.id, 'ADMIN', `Withdrawal from ${dealerId}`, 0, amount);
          });
          res.json({ message: "Success" });
      } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.put('/api/admin/accounts/:type/:id/toggle-restriction', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'ADMIN') return res.sendStatus(403);
      try { res.json(database.toggleAccountRestrictionByAdmin(req.params.id, req.params.type)); }
      catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post('/api/admin/bulk-bet', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'ADMIN') return res.sendStatus(403);
      try { res.status(201).json(database.placeBulkBets(req.body.userId, req.body.gameId, req.body.betGroups)); }
      catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post('/api/admin/games/:id/declare-winner', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'ADMIN') return res.sendStatus(403);
      try { res.json(database.declareWinnerForGame(req.params.id, req.body.winningNumber, req.user!.name)); }
      catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.put('/api/admin/games/:id/update-winner', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'ADMIN') return res.sendStatus(403);
      try { res.json(database.updateWinningNumber(req.params.id, req.body.newWinningNumber, req.user!.name)); }
      catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post('/api/admin/games/:id/approve-payouts', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'ADMIN') return res.sendStatus(403);
      try { res.json(database.approvePayoutsForGame(req.params.id)); }
      catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.put('/api/admin/games/:id/draw-time', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'ADMIN') return res.sendStatus(403);
      try { res.json(database.updateGameDrawTime(req.params.id, req.body.newDrawTime)); }
      catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // --- NUMBER LIMITS ---
  app.get('/api/admin/number-limits', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'ADMIN') return res.sendStatus(403);
      res.json(database.getAllNumberLimits());
  });

  app.post('/api/admin/number-limits', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'ADMIN') return res.sendStatus(403);
      try { res.json(database.saveNumberLimit(req.body)); }
      catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.delete('/api/admin/number-limits/:id', authMiddleware, (req: AuthRequest, res) => {
      if (req.user!.role !== 'ADMIN') return res.sendStatus(403);
      try { database.deleteNumberLimit(req.params.id); res.sendStatus(204); }
      catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // --- AI SERVICES ---
  app.post('/api/user/ai-lucky-pick', authMiddleware, async (req: AuthRequest, res) => {
      const key = process.env.GEMINI_API_KEY;
      if (!key) return res.status(503).json({ message: "AI disabled" });
      try {
          const ai = new GoogleGenAI(key);
          const { gameType, count = 5 } = req.body;
          const p = "Give " + count + " lucky nums for " + gameType + ". CSV format.";
          const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
          const r = await model.generateContent(p);
          res.json({ luckyNumbers: r.response.text() });
      } catch (e) { res.status(500).json({ message: "AI error" }); }
  });

  // Vite middleware for development
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      // Fix for Express 5 wildcard error: Missing parameter name at index 1: *
      app.get(/^\/(?!api).*/, (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    } else {
      console.error('--- [SERVER] ERROR: dist folder not found. Please run npm run build. ---');
    }
  }

  database.connect();
  database.verifySchema();
  scheduleNextGameReset();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
