
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./authMiddleware');
const database = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

database.connect();
database.verifySchema();

// --- PUBLIC ENDPOINTS ---
app.get('/api/games', (req, res) => {
    try {
        const games = database.getAllFromTable('games');
        res.json(games);
    } catch (e) {
        res.status(500).json({ error: "Failed to fetch games" });
    }
});

// --- AUTH ---
app.post('/api/auth/login', (req, res) => {
    const { loginId, password } = req.body;
    const { account, role } = database.findAccountForLogin(loginId);
    if (!account || account.password !== password) return res.status(401).json({ message: 'Invalid credentials.' });
    const fullAccount = database.findAccountById(account.id, role.toLowerCase() + 's', true);
    const token = jwt.sign({ id: account.id, role: role }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, role, account: fullAccount });
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
    const account = database.findAccountById(req.user.id, req.user.role.toLowerCase() + 's', true);
    res.json({ account, role: req.user.role });
});

// --- ADMIN GAME MANAGEMENT ---
app.post('/api/admin/games/:id/declare', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).send();
    const game = database.declareWinnerForGame(req.params.id, req.body.winningNumber);
    res.json(game);
});

app.post('/api/admin/games/:id/approve', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).send();
    database.approvePayoutsForGame(req.params.id);
    res.json({ message: 'Payouts approved' });
});

app.get('/api/admin/summary', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).send();
    res.json(database.getFinancialSummary(req.query.date));
});

// --- DATA SYNC ---
app.get('/api/admin/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).send();
    res.json({
        account: database.findAccountById(req.user.id, 'admins', true),
        games: database.getAllFromTable('games'),
        dealers: database.getAllFromTable('dealers'),
        users: database.getAllFromTable('users'),
        daily_results: database.getDailyResults()
    });
});

app.get('/api/dealer/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.status(403).send();
    const dealer = database.findAccountById(req.user.id, 'dealers', true);
    const users = database.getAllFromTable('users').filter(u => u.dealerId === req.user.id);
    res.json({
        dealer,
        users,
        games: database.getAllFromTable('games'),
        daily_results: database.getDailyResults()
    });
});

app.get('/api/user/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'USER') return res.status(403).send();
    const user = database.findAccountById(req.user.id, 'users', true);
    res.json({
        user,
        games: database.getAllFromTable('games'),
        bets: database.getBetsByUserId(req.user.id),
        daily_results: database.getDailyResults()
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
