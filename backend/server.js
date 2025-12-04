

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

// --- AUTOMATIC GAME RESET SCHEDULER ---
const PKT_OFFSET_HOURS = 5;
const RESET_HOUR_PKT = 16; // 4:00 PM PKT

function scheduleNextGameReset() {
    const now = new Date();
    const resetHourUTC = RESET_HOUR_PKT - PKT_OFFSET_HOURS;

    // Set the target reset time to today in UTC
    let resetTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), resetHourUTC, 0, 5, 0)); // 16:00:05 PKT for a small buffer

    if (now >= resetTime) {
        // If it's already past today's reset time, schedule for tomorrow
        resetTime.setUTCDate(resetTime.getUTCDate() + 1);
    }

    const delay = resetTime.getTime() - now.getTime();
    
    console.log(`--- Scheduling next game reset for ${resetTime.toUTCString()} (in ${Math.round(delay / 1000 / 60)} minutes) ---`);
    
    setTimeout(() => {
        console.log('--- [SCHEDULER] Running daily game reset task. ---');
        database.resetAllGames();
        scheduleNextGameReset(); // Reschedule for the next day
    }, delay);
}


// --- DATABASE INITIALIZATION ---
database.connect();
database.verifySchema();
scheduleNextGameReset();


// --- AUTHENTICATION ROUTES ---
app.post('/api/auth/login', (req, res) => {
    const { loginId, password } = req.body;
    if (!loginId || !password) {
        return res.status(400).json({ message: 'Login ID and password are required.' });
    }

    const { account, role } = database.findAccountForLogin(loginId);
    
    if (!account || account.password !== password) {
        return res.status(401).json({ message: 'Invalid credentials.' });
    }
    
    // Fetch full account details with ledger, etc.
    const fullAccount = database.findAccountById(account.id, role.toLowerCase() + 's');
    
    const token = jwt.sign({ id: account.id, role: role }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, role, account: fullAccount });
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
    const { id, role } = req.user;
    const account = database.findAccountById(id, role.toLowerCase() + 's');
    if (!account) {
        return res.status(404).json({ message: 'Account not found.' });
    }
    res.json({ account, role });
});

app.post('/api/auth/reset-password', (req, res) => {
    const { accountId, contact, newPassword } = req.body;
    if (!accountId || !contact || !newPassword) {
        return res.status(400).json({ message: 'Account ID, contact, and new password are required.' });
    }
    try {
        const success = database.updatePassword(accountId, contact, newPassword);
        if (success) {
            res.json({ message: 'Password has been successfully updated. You can now log in.' });
        } else {
            res.status(404).json({ message: 'Account not found or contact number is incorrect.' });
        }
    } catch (error) {
        res.status(500).json({ message: 'An internal error occurred.' });
    }
});

// --- PUBLIC ROUTES ---
app.get('/api/games', (req, res) => {
    try {
        const games = database.getAllFromTable('games');
        res.json(games);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch games' });
    }
});

// --- USER ROUTES ---
app.get('/api/user/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'USER') return res.status(403).json({ message: 'Forbidden' });
    const user = database.findAccountById(req.user.id, 'users');
    const games = database.getAllFromTable('games');
    const daily_results = database.getAllFromTable('daily_results');
    res.json({ games, user, daily_results });
});

app.post('/api/user/bets', authMiddleware, (req, res) => {
    if (req.user.role !== 'USER') return res.status(403).json({ message: 'Forbidden' });
    const { gameId, betGroups } = req.body;
    
    try {
        const result = database.placeBulkBets(req.user.id, gameId, betGroups, 'USER');
        res.status(201).json({ message: 'Bet placed successfully!', bets: result });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to place bet.' });
    }
});


// --- DEALER ROUTES ---
app.get('/api/dealer/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.status(403).json({ message: 'Forbidden' });
    const dealer = database.findAccountById(req.user.id, 'dealers');
    const users = database.findUsersByDealerId(req.user.id);
    const daily_results = database.getAllFromTable('daily_results');
    res.json({ dealer, users, daily_results });
});

app.post('/api/dealer/users', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.status(403).json({ message: 'Forbidden' });
    const { userData, initialDeposit } = req.body;
    try {
        const newUser = database.createUser(userData, req.user.id, initialDeposit);
        res.status(201).json(newUser);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to create user.' });
    }
});

app.put('/api/dealer/users/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.status(403).json({ message: 'Forbidden' });
    try {
        const updatedUser = database.updateUser(req.body, req.params.id, req.user.id);
        res.json(updatedUser);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to update user.' });
    }
});

