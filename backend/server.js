
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./authMiddleware');
const { GoogleGenAI } = require('@google/genai');
const database = require('./database');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

// --- ROBUST CLOCK-SYNCHRONIZED SCHEDULER ---
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
const RESET_HOUR_PKT = 16; // 4:00 PM PKT
let lastResetDate = null;

/**
 * Checks the current time in PKT and triggers a database reset 
 * if we have reached or passed 4:00 PM on a new day.
 */
function checkMarketSync() {
    const now = new Date();
    // Convert current UTC time to Pakistan Time (PKT) for calculation
    const pktNow = new Date(now.getTime() + PKT_OFFSET_MS);
    
    const currentHours = pktNow.getUTCHours();
    const currentDayKey = `${pktNow.getUTCFullYear()}-${pktNow.getUTCMonth()}-${pktNow.getUTCDate()}`;

    // If it is 4:00 PM or later and we haven't reset for today yet
    if (currentHours >= RESET_HOUR_PKT && lastResetDate !== currentDayKey) {
        console.error(`--- [SCHEDULER] Triggering 4:00 PM PKT Market Reset (${pktNow.toUTCString()}) ---`);
        try {
            database.resetAllGames();
            lastResetDate = currentDayKey;
        } catch (error) {
            console.error('[SCHEDULER ERROR] Market reset failed:', error);
        }
    }
}

const JWT_SECRET = process.env.JWT_SECRET;

// --- AUTHENTICATION ROUTES ---
app.post('/api/auth/login', (req, res) => {
    const { loginId, password } = req.body;
    const { account, role } = database.findAccountForLogin(loginId);
    if (account && account.password === password) {
        const fullAccount = database.findAccountById(account.id, role.toLowerCase() + 's');
        const token = jwt.sign({ id: account.id, role }, JWT_SECRET, { expiresIn: '1d' });
        return res.json({ token, role, account: fullAccount });
    }
    res.status(401).json({ message: 'Invalid Account ID or Password.' });
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
    const role = req.user.role;
    const table = role.toLowerCase() + 's';
    const account = database.findAccountById(req.user.id, table);
    if (!account) return res.status(404).json({ message: 'Account not found.' });
    
    let extra = {};
    if (role === 'DEALER') {
        extra.users = database.findUsersByDealerId(req.user.id);
        extra.bets = database.findBetsByDealerId(req.user.id);
    } else if (role === 'USER') {
        extra.bets = database.findBetsByUserId(req.user.id);
    } else if (role === Role.Admin) {
        extra.dealers = database.getAllFromTable('dealers', true);
        extra.users = database.getAllFromTable('users', true);
        extra.bets = database.getAllFromTable('bets');
    }
    
    res.json({ account, role, ...extra });
});

app.post('/api/auth/reset-password', (req, res) => {
    const { accountId, contact, newPassword } = req.body;
    if (database.updatePassword(accountId, contact, newPassword)) res.json({ message: 'Success' });
    else res.status(404).json({ message: 'Invalid credentials' });
});

app.get('/api/games', (req, res) => {
    res.json(database.getAllFromTable('games'));
});

app.post('/api/user/ai-lucky-pick', authMiddleware, async (req, res) => {
    const { gameType, count = 5 } = req.body;
    const API_KEY = process.env.API_KEY;
    if (!API_KEY) return res.status(503).json({ message: "AI services are currently unavailable." });
    try {
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        const prompt = `Lucky numbers for a "${gameType}" game. Generate ${count} unique. Return ONLY numbers separated by commas.`;
        const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
        res.json({ luckyNumbers: response.text.replace(/\s+/g, '') });
    } catch (error) {
        res.status(500).json({ message: "Oracle unavailable." });
    }
});

app.get('/api/user/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'USER') return res.sendStatus(403);
    res.json({ account: database.findAccountById(req.user.id, 'users'), games: database.getAllFromTable('games'), bets: database.findBetsByUserId(req.user.id) });
});

app.get('/api/dealer/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    res.json({ account: database.findAccountById(req.user.id, 'dealers'), users: database.findUsersByDealerId(req.user.id), bets: database.findBetsByDealerId(req.user.id) });
});

app.get('/api/admin/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    res.json({ account: database.findAccountById(req.user.id, 'admins'), dealers: database.getAllFromTable('dealers', true), users: database.getAllFromTable('users', true), games: database.getAllFromTable('games'), bets: database.getAllFromTable('bets') });
});

app.post('/api/user/bets', authMiddleware, (req, res) => {
    if (req.user.role !== 'USER') return res.sendStatus(403);
    const { isMultiGame, multiGameBets, gameId, betGroups } = req.body;
    try {
        if (isMultiGame && multiGameBets) {
            const results = [];
            database.runInTransaction(() => {
                for (const [gId, data] of Object.entries(multiGameBets)) {
                    const processed = database.placeBulkBets(req.user.id, gId, data.betGroups, 'USER');
                    if (processed) results.push(...processed);
                }
            });
            res.status(201).json(results);
        } else {
            res.status(201).json(database.placeBulkBets(req.user.id, gameId, betGroups, 'USER'));
        }
    } catch (e) {
        res.status(e.status || 400).json({ message: e.message });
    }
});

app.post('/api/dealer/bets/bulk', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try { res.status(201).json(database.placeBulkBets(req.body.userId, req.body.gameId, req.body.betGroups, 'DEALER')); }
    catch (e) { res.status(e.status || 400).json({ message: e.message }); }
});

app.post('/api/dealer/users', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try { res.status(201).json(database.createUser(req.body.userData, req.user.id, req.body.initialDeposit)); }
    catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.put('/api/dealer/users/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try { res.json(database.updateUser(req.body, req.params.id, req.user.id)); }
    catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.put('/api/admin/users/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.updateUserByAdmin(req.body, req.params.id)); }
    catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.post('/api/dealer/topup/user', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try {
        const dealer = database.findAccountById(req.user.id, 'dealers');
        const user = database.findUserByDealer(req.body.userId, req.user.id);
        if (!user || dealer.wallet < req.body.amount) throw { status: 400, message: "Invalid request" };
        database.runInTransaction(() => {
            database.addLedgerEntry(dealer.id, 'DEALER', `Top-Up for ${user.name}`, req.body.amount, 0);
            database.addLedgerEntry(user.id, 'USER', `Top-up from Dealer`, 0, req.body.amount);
        });
        res.json({ message: "Success" });
    } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.get('/api/admin/summary', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    res.json(database.getFinancialSummary());
});

app.post('/api/admin/games/:id/declare-winner', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    res.json(database.declareWinnerForGame(req.params.id, req.body.winningNumber));
});

app.put('/api/admin/games/:id/update-winner', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.updateWinningNumber(req.params.id, req.body.newWinningNumber)); }
    catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.post('/api/admin/games/:id/approve-payouts', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.approvePayoutsForGame(req.params.id)); }
    catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

const startServer = () => {
  database.connect();
  database.verifySchema();
  
  // Set initial reset state to today if we are already past 4 PM
  const now = new Date();
  const pktNow = new Date(now.getTime() + PKT_OFFSET_MS);
  if (pktNow.getUTCHours() >= RESET_HOUR_PKT) {
      lastResetDate = `${pktNow.getUTCFullYear()}-${pktNow.getUTCMonth()}-${pktNow.getUTCDate()}`;
  }

  // Monitor every 60 seconds to see if it's time to reset
  setInterval(checkMarketSync, 60000);
  
  app.listen(3001, () => console.error('>>> A-BABA SERVER LIVE: PORT 3001 <<<'));
};
startServer();
