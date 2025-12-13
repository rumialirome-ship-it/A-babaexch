
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
    
    setTimeout(async () => {
        console.log('--- [SCHEDULER] Running daily game reset task. ---');
        await database.resetAllGames();
        scheduleNextGameReset(); // Reschedule for the next day
    }, delay);
}


// --- DATABASE INITIALIZATION ---
// Note: verifySchema is async now but we don't block startup for it, just log errors.
database.verifySchema().then(() => {
    scheduleNextGameReset();
}).catch(err => {
    console.error("Startup Database Check Failed:", err);
});


// --- AUTHENTICATION ROUTES ---
app.post('/api/auth/login', async (req, res) => {
    const { loginId, password } = req.body;
    if (!loginId || !password) {
        return res.status(400).json({ message: 'Login ID and password are required.' });
    }

    try {
        const { account, role } = await database.findAccountForLogin(loginId);
        
        if (!account || account.password !== password) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }
        
        // Fetch full account details with ledger, etc.
        const fullAccount = await database.findAccountById(account.id, role.toLowerCase() + 's');
        
        const token = jwt.sign({ id: account.id, role: role }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.json({ token, role, account: fullAccount });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error during login.' });
    }
});

app.get('/api/auth/verify', authMiddleware, async (req, res) => {
    const { id, role } = req.user;
    try {
        const account = await database.findAccountById(id, role.toLowerCase() + 's');
        if (!account) {
            return res.status(404).json({ message: 'Account not found.' });
        }
        res.json({ account, role });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error.' });
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    const { accountId, contact, newPassword } = req.body;
    if (!accountId || !contact || !newPassword) {
        return res.status(400).json({ message: 'Account ID, contact, and new password are required.' });
    }
    try {
        const success = await database.updatePassword(accountId, contact, newPassword);
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
app.get('/api/games', async (req, res) => {
    try {
        const games = await database.getAllFromTable('games');
        res.json(games);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch games' });
    }
});

// --- USER ROUTES ---
app.get('/api/user/data', authMiddleware, async (req, res) => {
    if (req.user.role !== 'USER') return res.status(403).json({ message: 'Forbidden' });
    try {
        const user = await database.findAccountById(req.user.id, 'users');
        const games = await database.getAllFromTable('games');
        // Optimization: Fetch only bets for this user, limited
        const bets = await database.findBetsByUserId(req.user.id);
        const daily_results = await database.getAllFromTable('daily_results');
        res.json({ games, bets, user, daily_results });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch user data' });
    }
});

app.post('/api/user/bets', authMiddleware, async (req, res) => {
    if (req.user.role !== 'USER') return res.status(403).json({ message: 'Forbidden' });
    const { gameId, betGroups } = req.body;
    
    try {
        const result = await database.placeBulkBets(req.user.id, gameId, betGroups, 'USER');
        res.status(201).json({ message: 'Bet placed successfully!', bets: result });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to place bet.' });
    }
});


// --- DEALER ROUTES ---
app.get('/api/dealer/data', authMiddleware, async (req, res) => {
    if (req.user.role !== 'DEALER') return res.status(403).json({ message: 'Forbidden' });
    try {
        const dealer = await database.findAccountById(req.user.id, 'dealers');
        const users = await database.findUsersByDealerId(req.user.id);
        // Optimization: Fetch only bets for this dealer's users
        const bets = await database.findBetsByDealerId(req.user.id);
        const daily_results = await database.getAllFromTable('daily_results');
        res.json({ dealer, users, bets, daily_results });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch dealer data' });
    }
});

app.post('/api/dealer/users', authMiddleware, async (req, res) => {
    if (req.user.role !== 'DEALER') return res.status(403).json({ message: 'Forbidden' });
    const { userData, initialDeposit } = req.body;
    try {
        const newUser = await database.createUser(userData, req.user.id, initialDeposit);
        res.status(201).json(newUser);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to create user.' });
    }
});

app.put('/api/dealer/users/:id', authMiddleware, async (req, res) => {
    if (req.user.role !== 'DEALER') return res.status(403).json({ message: 'Forbidden' });
    try {
        const updatedUser = await database.updateUser(req.body, req.params.id, req.user.id);
        res.json(updatedUser);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to update user.' });
    }
});

app.put('/api/dealer/users/:id/toggle-restriction', authMiddleware, async (req, res) => {
    if (req.user.role !== 'DEALER') return res.status(403).json({ message: 'Forbidden' });
    try {
        const user = await database.toggleUserRestrictionByDealer(req.params.id, req.user.id);
        res.json(user);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to toggle restriction.' });
    }
});

app.post('/api/dealer/topup/user', authMiddleware, async (req, res) => {
    if (req.user.role !== 'DEALER') return res.status(403).json({ message: 'Forbidden' });
    const { userId, amount } = req.body;
    try {
        await database.performUserTopUp(req.user.id, userId, amount);
        res.json({ message: 'Top-up successful.' });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to top-up user wallet.' });
    }
});

app.post('/api/dealer/withdraw/user', authMiddleware, async (req, res) => {
    if (req.user.role !== 'DEALER') return res.status(403).json({ message: 'Forbidden' });
    const { userId, amount } = req.body;
    try {
        await database.performUserWithdrawal(req.user.id, userId, amount);
        res.json({ message: 'Withdrawal successful.' });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to withdraw from user wallet.' });
    }
});

app.post('/api/dealer/bets/bulk', authMiddleware, async (req, res) => {
    if (req.user.role !== 'DEALER') return res.status(403).json({ message: 'Forbidden' });
    const { userId, gameId, betGroups } = req.body;
     try {
        // Verify user belongs to this dealer
        const user = await database.findUserByDealer(userId, req.user.id);
        if (!user) return res.status(403).json({ message: 'You can only place bets for users you manage.' });

        const result = await database.placeBulkBets(userId, gameId, betGroups, 'DEALER');
        res.status(201).json({ message: 'Bet placed successfully!', bets: result });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to place bet.' });
    }
});


// --- ADMIN ROUTES ---
app.get('/api/admin/data', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    try {
        const admin = await database.findAccountById(req.user.id, 'admins');
        const games = await database.getAllFromTable('games');
        // Optimization: Admin doesn't need raw bets array on load.
        const daily_results = await database.getAllFromTable('daily_results');
        res.json({ admin, games, bets: [], daily_results });
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch admin data' });
    }
});

app.get('/api/admin/dealers', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    try {
        const result = await database.getPaginatedDealers(req.query);
        res.json(result);
    } catch (error) {
        console.error("Error fetching paginated dealers:", error);
        res.status(500).json({ message: 'Failed to fetch dealers.' });
    }
});

app.get('/api/admin/users', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    try {
        const result = await database.getPaginatedUsers(req.query);
        res.json(result);
    } catch (error) {
        console.error("Error fetching paginated users:", error);
        res.status(500).json({ message: 'Failed to fetch users.' });
    }
});

app.get('/api/admin/dealers/list', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    res.json(await database.getDealerList());
});