app.put('/api/dealer/users/:id/toggle-restriction', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.status(403).json({ message: 'Forbidden' });
    try {
        const user = database.toggleUserRestrictionByDealer(req.params.id, req.user.id);
        res.json(user);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to toggle restriction.' });
    }
});

app.post('/api/dealer/topup/user', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.status(403).json({ message: 'Forbidden' });
    const { userId, amount } = req.body;
    try {
        const user = database.findUserByDealer(userId, req.user.id);
        if (!user) return res.status(404).json({ message: "User not found or does not belong to this dealer." });
        
        database.runInTransaction(() => {
            database.addLedgerEntry(req.user.id, 'DEALER', `Top-Up for User: ${user.name}`, amount, 0);
            database.addLedgerEntry(userId, 'USER', `Top-Up from Dealer: ${req.user.name}`, 0, amount);
        });
        res.json({ message: 'Top-up successful.' });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to top-up user wallet.' });
    }
});

app.post('/api/dealer/withdraw/user', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.status(403).json({ message: 'Forbidden' });
    const { userId, amount } = req.body;
    try {
        const user = database.findUserByDealer(userId, req.user.id);
        if (!user) return res.status(404).json({ message: "User not found or does not belong to this dealer." });

        database.runInTransaction(() => {
            database.addLedgerEntry(userId, 'USER', `Withdrawal by Dealer: ${req.user.name}`, amount, 0);
            database.addLedgerEntry(req.user.id, 'DEALER', `Withdrawal from User: ${user.name}`, 0, amount);
        });
        res.json({ message: 'Withdrawal successful.' });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to withdraw from user wallet.' });
    }
});

app.post('/api/dealer/bets/bulk', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.status(403).json({ message: 'Forbidden' });
    const { userId, gameId, betGroups } = req.body;
     try {
        // Verify user belongs to this dealer
        const user = database.findUserByDealer(userId, req.user.id);
        if (!user) return res.status(403).json({ message: 'You can only place bets for users you manage.' });

        const result = database.placeBulkBets(userId, gameId, betGroups, 'DEALER');
        res.status(201).json({ message: 'Bet placed successfully!', bets: result });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to place bet.' });
    }
});


// --- SHARED USER/DEALER ROUTES ---
app.get('/api/bet-history', authMiddleware, (req, res) => {
    const { id, role } = req.user;
    if (role !== 'USER' && role !== 'DEALER') {
        return res.status(403).json({ message: 'Forbidden' });
    }
    try {
        const options = {
            accountId: id,
            accountRole: role,
            limit: parseInt(req.query.limit, 10) || 25,
            offset: parseInt(req.query.offset, 10) || 0,
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            searchTerm: req.query.searchTerm,
        };
        const history = database.getBetHistory(options);
        res.json(history);
    } catch (error) {
        console.error('Failed to get bet history:', error);
        res.status(500).json({ message: 'Failed to retrieve bet history.' });
    }
});


// --- ADMIN ROUTES ---
app.get('/api/admin/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    const admin = database.findAccountById(req.user.id, 'admins');
    const dealers = database.getAllFromTable('dealers', true);
    const users = database.getAllFromTable('users', true);
    const games = database.getAllFromTable('games');
    const daily_results = database.getAllFromTable('daily_results');
    res.json({ admin, dealers, users, games, daily_results });
});

app.post('/api/admin/dealers', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    try {
        const newDealer = database.createDealer(req.body);
        res.status(201).json(newDealer);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to create dealer.' });
    }
});

app.put('/api/admin/dealers/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    try {
        const updatedDealer = database.updateDealer(req.body, req.params.id);
        res.json(updatedDealer);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to update dealer.' });
    }
});

app.post('/api/admin/topup/dealer', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    const { dealerId, amount } = req.body;
    try {
        const dealer = database.findAccountById(dealerId, 'dealers');
        database.runInTransaction(() => {
            database.addLedgerEntry(req.user.id, 'ADMIN', `Top-Up for Dealer: ${dealer.name}`, amount, 0);
            database.addLedgerEntry(dealerId, 'DEALER', 'Top-Up from Admin', 0, amount);
        });
        res.json({ message: 'Top-up successful.' });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to top-up dealer wallet.' });
    }
});

app.post('/api/admin/withdraw/dealer', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    const { dealerId, amount } = req.body;
    try {
        const dealer = database.findAccountById(dealerId, 'dealers');
        database.runInTransaction(() => {
            database.addLedgerEntry(dealerId, 'DEALER', 'Withdrawal by Admin', amount, 0);
            database.addLedgerEntry(req.user.id, 'ADMIN', `Withdrawal from Dealer: ${dealer.name}`, 0, amount);
        });
        res.json({ message: 'Withdrawal successful.' });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to withdraw from dealer wallet.' });
    }
});

