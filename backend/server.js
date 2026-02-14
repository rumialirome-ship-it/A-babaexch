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

// --- UTILITIES ---
const logError = (context, error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`>>> [${context}] ERROR: ${message} <<<`);
};

// --- AUTOMATIC GAME RESET SCHEDULER ---
const PKT_OFFSET_HOURS = 5;
const RESET_HOUR_PKT = 16; // 4:00 PM PKT
let resetTimer = null;

function scheduleNextGameReset() {
    // Definitive Guard: Clean up any existing timer before starting a new one
    if (resetTimer) clearTimeout(resetTimer);
    
    const now = new Date();
    const resetHourUTC = RESET_HOUR_PKT - PKT_OFFSET_HOURS;
    let resetTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), resetHourUTC, 0, 5, 0));

    if (now >= resetTime) {
        resetTime.setUTCDate(resetTime.getUTCDate() + 1);
    }

    const delay = resetTime.getTime() - now.getTime();
    console.error(`--- [SCHEDULER] Next automatic daily reset scheduled for: ${resetTime.toUTCString()} ---`);
    
    resetTimer = setTimeout(() => {
        try { 
            database.resetAllGames(); 
        } catch (e) { 
            logError('SCHEDULER_EXECUTION', e); 
        }
        // Recurse to schedule the next day
        scheduleNextGameReset();
    }, delay);
}

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_not_for_prod';

// --- AUTHENTICATION ROUTES ---
app.post('/api/auth/login', (req, res) => {
    try {
        if (!req.body || !req.body.loginId) {
            return res.status(400).json({ message: 'Login credentials required.' });
        }
        const { loginId, password } = req.body;
        const { account, role } = database.findAccountForLogin(loginId);
        
        if (account && account.password === password) {
            const table = role.toLowerCase() + 's';
            const fullAccount = database.findAccountById(account.id, table);
            const token = jwt.sign({ id: account.id, role }, JWT_SECRET, { expiresIn: '1d' });
            return res.json({ token, role, account: fullAccount });
        }
        res.status(401).json({ message: 'Invalid ID or Password.' });
    } catch (e) {
        logError('ROUTE_LOGIN', e);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
    try {
        const role = req.user.role;
        const table = role.toLowerCase() + 's';
        const account = database.findAccountById(req.user.id, table);
        if (!account) return res.status(404).json({ message: 'Session invalid' });
        
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
    } catch (e) {
        logError('ROUTE_VERIFY', e);
        res.sendStatus(500);
    }
});

app.post('/api/auth/reset-password', (req, res) => {
    const { accountId, contact, newPassword } = req.body;
    if (database.updatePassword(accountId, contact, newPassword)) res.json({ message: 'Success' });
    else res.status(404).json({ message: 'Invalid credentials' });
});

// --- DATA ROUTES ---
app.get('/api/games', (req, res) => res.json(database.getAllFromTable('games')));

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

// --- CORE ACTION ROUTES ---
app.post('/api/user/bets', authMiddleware, (req, res) => {
    if (req.user.role !== 'USER') return res.sendStatus(403);
    const { isMultiGame, multiGameBets, gameId, betGroups } = req.body;
    try {
        if (isMultiGame && multiGameBets) {
            const results = [];
            database.runInTransaction(() => {
                // Definitive Fix: Removed TS 'as any' and used Object.entries for safety
                Object.entries(multiGameBets).forEach(([gId, gameData]) => {
                    const processed = database.placeBulkBets(req.user.id, gId, gameData.betGroups);
                    if (Array.isArray(processed)) results.push(...processed);
                });
            });
            res.status(201).json(results);
        } else {
            res.status(201).json(database.placeBulkBets(req.user.id, gameId, betGroups));
        }
    } catch (e) {
        res.status(400).json({ message: e.message });
    }
});

app.post('/api/dealer/bets/bulk', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try { res.status(201).json(database.placeBulkBets(req.body.userId, req.body.gameId, req.body.betGroups)); }
    catch (e) { res.status(400).json({ message: e.message }); }
});

app.post('/api/dealer/users', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try { res.status(201).json(database.createUser(req.body.userData, req.user.id, req.body.initialDeposit)); }
    catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/dealer/users/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try { res.json(database.updateUser(req.body, req.params.id, req.user.id)); }
    catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/dealer/users/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try { database.deleteUserByDealer(req.params.id, req.user.id); res.sendStatus(204); }
    catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/dealer/topup/user', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try {
        const { userId, amount } = req.body;
        database.runInTransaction(() => {
            database.addLedgerEntry(req.user.id, 'DEALER', `Top-up user`, amount, 0);
            database.addLedgerEntry(userId, 'USER', `Funded by Dealer`, 0, amount);
        });
        res.json({ message: "Success" });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

app.post('/api/dealer/withdraw/user', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try {
        const { userId, amount } = req.body;
        database.runInTransaction(() => {
            database.addLedgerEntry(userId, 'USER', `Withdrawal`, amount, 0);
            database.addLedgerEntry(req.user.id, 'DEALER', `User Payout`, 0, amount);
        });
        res.json({ message: "Success" });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

app.put('/api/dealer/users/:id/toggle-restriction', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try { res.json(database.toggleUserRestrictionByDealer(req.params.id, req.user.id)); }
    catch (e) { res.status(500).json({ message: e.message }); }
});

// --- ADMIN CONTROL ROUTES ---
app.get('/api/admin/summary', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    res.json(database.getFinancialSummary());
});

app.post('/api/admin/dealers', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.status(201).json(database.createDealer(req.body)); }
    catch (e) { res.status(400).json({ message: e.message }); }
});

app.put('/api/admin/dealers/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.updateDealer(req.body, req.params.id)); }
    catch (e) { res.status(400).json({ message: e.message }); }
});

app.post('/api/admin/games/:id/declare-winner', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.declareWinnerForGame(req.params.id, req.body.winningNumber)); }
    catch (e) { res.status(400).json({ message: e.message }); }
});

app.post('/api/admin/games/:id/approve-payouts', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.approvePayoutsForGame(req.params.id)); }
    catch (e) { res.status(400).json({ message: e.message }); }
});

// --- AI ORACLE ---
app.post('/api/user/ai-lucky-pick', authMiddleware, async (req, res) => {
    const API_KEY = process.env.API_KEY;
    if (!API_KEY) return res.status(503).json({ message: "Oracle Offline" });
    try {
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        const { gameType, count = 5 } = req.body;
        const prompt = `Lucky numbers for ${gameType} (${count} items). CSV only.`;
        const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
        res.json({ luckyNumbers: response.text });
    } catch (e) { res.status(500).json({ message: "Oracle failed" }); }
});

// --- SERVER STARTUP ---
const startServer = () => {
    try {
        database.connect();
        database.verifySchema();
        
        // Safety Guarantee: No database reset is ever called here.
        // Today's data persists until the scheduled 4 PM PKT reset.
        
        scheduleNextGameReset();
        
        const PORT = process.env.PORT || 3001;
        app.listen(PORT, () => {
            console.error(`--- [SERVER] A-BABA Exchange Core Online on Port ${PORT} ---`);
        });
    } catch (e) {
        logError('BOOTSTRAP', e);
        process.exit(1);
    }
};

startServer();