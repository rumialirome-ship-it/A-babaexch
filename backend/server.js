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
const PORT = 3001; // Hardcode to match Nginx and documentation
const API_KEY = process.env.API_KEY;

// --- AI SETUP ---
let ai = null;
if (!API_KEY) {
    console.warn("API_KEY for Google Gemini is not set. AI features will be disabled.");
} else {
    ai = new GoogleGenAI({ apiKey: API_KEY });
}

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

app.post('/api/auth/reset-password', (req, res) => {
    const { accountId, contact, newPassword } = req.body;
    const wasUpdated = database.updatePassword(accountId, contact, newPassword);

    if (wasUpdated) {
        res.json({ message: 'Password has been reset successfully.' });
    } else {
        res.status(404).json({ message: 'Account ID and Contact Number do not match.' });
    }
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
    const table = req.user.role.toLowerCase() + 's';
    const account = database.findAccountById(req.user.id, table);
    
    if (!account) return res.status(404).json({ message: 'Account not found.' });
    res.json({ account, role: req.user.role });
});


// --- PUBLIC ROUTES ---
app.get('/api/games', (req, res) => {
    const games = database.getAllFromTable('games');
    res.json(games);
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
    const games = database.getAllFromTable('games');
    const userBets = database.db.prepare('SELECT * FROM bets WHERE userId = ? ORDER BY timestamp DESC').all(req.user.id).map(bet => ({
        ...bet,
        numbers: JSON.parse(bet.numbers)
    }));
    res.json({ games, bets: userBets });
});

app.post('/api/user/bets', authMiddleware, (req, res) => {
    if (req.user.role !== 'USER') return res.sendStatus(403);
    const { gameId, subGameType, numbers, amountPerNumber } = req.body;
    
    try {
        database.runInTransaction(() => {
            const user = database.findAccountById(req.user.id, 'users');
            if (!user) throw { status: 404, message: 'User not found' };
            
            const dealer = database.findAccountById(user.dealerId, 'dealers');
            const game = database.getAllFromTable('games').find(g => g.id === gameId);
            const admin = database.findAccountById('Guru', 'admins');

            if (!dealer || !game || !admin) throw { status: 404, message: 'Dealer, Game or Admin not found' };
            if (user.isRestricted) throw { status: 403, message: 'Your account is restricted.' };

            const totalAmount = numbers.length * amountPerNumber;
            if (user.wallet < totalAmount) throw { status: 400, message: 'Insufficient funds' };
            if (user.betLimit && totalAmount > user.betLimit) throw { status: 400, message: `Bet amount exceeds your transaction limit of PKR ${user.betLimit}` };

            const newBet = { id: uuidv4(), userId: user.id, dealerId: dealer.id, gameId, subGameType, numbers: JSON.stringify(numbers), amountPerNumber, totalAmount, timestamp: new Date().toISOString() };
            database.db.prepare('INSERT INTO bets (id, userId, dealerId, gameId, subGameType, numbers, amountPerNumber, totalAmount, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
                newBet.id, newBet.userId, newBet.dealerId, newBet.gameId, newBet.subGameType, newBet.numbers, newBet.amountPerNumber, newBet.totalAmount, newBet.timestamp
            );
            
            database.addLedgerEntry(user.id, 'USER', `Bet placed - ${game.name} (${subGameType})`, totalAmount, 0);
            database.addLedgerEntry(admin.id, 'ADMIN', `Bet stake from ${user.name} on ${game.name}`, 0, totalAmount);
            
            const userCommission = totalAmount * (user.commissionRate / 100);
            const dealerCommission = totalAmount * (dealer.commissionRate - user.commissionRate) / 100;

            if (userCommission > 0) {
                database.addLedgerEntry(admin.id, 'ADMIN', `Commission to user ${user.name}`, userCommission, 0);
                database.addLedgerEntry(user.id, 'USER', `Commission earned on bet – ${game.name}`, 0, userCommission);
            }
            if (dealerCommission > 0) {
                database.addLedgerEntry(admin.id, 'ADMIN', `Commission to dealer ${dealer.name}`, dealerCommission, 0);
                database.addLedgerEntry(dealer.id, 'DEALER', `Commission from user bet – ${game.name}`, 0, dealerCommission);
            }
            res.status(201).json({ ...newBet, numbers: JSON.parse(newBet.numbers) });
        });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'An internal error occurred.' });
    }
});


