
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./authMiddleware');
const database = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize
try {
    database.connect();
    console.log("Backend Connected to SQLite");
} catch (e) {
    console.error("FATAL: Database could not start.");
}

// Ensure every response is JSON
app.use('/api', (req, res, next) => {
    res.setHeader('Content-Type', 'application/json');
    next();
});

// --- PUBLIC ---
app.get('/api/games', (req, res) => {
    try {
        const games = database.getAllFromTable('games');
        res.json(games);
    } catch (e) {
        res.status(500).json([]);
    }
});

// --- AUTH ---
app.post('/api/auth/login', (req, res) => {
    const { loginId, password } = req.body;
    const { account, role } = database.findAccountForLogin(loginId);
    if (account && account.password === password) {
        const token = jwt.sign({ id: account.id, role }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });
        const fullAccount = database.findAccountById(account.id, role.toLowerCase() + 's');
        return res.json({ token, role, account: fullAccount });
    }
    res.status(401).json({ message: "Invalid credentials" });
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
    const account = database.findAccountById(req.user.id, req.user.role.toLowerCase() + 's');
    if (!account) return res.status(404).json({ message: "Not found" });
    res.json({ account, role: req.user.role });
});

// --- DATA SYNC ---
app.get('/api/admin/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    res.json({
        dealers: database.getAllFromTable('dealers'),
        users: database.getAllFromTable('users'),
        games: database.getAllFromTable('games'),
        bets: database.getAllFromTable('bets')
    });
});

app.get('/api/dealer/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    const users = database.getAllFromTable('users').filter(u => u.dealerId === req.user.id);
    res.json({ users, bets: [] });
});

app.get('/api/user/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'USER') return res.sendStatus(403);
    res.json({ games: database.getAllFromTable('games'), bets: [] });
});

// Error handling to prevent HTML returns
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: "Internal server error", error: err.message });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
