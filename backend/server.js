
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const database = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'lottery-secret-key';

// Middleware to verify JWT
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

// --- ROUTES ---

app.get('/api/games', async (req, res) => {
  try {
    const games = await database.getAllFromTable('games');
    res.json(games);
  } catch (e) {
    console.error("Fetch Games Error:", e);
    res.status(500).json({ error: "Failed to load games" });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { loginId, password } = req.body;
  if (!loginId || !password) return res.status(400).json({ message: "Missing credentials" });

  try {
    const { account, role } = await database.findAccountForLogin(loginId);
    if (account && account.password === password) {
      const token = jwt.sign({ id: account.id, role }, JWT_SECRET, { expiresIn: '1d' });
      // Remove password from response for security
      const { password: _, ...safeAccount } = account;
      return res.json({ token, role, account: safeAccount });
    }
    res.status(401).json({ message: "Invalid ID or Password" });
  } catch (e) {
    console.error("Login Error:", e);
    res.status(500).json({ error: "Server authentication error" });
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
    console.error("Verify Error:", e);
    res.status(500).json({ error: "Verification failed" });
  }
});

// Start Server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`----------------------------------------`);
    console.log(`A-BABA POSTGRES ENGINE ONLINE`);
    console.log(`PORT: ${PORT}`);
    console.log(`DATABASE: ${process.env.DATABASE_URL ? 'Remote' : 'Localhost'}`);
    console.log(`----------------------------------------`);
});
