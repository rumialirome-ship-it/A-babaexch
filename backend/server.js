
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

// --- ADMIN PROFILE UPDATES ---
app.put('/api/admin/dealers/:id', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const { name, area, contact, commissionRate, prizeRates, betLimits } = req.body;
    try {
        await database.run(
            `UPDATE dealers SET name = ?, area = ?, contact = ?, commissionrate = ?, prizerates = ?, betlimits = ? WHERE id = ?`,
            [name, area, contact, commissionRate, JSON.stringify(prizeRates), JSON.stringify(betLimits), req.params.id]
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/admin/users/:id', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const { name, area, contact, commissionRate, prizeRates, betLimits } = req.body;
    try {
        await database.run(
            `UPDATE users SET name = ?, area = ?, contact = ?, commissionrate = ?, prizerates = ?, betlimits = ? WHERE id = ?`,
            [name, area, contact, commissionRate, JSON.stringify(prizeRates), JSON.stringify(betLimits), req.params.id]
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- GAME MANAGEMENT ---
app.put('/api/admin/games/:id/draw-time', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const { newDrawTime } = req.body;
    try {
        await database.run('UPDATE games SET drawtime = ? WHERE id = ?', [newDrawTime, req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- REMAINING SERVER LOGIC ---
app.post('/api/auth/reset-password', async (req, res) => {
    const { accountId, contact, newPassword } = req.body;
    try {
        const success = await database.updatePassword(accountId, contact, newPassword);
        if (success) res.json({ message: "Password reset successful." });
        else res.status(404).json({ message: "Account not found or contact mismatch." });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/admin/ai-insights', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    if (!process.env.API_KEY) return res.status(500).json({ message: "Gemini API Key missing in backend .env" });
    try {
        const { summaryData } = req.body;
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const prompt = `Analyze this lottery betting summary: ${JSON.stringify(summaryData)}. Provide a concise 3-sentence risk assessment. Highlight games with high exposure.`;
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: { systemInstruction: "You are a risk analyst for a lottery exchange." }
        });
        res.json({ insights: response.text });
    } catch (e) { res.status(500).json({ message: "AI Analysis failed: " + e.message }); }
});

app.get('/api/games', async (req, res) => {
    try {
        const games = await database.getAllFromTable('games');
        res.json(games);
    } catch (e) { res.status(500).send(); }
});

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
        if (user.isRestricted) return res.status(403).json({ message: "Account restricted" });
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
        await database.addLedgerEntry(req.user.id, 'DEALER', `Top-up for user ${userId}`, amount, 0);
        await database.addLedgerEntry(userId, 'USER', `Top-up from dealer`, 0, amount);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/dealer/withdraw/user', authMiddleware, async (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    const { userId, amount } = req.body;
    try {
        await database.addLedgerEntry(userId, 'USER', `Withdrawal by dealer`, amount, 0);
        await database.addLedgerEntry(req.user.id, 'DEALER', `Withdrawal from user ${userId}`, 0, amount);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/dealer/users/:id/toggle-restriction', authMiddleware, async (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try {
        const user = await database.get(`SELECT isrestricted FROM users WHERE id = ? AND dealerid = ?`, [req.params.id, req.user.id]);
        if (!user) return res.status(404).json({ message: 'User not found' });
        const newStatus = user.isRestricted ? 0 : 1;
        await database.run(`UPDATE users SET isrestricted = ? WHERE id = ?`, [newStatus, req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

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

app.post('/api/admin/topup/dealer', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const { dealerId, amount } = req.body;
    try {
        await database.addLedgerEntry(req.user.id, 'ADMIN', `Top-up for dealer ${dealerId}`, amount, 0);
        await database.addLedgerEntry(dealerId, 'DEALER', `Top-up from admin`, 0, amount);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/admin/withdraw/dealer', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const { dealerId, amount } = req.body;
    try {
        await database.addLedgerEntry(dealerId, 'DEALER', `Withdrawal by admin`, amount, 0);
        await database.addLedgerEntry(req.user.id, 'ADMIN', `Withdrawal from dealer ${dealerId}`, 0, amount);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/admin/accounts/:type/:id/toggle-restriction', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const { type, id } = req.params;
    const table = type === 'dealer' ? 'dealers' : 'users';
    try {
        const account = await database.get(`SELECT isrestricted FROM ${table} WHERE id = ?`, [id]);
        if (!account) return res.status(404).json({ message: 'Account not found' });
        const newStatus = account.isRestricted ? 0 : 1;
        await database.run(`UPDATE ${table} SET isrestricted = ? WHERE id = ?`, [newStatus, id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
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
        res.json({ games: gameSummaries, totals: { totalStake, totalPayouts: 0, totalDealerProfit: 0, totalCommissions: 0, netProfit: totalStake }, totalBets: bets.length });
    } catch (e) { res.status(500).send(); }
});

app.get('/api/admin/games/:id/exposure', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try {
        const bets = await database.query('SELECT * FROM bets WHERE gameid = ?', [req.params.id]);
        
        const exposure = {
            twoDigit: {},
            oneDigitOpen: {},
            oneDigitClose: {}
        };

        // Initialize structures
        for(let i=0; i<100; i++) exposure.twoDigit[i.toString().padStart(2, '0')] = 0;
        for(let i=0; i<10; i++) {
            exposure.oneDigitOpen[i.toString()] = 0;
            exposure.oneDigitClose[i.toString()] = 0;
        }

        bets.forEach(bet => {
            const nums = JSON.parse(bet.numbers);
            const amount = parseFloat(bet.amountpernumber);
            nums.forEach(n => {
                if (bet.subgametype === '1 Digit Open') {
                    exposure.oneDigitOpen[n] = (exposure.oneDigitOpen[n] || 0) + amount;
                } else if (bet.subgametype === '1 Digit Close') {
                    exposure.oneDigitClose[n] = (exposure.oneDigitClose[n] || 0) + amount;
                } else {
                    exposure.twoDigit[n] = (exposure.twoDigit[n] || 0) + amount;
                }
            });
        });

        res.json({ exposure });
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

app.put('/api/admin/games/:id/update-winner', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const { newWinningNumber } = req.body;
    try {
        await database.run('UPDATE games SET winningnumber = ? WHERE id = ?', [newWinningNumber, req.params.id]);
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
