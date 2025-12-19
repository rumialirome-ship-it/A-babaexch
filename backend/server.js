
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./authMiddleware');
const database = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize database
try {
    database.connect();
    database.verifySchema();
    console.log('Database connected and verified.');
} catch (err) {
    console.error('FATAL DB ERROR:', err.message);
}

// Safety: Ensure JSON response
app.use('/api', (req, res, next) => {
    res.setHeader('Content-Type', 'application/json');
    next();
});

// --- AUTH ---
app.post('/api/auth/login', (req, res) => {
    try {
        const { loginId, password } = req.body;
        const { account, role } = database.findAccountForLogin(loginId);
        if (account && account.password === password) {
            const fullAccount = database.findAccountById(account.id, role.toLowerCase() + 's');
            const token = jwt.sign({ id: account.id, role }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });
            return res.json({ token, role, account: fullAccount });
        }
        res.status(401).json({ message: 'Invalid credentials.' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
    try {
        const account = database.findAccountById(req.user.id, req.user.role.toLowerCase() + 's');
        if (!account) return res.status(404).json({ message: 'Not found.' });
        res.json({ account, role: req.user.role });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- PUBLIC ---
app.get('/api/games', (req, res) => {
    try { res.json(database.getAllFromTable('games')); } 
    catch (e) { res.status(500).json({ error: e.message, games: [] }); }
});

// --- ADMIN ---
app.get('/api/admin/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try {
        res.json({
            dealers: database.getAllFromTable('dealers', true),
            users: database.getAllFromTable('users', true),
            games: database.getAllFromTable('games'),
            bets: database.getAllFromTable('bets')
        });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/admin/summary', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.getFinancialSummary()); } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/admin/number-summary', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.getNumberStakeSummary(req.query)); } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/admin/bulk-bet', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.placeBulkBets(req.body.userId, req.body.gameId, req.body.betGroups)); } 
    catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.post('/api/admin/games/:id/declare-winner', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.declareWinnerForGame(req.params.id, req.body.winningNumber)); } 
    catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.put('/api/admin/games/:id/update-winner', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.updateWinningNumber(req.params.id, req.body.newWinningNumber)); } 
    catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.post('/api/admin/games/:id/approve-payouts', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.approvePayoutsForGame(req.params.id)); } 
    catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.post('/api/admin/topup/dealer', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try {
        const admin = database.findAccountById('Guru', 'admins');
        database.runInTransaction(() => {
            database.addLedgerEntry(req.body.dealerId, 'DEALER', 'Top-up from Admin', 0, req.body.amount);
            database.addLedgerEntry(admin.id, 'ADMIN', `Top-up for Dealer: ${req.body.dealerId}`, req.body.amount, 0);
        });
        res.json({ success: true });
    } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.post('/api/admin/withdraw/dealer', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try {
        const admin = database.findAccountById('Guru', 'admins');
        database.runInTransaction(() => {
            database.addLedgerEntry(req.body.dealerId, 'DEALER', 'Withdrawal by Admin', req.body.amount, 0);
            database.addLedgerEntry(admin.id, 'ADMIN', `Withdrawal from Dealer: ${req.body.dealerId}`, 0, req.body.amount);
        });
        res.json({ success: true });
    } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.put('/api/admin/dealers/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.saveDealer(req.body)); } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/admin/dealers', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.saveDealer(req.body)); } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/admin/accounts/:type/:id/toggle-restriction', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json({ success: database.toggleRestriction(req.params.id, req.params.type + 's') }); } 
    catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/admin/games/:id/draw-time', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.updateGameDrawTime(req.params.id, req.body.newDrawTime)); } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- DEALER ---
app.get('/api/dealer/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try {
        const allUsers = database.getAllFromTable('users', true);
        const allBets = database.getAllFromTable('bets');
        res.json({
            users: allUsers.filter(u => u.dealerId === req.user.id),
            bets: allBets.filter(b => b.dealerId === req.user.id)
        });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/dealer/users', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try {
        database.runInTransaction(() => {
            database.saveUser(req.body.userData);
            if (req.body.initialDeposit > 0) {
                database.addLedgerEntry(req.user.id, 'DEALER', `Deposit for User: ${req.body.userData.id}`, req.body.initialDeposit, 0);
                database.addLedgerEntry(req.body.userData.id, 'USER', 'Initial Deposit', 0, req.body.initialDeposit);
            }
        });
        res.json({ success: true });
    } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.post('/api/dealer/bets/bulk', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try { res.json(database.placeBulkBets(req.body.userId, req.body.gameId, req.body.betGroups)); } 
    catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.post('/api/dealer/topup/user', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try {
        database.runInTransaction(() => {
            database.addLedgerEntry(req.user.id, 'DEALER', `Top-up for User: ${req.body.userId}`, req.body.amount, 0);
            database.addLedgerEntry(req.body.userId, 'USER', 'Top-up from Dealer', 0, req.body.amount);
        });
        res.json({ success: true });
    } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.post('/api/dealer/withdraw/user', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try {
        database.runInTransaction(() => {
            database.addLedgerEntry(req.body.userId, 'USER', 'Withdrawal by Dealer', req.body.amount, 0);
            database.addLedgerEntry(req.user.id, 'DEALER', `Withdrawal from User: ${req.body.userId}`, 0, req.body.amount);
        });
        res.json({ success: true });
    } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

app.put('/api/dealer/users/:id/toggle-restriction', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try { res.json({ success: database.toggleRestriction(req.params.id, 'users') }); } 
    catch (e) { res.status(500).json({ message: e.message }); }
});

// --- USER ---
app.get('/api/user/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'USER') return res.sendStatus(403);
    try {
        const games = database.getAllFromTable('games');
        const bets = database.getAllFromTable('bets').filter(b => b.userId === req.user.id);
        res.json({ games, bets });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/user/bets', authMiddleware, (req, res) => {
    if (req.user.role !== 'USER') return res.sendStatus(403);
    try { res.json(database.placeBulkBets(req.user.id, req.body.gameId, req.body.betGroups)); } 
    catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

// --- CATCH ALL ERRORS ---
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Internal Server Error', error: err.message });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server active on port ${PORT}`));
