
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./authMiddleware');
const database = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Database connection
let dbReady = false;
let dbError = null;

try {
    database.connect();
    if (database.verifySchema()) {
        dbReady = true;
        console.log("[SERVER] Database is ready.");
    } else {
        dbError = "Schema incomplete. Please run setup-database.js.";
        console.error("[SERVER] " + dbError);
    }
} catch (e) {
    dbError = e.message;
    console.error("[SERVER] FATAL: Database failed to start.");
}

// API Health Check / Status
app.get('/api/status', (req, res) => {
    res.json({ 
        status: dbReady ? "online" : "error", 
        database: dbReady ? "connected" : "failed",
        error: dbError 
    });
});

// Global JSON response header and DB check middleware
app.use('/api', (req, res, next) => {
    res.setHeader('Content-Type', 'application/json');
    if (!dbReady) {
        return res.status(503).json({ 
            error: "Database Offline", 
            details: dbError,
            fix: "Run 'npm install' in the backend folder and restart PM2."
        });
    }
    next();
});

// --- PUBLIC ---
app.get('/api/games', (req, res) => {
    try {
        const games = database.getAllFromTable('games');
        res.json(games);
    } catch (e) {
        res.status(500).json({ error: "Query failed", details: e.message });
    }
});

// --- AUTH ---
app.post('/api/auth/login', (req, res) => {
    const { loginId, password } = req.body;
    try {
        const { account, role } = database.findAccountForLogin(loginId);
        if (account && account.password === password) {
            const token = jwt.sign({ id: account.id, role }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });
            const fullAccount = database.findAccountById(account.id, role.toLowerCase() + 's');
            return res.json({ token, role, account: fullAccount });
        }
        res.status(401).json({ message: "Invalid credentials" });
    } catch (e) {
        res.status(500).json({ message: "Internal login error", error: e.message });
    }
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
    try {
        const account = database.findAccountById(req.user.id, req.user.role.toLowerCase() + 's');
        if (!account) return res.status(404).json({ message: "Account not found." });
        res.json({ account, role: req.user.role });
    } catch (e) {
        res.status(500).json({ message: "Verification failed.", error: e.message });
    }
});

// --- DATA SYNC ---
app.get('/api/admin/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try {
        res.json({
            dealers: database.getAllFromTable('dealers'),
            users: database.getAllFromTable('users'),
            games: database.getAllFromTable('games'),
            bets: database.getAllFromTable('bets')
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/dealer/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try {
        const users = database.getAllFromTable('users').filter(u => u.dealerId === req.user.id);
        res.json({ users, bets: [] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/user/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'USER') return res.sendStatus(403);
    try {
        res.json({ games: database.getAllFromTable('games'), bets: [] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Final error catch-all
app.use((err, req, res, next) => {
    console.error("[SERVER] Global Error:", err.stack);
    res.status(500).json({ 
        message: "Internal Server Error", 
        error: err.message 
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`[SERVER] Running on port ${PORT}`));
