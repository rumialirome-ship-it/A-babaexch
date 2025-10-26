require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('./authMiddleware');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(cors());
app.use(express.json());

const DB_PATH = path.join(__dirname, 'db.json');
const JWT_SECRET = process.env.JWT_SECRET;
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.API_KEY;

// --- AI SETUP ---
let ai = null;
if (!API_KEY) {
    console.warn("API_KEY for Google Gemini is not set. AI features will be disabled.");
} else {
    ai = new GoogleGenAI({ apiKey: API_KEY });
}

// --- DATABASE HELPERS ---
let db;
const readDb = async () => {
  try {
    const data = await fs.readFile(DB_PATH, 'utf-8');
    db = JSON.parse(data);
  } catch (error) {
    console.error('Failed to read database:', error);
    process.exit(1);
  }
};

const writeDb = async () => {
  try {
    await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
  } catch (error) {
    console.error('Failed to write to database:', error);
  }
};

// --- LEDGER HELPERS ---
const addLedgerEntry = (account, description, debit, credit) => {
    const lastBalance = account.ledger.length > 0 ? account.ledger[account.ledger.length-1].balance : 0;
    const newBalance = lastBalance - debit + credit;
    account.ledger.push({ id: uuidv4(), timestamp: new Date(), description, debit, credit, balance: newBalance });
    account.wallet = newBalance;
};

// --- AUTHENTICATION ROUTES ---
app.post('/api/auth/login', (req, res) => {
    const { loginId, password } = req.body;
    const lowerCaseLoginId = loginId.toLowerCase();

    const findAccount = (collection, role) => {
        const account = collection.find(acc => acc.id.toLowerCase() === lowerCaseLoginId);
        if (account && account.password === password) {
            const token = jwt.sign({ id: account.id, role }, JWT_SECRET, { expiresIn: '1d' });
            return res.json({ token, role, account });
        }
        return null;
    };
    
    if (findAccount(db.users, 'USER')) return;
    if (findAccount(db.dealers, 'DEALER')) return;
    
    if (db.admin.id.toLowerCase() === lowerCaseLoginId && db.admin.password === password) {
        const token = jwt.sign({ id: db.admin.id, role: 'ADMIN' }, JWT_SECRET, { expiresIn: '1d' });
        return res.json({ token, role: 'ADMIN', account: db.admin });
    }

    res.status(401).json({ message: 'Invalid Account ID or Password.' });
});

app.post('/api/auth/reset-password', async (req, res) => {
    const { accountId, contact, newPassword } = req.body;
    
    const accounts = [...db.users, ...db.dealers];
    const account = accounts.find(acc => acc.id === accountId);

    if (!account) return res.status(404).json({ message: 'Account ID not found.' });
    if (account.contact !== contact) return res.status(403).json({ message: 'Contact number does not match the account ID.' });
    
    account.password = newPassword;
    await writeDb();
    res.json({ message: 'Password has been reset successfully.' });
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
    let account;
    if (req.user.role === 'USER') account = db.users.find(u => u.id === req.user.id);
    if (req.user.role === 'DEALER') account = db.dealers.find(d => d.id === req.user.id);
    if (req.user.role === 'ADMIN') account = db.admin;
    
    if (!account) return res.status(404).json({ message: 'Account not found.' });
    res.json({ account, role: req.user.role });
});


// --- PUBLIC ROUTES ---
app.get('/api/games', (req, res) => {
    const publicGames = db.games.map(({logo, ...game}) => game); // remove logo from payload
    res.json(publicGames);
});

