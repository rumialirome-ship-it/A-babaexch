
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./authMiddleware');
const database = require('./database');
const { v4: uuidv4 } = require('uuid');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

// --- AUTH ---
app.post('/api/auth/login', async (req, res) => {
    try {
        const { loginId, password } = req.body;
        const { account, role } = await database.findAccountForLogin(loginId);
        if (account && account.password === password) {
            const token = jwt.sign({ id: account.id, role }, JWT_SECRET, { expiresIn: '1d' });
            return res.json({ token, role, account });
        }
        res.status(401).json({ message: 'Invalid credentials.' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/auth/verify', authMiddleware, async (req, res) => {
    try {
        const account = await database.findAccountById(req.user.id, req.user.role.toLowerCase() + 's');
        if (!account) return res.status(404).send();
        res.json({ account, role: req.user.role });
    } catch (e) { res.status(500).send(); }
});

// --- AI INSIGHTS ---
app.post('/api/admin/ai-insights', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    if (!process.env.API_KEY) return res.status(500).json({ message: "Gemini API Key missing in backend .env" });

    try {
        const { summaryData } = req.body;
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const prompt = `Analyze this lottery betting summary for the day: ${JSON.stringify(summaryData)}. 
        Provide a concise 3-sentence risk assessment. Mention which game has the highest potential loss 
        risk for the system and if any unusual betting volume is detected. Keep it professional and urgent.`;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                systemInstruction: "You are a senior financial risk analyst for a high-volume lottery exchange.",
            }
        });

        res.json({ insights: response.text });
    } catch (e) {
        res.status(500).json({ message: "AI Analysis failed: " + e.message });
    }
});

// --- PUBLIC ---
app.get('/api/games', async (req, res) => {
    try {
        const games = await database.getAllFromTable('games');
        res.json(games);
    } catch (e) { res.status(500).send(); }
});

// --- USER ENDPOINTS ---
app.get('/api/user/data', authMiddleware, async (req, res) => {
    if (req.user.role !== 'USER') return res.sendStatus(403);
    try {
        const games = await database.getAllFromTable('games');
        const allBets = await database.query('SELECT * FROM bets WHERE userid = ? ORDER BY timestamp DESC', [req.user.id]);
        res.json({ games, bets: allBets });
    } catch (e) { res.status(500).send(); }
});

app.post('/api/user/bets', authMiddleware, async (req, res) => {
    if (req.user.role !== 'USER') return res.sendStatus(403);
    const { gameId, betGroups } = req.body;
    try {
        const user = await database.findAccountById(req.user.id, 'users');
        const game = await database.findAccountById(gameId, 'games');
        if (!game.isMarketOpen) return res.status(400).json({ message: "Market closed" });
        
        let totalCost = 0;
        betGroups.forEach(g => totalCost += (g.numbers.length * g.amountPerNumber));
        if (parseFloat(user.wallet) < totalCost) return res.status(400).json({ message: "Insufficient balance" });

        for (const group of betGroups) {
            const bid = uuidv4();
            await database.run('INSERT INTO bets (id, userid, dealerid, gameid, subgametype, numbers, amountpernumber, totalamount, timestamp) VALUES (?,?,?,?,?,?,?,?,?)',
                [bid, user.id, user.dealerId, gameId, group.subGameType, JSON.stringify(group.numbers), group.amountPerNumber, group.numbers.length * group.amountPerNumber, new Date().toISOString()]);
        }
        await database.addLedgerEntry(user.id, 'USER', `Bet on ${game.name}`, totalCost, 0);
        res.status(201).json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- DEALER ENDPOINTS ---
app.get('/api/dealer/data', authMiddleware, async (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try {
        const users = (await database.getAllFromTable('users', true)).filter(u => u.dealerId === req.user.id);
        const bets = await database.query('SELECT * FROM bets WHERE dealerid = ? ORDER BY timestamp DESC LIMIT 500', [req.user.id]);
        res.json({ users, bets });
    } catch (e) { res.status(500).send(); }
});

app.post('/api/dealer/topup/user', authMiddleware, async (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    const { userId, amount } = req.body;
    try {
        const dealer = await database.findAccountById(req.user.id, 'dealers');
        if (parseFloat(dealer.wallet) < amount) return res.status(400).json({ message: "Insufficient Dealer Balance" });
        await database.addLedgerEntry(req.user.id, 'DEALER', `Topup for ${userId}`, amount, 0);
        await database.addLedgerEntry(userId, 'USER', `Topup from Dealer`, 0, amount);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- ADMIN ENDPOINTS ---
app.get('/api/admin/data', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try {
        res.json({
            dealers: await database.getAllFromTable('dealers', true),
            users: await database.getAllFromTable('users', true),
            games: await database.getAllFromTable('games'),
            bets: await database.query('SELECT * FROM bets ORDER BY timestamp DESC LIMIT 1000')
        });
    } catch (e) { res.status(500).send(); }
});

app.get('/api/admin/summary', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try {
        const games = await database.getAllFromTable('games');
        const bets = await database.query('SELECT * FROM bets');
        
        let totalStake = 0;
        const gameSummaries = games.map(game => {
            const gameBets = bets.filter(b => b.gameId === game.id);
            const stake = gameBets.reduce((s, b) => s + parseFloat(b.totalAmount), 0);
            totalStake += stake;
            return {
                gameName: game.name,
                winningNumber: game.winningNumber || '-',
                totalStake: stake,
                totalPayouts: 0, 
                totalDealerProfit: 0,
                totalCommissions: 0,
                netProfit: stake
            };
        });

        res.json({ 
            games: gameSummaries, 
            totals: { 
                totalStake, 
                totalPayouts: 0, 
                totalDealerProfit: 0,
                totalCommissions: 0,
                netProfit: totalStake 
            },
            totalBets: bets.length
        });
    } catch (e) { res.status(500).send(); }
});

app.post('/api/admin/games/:id/declare-winner', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const { winningNumber } = req.body;
    try {
        await database.run('UPDATE games SET winningnumber = ? WHERE id = ?', [winningNumber, req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

const PORT = process.env.PORT || 3001;
database.connect().then(() => {
    database.verifySchema().then(() => {
        app.listen(PORT, () => {
            console.error('----------------------------------------');
            console.error(`A-BABA SERVER READY ON PORT ${PORT}`);
            console.error('----------------------------------------');
        });
    });
});
