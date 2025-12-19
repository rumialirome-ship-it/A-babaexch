
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./authMiddleware');
const database = require('./database');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize database
try {
    database.connect();
    database.verifySchema();
} catch (err) {
    console.error('FATAL DB ERROR ON STARTUP:', err.message);
}

// Scheduled Reset logic
const PKT_OFFSET_HOURS = 5;
const RESET_HOUR_PKT = 16;
function scheduleNextGameReset() {
    const now = new Date();
    const resetHourUTC = RESET_HOUR_PKT - PKT_OFFSET_HOURS;
    let resetTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), resetHourUTC, 0, 5, 0));
    if (now >= resetTime) resetTime.setUTCDate(resetTime.getUTCDate() + 1);
    const delay = resetTime.getTime() - now.getTime();
    setTimeout(() => {
        try { database.resetAllGames(); } catch (e) { console.error('Timer error:', e); }
        scheduleNextGameReset();
    }, delay);
}
scheduleNextGameReset();

// Safety middleware: ensure JSON response for API
app.use('/api', (req, res, next) => {
    res.setHeader('Content-Type', 'application/json');
    next();
});

// --- AUTH ---
app.post('/api/auth/login', (req, res) => {
    try {
        const { loginId, password } = req.body;
        const { account, role } = database.findAccountForLogin(loginId);
        if (account && account.password === password) {
            const fullAccount = database.findAccountById(account.id, role.toLowerCase() + 's');
            const token = jwt.sign({ id: account.id, role }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });
            return res.json({ token, role, account: fullAccount });
        }
        res.status(401).json({ message: 'Invalid credentials.' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
    try {
        const account = database.findAccountById(req.user.id, req.user.role.toLowerCase() + 's');
        if (!account) return res.status(404).json({ message: 'Not found.' });
        res.json({ account, role: req.user.role });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- GAMES ---
app.get('/api/games', (req, res) => {
    try {
        const games = database.getAllFromTable('games');
        res.json(games);
    } catch (e) {
        console.error('API Error /api/games:', e.message);
        res.status(500).json({ message: 'Database Error: ' + e.message, games: [] });
    }
});

// --- USER ---
app.get('/api/user/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'USER') return res.sendStatus(403);
    try {
        const games = database.getAllFromTable('games');
        const bets = database.getAllFromTable('bets').filter(b => b.userId === req.user.id);
        res.json({ games, bets });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/user/bets', authMiddleware, (req, res) => {
    if (req.user.role !== 'USER') return res.sendStatus(403);
    try {
        const created = database.placeBulkBets(req.user.id, req.body.gameId, req.body.betGroups, 'USER');
        res.status(201).json(created);
    } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

// --- DEALER ---
app.get('/api/dealer/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try {
        const users = database.findUsersByDealerId(req.user.id);
        const bets = database.findBetsByDealerId(req.user.id);
        res.json({ users, bets });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/dealer/users', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try {
        let user;
        database.runInTransaction(() => { user = database.createUser(req.body.userData, req.user.id, req.body.initialDeposit); });
        res.status(201).json(user);
    } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

// --- ADMIN ---
app.get('/api/admin/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try {
        res.json({
            dealers: database.getAllFromTable('dealers', true),
            users: database.getAllFromTable('users', true),
            games: database.getAllFromTable('games'),
            bets: database.getAllFromTable('bets')
        });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/admin/summary', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.getFinancialSummary()); } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/admin/games/:id/declare-winner', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.declareWinnerForGame(req.params.id, req.body.winningNumber)); } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.post('/api/admin/games/:id/approve-payouts', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.approvePayoutsForGame(req.params.id)); } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

// Catch-all for API errors
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Internal Server Error: ' + err.message });
});

app.listen(3001, () => {
    console.log('>>> Server running on 3001 <<<');
});
