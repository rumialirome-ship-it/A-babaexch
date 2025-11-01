console.error('############################################################');
console.error('--- EXECUTING LATEST SERVER.JS VERSION 3 ---');
console.error('--- INTENDED PORT IS HARDCODED TO: 3001 ---');
console.error(`--- Checking environment variable PORT: ${process.env.PORT || 'Not Set'} ---`);
console.error('############################################################');
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

// --- Daily Market Reset Check ---
// This runs on API requests to ensure the market state is current.
// It's a very fast check if no reset is needed.
app.use('/api', (req, res, next) => {
    try {
        database.performDailyResetIfNeeded();
    } catch (error) {
        // Log the error but don't block the request. The reset is not a critical failure for the ongoing request.
        console.error("[CRITICAL] Daily market reset check failed:", error);
    }
    next();
});


// --- API BROWSER ACCESS GUARD ---
// This middleware prevents browsers from directly navigating to API endpoints,
// which can cause them to try and download the JSON response as a file.
app.use('/api', (req, res, next) => {
    const acceptHeader = req.headers.accept || '';
    // A typical browser navigation request will prioritize text/html. AJAX/fetch requests
    // from the app will usually accept */* or application/json.
    if (acceptHeader.toLowerCase().startsWith('text/html')) {
        return res.status(404).setHeader('Content-Type', 'text/html').send(
            `<body style="font-family: sans-serif; background-color: #020617; color: #cbd5e1; padding: 2rem;">
               <h2>Endpoint Not Accessible</h2>
               <p>This is an API endpoint and is not meant to be accessed directly in a browser.</p>
               <p>Please use the main application interface.</p>
            </body>`
        );
    }
    next();
});

const JWT_SECRET = process.env.JWT_SECRET;
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
    const userBets = database.getAllFromTable('bets')
        .filter(b => b.userId === req.user.id)
        .sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json({ games, bets: userBets });
});

app.post('/api/user/bets', authMiddleware, (req, res) => {
    if (req.user.role !== 'USER') return res.sendStatus(403);
    const { gameId, betGroups } = req.body;

    try {
        const createdBets = database.placeBulkBets(req.user.id, gameId, betGroups, 'USER');
        res.status(201).json(createdBets);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'An internal error occurred.' });
    }
});


// --- DEALER ROUTES ---
app.get('/api/dealer/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    const users = database.findUsersByDealerId(req.user.id);
    const bets = database.findBetsByDealerId(req.user.id);
    res.json({ users, bets });
});

app.post('/api/dealer/users', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    const { userData, initialDeposit = 0 } = req.body;
    try {
        let newUser;
        database.runInTransaction(() => {
            newUser = database.createUser(userData, req.user.id, initialDeposit);
        });
        res.status(201).json(newUser);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'An internal error occurred.' });
    }
});

app.put('/api/dealer/users/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    const userData = req.body;
    try {
        let updatedUser;
        database.runInTransaction(() => {
            updatedUser = database.updateUser(userData, req.params.id, req.user.id);
        });
        res.json(updatedUser);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'An internal error occurred.' });
    }
});

app.post('/api/dealer/topup/user', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    const { userId, amount } = req.body;

    try {
        database.runInTransaction(() => {
            const dealer = database.findAccountById(req.user.id, 'dealers');
            const user = database.findUserByDealer(userId, req.user.id);
            
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

app.post('/api/dealer/withdraw/user', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    const { userId, amount } = req.body;

    try {
        database.runInTransaction(() => {
            const dealer = database.findAccountById(req.user.id, 'dealers');
            const user = database.findUserByDealer(userId, req.user.id);
            
            if (!user) throw { status: 404, message: "User not found or does not belong to you." };
            if (user.wallet < amount) throw { status: 400, message: "User has insufficient funds for this withdrawal." };
        
            database.addLedgerEntry(user.id, 'USER', `Withdrawal by Dealer: ${dealer.name}`, amount, 0);
            database.addLedgerEntry(dealer.id, 'DEALER', `Funds withdrawn from User: ${user.name}`, 0, amount);
            
            res.json({ message: "Withdrawal successful." });
        });
    } catch (error) {
         res.status(error.status || 500).json({ message: error.message || 'An internal error occurred.' });
    }
});


app.put('/api/dealer/users/:id/toggle-restriction', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try {
        const updatedUser = database.toggleUserRestrictionByDealer(req.params.id, req.user.id);
        res.json(updatedUser);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'An internal error occurred.' });
    }
});

app.post('/api/dealer/bets/bulk', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    const { userId, gameId, betGroups } = req.body;
    const dealerId = req.user.id;

    try {
        // Verify user belongs to this dealer before proceeding
        const user = database.findUserByDealer(userId, dealerId);
        if (!user) {
            return res.status(403).json({ message: "You can only place bets for users under your account." });
        }
        
        // The placeBulkBets function handles all other logic like wallet checks, limits, etc.
        const createdBets = database.placeBulkBets(userId, gameId, betGroups, 'DEALER');
        res.status(201).json(createdBets);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'An internal error occurred.' });
    }
});


// --- ADMIN ROUTES ---
app.get('/api/admin/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    res.json({
        dealers: database.getAllFromTable('dealers', true),
        users: database.getAllFromTable('users', true),
        games: database.getAllFromTable('games'),
        bets: database.getAllFromTable('bets')
    });
});

app.get('/api/admin/summary', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try {
        const summary = database.getFinancialSummary();
        res.json(summary);
    } catch (error) {
        console.error("Error generating financial summary:", error);
        res.status(500).json({ message: "Failed to generate financial summary." });
    }
});