// --- DEALER ROUTES ---
app.get('/api/dealer/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    const users = database.db.prepare('SELECT * FROM users WHERE dealerId = ?').all(req.user.id).map(u => ({
        ...u,
        prizeRates: JSON.parse(u.prizeRates),
        isRestricted: !!u.isRestricted,
        ledger: database.getLedgerForAccount(u.id)
    }));
    res.json({ users });
});

app.post('/api/dealer/users', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    const { userData, initialDeposit = 0 } = req.body;
    
    try {
        database.runInTransaction(() => {
            const dealer = database.findAccountById(req.user.id, 'dealers');
            if (!dealer) throw { status: 404, message: 'Dealer not found.' };

            const existingUser = database.db.prepare('SELECT id FROM users WHERE lower(id) = ?').get(userData.id.toLowerCase());
            if (existingUser) throw { status: 400, message: "This User Login ID is already taken." };

            if (initialDeposit > 0 && dealer.wallet < initialDeposit) {
                throw { status: 400, message: `Insufficient funds for initial deposit. Available: ${dealer.wallet}` };
            }

            const newUser = {
                ...userData,
                wallet: 0,
                isRestricted: 0,
            };

            database.db.prepare('INSERT INTO users (id, name, password, dealerId, area, contact, wallet, commissionRate, isRestricted, prizeRates, betLimit, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                .run(newUser.id, newUser.name, newUser.password, newUser.dealerId, newUser.area, newUser.contact, 0, newUser.commissionRate, 0, JSON.stringify(newUser.prizeRates), newUser.betLimit, newUser.avatarUrl);

            if (initialDeposit > 0) {
                database.addLedgerEntry(dealer.id, 'DEALER', `Initial Deposit for new user: ${newUser.name}`, initialDeposit, 0);
                database.addLedgerEntry(newUser.id, 'USER', `Initial Deposit from Dealer: ${dealer.name}`, 0, initialDeposit);
            } else {
                database.addLedgerEntry(newUser.id, 'USER', 'Account Created', 0, 0);
            }
            
            res.status(201).json(database.findAccountById(newUser.id, 'users'));
        });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'An internal error occurred.' });
    }
});

app.put('/api/dealer/users/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    const userData = req.body;
    
    const user = database.db.prepare('SELECT * FROM users WHERE id = ? AND dealerId = ?').get(req.params.id, req.user.id);
    if (!user) return res.status(404).json({ message: "User not found or you don't have permission." });

    const updatedUser = { ...user, ...userData };

    const stmt = database.db.prepare('UPDATE users SET name = ?, password = ?, area = ?, contact = ?, commissionRate = ?, prizeRates = ?, betLimit = ?, avatarUrl = ? WHERE id = ?');
    stmt.run(updatedUser.name, updatedUser.password, updatedUser.area, updatedUser.contact, updatedUser.commissionRate, JSON.stringify(updatedUser.prizeRates), updatedUser.betLimit, updatedUser.avatarUrl, req.params.id);

    res.json(database.findAccountById(req.params.id, 'users'));
});

