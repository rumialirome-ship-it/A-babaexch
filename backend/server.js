
console.error('############################################################');
console.error('--- EXECUTING LATEST SERVER.JS VERSION 5 ---');
console.error('############################################################');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./authMiddleware');
const database = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET;

app.post('/api/auth/login', (req, res) => {
    const { loginId, password } = req.body;
    const { account, role } = database.findAccountForLogin(loginId);
    if (account && account.password === password) {
        const fullAccount = database.findAccountById(account.id, role.toLowerCase() + 's');
        const token = jwt.sign({ id: account.id, role }, JWT_SECRET, { expiresIn: '1d' });
        return res.json({ token, role, account: fullAccount });
    }
    res.status(401).json({ message: 'Invalid Account ID or Password.' });
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
    const table = req.user.role.toLowerCase() + 's';
    const account = database.findAccountById(req.user.id, table);
    if (!account) return res.status(404).json({ message: 'Account not found.' });
    res.json({ account, role: req.user.role });
});

app.get('/api/games', (req, res) => {
    res.json(database.getAllFromTable('games'));
});

// --- DEALER WALLET MANAGEMENT ---
app.post('/api/dealer/topup/user', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    const { userId, amount } = req.body;
    try {
        database.topUpUserWallet(req.user.id, userId, amount);
        res.json({ message: 'Top-up successful.' });
    } catch (e) {
        res.status(e.status || 500).json({ message: e.message });
    }
});

app.post('/api/dealer/withdraw/user', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    const { userId, amount } = req.body;
    try {
        database.withdrawFromUserWallet(req.user.id, userId, amount);
        res.json({ message: 'Withdrawal successful.' });
    } catch (e) {
        res.status(e.status || 500).json({ message: e.message });
    }
});

app.get('/api/dealer/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    const users = database.findUsersByDealerId(req.user.id);
    const bets = database.findBetsByDealerId(req.user.id);
    res.json({ users, bets });
});

app.post('/api/dealer/users', authMiddleware, (req, res) => {
    const { userData, initialDeposit = 0 } = req.body;
    try {
        const newUser = database.createUser(userData, req.user.id, initialDeposit);
        res.status(201).json(newUser);
    } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.put('/api/dealer/users/:id', authMiddleware, (req, res) => {
    try {
        const updatedUser = database.updateUser(req.body, req.params.id, req.user.id);
        res.json(updatedUser);
    } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.put('/api/dealer/users/:id/toggle-restriction', authMiddleware, (req, res) => {
    try {
        const updatedUser = database.toggleUserRestrictionByDealer(req.params.id, req.user.id);
        res.json(updatedUser);
    } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

// Admin and User routes remain consistent...
app.listen(3001, () => { console.error('>>> A-BABA BACKEND IS LIVE ON PORT 3001 <<<'); });
