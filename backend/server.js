require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./config'); // FIX: shared secret with authMiddleware
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
let resetTimer = null;

function scheduleNextGameReset() {
    if (resetTimer) clearTimeout(resetTimer);

    const now = new Date();
    const resetHourUTC = RESET_HOUR_PKT - PKT_OFFSET_HOURS;
    let resetTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), resetHourUTC, 0, 5, 0));

    if (now >= resetTime) {
        resetTime.setUTCDate(resetTime.getUTCDate() + 1);
    }

    const delay = resetTime.getTime() - now.getTime();
    // FIX: use console.log for informational messages, not console.error
    console.log('--- [SCHEDULER] Next reset at: ' + resetTime.toUTCString() + ' ---');

    resetTimer = setTimeout(() => {
        try {
            database.resetAllGames();
        } catch (e) {
            console.error('--- [SCHEDULER] Error: ' + (e.message || e) + ' ---');
        }
        scheduleNextGameReset();
    }, delay);
}

// --- AUTHENTICATION ROUTES ---
app.post('/api/auth/login', (req, res) => {
    try {
        if (!req.body || !req.body.loginId) return res.status(400).json({ message: 'Input required.' });
        const result = database.findAccountForLogin(req.body.loginId);
        // FIX: Use bcrypt-aware verifyPassword instead of plaintext comparison
        if (result.account && database.verifyPassword(req.body.password, result.account.password)) {
            const table = result.role.toLowerCase() + 's';
            const fullAccount = database.findAccountById(result.account.id, table);
            // FIX: sign with shared JWT_SECRET from config.js
            const token = jwt.sign({ id: result.account.id, role: result.role }, JWT_SECRET, { expiresIn: '1d' });
            return res.json({ token: token, role: result.role, account: fullAccount });
        }
        res.status(401).json({ message: 'ID or Password incorrect.' });
    } catch (e) {
        console.error('--- [SERVER] Login crash: ' + (e.message || e) + ' ---');
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
    try {
        const role = req.user.role;
        const table = role.toLowerCase() + 's';
        const account = database.findAccountById(req.user.id, table);
        if (!account) return res.status(404).json({ message: 'User not found.' });

        let extra = {};
        if (role === 'DEALER') {
            extra.users = database.findUsersByDealerId(req.user.id);
            extra.bets = database.findBetsByDealerId(req.user.id);
        } else if (role === 'USER') {
            extra.bets = database.findBetsByUserId(req.user.id);
        } else if (role === 'ADMIN') {
            extra.dealers = database.getAllFromTable('dealers', true);
            extra.users = database.getAllFromTable('users', true);
            extra.bets = database.getAllFromTable('bets');
        }
        res.json(Object.assign({ account: account, role: role }, extra));
    } catch (e) {
        res.sendStatus(500);
    }
});

// FIX: Wired up resetPassword route (was a stub in the frontend)
app.post('/api/auth/reset-password', (req, res) => {
    try {
        const { loginId, contact, newPassword } = req.body;
        if (!loginId || !contact || !newPassword) return res.status(400).json({ message: 'All fields required.' });
        const success = database.updatePassword(loginId, contact, newPassword);
        if (!success) return res.status(404).json({ message: 'Account not found or contact does not match.' });
        res.json({ message: 'Password updated successfully.' });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// --- DATA ROUTES ---
app.get('/api/games', (req, res) => {
    const data = database.getAllFromTable('games');
    res.json(data || []);
});

app.get('/api/user/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'USER') return res.sendStatus(403);
    res.json({
        account: database.findAccountById(req.user.id, 'users'),
        games: database.getAllFromTable('games'),
        bets: database.findBetsByUserId(req.user.id)
    });
});

app.get('/api/dealer/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    res.json({
        account: database.findAccountById(req.user.id, 'dealers'),
        users: database.findUsersByDealerId(req.user.id),
        bets: database.findBetsByDealerId(req.user.id)
    });
});

