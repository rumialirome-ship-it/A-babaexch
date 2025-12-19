
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
    const { loginId, password } = req.body;
    const { account, role } = database.findAccountForLogin(loginId);
    if (!account || account.password !== password) return res.status(401).json({ message: 'Invalid credentials' });
    const fullAccount = database.findAccountById(account.id, role.toLowerCase() + 's', true);
    const token = jwt.sign({ id: account.id, role }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, role, account: fullAccount });
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
    const account = database.findAccountById(req.user.id, req.user.role.toLowerCase() + 's', true);
    res.json({ account, role: req.user.role });
});

// --- DATA SYNC ---
app.get('/api/admin/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).send();
    res.json({
        account: database.findAccountById(req.user.id, 'admins', true),
        games: database.getAllFromTable('games'),
        dealers: database.getAllFromTable('dealers'),
        users: database.getAllFromTable('users'),
        daily_results: database.getDailyResults()
    });
});

app.get('/api/dealer/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.status(403).send();
    res.json({
        dealer: database.findAccountById(req.user.id, 'dealers', true),
        users: database.getAllFromTable('users').filter(u => u.dealerId === req.user.id),
        games: database.getAllFromTable('games'),
        daily_results: database.getDailyResults()
    });
});

app.get('/api/user/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'USER') return res.status(403).send();
    res.json({
        user: database.findAccountById(req.user.id, 'users', true),
        games: database.getAllFromTable('games'),
        bets: database.getBetsByUserId(req.user.id),
        daily_results: database.getDailyResults()
    });
});

// --- ADMIN SPECIFIC ---
app.post('/api/admin/dealers', authMiddleware, (req, res) => database.saveDealer(req.body) && res.json({ success: true }));
app.put('/api/admin/dealers/:id', authMiddleware, (req, res) => database.saveDealer(req.body) && res.json({ success: true }));
app.post('/api/admin/games/:id/declare', authMiddleware, (req, res) => database.declareWinner(req.params.id, req.body.winningNumber) || res.json({ success: true }));
app.put('/api/admin/games/:id/draw-time', authMiddleware, (req, res) => database.updateGameDrawTime(req.params.id, req.body.drawTime) || res.json({ success: true }));
app.post('/api/admin/dealers/:id/top-up', authMiddleware, (req, res) => res.json({ balance: database.updateWallet(req.params.id, 'DEALER', req.body.amount, 'Top-up from Admin', 'credit') }));
app.post('/api/admin/dealers/:id/withdraw', authMiddleware, (req, res) => res.json({ balance: database.updateWallet(req.params.id, 'DEALER', req.body.amount, 'Withdrawal by Admin', 'debit') }));
app.post('/api/admin/:type/:id/toggle-restriction', authMiddleware, (req, res) => database.toggleRestriction(req.params.id, req.params.type + 's') || res.json({ success: true }));

app.get('/api/admin/number-summary', authMiddleware, (req, res) => res.json(database.getNumberSummary(req.query)));
app.get('/api/admin/live-booking/:id', authMiddleware, (req, res) => res.json(database.getLiveBooking(req.params.id)));
app.get('/api/admin/winners-report', authMiddleware, (req, res) => res.json(database.getWinnersReport(req.query.date, req.query.gameId)));
app.get('/api/admin/bet-search', authMiddleware, (req, res) => {
    const bets = database.searchBets(req.query.number);
    res.json({ bets, summary: { number: req.query.number, count: bets.length, totalStake: bets.reduce((s,b) => s + b.totalAmount, 0) } });
});

// --- DEALER SPECIFIC ---
app.post('/api/dealer/users', authMiddleware, (req, res) => database.saveUser(req.body) && res.json({ success: true }));
app.post('/api/dealer/users/:id/top-up', authMiddleware, (req, res) => res.json({ balance: database.updateWallet(req.params.id, 'USER', req.body.amount, 'Top-up from Dealer', 'credit') }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
