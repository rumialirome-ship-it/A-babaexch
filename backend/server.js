
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
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

// --- TRANSACTION HELPERS ---

async function createLedgerEntry(accountId, description, debit, credit) {
    const acc = await database.get('SELECT wallet FROM admins WHERE id = ? UNION SELECT wallet FROM dealers WHERE id = ? UNION SELECT wallet FROM users WHERE id = ?', [accountId, accountId, accountId]);
    const currentBalance = acc ? parseFloat(acc.wallet) : 0;
    const newBalance = currentBalance - debit + credit;
    
    await database.run(
        'INSERT INTO ledgers (accountId, description, debit, credit, balance) VALUES (?, ?, ?, ?, ?)',
        [accountId, description, debit, credit, newBalance]
    );

    // Update the actual account wallet
    const tables = ['admins', 'dealers', 'users'];
    for (const table of tables) {
        await database.run(`UPDATE ${table} SET wallet = ? WHERE id = ?`, [newBalance, accountId]);
    }
}

// --- ROUTES ---

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
    const users = await database.query('SELECT * FROM users WHERE dealerId = ?', [req.user.id]);
    const bets = await database.query('SELECT * FROM bets WHERE dealerId = ?', [req.user.id]);
    res.json({ games, users, bets });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/user/data', auth, async (req, res) => {
  if (req.user.role !== 'USER') return res.status(403).json({ message: 'Forbidden' });
  try {
    const games = await database.getAllFromTable('games');
    const bets = await database.query('SELECT * FROM bets WHERE userId = ?', [req.user.id]);
    res.json({ games, bets });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- ACCOUNT MGMT ---

app.post('/api/admin/save-dealer', auth, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).send();
    const { id, name, password, area, contact, commissionRate, prizeRates } = req.body;
    const existing = await database.get('SELECT id FROM dealers WHERE id = ?', [id]);
    
    if (existing) {
        await database.run('UPDATE dealers SET name=?, password=?, area=?, contact=?, commissionRate=?, prizeRates=? WHERE id=?', 
            [name, password, area, contact, commissionRate, JSON.stringify(prizeRates), id]);
    } else {
        await database.run('INSERT INTO dealers (id, name, password, area, contact, commissionRate, prizeRates, wallet) VALUES (?,?,?,?,?,?,?,?)',
            [id, name, password, area, contact, commissionRate, JSON.stringify(prizeRates), 0]);
        await createLedgerEntry(id, 'Account Created', 0, 0);
    }
    res.json({ success: true });
});

app.post('/api/dealer/save-user', auth, async (req, res) => {
    if (req.user.role !== 'DEALER') return res.status(403).send();
    const { id, name, password, area, contact, commissionRate, prizeRates, betLimits } = req.body;
    const existing = await database.get('SELECT id FROM users WHERE id = ?', [id]);
    
    if (existing) {
        await database.run('UPDATE users SET name=?, password=?, area=?, contact=?, commissionRate=?, prizeRates=?, betLimits=? WHERE id=?', 
            [name, password, area, contact, commissionRate, JSON.stringify(prizeRates), JSON.stringify(betLimits), id]);
    } else {
        await database.run('INSERT INTO users (id, name, password, dealerId, area, contact, commissionRate, prizeRates, betLimits, wallet) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [id, name, password, req.user.id, area, contact, commissionRate, JSON.stringify(prizeRates), JSON.stringify(betLimits), 0]);
        await createLedgerEntry(id, 'Account Created', 0, 0);
    }
    res.json({ success: true });
});

app.post('/api/auth/toggle-restriction', auth, async (req, res) => {
    const { accountId, type } = req.body;
    const table = type === 'dealer' ? 'dealers' : 'users';
    await database.run(`UPDATE ${table} SET isRestricted = 1 - isRestricted WHERE id = ?`, [accountId]);
    res.json({ success: true });
});

// --- WALLET MGMT ---

app.post('/api/admin/topup-dealer', auth, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).send();
    const { dealerId, amount } = req.body;
    await createLedgerEntry(dealerId, 'Top-Up from Admin', 0, amount);
    await createLedgerEntry(req.user.id, `Transfer to Dealer ${dealerId}`, amount, 0);
    res.json({ success: true });
});

