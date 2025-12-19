
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
        res.json(games || []);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to fetch games" });
    }
});

// --- AUTH ---
app.post('/api/auth/login', (req, res) => {
    try {
        const { loginId, password } = req.body;
        if (!loginId || !password) return res.status(400).json({ message: 'Login ID and password required.' });

        const { account, role } = database.findAccountForLogin(loginId);
        if (!account || account.password !== password) return res.status(401).json({ message: 'Invalid credentials.' });
        
        const fullAccount = database.findAccountById(account.id, role.toLowerCase() + 's', true);
        const token = jwt.sign({ id: account.id, role: role }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1d' });
        res.json({ token, role, account: fullAccount });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "Server error during login" });
    }
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
    try {
        const account = database.findAccountById(req.user.id, req.user.role.toLowerCase() + 's', true);
        if (!account) return res.status(404).json({ message: "Account not found" });
        res.json({ account, role: req.user.role });
    } catch (e) {
        res.status(500).json({ message: "Verification failed" });
    }
});

// --- DATA SYNC ---
app.get('/api/admin/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: "Unauthorized" });
    res.json({
        account: database.findAccountById(req.user.id, 'admins', true),
        games: database.getAllFromTable('games'),
        dealers: database.getAllFromTable('dealers'),
        users: database.getAllFromTable('users'),
        daily_results: database.getDailyResults()
    });
});

app.get('/api/dealer/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.status(403).json({ message: "Unauthorized" });
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
    if (req.user.role !== 'USER') return res.status(403).json({ message: "Unauthorized" });
    const user = database.findAccountById(req.user.id, 'users', true);
    res.json({
        user,
        games: database.getAllFromTable('games'),
        bets: database.getBetsByUserId(req.user.id),
        daily_results: database.getDailyResults()
    });
});

// --- GLOBAL ERROR HANDLER ---
app.use((err, req, res, next) => {
    console.error("Global Error:", err.stack);
    res.status(500).json({ message: "Internal Server Error", error: err.message });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
