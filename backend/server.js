
console.error('############################################################');
console.error('--- EXECUTING LATEST SERVER.JS VERSION 4 ---');
console.error('############################################################');
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

const JWT_SECRET = process.env.JWT_SECRET;

// --- AUTHENTICATION ROUTES ---
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

// --- PROFILE UPDATE (Self Service) ---
app.put('/api/:role/profile', authMiddleware, (req, res) => {
    const { name, password } = req.body;
    const table = req.user.role.toLowerCase() + 's';
    try {
        const currentAccount = database.findAccountById(req.user.id, table);
        const updated = { ...currentAccount, name, password };
        database.runInTransaction(() => {
            if (req.user.role === 'DEALER') database.updateDealer(updated, req.user.id);
            else database.updateUser(updated, req.user.id, currentAccount.dealerId);
        });
        res.json({ message: 'Profile updated.' });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// --- USER ROUTES ---
app.get('/api/user/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'USER') return res.sendStatus(403);
    const games = database.getAllFromTable('games');
    const userBets = database.getAllFromTable('bets').filter(b => b.userId === req.user.id).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json({ games, bets: userBets });
});

// --- DEALER ROUTES ---
app.get('/api/dealer/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    const users = database.findUsersByDealerId(req.user.id);
    const bets = database.findBetsByDealerId(req.user.id);
    res.json({ users, bets });
});

app.post('/api/dealer/users', authMiddleware, (req, res) => {
    const { userData, initialDeposit = 0 } = req.body;
    try {
        let newUser;
        database.runInTransaction(() => { newUser = database.createUser(userData, req.user.id, initialDeposit); });
        res.status(201).json(newUser);
    } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.put('/api/dealer/users/:id', authMiddleware, (req, res) => {
    try {
        let updatedUser;
        database.runInTransaction(() => { updatedUser = database.updateUser(req.body, req.params.id, req.user.id); });
        res.json(updatedUser);
    } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

// Admin Routes (Inherit Existing Logic)
app.get('/api/admin/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    res.json({
        dealers: database.getAllFromTable('dealers', true),
        users: database.getAllFromTable('users', true),
        games: database.getAllFromTable('games'),
        bets: database.getAllFromTable('bets')
    });
});

app.listen(3001, () => { console.error('>>> A-BABA BACKEND IS LIVE ON PORT 3001 <<<'); });
