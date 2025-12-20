
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const database = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'lottery-secret-key';

// Auth Middleware
const auth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (e) { res.status(401).json({ message: 'Invalid Session' }); }
};

app.get('/api/games', async (req, res) => {
    try {
        const games = await database.getAllFromTable('games');
        res.json(games);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
    const { loginId, password } = req.body;
    try {
        const { account, role } = await database.findAccountForLogin(loginId);
        if (account && account.password === password) {
            const token = jwt.sign({ id: account.id, role }, JWT_SECRET, { expiresIn: '1d' });
            return res.json({ token, role, account });
        }
        res.status(401).json({ message: "Invalid Credentials" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/verify', auth, async (req, res) => {
    try {
        const table = req.user.role.toLowerCase() + 's';
        const account = await database.findAccountById(req.user.id, table);
        res.json({ account, role: req.user.role });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend Active on Port ${PORT}`));