app.get('/api/admin/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    res.json({
        account: database.findAccountById(req.user.id, 'admins'),
        dealers: database.getAllFromTable('dealers', true),
        users: database.getAllFromTable('users', true),
        games: database.getAllFromTable('games'),
        bets: database.getAllFromTable('bets')
    });
});

// --- ACTION ROUTES ---
app.post('/api/user/bets', authMiddleware, (req, res) => {
    if (req.user.role !== 'USER') return res.sendStatus(403);
    const body = req.body;
    try {
        if (body.isMultiGame && body.multiGameBets) {
            const results = [];
            database.runInTransaction(() => {
                const keys = Object.keys(body.multiGameBets);
                for (var i = 0; i < keys.length; i++) {
                    const gameId = keys[i];
                    const entry = body.multiGameBets[gameId];
                    const processed = database.placeBulkBets(req.user.id, gameId, entry.betGroups);
                    if (processed && Array.isArray(processed)) {
                        for (var j = 0; j < processed.length; j++) {
                            results.push(processed[j]);
                        }
                    }
                }
            });
            res.status(201).json(results);
        } else {
            res.status(201).json(database.placeBulkBets(req.user.id, body.gameId, body.betGroups));
        }
    } catch (e) {
        res.status(400).json({ message: e.message || 'Processing failed' });
    }
});

app.post('/api/dealer/bets/bulk', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try { res.status(201).json(database.placeBulkBets(req.body.userId, req.body.gameId, req.body.betGroups)); }
    catch (e) { res.status(400).json({ message: e.message }); }
});

app.post('/api/dealer/users', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try { res.status(201).json(database.createUser(req.body.userData, req.user.id, req.body.initialDeposit)); }
    catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/dealer/users/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try { res.json(database.updateUser(req.body, req.params.id, req.user.id)); }
    catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/dealer/users/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try { database.deleteUserByDealer(req.params.id, req.user.id); res.sendStatus(204); }
    catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/dealer/topup/user', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try {
        const { userId, amount } = req.body;
        const user = database.findUserByDealer(userId, req.user.id);
        if (!user) throw new Error('User not found in your network.');
        database.runInTransaction(() => {
            database.addLedgerEntry(req.user.id, 'DEALER', 'User funding: ' + userId, amount, 0);
            database.addLedgerEntry(userId, 'USER', 'Wallet refill', 0, amount);
        });
        res.json({ message: "Success" });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

app.post('/api/dealer/withdraw/user', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try {
        const { userId, amount } = req.body;
        const user = database.findUserByDealer(userId, req.user.id);
        if (!user) throw new Error('User not found in your network.');
        database.runInTransaction(() => {
            database.addLedgerEntry(userId, 'USER', 'Withdrawal by Dealer', amount, 0);
            database.addLedgerEntry(req.user.id, 'DEALER', 'User withdrawal credit: ' + userId, 0, amount);
        });
        res.json({ message: "Success" });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

app.put('/api/dealer/users/:id/toggle-restriction', authMiddleware, (req, res) => {
    if (req.user.role !== 'DEALER') return res.sendStatus(403);
    try { res.json(database.toggleUserRestrictionByDealer(req.params.id, req.user.id)); }
    catch (e) { res.status(500).json({ message: e.message }); }
});

// --- ADMIN ROUTES ---
app.get('/api/admin/summary', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    res.json(database.getFinancialSummary());
});

app.get('/api/admin/number-summary', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    res.json(database.getNumberStakeSummary(req.query));
});

app.post('/api/admin/dealers', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.status(201).json(database.createDealer(req.body)); }
    catch (e) { res.status(400).json({ message: e.message }); }
});

app.put('/api/admin/dealers/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.updateDealer(req.body, req.params.id)); }
    catch (e) { res.status(400).json({ message: e.message }); }
});

app.put('/api/admin/users/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.updateUserByAdmin(req.body, req.params.id)); }
    catch (e) { res.status(400).json({ message: e.message }); }
});

