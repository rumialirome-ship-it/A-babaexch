
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./authMiddleware');
const database = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

try {
    database.connect();
    database.verifySchema();
} catch (err) {
    process.exit(1);
}

// --- AUTH ---
app.post('/api/auth/login', (req, res) => {
    const { loginId, password } = req.body;
    const { account, role } = database.findAccountForLogin(loginId);
    if (account && account.password === password) {
        const fullAccount = database.findAccountById(account.id, role.toLowerCase() + 's');
        const token = jwt.sign({ id: account.id, role }, JWT_SECRET, { expiresIn: '1d' });
        return res.json({ token, role, account: fullAccount });
    }
    res.status(401).json({ message: 'Invalid Login ID or Password.' });
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
    const table = req.user.role.toLowerCase() + 's';
    const account = database.findAccountById(req.user.id, table);
    if (!account) return res.status(404).json({ message: 'Account not found.' });
    res.json({ account, role: req.user.role });
});

// --- COMMON ---
app.get('/api/games', (req, res) => {
    res.json(database.getAllFromTable('games'));
});

// --- USER ---
app.get('/api/user/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'USER') return res.status(403).json({ message: 'Forbidden' });
    const games = database.getAllFromTable('games');
    const bets = database.getAllFromTable('bets').filter(b => b.userId === req.user.id);
    res.json({ games, bets });
});

app.post('/api/user/bets', authMiddleware, (req, res) => {
    if (req.user.role !== 'USER') return res.status(403).json({ message: 'Forbidden' });
    try {
        const result = database.placeBulkBets(req.user.id, req.body.gameId, req.body.betGroups);
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ message: e.message });
    }
});

// --- DEALER ---
app.get('/api/dealer/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.status(403).json({ message: 'Forbidden' });
    const users = database.findUsersByDealerId(req.user.id);
    const bets = database.findBetsByDealerId(req.user.id);
    res.json({ users, bets });
});

app.post('/api/dealer/topup/user', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.status(403).json({ message: 'Forbidden' });
    try {
        database.topUpUserWallet(req.user.id, req.body.userId, req.body.amount);
        res.json({ message: 'Top-up success' });
    } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.post('/api/dealer/withdraw/user', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.status(403).json({ message: 'Forbidden' });
    try {
        database.withdrawFromUserWallet(req.user.id, req.body.userId, req.body.amount);
        res.json({ message: 'Withdraw success' });
    } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.post('/api/dealer/users', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.status(403).json({ message: 'Forbidden' });
    try {
        const newUser = database.createUser(req.body.userData, req.user.id, req.body.initialDeposit || 0);
        res.status(201).json(newUser);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/dealer/users/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.status(403).json({ message: 'Forbidden' });
    try {
        const updated = database.updateUser(req.body, req.params.id, req.user.id);
        res.json(updated);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- ADMIN ---
app.get('/api/admin/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    res.json({
        dealers: database.getAllFromTable('dealers', true),
        users: database.getAllFromTable('users', true),
        games: database.getAllFromTable('games'),
        bets: database.getAllFromTable('bets')
    });
});

app.get('/api/admin/summary', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    res.json(database.getFinancialSummary());
});

app.post('/api/admin/games/:id/declare-winner', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    database.declareWinner(req.params.id, req.body.winningNumber);
    res.json({ message: 'Winner declared' });
});

app.put('/api/admin/games/:id/update-winner', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    database.declareWinner(req.params.id, req.body.newWinningNumber);
    res.json({ message: 'Winner updated' });
});

app.post('/api/admin/games/:id/approve-payouts', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    try {
        database.approvePayouts(req.params.id);
        res.json({ message: 'Payouts approved' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/admin/games/:id/draw-time', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    database.updateDrawTime(req.params.id, req.body.newDrawTime);
    res.json({ message: 'Draw time updated' });
});

app.put('/api/admin/accounts/:type/:id/toggle-restriction', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    const table = req.params.type === 'user' ? 'users' : 'dealers';
    res.json(database.toggleAccountRestriction(req.params.id, table));
});

app.listen(3001, () => { console.log('Backend running on 3001'); });