app.post('/api/dealer/topup/user', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    const { userId, amount } = req.body;

    try {
        database.runInTransaction(() => {
            const dealer = database.findAccountById(req.user.id, 'dealers');
            const user = database.db.prepare('SELECT * FROM users WHERE id = ? AND dealerId = ?').get(userId, req.user.id);
            
            if (!user) throw { status: 404, message: "User not found." };
            if (!dealer || dealer.wallet < amount) throw { status: 400, message: "Insufficient funds." };
        
            database.addLedgerEntry(dealer.id, 'DEALER', `Top-Up for User: ${user.name}`, amount, 0);
            database.addLedgerEntry(user.id, 'USER', `Top-up from Dealer: ${dealer.name}`, 0, amount);
            
            res.json({ message: "Top-up successful." });
        });
    } catch (error) {
         res.status(error.status || 500).json({ message: error.message || 'An internal error occurred.' });
    }
});

app.put('/api/dealer/users/:id/toggle-restriction', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    const user = database.db.prepare('SELECT isRestricted FROM users WHERE id = ? AND dealerId = ?').get(req.params.id, req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    const newStatus = !user.isRestricted;
    database.db.prepare('UPDATE users SET isRestricted = ? WHERE id = ?').run(newStatus ? 1 : 0, req.params.id);
    
    res.json(database.findAccountById(req.params.id, 'users'));
});


// --- ADMIN ROUTES ---
app.get('/api/admin/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    res.json({
        dealers: database.getAllFromTable('dealers', true),
        users: database.getAllFromTable('users', true),
        games: database.getAllFromTable('games'),
        bets: database.getAllFromTable('bets').map(b => ({...b, numbers: JSON.parse(b.numbers)}))
    });
});

app.post('/api/admin/dealers', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const dealerData = req.body;
    
    database.runInTransaction(() => {
        const existing = database.db.prepare('SELECT id FROM dealers WHERE lower(id) = ?').get(dealerData.id.toLowerCase());
        if (existing) return res.status(400).json({ message: "This Dealer Login ID is already taken." });

        const initialAmount = dealerData.wallet || 0;
        database.db.prepare('INSERT INTO dealers (id, name, password, area, contact, wallet, commissionRate, isRestricted, prizeRates, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(dealerData.id, dealerData.name, dealerData.password, dealerData.area, dealerData.contact, 0, dealerData.commissionRate, 0, JSON.stringify(dealerData.prizeRates), dealerData.avatarUrl);

        database.addLedgerEntry(dealerData.id, 'DEALER', initialAmount > 0 ? 'Initial Deposit' : 'Account Created', 0, initialAmount);
        
        res.status(201).json(database.findAccountById(dealerData.id, 'dealers'));
    });
});

app.put('/api/admin/dealers/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const dealerData = req.body;
    const originalId = req.params.id;

    database.runInTransaction(() => {
        const dealer = database.db.prepare('SELECT * FROM dealers WHERE id = ?').get(originalId);
        if (!dealer) return res.status(404).json({ message: 'Dealer not found.' });

        const idChanged = dealerData.id !== originalId;
        if (idChanged) {
            const existing = database.db.prepare('SELECT id FROM dealers WHERE lower(id) = ?').get(dealerData.id.toLowerCase());
            if (existing) return res.status(400).json({ message: 'Dealer Login ID already taken.' });
        }
        
        const updatedDealer = { ...dealer, ...dealerData };
        
        database.db.prepare('UPDATE dealers SET id = ?, name = ?, password = ?, area = ?, contact = ?, commissionRate = ?, prizeRates = ?, avatarUrl = ? WHERE id = ?')
            .run(updatedDealer.id, updatedDealer.name, updatedDealer.password, updatedDealer.area, updatedDealer.contact, updatedDealer.commissionRate, JSON.stringify(updatedDealer.prizeRates), updatedDealer.avatarUrl, originalId);
        
        if (idChanged) {
            database.db.prepare('UPDATE users SET dealerId = ? WHERE dealerId = ?').run(updatedDealer.id, originalId);
        }
        
        res.json(database.findAccountById(updatedDealer.id, 'dealers'));
    });
});

