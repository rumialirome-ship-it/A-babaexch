
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

const PKT_OFFSET_HOURS = 5;
const RESET_HOUR_PKT = 16; 

function scheduleTasks() {
    const now = new Date();
    const resetHourUTC = RESET_HOUR_PKT - PKT_OFFSET_HOURS;
    let resetTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), resetHourUTC, 0, 5, 0));

    if (now >= resetTime) resetTime.setUTCDate(resetTime.getUTCDate() + 1);

    const delay = Math.max(60000, resetTime.getTime() - now.getTime());
    console.error(`--- System Tasks Scheduled (Next Run: ${resetTime.toUTCString()}) ---`);
    
    setTimeout(() => {
        try { 
            database.resetAllGames(); 
            // Automated nightly backup on reset
            database.createSafeBackup();
            database.pruneOldBackups();
        } catch (e) { console.error('Scheduler error:', e); }
        scheduleTasks();
    }, delay);
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
    res.status(401).json({ message: 'Invalid Credentials.' });
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
 * ADMIN SECURITY: Manual backup download
 */
app.get('/api/admin/backup/download', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try {
        const tempPath = path.join(__dirname, 'backups', `manual-export-${Date.now()}.sqlite`);
        database.createSafeBackup(tempPath);
        res.download(tempPath, 'system-backup.sqlite', (err) => {
            if (!err && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        });
    } catch (e) { res.status(500).json({ message: "Backup error" }); }
});

app.get('/api/games', (req, res) => res.json(database.getAllFromTable('games')));

app.get('/api/admin/data', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    res.json({ account: database.findAccountById(req.user.id, 'admins'), dealers: database.getAllFromTable('dealers', true), users: database.getAllFromTable('users', true), games: database.getAllFromTable('games'), bets: database.getAllFromTable('bets') });
});

app.get('/api/admin/summary', authMiddleware, (req, res) => res.json(database.getFinancialSummary()));

app.post('/api/admin/dealers', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.status(201).json(database.createDealer(req.body)); }
    catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/admin/dealers/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    try { res.json(database.updateDealer(req.body, req.params.id)); }
    catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/admin/games/:id/declare-winner', authMiddleware, (req, res) => res.json(database.declareWinnerForGame(req.params.id, req.body.winningNumber)));
app.post('/api/admin/games/:id/approve-payouts', authMiddleware, (req, res) => res.json(database.approvePayoutsForGame(req.params.id)));

const startServer = () => {
  database.connect();
  database.verifySchema();
  scheduleTasks();
  app.listen(3001, () => console.error('>>> BACKEND RUNNING ON PORT 3001 <<<'));
};
startServer();
