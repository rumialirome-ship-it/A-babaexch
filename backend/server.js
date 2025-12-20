
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./authMiddleware');
const { GoogleGenAI } = require('@google/genai');
const database = require('./database');
const { v4: uuidv4 } = require('uuid');

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

// --- USER ---
app.get('/api/user/data', authMiddleware, async (req, res) => {
    if (req.user.role !== 'USER') return res.sendStatus(403);
    const games = await database.getAllFromTable('games');
    const allBets = await database.getAllFromTable('bets');
    const userBets = allBets.filter(b => b.userId === req.user.id).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json({ games, bets: userBets });
});

app.post('/api/user/bets', authMiddleware, async (req, res) => {
    if (req.user.role !== 'USER') return res.sendStatus(403);
    const { gameId, betGroups } = req.body;
    try {
        // Simple betting logic restored
        const user = await database.findAccountById(req.user.id, 'users');
        const game = await database.findAccountById(gameId, 'games');
        if (!game.isMarketOpen) return res.status(400).json({ message: "Market closed" });
        
        let cost = 0;
        betGroups.forEach(g => cost += (g.numbers.length * g.amountPerNumber));
        if (user.wallet < cost) return res.status(400).json({ message: "Insufficient balance" });

        for (const group of betGroups) {
            const bid = uuidv4();
            await database.run('INSERT INTO bets VALUES (?,?,?,?,?,?,?,?,?)',
                [bid, user.id, user.dealerId, gameId, group.subGameType, JSON.stringify(group.numbers), group.amountPerNumber, group.numbers.length * group.amountPerNumber, new Date().toISOString()]);
        }
        await database.addLedgerEntry(user.id, 'USER', `Bet on ${game.name}`, cost, 0);
        res.status(201).json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- DEALER ---
app.get('/api/dealer/data', authMiddleware, async (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    const users = (await database.getAllFromTable('users', true)).filter(u => u.dealerId === req.user.id);
    const bets = (await database.getAllFromTable('bets')).filter(b => b.dealerId === req.user.id);
    res.json({ users, bets });
});

app.post('/api/dealer/topup/user', authMiddleware, async (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    const { userId, amount } = req.body;
    try {
        const dealer = await database.findAccountById(req.user.id, 'dealers');
        if (dealer.wallet < amount) return res.status(400).json({ message: "Insufficient Dealer Balance" });
        await database.addLedgerEntry(req.user.id, 'DEALER', `Topup for ${userId}`, amount, 0);
        await database.addLedgerEntry(userId, 'USER', `Topup from Dealer`, 0, amount);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- ADMIN ---
app.get('/api/admin/data', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    res.json({
        dealers: await database.getAllFromTable('dealers', true),
        users: await database.getAllFromTable('users', true),
        games: await database.getAllFromTable('games'),
        bets: await database.getAllFromTable('bets')
    });
});

app.post('/api/admin/games/:id/declare-winner', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const { winningNumber } = req.body;
    await database.run('UPDATE games SET winningNumber = ? WHERE id = ?', [winningNumber, req.params.id]);
    res.json({ success: true });
});

// --- PUBLIC ---
app.get('/api/games', async (req, res) => {
    const games = await database.getAllFromTable('games');
    res.json(games);
});

const PORT = process.env.PORT || 3001;
database.connect();
database.verifySchema().then(() => {
    app.listen(PORT, () => console.error(`>>> A-BABA SERVER RUNNING ON PORT ${PORT} <<<`));
});
