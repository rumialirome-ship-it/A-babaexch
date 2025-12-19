
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./authMiddleware');
const database = require('./database');
const { GoogleGenAI } = require('@google/genai');

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

// --- AI INSIGHTS ---
app.get('/api/admin/ai-insights', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).send();
    if (!process.env.API_KEY) return res.status(500).json({ error: "AI Key missing" });

    try {
        const summary = database.getFinancialSummary(new Date().toISOString().split('T')[0]);
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Analyze this lottery betting data for today and identify high-risk numbers or games that could cause massive payouts: ${JSON.stringify(summary)}. Return a short, punchy 3-sentence risk assessment.`,
        });
        res.json({ insights: response.text });
    } catch (e) {
        res.status(500).json({ error: "AI Analysis failed" });
    }
});

// --- DATA SYNC ---
app.get('/api/user/data', authMiddleware, (req, res) => {
    const user = database.findAccountById(req.user.id, 'users', false);
    res.json({ user, games: database.getAllFromTable('games'), bets: database.getBetsByUserId(req.user.id) });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
