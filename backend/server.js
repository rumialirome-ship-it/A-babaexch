
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./authMiddleware');
const database = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

database.connect();

// --- PUBLIC ---
app.get('/api/games', (req, res) => {
    try { res.json(database.getAllFromTable('games')); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});

// --- AUTH ---
app.post('/api/auth/login', (req, res) => {
    try {
        const { loginId, password } = req.body;
        const { account, role } = database.findAccountForLogin(loginId);
        if (!account || account.password !== password) return res.status(401).json({ message: 'Invalid credentials' });
        const fullAccount = database.findAccountById(account.id, role.toLowerCase() + 's', true);
        const token = jwt.sign({ id: account.id, role }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });
        res.json({ token, role, account: fullAccount });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
    try {
        const account = database.findAccountById(req.user.id, req.user.role.toLowerCase() + 's', true);
        res.json({ account, role: req.user.role });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- DATA SYNC ---
app.get('/api/admin/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: "Forbidden" });
    res.json({
        account: database.findAccountById(req.user.id, 'admins', true),
        games: database.getAllFromTable('games'),
        dealers: database.getAllFromTable('dealers'),
        users: database.getAllFromTable('users'),
        daily_results: database.getDailyResults()
    });
});

app.get('/api/dealer/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.status(403).json({ message: "Forbidden" });
    res.json({
        dealer: database.findAccountById(req.user.id, 'dealers', true),
        users: database.getAllFromTable('users').filter(u => u.dealerId === req.user.id),
        games: database.getAllFromTable('games'),
        daily_results: database.getDailyResults()
    });
});

app.get('/api/user/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'USER') return res.status(403).json({ message: "Forbidden" });
    res.json({
        user: database.findAccountById(req.user.id, 'users', true),
        games: database.getAllFromTable('games'),
        bets: database.getBetsByUserId(req.user.id),
        daily_results: database.getDailyResults()
    });
});

// --- ACTIONS ---
app.post('/api/admin/dealers', authMiddleware, (req, res) => res.json({ success: database.saveDealer(req.body) }));
app.post('/api/admin/games/:id/declare', authMiddleware, (req, res) => res.json({ success: database.declareWinner(req.params.id, req.body.winningNumber) }));
app.post('/api/admin/games/:id/approve', authMiddleware, (req, res) => res.json({ success: database.approvePayouts(req.params.id) }));
app.post('/api/admin/dealers/:id/top-up', authMiddleware, (req, res) => res.json({ wallet: database.updateWallet(req.params.id, 'DEALER', req.body.amount, 'Admin Top-up', 'credit') }));
app.post('/api/admin/dealers/:id/withdraw', authMiddleware, (req, res) => res.json({ wallet: database.updateWallet(req.params.id, 'DEALER', req.body.amount, 'Admin Withdrawal', 'debit') }));
app.post('/api/admin/:type/:id/toggle-restriction', authMiddleware, (req, res) => res.json({ success: database.toggleRestriction(req.params.id, req.params.type) }));

app.post('/api/dealer/users', authMiddleware, (req, res) => res.json({ success: database.saveUser(req.body) }));
app.post('/api/dealer/users/:id/top-up', authMiddleware, (req, res) => res.json({ wallet: database.updateWallet(req.params.id, 'USER', req.body.amount, 'Dealer Top-up', 'credit') }));

// Catch-all Error handler to ensure JSON response
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: "Internal Server Error", error: err.message });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
