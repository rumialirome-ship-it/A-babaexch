
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./authMiddleware');
const database = require('./database');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const JWT_SECRET = process.env.JWT_SECRET;

app.post('/api/auth/login', (req, res) => {
    const { loginId, password } = req.body;
    const { account, role } = database.findAccountForLogin(loginId);
    if (account && account.password === password) {
        const fullAccount = database.findAccountById(account.id, role.toLowerCase() + 's');
        const token = jwt.sign({ id: account.id, role }, JWT_SECRET, { expiresIn: '1d' });
        return res.json({ token, role, account: fullAccount });
    }
    res.status(401).json({ message: 'Invalid credentials.' });
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
    const account = database.findAccountById(req.user.id, req.user.role.toLowerCase() + 's');
    if (!account) return res.status(404).json({ message: 'Not found.' });
    res.json({ account, role: req.user.role });
});

app.get('/api/games', (req, res) => res.json(database.getAllFromTable('games')));

app.get('/api/admin/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    res.json({
        dealers: database.getAllFromTable('dealers', true),
        users: database.getAllFromTable('users', true),
        games: database.getAllFromTable('games'),
        bets: database.getAllFromTable('bets')
    });
});

app.post('/api/admin/users/bulk-import', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try {
        const count = database.bulkImportUsers(req.body.users);
        res.json({ message: `Successfully imported ${count} users.` });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// Minimal implementation of other routes to keep file functional
app.get('/api/admin/summary', authMiddleware, (req, res) => res.json(database.getFinancialSummary()));
app.get('/api/admin/number-summary', authMiddleware, (req, res) => res.json(database.getNumberStakeSummary()));
app.get('/api/user/data', authMiddleware, (req, res) => res.json({ games: database.getAllFromTable('games'), bets: [] }));
app.get('/api/dealer/data', authMiddleware, (req, res) => res.json({ users: database.findUsersByDealerId(req.user.id), bets: [] }));

database.connect();
database.verifySchema();
app.listen(3001, () => console.error('Backend live on 3001'));
