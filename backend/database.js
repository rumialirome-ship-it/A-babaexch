
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'database.sqlite');
let _db = null;

/**
 * DATABASE CONNECTOR
 * Uses lazy-loading to prevent crash if binary driver is broken.
 */
const connect = () => {
    if (_db) return _db;
    
    try {
        // We require it here so the server doesn't crash immediately on load
        // if the binary is mismatched.
        const Database = require('better-sqlite3');
        
        console.log(`[DB] Establishing link to: ${DB_PATH}`);
        
        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        _db = new Database(DB_PATH, { timeout: 10000 });
        _db.pragma('journal_mode = WAL');
        _db.pragma('foreign_keys = ON');
        
        // Quick health check
        _db.prepare("SELECT 1").get();
        
        console.log('[DB] SQL Link Established.');
        return _db;
    } catch (e) {
        console.error("--- DATABASE LINK FAILURE ---");
        console.error(e.message);
        
        let msg = "SQL Kernel Error";
        let fix = "Run 'npm run db:setup' on the server.";

        if (e.message.includes('self-register') || e.message.includes('NODE_MODULE_VERSION')) {
            msg = "Binary Mismatch: SQL Driver Broken";
            fix = "Run: rm -rf node_modules && npm install && pm2 restart ababa-backend";
        } else if (!fs.existsSync(DB_PATH)) {
            msg = "Database Missing: SQL File Not Found";
            fix = "Run: npm run db:setup";
        }

        const err = new Error(msg);
        err.raw = e.message;
        err.fix = fix;
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
        console.error(`[DB] Query failed for ${table}:`, err.message);
        throw err;
    }
};

module.exports = {
    connect,
    verifySchema: () => {
        try {
            const db = getDB();
            const required = ['admins', 'games', 'dealers'];
            for (const table of required) {
                const res = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
                if (!res) return false;
            }
            return true;
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
    saveDealer: (d) => {
        const db = getDB();
        return db.prepare('INSERT OR REPLACE INTO dealers (id, name, password, area, contact, wallet, commissionRate, prizeRates, avatarUrl) VALUES (?,?,?,?,?,?,?,?,?)')
                 .run(d.id, d.name, d.password, d.area, d.contact, d.wallet, d.commissionRate, JSON.stringify(d.prizeRates), d.avatarUrl);
    },
    saveUser: (u) => {
        const db = getDB();
        return db.prepare('INSERT OR REPLACE INTO users (id, name, password, dealerId, area, contact, wallet, commissionRate, prizeRates, avatarUrl) VALUES (?,?,?,?,?,?,?,?,?,?)')
                 .run(u.id, u.name, u.password, u.dealerId, u.area, u.contact, u.wallet, u.commissionRate, JSON.stringify(u.prizeRates), u.avatarUrl);
    },
    runInTransaction: (fn) => getDB().transaction(fn)()
};
