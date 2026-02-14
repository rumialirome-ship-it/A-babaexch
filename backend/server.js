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

// --- AUTOMATIC GAME RESET SCHEDULER ---
const PKT_OFFSET_HOURS = 5;
const RESET_HOUR_PKT = 16; // 4:00 PM PKT

let resetTimer = null;

function scheduleNextGameReset() {
    if (resetTimer) clearTimeout(resetTimer);
    
    const now = new Date();
    const resetHourUTC = RESET_HOUR_PKT - PKT_OFFSET_HOURS;

    // Boundary check for PKT 4 PM
    let resetTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), resetHourUTC, 0, 5, 0));

    if (now >= resetTime) {
        resetTime.setUTCDate(resetTime.getUTCDate() + 1);
    }

    const delay = resetTime.getTime() - now.getTime();
    console.error(`--- [SCHEDULER] Next daily reset at: ${resetTime.toUTCString()} ---`);
    
    resetTimer = setTimeout(() => {
        try { 
            database.resetAllGames(); 
        } catch (e) { 
            console.error('--- [SCHEDULER] Reset error:', e.message || e); 
        }
        scheduleNextGameReset();
    }, delay);
}

const JWT_SECRET = process.env.JWT_SECRET;

// --- AUTHENTICATION ROUTES ---
app.post('/api/auth/login', (req, res) => {
    try {
        if (!req.body) return res.status(400).json({ message: 'Request body required.' });
        const { loginId, password } = req.body;
        const { account, role } = database.findAccountForLogin(loginId);
        if (account && account.password === password) {
            const fullAccount = database.findAccountById(account.id, role.toLowerCase() + 's');
            const token = jwt.sign({ id: account.id, role }, JWT_SECRET, { expiresIn: '1d' });
            return res.json({ token, role, account: fullAccount });
        }
        res.status(401).json({ message: 'Invalid Account ID or Password.' });
    } catch (e) {
        console.error('--- [SERVER] Login error:', e.message || e);
        res.status(500).json({ message: 'Internal server error.' });
    }
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
    } else if (role === 'ADMIN') {
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

// --- PUBLIC DATA ---
app.get('/api/games', (req, res) => {
    res.json(database.getAllFromTable('games'));
});

// --- AI LUCKY PICK ---
app.post('/api/user/ai-lucky-pick', authMiddleware, async (req, res) => {
    const { gameType, count = 5 } = req.body;
    const API_KEY = process.env.API_KEY;
    if (!API_KEY) return res.status(503).json({ message: "AI services unavailable." });
    try {
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        const prompt = `Generate ${count} unique lucky numbers for a "${gameType}" game. Return ONLY numbers separated by commas.`;
        const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
        res.json({ luckyNumbers: response.text.replace(/\s+/g, '') });
    } catch (error) {
        res.status(500).json({ message: "Oracle unavailable." });
    }
});

// --- DATA ROUTES ---
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

// --- ACTION ROUTES ---
app.post('/api/user/bets', authMiddleware, (req, res) => {
    if (req.user.role !== 'USER') return res.sendStatus(403);
    const { isMultiGame, multiGameBets, gameId, betGroups } = req.body;
    try {
        if (isMultiGame && multiGameBets) {
            const results = [];
            database.runInTransaction(() => {
                for (const [gId, data] of Object.entries(multiGameBets)) {
                    // Problem 1 FIX: TypeScript casting strictly removed
                    const processed = database.placeBulkBets(req.user.id, gId, data.betGroups, 'USER');
                    if (processed && Array.isArray(processed)) {
                        results.push(...processed);
                    }
                }
            });
            res.status(201).json(results);
        } else {
            res.status(201).json(database.placeBulkBets(req.user.id, gameId, betGroups, 'USER'));
        }
    } catch (e) {
        res.status(e.status || 400).json({ message: e.message || 'Error processing request' });
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

app.delete('/api/dealer/users/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try { database.deleteUserByDealer(req.params.id, req.user.id); res.sendStatus(204); }
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

app.post('/api/dealer/withdraw/user', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try {
        const dealer = database.findAccountById(req.user.id, 'dealers');
        const user = database.findUserByDealer(req.body.userId, req.user.id);
        if (!user || user.wallet < req.body.amount) throw { status: 400, message: "Invalid request" };
        database.runInTransaction(() => {
            database.addLedgerEntry(user.id, 'USER', `Withdrawal by Dealer`, req.body.amount, 0);
            database.addLedgerEntry(dealer.id, 'DEALER', `Withdrawn from ${user.name}`, 0, req.body.amount);
        });
        res.json({ message: "Success" });
    } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.put('/api/dealer/users/:id/toggle-restriction', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try { res.json(database.toggleUserRestrictionByDealer(req.params.id, req.user.id)); }
    catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.get('/api/admin/summary', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    res.json(database.getFinancialSummary());
});

app.get('/api/admin/number-summary', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    res.json(database.getNumberStakeSummary(req.query));
});

app.post('/api/admin/dealers', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.status(201).json(database.createDealer(req.body)); }
    catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/admin/dealers/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.updateDealer(req.body, req.params.id)); }
    catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.put('/api/admin/profile', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.updateAdmin(req.body, req.user.id)); }
    catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.post('/api/admin/topup/dealer', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try {
        const dealer = database.findAccountById(req.body.dealerId, 'dealers');
        const admin = database.findAccountById('Guru', 'admins');
        if (!dealer || admin.wallet < req.body.amount) throw { status: 400, message: "Invalid request" };
        database.runInTransaction(() => {
            database.addLedgerEntry('Guru', 'ADMIN', `Top-up for ${dealer.name}`, req.body.amount, 0);
            database.addLedgerEntry(dealer.id, 'DEALER', 'Top-up from Admin', 0, req.body.amount);
        });
        res.json({ message: "Success" });
    } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.post('/api/admin/withdraw/dealer', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try {
        const dealer = database.findAccountById(req.body.dealerId, 'dealers');
        if (!dealer || dealer.wallet < req.body.amount) throw { status: 400, message: "Invalid request" };
        database.runInTransaction(() => {
            database.addLedgerEntry(dealer.id, 'DEALER', `Withdrawal by Admin`, req.body.amount, 0);
            database.addLedgerEntry('Guru', 'ADMIN', `Withdrawn from ${dealer.name}`, 0, req.body.amount);
        });
        res.json({ message: "Success" });
    } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.put('/api/admin/accounts/:type/:id/toggle-restriction', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.toggleAccountRestrictionByAdmin(req.params.id, req.params.type)); }
    catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.post('/api/admin/games/:id/declare-winner', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try {
        res.json(database.declareWinnerForGame(req.params.id, req.body.winningNumber));
    } catch (e) {
        res.status(400).json({ message: e.message || 'Declaration failed' });
    }
});

app.put('/api/admin/games/:id/update-winner', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.updateWinningNumber(req.params.id, req.body.newWinningNumber)); }
    catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.put('/api/admin/games/:id/draw-time', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.updateGameDrawTime(req.params.id, req.body.newDrawTime)); }
    catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.post('/api/admin/games/:id/approve-payouts', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.approvePayoutsForGame(req.params.id)); }
    catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.get('/api/admin/number-limits', authMiddleware, (req, res) => res.json(database.getAllNumberLimits()));
app.post('/api/admin/number-limits', authMiddleware, (req, res) => res.json(database.saveNumberLimit(req.body)));
app.delete('/api/admin/number-limits/:id', authMiddleware, (req, res) => { database.deleteNumberLimit(req.params.id); res.sendStatus(204); });

const startServer = () => {
  database.connect();
  database.verifySchema();
  
  // Problem 5 ASSURANCE: Forced market reset is NOT called here.
  // Resets ONLY occur at 4:00 PM PKT via the scheduleNextGameReset function above.
  // Today's bets and results are safe during PM2 reloads.
  
  scheduleNextGameReset();
  app.listen(3001, () => console.error('>>> [SERVER] A-BABA BACKEND IS LIVE ON PORT 3001 <<<'));
};
startServer();