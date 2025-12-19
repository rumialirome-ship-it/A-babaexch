
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

// --- AUTH ---
app.post('/api/auth/login', (req, res) => {
    const { loginId, password } = req.body;
    const { account, role } = database.findAccountForLogin(loginId);
    if (!account || account.password !== password) return res.status(401).json({ message: 'Invalid credentials.' });
    const fullAccount = database.findAccountById(account.id, role.toLowerCase() + 's', false);
    const token = jwt.sign({ id: account.id, role: role }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, role, account: fullAccount });
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
    const account = database.findAccountById(req.user.id, req.user.role.toLowerCase() + 's', false);
    res.json({ account, role: req.user.role });
});

// --- NEW: High-performance history fetch ---
app.get('/api/ledger/:id', authMiddleware, (req, res) => {
    const ledger = database.getLedgerForAccount(req.params.id, 500);
    res.json(ledger);
});

// --- DATA SYNC (LIGHTWEIGHT) ---
app.get('/api/user/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'USER') return res.status(403).send();
    const user = database.findAccountById(req.user.id, 'users', false);
    const games = database.getAllFromTable('games');
    const bets = database.getBetsByUserId(req.user.id);
    res.json({ games, bets, user, daily_results: [] });
});

app.get('/api/dealer/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.status(403).send();
    const dealer = database.findAccountById(req.user.id, 'dealers', false);
    const games = database.getAllFromTable('games');
    res.json({ dealer, games });
});

// --- PAGINATED LISTS ---
app.get('/api/admin/users', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).send();
    res.json(database.getPaginatedUsers(req.query));
});

app.get('/api/dealer/users', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.status(403).send();
    res.json(database.getPaginatedUsers({ ...req.query, dealerId: req.user.id }));
});

// ... Preserved existing POST/PUT routes for winners, bets, etc. ...
app.post('/api/user/bets', authMiddleware, (req, res) => {
    try {
        const result = database.placeBulkBets(req.user.id, req.body.gameId, req.body.betGroups);
        res.status(201).json(result);
    } catch (e) { res.status(e.status || 500).json(e); }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