app.put('/api/admin/profile', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.updateAdmin(req.body, req.user.id)); }
    catch (e) { res.status(400).json({ message: e.message }); }
});

app.post('/api/admin/topup/dealer', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try {
        const { dealerId, amount } = req.body;
        database.runInTransaction(() => {
            database.addLedgerEntry(req.user.id, 'ADMIN', `Funding Dealer ${dealerId}`, amount, 0);
            database.addLedgerEntry(dealerId, 'DEALER', 'Deposit from Admin', 0, amount);
        });
        res.json({ message: "Success" });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

app.post('/api/admin/withdraw/dealer', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try {
        const { dealerId, amount } = req.body;
        database.runInTransaction(() => {
            database.addLedgerEntry(dealerId, 'DEALER', 'Withdrawal by Admin', amount, 0);
            database.addLedgerEntry(req.user.id, 'ADMIN', `Withdrawal from ${dealerId}`, 0, amount);
        });
        res.json({ message: "Success" });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

app.put('/api/admin/accounts/:type/:id/toggle-restriction', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.toggleAccountRestrictionByAdmin(req.params.id, req.params.type)); }
    catch (e) { res.status(400).json({ message: e.message }); }
});

app.post('/api/admin/bulk-bet', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.status(201).json(database.placeBulkBets(req.body.userId, req.body.gameId, req.body.betGroups)); }
    catch (e) { res.status(400).json({ message: e.message }); }
});

app.post('/api/admin/games/:id/declare-winner', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.declareWinnerForGame(req.params.id, req.body.winningNumber)); }
    catch (e) { res.status(400).json({ message: e.message }); }
});

app.put('/api/admin/games/:id/update-winner', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.updateWinningNumber(req.params.id, req.body.newWinningNumber)); }
    catch (e) { res.status(400).json({ message: e.message }); }
});

app.post('/api/admin/games/:id/approve-payouts', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.approvePayoutsForGame(req.params.id)); }
    catch (e) { res.status(400).json({ message: e.message }); }
});

app.put('/api/admin/games/:id/draw-time', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.updateGameDrawTime(req.params.id, req.body.newDrawTime)); }
    catch (e) { res.status(400).json({ message: e.message }); }
});

// --- NUMBER LIMITS ---
app.get('/api/admin/number-limits', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    res.json(database.getAllNumberLimits());
});

app.post('/api/admin/number-limits', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.saveNumberLimit(req.body)); }
    catch (e) { res.status(400).json({ message: e.message }); }
});

app.delete('/api/admin/number-limits/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { database.deleteNumberLimit(req.params.id); res.sendStatus(204); }
    catch (e) { res.status(400).json({ message: e.message }); }
});

// --- AI SERVICES ---
app.post('/api/user/ai-lucky-pick', authMiddleware, async (req, res) => {
    const key = process.env.API_KEY;
    if (!key) return res.status(503).json({ message: "AI disabled" });
    try {
        const ai = new GoogleGenAI({ apiKey: key });
        const { gameType, count = 5 } = req.body;
        const p = "Give " + count + " lucky nums for " + gameType + ". CSV format.";
        // FIX: corrected model name — 'gemini-3-flash-preview' does not exist
        const r = await ai.models.generateContent({ model: 'gemini-2.0-flash', contents: p });
        res.json({ luckyNumbers: r.text });
    } catch (e) { res.status(500).json({ message: "AI error" }); }
});

// --- STARTUP ---
const startServer = () => {
    try {
        database.connect();
        database.verifySchema();
        // FIX: Migrate any existing plaintext passwords to bcrypt hashes on startup.
        database.migratePasswords();

        scheduleNextGameReset();
        const port = process.env.PORT || 3001;
        app.listen(port, () => {
            // FIX: use console.log for normal startup messages
            console.log('>>> [CORE] ABABA Exchange active on port ' + port + ' <<<');
        });
    } catch (e) {
        console.error('--- [FATAL] Startup failed: ' + (e.message || e) + ' ---');
        process.exit(1);
    }
};

startServer();