app.get('/api/admin/users/list', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    res.json(await database.getUserList());
});


app.post('/api/admin/dealers', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    try {
        const newDealer = await database.createDealer(req.body);
        res.status(201).json(newDealer);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to create dealer.' });
    }
});

app.put('/api/admin/dealers/:id', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    try {
        const updatedDealer = await database.updateDealer(req.body, req.params.id);
        res.json(updatedDealer);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to update dealer.' });
    }
});

app.post('/api/admin/topup/dealer', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    const { dealerId, amount } = req.body;
    try {
        await database.performDealerTopUp(req.user.id, dealerId, amount);
        res.json({ message: 'Top-up successful.' });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to top-up dealer wallet.' });
    }
});

app.post('/api/admin/withdraw/dealer', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    const { dealerId, amount } = req.body;
    try {
        await database.performDealerWithdrawal(req.user.id, dealerId, amount);
        res.json({ message: 'Withdrawal successful.' });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to withdraw from dealer wallet.' });
    }
});

app.put('/api/admin/accounts/:type/:id/toggle-restriction', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    const { type, id } = req.params;
    if (type !== 'user' && type !== 'dealer') return res.status(400).json({ message: 'Invalid account type.' });
    try {
        const account = await database.toggleAccountRestrictionByAdmin(id, type);
        res.json(account);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to toggle restriction.' });
    }
});

