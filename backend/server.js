
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const database = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'lottery-secret-key';

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Authentication required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ message: 'Invalid or expired session' });
  }
};

// --- DATA AGGREGATION ROUTES ---

app.get('/api/games', async (req, res) => {
  try {
    const games = await database.getAllFromTable('games');
    res.json(games);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/data', auth, async (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
  try {
    const dealers = await database.getAllFromTable('dealers');
    const users = await database.getAllFromTable('users');
    const games = await database.getAllFromTable('games');
    const bets = await database.getAllFromTable('bets');
    res.json({ dealers, users, games, bets });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/dealer/data', auth, async (req, res) => {
  if (req.user.role !== 'DEALER') return res.status(403).json({ message: 'Forbidden' });
  try {
    const games = await database.getAllFromTable('games');
    const users = await database.query('SELECT * FROM users WHERE dealerId = $1', [req.user.id]);
    const bets = await database.query('SELECT * FROM bets WHERE dealerId = $1', [req.user.id]);
    res.json({ games, users: users.rows, bets: bets.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/user/data', auth, async (req, res) => {
  if (req.user.role !== 'USER') return res.status(403).json({ message: 'Forbidden' });
  try {
    const games = await database.getAllFromTable('games');
    const bets = await database.query('SELECT * FROM bets WHERE userId = $1', [req.user.id]);
    res.json({ games, bets: bets.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { loginId, password } = req.body;
  if (!loginId || !password) return res.status(400).json({ message: "Missing credentials" });

  try {
    const { account, role } = await database.findAccountForLogin(loginId);
    if (account && account.password === password) {
      const token = jwt.sign({ id: account.id, role }, JWT_SECRET, { expiresIn: '1d' });
      const { password: _, ...safeAccount } = account;
      return res.json({ token, role, account: safeAccount });
    }
    res.status(401).json({ message: "Invalid ID or Password" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/verify', auth, async (req, res) => {
  try {
    const table = req.user.role.toLowerCase() + 's';
    const account = await database.findAccountById(req.user.id, table);
    if (!account) return res.status(404).json({ message: 'Account not found' });
    const { password: _, ...safeAccount } = account;
    res.json({ account: safeAccount, role: req.user.role });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`A-BABA ENGINE ONLINE (PKT) - PORT: ${PORT}`);
});