app.post('/api/dealer/topup-user', auth, async (req, res) => {
    if (req.user.role !== 'DEALER') return res.status(403).send();
    const { userId, amount } = req.body;
    const dealer = await database.get('SELECT wallet FROM dealers WHERE id = ?', [req.user.id]);
    if (dealer.wallet < amount) return res.status(400).json({ message: "Insufficient Dealer Wallet" });
    
    await createLedgerEntry(userId, 'Top-Up from Dealer', 0, amount);
    await createLedgerEntry(req.user.id, `Transfer to User ${userId}`, amount, 0);
    res.json({ success: true });
});

// --- BETTING ---

app.post('/api/user/place-bet', auth, async (req, res) => {
    const { gameId, betGroups } = req.body;
    const user = await database.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const game = await database.get('SELECT * FROM games WHERE id = ?', [gameId]);

    if (!game.isMarketOpen || game.winningNumber) return res.status(400).json({ message: "Market Closed" });
    
    let totalCost = 0;
    betGroups.forEach(g => totalCost += (g.numbers.length * g.amountPerNumber));
    
    if (user.wallet < totalCost) return res.status(400).json({ message: "Insufficient Balance" });

    for (const group of betGroups) {
        const betId = uuidv4();
        await database.run('INSERT INTO bets (id, userId, dealerId, gameId, subGameType, numbers, amountPerNumber, totalAmount) VALUES (?,?,?,?,?,?,?,?)',
            [betId, user.id, user.dealerId, gameId, group.subGameType, JSON.stringify(group.numbers), group.amountPerNumber, group.numbers.length * group.amountPerNumber]);
    }

    await createLedgerEntry(user.id, `Bet placed on ${game.name}`, totalCost, 0);
    res.json({ success: true });
});

// --- WINNER DECLARATION ---

app.post('/api/admin/declare-winner', auth, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).send();
    const { gameId, winningNumber } = req.body;
    
    await database.run('UPDATE games SET winningNumber = ?, isMarketOpen = 0 WHERE id = ?', [winningNumber, gameId]);
    
    const bets = await database.query('SELECT * FROM bets WHERE gameId = ?', [gameId]);
    const game = await database.get('SELECT name FROM games WHERE id = ?', [gameId]);

    for (const bet of bets) {
        const user = await database.get('SELECT prizeRates FROM users WHERE id = ?', [bet.userId]);
        const rates = JSON.parse(user.prizeRates);
        const betNumbers = JSON.parse(bet.numbers);
        let winCount = 0;

        betNumbers.forEach(num => {
            if (bet.subGameType === '1 Digit Open' && winningNumber[0] === num) winCount++;
            if (bet.subGameType === '1 Digit Close' && winningNumber[1] === num) winCount++;
            if (bet.subGameType === '2 Digit' && winningNumber === num) winCount++;
        });

        if (winCount > 0) {
            let multiplier = rates.twoDigit;
            if (bet.subGameType === '1 Digit Open') multiplier = rates.oneDigitOpen;
            if (bet.subGameType === '1 Digit Close') multiplier = rates.oneDigitClose;
            
            const payout = winCount * bet.amountPerNumber * multiplier;
            await createLedgerEntry(bet.userId, `WIN: ${game.name} (${winningNumber})`, 0, payout);
        }
    }
    res.json({ success: true });
});

app.post('/api/auth/login', async (req, res) => {
  const { loginId, password } = req.body;
  try {
    const { account, role } = await database.findAccountForLogin(loginId);
    if (account && account.password === password) {
      const token = jwt.sign({ id: account.id, role }, JWT_SECRET, { expiresIn: '1d' });
      const { password: _, ...safeAccount } = account;
      return res.json({ token, role, account: safeAccount });
    }
    res.status(401).json({ message: "Invalid ID or Password" });
  } catch (e) {
    res.status(500).json({ error: "Authentication system error" });
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