app.post('/api/admin/games/:id/declare-winner', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    try {
        const game = await database.declareWinnerForGame(req.params.id, req.body.winningNumber);
        res.json(game);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to declare winner.' });
    }
});

app.put('/api/admin/games/:id/update-winner', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    try {
        const game = await database.updateWinningNumber(req.params.id, req.body.newWinningNumber);
        res.json(game);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to update winner.' });
    }
});

app.post('/api/admin/games/:id/approve-payouts', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    try {
        const game = await database.approvePayoutsForGame(req.params.id);
        res.json(game);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to approve payouts.' });
    }
});

app.get('/api/admin/summary', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    try {
        const { date } = req.query; // e.g., '2024-05-25'
        const summary = await database.getFinancialSummary(date);
        res.json(summary);
    } catch (error) {
        console.error("Error fetching financial summary:", error);
        res.status(500).json({ message: 'Failed to fetch financial summary.' });
    }
});

app.get('/api/admin/winners-report', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    try {
        const { date, gameId } = req.query;
        if (!date || !gameId) {
            return res.status(400).json({ message: 'Date and Game ID are required.' });
        }
        const report = await database.getWinnersReport(gameId, date);
        res.json(report);
    } catch (error) {
        console.error("Error fetching winners report:", error);
        res.status(500).json({ message: 'Failed to fetch winners report.' });
    }
});

// Admin Number Limit Routes
app.get('/api/admin/number-limits', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    res.json(await database.getAllNumberLimits());
});

app.post('/api/admin/number-limits', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    res.status(201).json(await database.saveNumberLimit(req.body));
});

app.delete('/api/admin/number-limits/:id', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    await database.deleteNumberLimit(req.params.id);
    res.status(204).send();
});

app.get('/api/admin/live-booking/:gameId', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    const bets = await database.findBetsByGameId(req.params.gameId);
    res.json(bets);
});

app.get('/api/admin/number-summary', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    res.json(await database.getNumberStakeSummary(req.query));
});

app.post('/api/admin/bulk-bet', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    const { userId, gameId, betGroups } = req.body;
    try {
        const result = await database.placeBulkBets(userId, gameId, betGroups, 'ADMIN');
        res.status(201).json({ message: 'Bet placed successfully!', bets: result });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to place bet.' });
    }
});

app.get('/api/admin/bet-search', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    try {
        const { number } = req.query;
        const result = await database.searchBetsByNumber(number);
        res.json(result);
    } catch (error) {
        console.error("Error during bet search:", error);
        res.status(500).json({ message: 'Failed to search bets.' });
    }
});

app.put('/api/admin/games/:id/draw-time', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    try {
        const game = await database.updateGameDrawTime(req.params.id, req.body.newDrawTime);
        res.json(game);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Failed to update draw time.' });
    }
});

app.post('/api/admin/reprocess-payouts', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    const { gameId, date } = req.body;
    try {
        const result = await database.reprocessPayoutsForMarketDay(gameId, date);
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

// AI INSIGHT ROUTE (New)
app.post('/api/admin/ai-insight', authMiddleware, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
    const { date, userPrompt } = req.body;

    if (!process.env.API_KEY) {
        return res.status(503).json({ message: "AI services unavailable. API Key not configured." });
    }

    try {
        const summary = await database.getFinancialSummary(date);
        
        const prompt = `
            You are a sharp financial analyst for "A-Baba Exchange", a digital lottery platform.
            Current Data Context for ${date}:
            - Total System Stake: ${summary.totals.totalStake.toFixed(2)}
            - Total Payouts: ${summary.totals.totalPayouts.toFixed(2)}
            - Net System Profit: ${summary.totals.netProfit.toFixed(2)}
            - Game Performance Breakdown: ${JSON.stringify(summary.games.map(g => ({ name: g.gameName, stake: g.totalStake, profit: g.netProfit })))}
            User Question: "${userPrompt}"
            Provide a concise, professional, and strategic answer.
        `;

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        res.json({ insight: response.text });

    } catch (error) {
        console.error("AI Insight Error:", error);
        res.status(500).json({ message: "Failed to generate AI insight." });
    }
});


const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