app.get('/api/admin/live-booking/:gameId', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try {
        const { gameId } = req.params;
        const bets = database.findBetsByGameId(gameId);
        res.json(bets);
    } catch (error) {
        console.error(`Error fetching live booking for game ${req.params.gameId}:`, error);
        res.status(500).json({ message: "Failed to fetch live booking data." });
    }
});

app.get('/api/admin/number-summary', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try {
        const { gameId, dealerId, date } = req.query;
        const summary = database.getNumberStakeSummary({ gameId, dealerId, date });
        res.json(summary);
    } catch (error) {
        console.error("Error fetching number stake summary:", error);
        res.status(500).json({ message: "Failed to fetch number summary data." });
    }
});

app.post('/api/admin/dealers', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const dealerData = req.body;
    try {
        let newDealer;
        database.runInTransaction(() => {
            newDealer = database.createDealer(dealerData);
        });
        res.status(201).json(newDealer);
    } catch (error) {
        if (!res.headersSent) {
            res.status(error.status || 500).json({ message: error.message || 'An internal error occurred.' });
        }
    }
});

app.put('/api/admin/dealers/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const dealerData = req.body;
    const originalId = req.params.id;
    try {
        let updatedDealer;
        database.runInTransaction(() => {
            updatedDealer = database.updateDealer(dealerData, originalId);
        });
        res.json(updatedDealer);
    } catch (error) {
        if (!res.headersSent) {
            res.status(error.status || 500).json({ message: error.message || 'An internal error occurred.' });
        }
    }
});

app.post('/api/admin/topup/dealer', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const { dealerId, amount } = req.body;

    try {
        database.runInTransaction(() => {
            const dealer = database.findAccountById(dealerId, 'dealers');
            const admin = database.findAccountById('Guru', 'admins');
            
            if (!dealer) throw { status: 404, message: "Dealer not found." };
            if (!admin) throw { status: 500, message: "Admin account not found." };
            if (admin.wallet < amount) throw { status: 400, message: "Admin has insufficient system funds for this top-up." };
        
            database.addLedgerEntry('Guru', 'ADMIN', `Top-up to Dealer: ${dealer.name} (${dealer.id})`, amount, 0);
            database.addLedgerEntry(dealerId, 'DEALER', 'Top-up from Admin', 0, amount);
            
            res.json({ message: "Top-up successful." });
        });
    } catch (error) {
         res.status(error.status || 500).json({ message: error.message || 'An internal error occurred.' });
    }
});

app.post('/api/admin/withdraw/dealer', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const { dealerId, amount } = req.body;

    try {
        database.runInTransaction(() => {
            const dealer = database.findAccountById(dealerId, 'dealers');
            if (!dealer) throw { status: 404, message: "Dealer not found." };
            if (dealer.wallet < amount) throw { status: 400, message: "Dealer has insufficient funds for this withdrawal." };

            database.addLedgerEntry(dealer.id, 'DEALER', 'Withdrawal by Admin', amount, 0);
            database.addLedgerEntry('Guru', 'ADMIN', `Funds withdrawn from ${dealer.name}`, 0, amount);
            
            res.json({ message: "Withdrawal successful." });
        });
    } catch (error) {
         res.status(error.status || 500).json({ message: error.message || 'An internal error occurred.' });
    }
});

app.put('/api/admin/accounts/:type/:id/toggle-restriction', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try {
        const { type, id } = req.params;
        const updatedAccount = database.toggleAccountRestrictionByAdmin(id, type);
        res.json(updatedAccount);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'An internal error occurred.' });
    }
});

app.post('/api/admin/games/:id/declare-winner', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const { winningNumber } = req.body;
    const updatedGame = database.declareWinnerForGame(req.params.id, winningNumber);
    if (!updatedGame) {
        return res.status(404).json({ message: 'Game not found.' });
    }
    res.json(updatedGame);
});

app.put('/api/admin/games/:id/update-winner', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const { newWinningNumber } = req.body;
    try {
        const updatedGame = database.updateWinningNumber(req.params.id, newWinningNumber);
        res.json(updatedGame);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'An internal error occurred.' });
    }
});

app.put('/api/admin/games/:id/draw-time', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const { newDrawTime } = req.body;
    try {
        const updatedGame = database.updateGameDrawTime(req.params.id, newDrawTime);
        res.json(updatedGame);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'An internal error occurred.' });
    }
});

app.post('/api/admin/games/:id/approve-payouts', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try {
        const updatedGame = database.approvePayoutsForGame(req.params.id);
        res.json(updatedGame);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'An internal error occurred.' });
    }
});

// Admin Number Limit Routes
app.get('/api/admin/number-limits', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    res.json(database.getAllNumberLimits());
});

app.post('/api/admin/number-limits', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const { gameType, numberValue, limitAmount } = req.body;
    try {
        const savedLimit = database.saveNumberLimit({ gameType, numberValue, limitAmount });
        res.status(201).json(savedLimit);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

app.delete('/api/admin/number-limits/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    const { id } = req.params;
    try {
        database.deleteNumberLimit(id);
        res.status(204).send();
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});


// --- MAIN ---
const startServer = () => {
  database.connect();
  database.verifySchema();
  // The port is hardcoded here to ensure it matches the Nginx config and deployment guide.
  // This avoids conflicts from environment variables.
  app.listen(3001, () => {
    console.error('>>> A-BABA BACKEND IS LIVE ON PORT 3001 <<<');
  });
};

startServer();