// --- AI ROUTES ---
app.post('/api/ai/lucky-number', authMiddleware, async (req, res) => {
    if (!ai) {
        return res.status(503).json({ message: "AI service is not configured on the server." });
    }
    if (req.user.role !== 'USER') return res.sendStatus(403);

    const { userPrompt, gameName, numberType } = req.body;
    
    if (!userPrompt || !gameName || !numberType) {
        return res.status(400).json({ message: "Prompt, game name, and number type are required." });
    }

    const systemInstruction = `You are a mystical oracle for a digital lottery game called A-Baba Exchange. Your purpose is to interpret dreams, feelings, or simple requests into lucky lottery numbers. The user will specify the type of number they need: '1 Digit Open', '1 Digit Close', or '2 Digit'. You MUST provide only one number in the requested format. Your response must be brief, mystical, and encouraging. First, provide the number, then a short, creative explanation. The number MUST be enclosed in [NUMBER] tags, like [42]. Example for '2 Digit': '[42] The stars align for cosmic balance.'. Example for '1 Digit Open': '[7] The number 7 resonates with freedom and luck.'`;

    try {
        const fullPrompt = `Game: ${gameName}\nNumber Type: ${numberType}\nUser's Request: "${userPrompt}"`;
        
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: fullPrompt,
            config: {
                systemInstruction: systemInstruction,
                temperature: 1,
            },
        });

        const text = response.text;
        const numberMatch = text.match(/\[(\d{1,2})\]/);
        
        if (!numberMatch || !numberMatch[1]) {
            // Fallback if the model doesn't follow instructions
            const fallbackExplanation = text.replace(/\[\d{1,2}\]/g, '').trim();
            const fallbackNumber = numberType === '2 Digit' ? String(Math.floor(Math.random() * 100)).padStart(2, '0') : String(Math.floor(Math.random() * 10));
            return res.json({ 
                suggestedNumber: fallbackNumber, 
                explanation: fallbackExplanation || "The ether was unclear, but fortune favors this number."
            });
        }
        
        const suggestedNumber = numberMatch[1];
        const explanation = text.replace(numberMatch[0], '').trim();

        res.json({ suggestedNumber, explanation });

    } catch (error) {
        console.error("Gemini API error:", error);
        res.status(500).json({ message: "Failed to get a response from the AI oracle." });
    }
});

// --- USER ROUTES ---
app.get('/api/user/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'USER') return res.sendStatus(403);
    const userBets = db.bets.filter(b => b.userId === req.user.id);
    res.json({ games: db.games, bets: userBets });
});

app.post('/api/user/bets', authMiddleware, async (req, res) => {
    if (req.user.role !== 'USER') return res.sendStatus(403);
    const { gameId, subGameType, numbers, amountPerNumber } = req.body;
    
    const user = db.users.find(u => u.id === req.user.id);
    const dealer = db.dealers.find(d => d.id === user.dealerId);
    const game = db.games.find(g => g.id === gameId);
    if (!user || !dealer || !game) return res.status(404).json({ message: 'User, Dealer or Game not found' });
    if (user.isRestricted) return res.status(403).json({ message: 'Your account is restricted.' });

    const totalAmount = numbers.length * amountPerNumber;
    if (user.wallet < totalAmount) return res.status(400).json({ message: 'Insufficient funds' });
    if (user.betLimit && totalAmount > user.betLimit) return res.status(400).json({ message: `Bet amount exceeds your transaction limit of PKR ${user.betLimit}` });

    const newBet = { id: uuidv4(), userId: user.id, dealerId: dealer.id, gameId, subGameType, numbers, amountPerNumber, totalAmount, timestamp: new Date() };
    db.bets.push(newBet);
    
    // Logic: user wallet decreases, admin wallet increases
    addLedgerEntry(user, `Bet placed - ${game.name} (${subGameType})`, totalAmount, 0);
    addLedgerEntry(db.admin, `Bet stake from ${user.name} on ${game.name}`, 0, totalAmount);
    
    // Commission logic
    const userCommission = totalAmount * (user.commissionRate / 100);
    const dealerCommission = totalAmount * (dealer.commissionRate - user.commissionRate) / 100;

    if (userCommission > 0) {
        addLedgerEntry(db.admin, `Commission to user ${user.name}`, userCommission, 0);
        addLedgerEntry(user, `Commission earned on bet – ${game.name}`, 0, userCommission);
    }
    if (dealerCommission > 0) {
        addLedgerEntry(db.admin, `Commission to dealer ${dealer.name}`, dealerCommission, 0);
        addLedgerEntry(dealer, `Commission from user bet – ${game.name}`, 0, dealerCommission);
    }

    await writeDb();
    res.status(201).json(newBet);
});


