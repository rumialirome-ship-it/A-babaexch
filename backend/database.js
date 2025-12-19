
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'database.sqlite');
let _db = null;

/**
 * Initializes the database connection.
 * Explicitly handles native module errors.
 */
const connect = () => {
    if (_db) return _db;
    try {
        console.log(`[DB] Attempting connection: ${DB_PATH}`);
        _db = new Database(DB_PATH, { timeout: 10000 });
        _db.pragma('journal_mode = WAL');
        _db.pragma('foreign_keys = ON');
        console.log('[DB] Connection successful.');
        return _db;
    } catch (e) {
        console.error("--- CRITICAL DATABASE ERROR ---");
        if (e.code === 'ERR_DLOPEN_FAILED' || e.message.includes('NODE_MODULE_VERSION')) {
            console.error("[DB] DIAGNOSIS: Node.js version mismatch detected.");
            console.error("[DB] FIX: Run 'npm install' or 'npm rebuild' in the backend folder.");
        } else {
            console.error("[DB] Error Message:", e.message);
        }
        throw e;
    }
};

const getDB = () => {
    if (!_db) return connect();
    return _db;
};

// Timezone logic (PKT is UTC+5)
const PKT_OFFSET = 5;
const OPEN_HOUR_PKT = 16;

const safeParse = (str) => {
    try { return str ? JSON.parse(str) : null; } 
    catch (e) { return null; }
};

const getAllFromTable = (table) => {
    try {
        const db = getDB();
        const items = db.prepare(`SELECT * FROM ${table}`).all();
        
        return items.map(item => {
            if (item.prizeRates) item.prizeRates = safeParse(item.prizeRates);
            if (item.betLimits) item.betLimits = safeParse(item.betLimits);
            if (item.numbers) item.numbers = safeParse(item.numbers);
            
            if (table === 'games') {
                const now = new Date();
                const pktHour = (now.getUTCHours() + PKT_OFFSET) % 24;
                item.isMarketOpen = (pktHour >= OPEN_HOUR_PKT || pktHour < 2);
            }
            return item;
        });
    } catch (err) {
        console.error(`[DB] Error querying table ${table}:`, err.message);
        throw err;
    }
};

const findAccountForLogin = (loginId) => {
    const db = getDB();
    const roles = [
        { table: 'users', role: 'USER' },
        { table: 'dealers', role: 'DEALER' },
        { table: 'admins', role: 'ADMIN' }
    ];
    for (const r of roles) {
        const acc = db.prepare(`SELECT * FROM ${r.table} WHERE id = ?`).get(loginId);
        if (acc) return { account: acc, role: r.role };
    }
    return { account: null, role: null };
};

const findAccountById = (id, table) => {
    const db = getDB();
    const acc = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!acc) return null;
    acc.prizeRates = safeParse(acc.prizeRates);
    acc.ledger = db.prepare('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp DESC LIMIT 100').all(id);
    return acc;
};

module.exports = {
    connect,
    verifySchema: () => {
        try {
            const db = getDB();
            const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='games'").get();
            if (!tableCheck) {
                console.error("[DB] CRITICAL: 'games' table is missing!");
                return false;
            }
            const count = db.prepare("SELECT COUNT(*) as total FROM games").get();
            console.log(`[DB] Schema Verified. Games found: ${count.total}`);
            return true;
        } catch (e) {
            console.error("[DB] Schema verification failed:", e.message);
            return false;
        }
    },
    getAllFromTable,
    findAccountForLogin,
    findAccountById,
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
    runInTransaction: (fn) => {
        const db = getDB();
        return db.transaction(fn)();
    }
};
