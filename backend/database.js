
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'database.sqlite');
let _db = null;

/**
 * SQL KERNEL CONNECTOR
 * Handles native binary mismatches and provides clear recovery instructions.
 */
const connect = () => {
    if (_db) return _db;
    
    try {
        const Database = require('better-sqlite3');
        
        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        _db = new Database(DB_PATH, { timeout: 10000 });
        _db.pragma('journal_mode = WAL');
        _db.pragma('foreign_keys = ON');
        
        _db.prepare("SELECT 1").get();
        console.log('[DB] SQL Engine Online.');
        return _db;
    } catch (e) {
        console.error("!!! DATABASE KERNEL PANIC !!!");
        console.error(e.message);
        
        let msg = "Database Offline";
        let fix = "Run the Nuclear Remake command.";

        if (e.message.includes('self-register') || e.message.includes('NODE_MODULE_VERSION') || e.code === 'ERR_DLOPEN_FAILED') {
            msg = "Binary Mismatch Error";
            fix = "SSH Command: rm -rf node_modules && npm install";
        }

        const err = new Error(msg);
        err.raw = e.message;
        err.fix = fix;
        err.terminal = "cd /var/www/html/A-babaexch/backend && pm2 stop ababa-backend && rm -rf node_modules package-lock.json database.sqlite* && npm install && npm run db:setup && pm2 start server.js --name ababa-backend";
        throw err;
    }
};

const getDB = () => {
    if (!_db) return connect();
    return _db;
};

const safeParse = (str) => {
    try { return str ? JSON.parse(str) : null; } 
    catch (e) { return null; }
};

const getAllFromTable = (table) => {
    const db = getDB();
    try {
        const items = db.prepare(`SELECT * FROM ${table}`).all();
        return items.map(item => {
            if (item.prizeRates) item.prizeRates = safeParse(item.prizeRates);
            if (item.betLimits) item.betLimits = safeParse(item.betLimits);
            if (item.numbers) item.numbers = safeParse(item.numbers);
            return item;
        });
    } catch (err) {
        throw err;
    }
};

module.exports = {
    connect,
    verifySchema: () => {
        try {
            const db = getDB();
            const res = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='admins'`).get();
            return !!res;
        } catch (e) {
            return false;
        }
    },
    getAllFromTable,
    findAccountForLogin: (loginId) => {
        const db = getDB();
        const roles = [{ table: 'users', role: 'USER' }, { table: 'dealers', role: 'DEALER' }, { table: 'admins', role: 'ADMIN' }];
        for (const r of roles) {
            const acc = db.prepare(`SELECT * FROM ${r.table} WHERE id = ?`).get(loginId);
            if (acc) return { account: acc, role: r.role };
        }
        return { account: null, role: null };
    },
    findAccountById: (id, table) => {
        const db = getDB();
        const acc = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
        if (!acc) return null;
        acc.prizeRates = safeParse(acc.prizeRates);
        acc.ledger = db.prepare('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp DESC LIMIT 50').all(id);
        return acc;
    },
    runInTransaction: (fn) => getDB().transaction(fn)()
};