// --- DEALER ROUTES ---
app.get('/api/dealer/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    const users = db.users.filter(u => u.dealerId === req.user.id);
    res.json({ users });
});

app.post('/api/dealer/users', authMiddleware, async (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    const { userData, initialDeposit } = req.body;
    const dealer = db.dealers.find(d => d.id === req.user.id);
    
    if (db.users.some(u => u.id.toLowerCase() === userData.id.toLowerCase())) {
      return res.status(400).json({ message: "This User Login ID is already taken." });
    }

    if (initialDeposit > 0 && dealer.wallet < initialDeposit) {
        return res.status(400).json({ message: `Insufficient funds for initial deposit. Available: ${dealer.wallet}` });
    }
    
    const newUser = { ...userData, wallet: 0, ledger: [], isRestricted: false };
    
    if(initialDeposit > 0) {
      addLedgerEntry(dealer, `Initial Deposit for new user: ${userData.name}`, initialDeposit, 0);
      addLedgerEntry(newUser, `Initial Deposit from Dealer: ${dealer.name}`, 0, initialDeposit);
    } else {
      addLedgerEntry(newUser, 'Account Created', 0, 0);
    }

    db.users.push(newUser);
    await writeDb();
    res.status(201).json(newUser);
});

app.put('/api/dealer/users/:id', authMiddleware, async (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    const userData = req.body;
    const userIndex = db.users.findIndex(u => u.id === req.params.id && u.dealerId === req.user.id);
    if (userIndex === -1) return res.status(404).json({ message: "User not found or you don't have permission." });
    
    // Keep sensitive data from being overwritten
    const existingUser = db.users[userIndex];
    db.users[userIndex] = { ...existingUser, ...userData, wallet: existingUser.wallet, ledger: existingUser.ledger };

    await writeDb();
    res.json(db.users[userIndex]);
});

app.post('/api/dealer/topup/user', authMiddleware, async (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    const { userId, amount } = req.body;
    const dealer = db.dealers.find(d => d.id === req.user.id);
    const user = db.users.find(u => u.id === userId && u.dealerId === dealer.id);

    if (!user) return res.status(404).json({ message: "User not found." });
    if (dealer.wallet < amount) return res.status(400).json({ message: "Insufficient funds." });
    
    addLedgerEntry(dealer, `Top-Up for User: ${user.name}`, amount, 0);
    addLedgerEntry(user, `Top-up from Dealer: ${dealer.name}`, 0, amount);

    await writeDb();
    res.json({ message: "Top-up successful." });
});

app.put('/api/dealer/users/:id/toggle-restriction', authMiddleware, async (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    const user = db.users.find(u => u.id === req.params.id && u.dealerId === req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.isRestricted = !user.isRestricted;
    await writeDb();
    res.json(user);
});


// --- ADMIN ROUTES ---
app.get('/api/admin/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    res.json({
        dealers: db.dealers,
        users: db.users,
        games: db.games,
        bets: db.bets
    });
});

app.post('/api/admin/dealers', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const dealerData = req.body;
     if (db.dealers.some(d => d.id.toLowerCase() === dealerData.id.toLowerCase())) {
      return res.status(400).json({ message: "This Dealer Login ID is already taken." });
    }
    const newDealer = { ...dealerData, ledger: [], isRestricted: false };
    const initialAmount = newDealer.wallet || 0;
    addLedgerEntry(newDealer, initialAmount > 0 ? 'Initial Deposit' : 'Account Created', 0, initialAmount);
    db.dealers.push(newDealer);
    await writeDb();
    res.status(201).json(newDealer);
});

