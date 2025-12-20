
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./authMiddleware');
const database = require('./database');
const { GoogleGenAI } = require("@google/genai");

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenAI({ apiKey: process.env.API_KEY });

let dbReady = false;
let dbErrorData = null;

const checkDBStatus = () => {
    try {
        database.connect();
        if (database.verifySchema()) {
            dbReady = true;
            dbErrorData = null;
            return true;
        } else {
            dbErrorData = { error: "Schema Missing", terminal: "npm run db:setup" };
        }
    } catch (e) {
        dbErrorData = { 
            error: e.message, 
            raw: e.raw || e.toString(), 
            terminal: e.terminal || "npm install" 
        };
    }
    return false;
};

// Initial Health Check
checkDBStatus();

app.use('/api', (req, res, next) => {
    if (!dbReady && req.path !== '/status' && req.path !== '/games') {
        checkDBStatus();
    }
    next();
});

app.get('/api/games', (req, res) => {
    if (!dbReady) {
        checkDBStatus();
        return res.status(503).json(dbErrorData);
    }
    try {
        const games = database.getAllFromTable('games');
        res.json(games);
    } catch (e) {
        res.status(500).json({ error: "Query failed", details: e.message });
    }
});

app.post('/api/auth/login', (req, res) => {
    if (!dbReady) return res.status(503).json({ message: "Database offline. Run remake command." });
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
        res.status(500).json({ message: "Login failed.", error: e.message });
    }
});

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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`[SERVER] Active on port ${PORT}`));
