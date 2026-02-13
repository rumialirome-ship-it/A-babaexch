
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./authMiddleware');
const database = require('./database');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// --- ENHANCED SYSTEM SCHEDULER ---
const PKT_OFFSET_HOURS = 5;
const RESET_HOUR_PKT = 16; // 4:00 PM PKT

function runMaintenanceCycle() {
    console.error('>>> INITIATING DAILY MAINTENANCE CYCLE <<<');
    try {
        // 1. Reset games for the next day
        database.resetAllGames();
        
        // 2. Automated Safe Backup
        database.createSafeBackup();
        
        // 3. Cleanup old backups (keep 7 days)
        database.pruneOldBackups();
        
        console.error('>>> MAINTENANCE CYCLE COMPLETED <<<');
    } catch (e) {
        console.error('!!! MAINTENANCE CYCLE FAILED !!!', e);
    }
    
    // Schedule for exactly 24 hours later to maintain precision
    scheduleMaintenance();
}

function scheduleMaintenance() {
    const now = new Date();
    const resetHourUTC = RESET_HOUR_PKT - PKT_OFFSET_HOURS;
    
    // Target 4:00 PM PKT in UTC
    let target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), resetHourUTC, 0, 5, 0));

    // If we've passed 4 PM today, move to tomorrow
    if (now >= target) {
        target.setUTCDate(target.getUTCDate() + 1);
    }

    const delay = target.getTime() - now.getTime();
    console.error(`--- SYSTEM SCHEDULER ---`);
    console.error(`Status: Active`);
    console.error(`Next Sync: ${target.toUTCString()}`);
    console.error(`Countdown: ${Math.round(delay / 60000)} minutes`);
    
    setTimeout(runMaintenanceCycle, delay);
}

const JWT_SECRET = process.env.JWT_SECRET;

app.post('/api/auth/login', (req, res) => {
    const { loginId, password } = req.body;
    const { account, role } = database.findAccountForLogin(loginId);
    if (account && account.password === password) {
        const fullAccount = database.findAccountById(account.id, role.toLowerCase() + 's');
        const token = jwt.sign({ id: account.id, role }, JWT_SECRET, { expiresIn: '1d' });
        return res.json({ token, role, account: fullAccount });
    }
    res.status(401).json({ message: 'Invalid Login.' });
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
    const role = req.user.role;
    const account = database.findAccountById(req.user.id, role.toLowerCase() + 's');
    if (!account) return res.status(404).json({ message: 'Account not found.' });
    let extra = {};
    if (role === 'DEALER') { extra.users = database.findUsersByDealerId(req.user.id); extra.bets = database.findBetsByDealerId(req.user.id); }
    else if (role === 'USER') { extra.bets = database.findBetsByUserId(req.user.id); }
    else if (role === 'ADMIN') { extra.dealers = database.getAllFromTable('dealers', true); extra.users = database.getAllFromTable('users', true); extra.bets = database.getAllFromTable('bets'); }
    res.json({ account, role, ...extra });
});

/**
 * ADMIN: MANUAL DATA EXPORT
 */
app.get('/api/admin/backup/download', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try {
        const tempPath = path.join(__dirname, 'backups', `manual-export-${Date.now()}.sqlite`);
        database.createSafeBackup(tempPath);
        
        res.download(tempPath, 'ABABA-SYSTEM-SNAPSHOT.sqlite', (err) => {
            if (!err && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        });
    } catch (e) {
        res.status(500).json({ message: "Backup generation failed." });
    }
});

app.get('/api/games', (req, res) => res.json(database.getAllFromTable('games')));

app.get('/api/admin/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    res.json({ account: database.findAccountById(req.user.id, 'admins'), dealers: database.getAllFromTable('dealers', true), users: database.getAllFromTable('users', true), games: database.getAllFromTable('games'), bets: database.getAllFromTable('bets') });
});

app.get('/api/admin/summary', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    res.json(database.getFinancialSummary());
});

app.post('/api/admin/dealers', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.status(201).json(database.createDealer(req.body)); }
    catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/admin/games/:id/declare-winner', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    res.json(database.declareWinnerForGame(req.params.id, req.body.winningNumber));
});

const startServer = () => {
  database.connect();
  database.verifySchema();
  scheduleMaintenance();
  app.listen(3001, () => console.error('>>> A-BABA SERVER LIVE: PORT 3001 <<<'));
};
startServer();