app.put('/api/admin/dealers/:id', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const { dealerData, originalId } = req.body;
    const dealerIndex = db.dealers.findIndex(d => d.id === originalId);
    if (dealerIndex === -1) return res.status(404).json({ message: 'Dealer not found.' });

    const idChanged = dealerData.id !== originalId;
    if (idChanged && db.dealers.some(d => d.id.toLowerCase() === dealerData.id.toLowerCase() && d.id !== originalId)) {
        return res.status(400).json({ message: 'Dealer Login ID already taken.' });
    }

    const existingDealer = db.dealers[dealerIndex];
    // Don't allow wallet to be updated via this form
    db.dealers[dealerIndex] = { ...existingDealer, ...dealerData, wallet: existingDealer.wallet, ledger: existingDealer.ledger };

    if (idChanged) {
        db.users.forEach(u => { if (u.dealerId === originalId) u.dealerId = dealerData.id; });
    }

    await writeDb();
    res.json(db.dealers[dealerIndex]);
});

app.post('/api/admin/topup/dealer', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const { dealerId, amount } = req.body;
    const dealer = db.dealers.find(d => d.id === dealerId);
    if (!dealer) return res.status(404).json({ message: 'Dealer not found.' });
    addLedgerEntry(dealer, 'Admin Top-Up', 0, amount);
    await writeDb();
    res.json({ message: 'Top-up successful' });
});

app.put('/api/admin/accounts/:type/:id/toggle-restriction', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const { type, id } = req.params;
    const collection = type === 'user' ? db.users : db.dealers;
    const account = collection.find(acc => acc.id === id);
    if (!account) return res.status(404).json({ message: 'Account not found.' });
    account.isRestricted = !account.isRestricted;
    await writeDb();
    res.json(account);
});

app.post('/api/admin/games/:id/declare-winner', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const { winningNumber } = req.body;
    const game = db.games.find(g => g.id === req.params.id);
    if (!game) return res.status(404).json({ message: 'Game not found.' });
    game.winningNumber = winningNumber;
    game.payoutsApproved = false;
    await writeDb();
    res.json(game);
});

app.post('/api/admin/games/:id/approve-payouts', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const game = db.games.find(g => g.id === req.params.id);
    if (!game || !game.winningNumber || game.payoutsApproved) return res.status(400).json({ message: 'Game not ready for payout.' });

    const gameBets = db.bets.filter(bet => bet.gameId === game.id);
    gameBets.forEach(bet => {
        const winningNumbersInBet = bet.numbers.filter(num => {
            let isWin = false;
            switch (bet.subGameType) {
                case "1 Digit Open": isWin = num === game.winningNumber[0]; break;
                case "1 Digit Close": isWin = num === game.winningNumber[1]; break;
                default: isWin = num === game.winningNumber; break;
            }
            return isWin;
        });

        if (winningNumbersInBet.length > 0) {
            const user = db.users.find(u => u.id === bet.userId);
            const dealer = db.dealers.find(d => d.id === bet.dealerId);
            if (!user || !dealer) return;

            const getPrizeMultiplier = (rates, subGameType) => {
                if (subGameType === "1 Digit Open") return rates.oneDigitOpen;
                if (subGameType === "1 Digit Close") return rates.oneDigitClose;
                return rates.twoDigit;
            };

            const userPrize = winningNumbersInBet.length * bet.amountPerNumber * getPrizeMultiplier(user.prizeRates, bet.subGameType);
            const dealerProfit = winningNumbersInBet.length * bet.amountPerNumber * (getPrizeMultiplier(dealer.prizeRates, bet.subGameType) - getPrizeMultiplier(user.prizeRates, bet.subGameType));
            
            if (userPrize > 0) {
                addLedgerEntry(db.admin, `Payout to user ${user.name}`, userPrize, 0);
                addLedgerEntry(user, `Prize Won - ${game.name}`, 0, userPrize);
            }
            if (dealerProfit > 0) {
                addLedgerEntry(db.admin, `Profit to dealer ${dealer.name}`, dealerProfit, 0);
                addLedgerEntry(dealer, `Profit from User Prize - ${game.name}`, 0, dealerProfit);
            }
        }
    });

    game.payoutsApproved = true;
    await writeDb();
    res.json(game);
});

// --- MAIN ---
const startServer = async () => {
  await readDb();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

startServer();