app.put('/api/admin/accounts/:type/:id/toggle-restriction', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    const { type, id } = req.params;
    if (type !== 'user' && type !== 'dealer') return res.status(400).json({ message: 'Invalid account type.' });
    try {
        const account = database.toggleAccountRestrictionByAdmin(id, type);
        res.json(account);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to toggle restriction.' });
    }
});

app.post('/api/admin/games/:id/declare-winner', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    try {
        const game = database.declareWinnerForGame(req.params.id, req.body.winningNumber);
        res.json(game);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to declare winner.' });
    }
});

app.put('/api/admin/games/:id/update-winner', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    try {
        const game = database.updateWinningNumber(req.params.id, req.body.newWinningNumber);
        res.json(game);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to update winner.' });
    }
});

app.post('/api/admin/games/:id/approve-payouts', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    try {
        const game = database.approvePayoutsForGame(req.params.id);
        res.json(game);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to approve payouts.' });
    }
});

app.get('/api/admin/summary', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    try {
        const { date } = req.query; // e.g., '2024-05-25'
        const summary = database.getFinancialSummary(date);
        res.json(summary);
    } catch (error) {
        console.error("Error fetching financial summary:", error);
        res.status(500).json({ message: 'Failed to fetch financial summary.' });
    }
});

app.get('/api/admin/winners-report', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    try {
        const { date, gameId } = req.query;
        if (!date || !gameId) {
            return res.status(400).json({ message: 'Date and Game ID are required.' });
        }
        const report = database.getWinnersReport(gameId, date);
        res.json(report);
    } catch (error) {
        console.error("Error fetching winners report:", error);
        res.status(500).json({ message: 'Failed to fetch winners report.' });
    }
});

// Admin Number Limit Routes
app.get('/api/admin/number-limits', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    res.json(database.getAllNumberLimits());
});

app.post('/api/admin/number-limits', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    res.status(201).json(database.saveNumberLimit(req.body));
});

app.delete('/api/admin/number-limits/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    database.deleteNumberLimit(req.params.id);
    res.status(204).send();
});

app.get('/api/admin/live-booking/:gameId', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    const bets = database.findBetsByGameId(req.params.gameId);
    res.json(bets);
});

app.get('/api/admin/number-summary', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    res.json(database.getNumberStakeSummary(req.query));
});

app.post('/api/admin/bulk-bet', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    const { userId, gameId, betGroups } = req.body;
    try {
        const result = database.placeBulkBets(userId, gameId, betGroups, 'ADMIN');
        res.status(201).json({ message: 'Bet placed successfully!', bets: result });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to place bet.' });
    }
});

app.get('/api/admin/bet-search', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    try {
        const { number } = req.query;
        const result = database.searchBetsByNumber(number);
        res.json(result);
    } catch (error) {
        console.error("Error during bet search:", error);
        res.status(500).json({ message: 'Failed to search bets.' });
    }
});

app.put('/api/admin/games/:id/draw-time', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    try {
        const game = database.updateGameDrawTime(req.params.id, req.body.newDrawTime);
        res.json(game);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to update draw time.' });
    }
});

app.post('/api/admin/reprocess-payouts', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    const { gameId, date } = req.body;
    try {
        const result = database.reprocessPayoutsForMarketDay(gameId, date);
        res.json({ message: 'Reprocessing complete.', ...result });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to reprocess payouts.' });
    }
});

// AI LUCKY PICK ROUTE
app.post('/api/ai/lucky-pick', authMiddleware, async (req, res) => {
    const { gameName, count } = req.body;

    if (!process.env.API_KEY) {
        return res.status(500).json({ message: "AI features are not configured on the server." });
    }
    
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const isSingleDigit = gameName === 'AKC' || gameName === 'AK';
        const numType = isSingleDigit ? "single-digit (0-9)" : "two-digit (00-99)";
        
        const prompt = `
            Based on numerology, astrology, and popular cultural beliefs in Pakistan related to the game "${gameName}", generate ${count} lucky numbers. 
            The numbers must be in ${numType} format. 
            Do not provide any explanation, context, or disclaimer. Only return a JSON array of strings.
            Example format: ["07", "42", "81"] for two-digit or ["1", "8"] for single-digit.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        
        const text = response.text.trim();
        const jsonMatch = text.match(/\[.*\]/);
        if (!jsonMatch) {
            throw new Error("AI did not return a valid JSON array.");
        }

        const numbers = JSON.parse(jsonMatch[0]);
        res.json({ luckyNumbers: numbers });

    } catch (error) {
        console.error("AI Lucky Pick Error:", error);
        res.status(500).json({ message: "Could not generate lucky numbers at this time." });
    }
});


const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
