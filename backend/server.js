
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

// Initialize Gemini
const genAI = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Initialize Database connection
let dbReady = false;
let dbError = null;
let dbRawError = null;

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
    dbRawError = e.raw || e.toString();
    console.error("[SERVER] FATAL: Database failed to start.");
}

// Global JSON response header and DB check middleware
app.use('/api', (req, res, next) => {
    res.setHeader('Content-Type', 'application/json');
    if (!dbReady && req.path !== '/status' && req.path !== '/games') {
        // We let /games through so it can return the formatted error
    }
    next();
});

// Health Check
app.get('/api/status', (req, res) => {
    res.json({ 
        status: dbReady ? "online" : "error", 
        database: dbReady ? "connected" : "failed",
        error: dbError,
        raw: dbRawError
    });
});

// --- PUBLIC ---
app.get('/api/games', (req, res) => {
    if (!dbReady) {
        return res.status(503).json({ 
            error: dbError || "Database Offline", 
            details: "The server is running but the SQL connection is broken.",
            raw: dbRawError,
            fix: "Execute 'npm install' in the backend directory and restart PM2."
        });
    }
    try {
        const games = database.getAllFromTable('games');
        res.json(games);
    } catch (e) {
        res.status(500).json({ error: "Query failed", details: e.message });
    }
});

// --- AI LUCKY PICK ---
app.get('/api/user/ai-lucky-pick', authMiddleware, async (req, res) => {
    try {
        const type = req.query.type || '2-digit';
        const gameName = req.query.gameName || 'Ali Baba';
        
        const prompt = `You are a mystical numerologist for a lottery platform. 
        The user is playing a game called "${gameName}". 
        Generate ${type === '2-digit' ? 'three different 2-digit numbers (00-99)' : 'three different 1-digit numbers (0-9)'}.
        Provide the response in JSON format like: {"numbers": ["12", "45", "78"]} or {"numbers": ["4", "7", "2"]}.
        Make the choice feel special and based on the cosmos. Only return JSON.`;

        const response = await genAI.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });

        const result = JSON.parse(response.text);
        res.json(result);
    } catch (e) {
        console.error("[AI] Error:", e);
        res.status(500).json({ error: "AI failed to suggest numbers." });
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`[SERVER] Running on port ${PORT}`));
