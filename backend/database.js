
const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'database.sqlite');
let db;

// Timezone logic (PKT is UTC+5)
const PKT_OFFSET = 5;
const OPEN_HOUR_PKT = 16;

const connect = () => {
    try {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
    } catch (e) {
        console.error("DB Connection Failed:", e);
        throw e;
    }
};

const safeParse = (str) => {
    try { return str ? JSON.parse(str) : null; } 
    catch (e) { return null; }
};

const getAllFromTable = (table) => {
    try {
        const items = db.prepare(`SELECT * FROM ${table}`).all();
        return items.map(item => {
            if (item.prizeRates) item.prizeRates = safeParse(item.prizeRates);
            if (item.betLimits) item.betLimits = safeParse(item.betLimits);
            if (item.numbers) item.numbers = safeParse(item.numbers);
            
            if (table === 'games') {
                // Determine if market is open (Simple logic for display)
                const now = new Date();
                const pktHour = (now.getUTCHours() + PKT_OFFSET) % 24;
                item.isMarketOpen = pktHour >= OPEN_HOUR_PKT || pktHour < 2; // Rough estimate
            }
            return item;
        });
    } catch (e) {
        return [];
    }
};

const findAccountForLogin = (loginId) => {
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
    const acc = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!acc) return null;
    acc.prizeRates = safeParse(acc.prizeRates);
    acc.ledger = db.prepare('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp DESC LIMIT 50').all(id);
    return acc;
};

module.exports = {
    connect,
    verifySchema: () => db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admins'").get(),
    getAllFromTable,
    findAccountForLogin,
    findAccountById,
    saveDealer: (d) => db.prepare('INSERT OR REPLACE INTO dealers (id, name, password, area, contact, wallet, commissionRate, prizeRates, avatarUrl) VALUES (?,?,?,?,?,?,?,?,?)').run(d.id, d.name, d.password, d.area, d.contact, d.wallet, d.commissionRate, JSON.stringify(d.prizeRates), d.avatarUrl),
    saveUser: (u) => db.prepare('INSERT OR REPLACE INTO users (id, name, password, dealerId, area, contact, wallet, commissionRate, prizeRates, avatarUrl) VALUES (?,?,?,?,?,?,?,?,?,?)').run(u.id, u.name, u.password, u.dealerId, u.area, u.contact, u.wallet, u.commissionRate, JSON.stringify(u.prizeRates), u.avatarUrl),
    runInTransaction: (fn) => db.transaction(fn)()
};