app.post('/api/admin/topup/dealer', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const { dealerId, amount } = req.body;

    database.runInTransaction(() => {
        const dealer = database.db.prepare('SELECT * FROM dealers WHERE id = ?').get(dealerId);
        if (!dealer) return res.status(404).json({ message: 'Dealer not found.' });
        database.addLedgerEntry(dealerId, 'DEALER', 'Admin Top-Up', 0, amount);
        res.json({ message: 'Top-up successful' });
    });
});

app.put('/api/admin/accounts/:type/:id/toggle-restriction', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const { type, id } = req.params;
    const table = type === 'user' ? 'users' : 'dealers';
    
    const account = database.db.prepare(`SELECT isRestricted FROM ${table} WHERE id = ?`).get(id);
    if (!account) return res.status(404).json({ message: 'Account not found.' });
    
    const newStatus = !account.isRestricted;
    database.db.prepare(`UPDATE ${table} SET isRestricted = ? WHERE id = ?`).run(newStatus ? 1 : 0, id);
    
    res.json(database.findAccountById(id, table));
});

app.post('/api/admin/games/:id/declare-winner', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const { winningNumber } = req.body;
    
    const result = database.db.prepare('UPDATE games SET winningNumber = ?, payoutsApproved = 0 WHERE id = ?').run(winningNumber, req.params.id);
    if (result.changes === 0) return res.status(404).json({ message: 'Game not found.' });
    
    res.json(database.db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id));
});

app.post('/api/admin/games/:id/approve-payouts', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);

    database.runInTransaction(() => {
        const game = database.db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
        if (!game || !game.winningNumber || game.payoutsApproved) return res.status(400).json({ message: 'Game not ready for payout.' });

        const gameBets = database.db.prepare('SELECT * FROM bets WHERE gameId = ?').all(game.id);
        
        gameBets.forEach(bet => {
            const numbers = JSON.parse(bet.numbers);
            const winningNumbersInBet = numbers.filter(num => {
                switch (bet.subGameType) {
                    case "1 Digit Open": return num === game.winningNumber[0];
                    case "1 Digit Close": return num === game.winningNumber[1];
                    default: return num === game.winningNumber;
                }
            });

            if (winningNumbersInBet.length > 0) {
                const user = database.findAccountById(bet.userId, 'users');
                const dealer = database.findAccountById(bet.dealerId, 'dealers');
                if (!user || !dealer) return;

                const getPrizeMultiplier = (rates, subGameType) => {
                    if (subGameType === "1 Digit Open") return rates.oneDigitOpen;
                    if (subGameType === "1 Digit Close") return rates.oneDigitClose;
                    return rates.twoDigit;
                };

                const userPrize = winningNumbersInBet.length * bet.amountPerNumber * getPrizeMultiplier(user.prizeRates, bet.subGameType);
                const dealerProfit = winningNumbersInBet.length * bet.amountPerNumber * (getPrizeMultiplier(dealer.prizeRates, bet.subGameType) - getPrizeMultiplier(user.prizeRates, bet.subGameType));
                
                if (userPrize > 0) {
                    database.addLedgerEntry('Guru', 'ADMIN', `Payout to user ${user.name}`, userPrize, 0);
                    database.addLedgerEntry(user.id, 'USER', `Prize Won - ${game.name}`, 0, userPrize);
                }
                if (dealerProfit > 0) {
                    database.addLedgerEntry('Guru', 'ADMIN', `Profit to dealer ${dealer.name}`, dealerProfit, 0);
                    database.addLedgerEntry(dealer.id, 'DEALER', `Profit from User Prize - ${game.name}`, 0, dealerProfit);
                }
            }
        });

        database.db.prepare('UPDATE games SET payoutsApproved = 1 WHERE id = ?').run(game.id);
        res.json(database.db.prepare('SELECT * FROM games WHERE id = ?').get(game.id));
    });
});

// --- MAIN ---
const startServer = () => {
  database.connect();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

startServer();