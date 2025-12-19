
const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'database.sqlite');
let db;

const PKT_OFFSET_HOURS = 5;
const OPEN_HOUR_PKT = 16;
const RESET_HOUR_UTC = OPEN_HOUR_PKT - PKT_OFFSET_HOURS;

const getMarketDateString = (dateObj = new Date()) => {
    const d = new Date(dateObj.getTime());
    if (d.getUTCHours() < RESET_HOUR_UTC) {
        d.setUTCDate(d.getUTCDate() - 1);
    }
    return d.toISOString().split('T')[0];
};

const connect = () => {
    try {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        db.pragma('foreign_keys = ON');
    } catch (error) {
        console.error("DB Connection Error:", error);
        process.exit(1);
    }
};

const verifySchema = () => {
    try {
        db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admins'").get();
    } catch (error) {
        console.error("Schema verify failed.");
        process.exit(1);
    }
};

const safeParse = (str) => {
    try { return str ? JSON.parse(str) : null; } 
    catch (e) { return null; }
};

const findAccountById = (id, table, full = false) => {
    try {
        const account = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
        if (!account) return null;
        account.prizeRates = safeParse(account.prizeRates);
        account.betLimits = safeParse(account.betLimits);
        if ('isRestricted' in account) account.isRestricted = !!account.isRestricted;
        if (full) {
            account.ledger = db.prepare('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp DESC LIMIT 100').all(id).map(e => ({...e, timestamp: new Date(e.timestamp)}));
        }
        return account;
    } catch (e) { return null; }
};

const findAccountForLogin = (loginId) => {
    try {
        let account = db.prepare('SELECT id FROM admins WHERE id = ?').get(loginId);
        if (account) return { account: db.prepare('SELECT * FROM admins WHERE id = ?').get(loginId), role: 'ADMIN' };
        account = db.prepare('SELECT id FROM dealers WHERE id = ?').get(loginId);
        if (account) return { account: db.prepare('SELECT * FROM dealers WHERE id = ?').get(loginId), role: 'DEALER' };
        account = db.prepare('SELECT id FROM users WHERE id = ?').get(loginId);
        if (account) return { account: db.prepare('SELECT * FROM users WHERE id = ?').get(loginId), role: 'USER' };
        return { account: null, role: null };
    } catch (e) { return { account: null, role: null }; }
};

const getAllFromTable = (table) => {
    try {
        const items = db.prepare(`SELECT * FROM ${table}`).all();
        return items.map(i => {
            i.prizeRates = safeParse(i.prizeRates);
            i.betLimits = safeParse(i.betLimits);
            if (table === 'games') {
                // Determine market status
                const now = new Date();
                const [h, m] = i.drawTime.split(':').map(Number);
                const draw = new Date(now);
                draw.setHours(h - PKT_OFFSET_HOURS, m, 0, 0); // Roughly UTC
                i.isMarketOpen = true; // Simplified for restore
            }
            return i;
        });
    } catch (e) { return []; }
};

const updateWallet = (accountId, accountType, amount, description, type) => {
    return db.transaction(() => {
        const table = accountType.toLowerCase() + 's';
        const account = db.prepare(`SELECT wallet FROM ${table} WHERE id = ?`).get(accountId);
        if (!account) throw new Error("Account not found");
        const newBalance = type === 'credit' ? account.wallet + amount : account.wallet - amount;
        if (newBalance < 0) throw new Error("Insufficient funds");
        db.prepare(`UPDATE ${table} SET wallet = ? WHERE id = ?`).run(newBalance, accountId);
        db.prepare(`INSERT INTO ledgers (id, accountId, accountType, timestamp, description, debit, credit, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
            uuidv4(), accountId, accountType, new Date().toISOString(), description, type === 'debit' ? amount : 0, type === 'credit' ? amount : 0, newBalance
        );
        return newBalance;
    })();
};

module.exports = {
    connect, verifySchema, findAccountById, findAccountForLogin, getAllFromTable,
    updateWallet,
    declareWinner: (gameId, num) => {
        const date = getMarketDateString();
        db.prepare('UPDATE games SET winningNumber = ?, payoutsApproved = 0 WHERE id = ?').run(num, gameId);
        db.prepare('INSERT INTO daily_results (id, gameId, date, winningNumber) VALUES (?,?,?,?) ON CONFLICT(gameId, date) DO UPDATE SET winningNumber=excluded.winningNumber').run(uuidv4(), gameId, date, num);
    },
    approvePayouts: (gameId) => db.prepare('UPDATE games SET payoutsApproved = 1 WHERE id = ?').run(gameId),
    toggleRestriction: (id, table) => {
        const cur = db.prepare(`SELECT isRestricted FROM ${table} WHERE id = ?`).get(id).isRestricted;
        db.prepare(`UPDATE ${table} SET isRestricted = ? WHERE id = ?`).run(cur ? 0 : 1, id);
    },
    saveDealer: (d) => db.prepare(`INSERT INTO dealers (id, name, password, area, contact, wallet, commissionRate, prizeRates, avatarUrl) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, area=excluded.area, contact=excluded.contact, commissionRate=excluded.commissionRate, prizeRates=excluded.prizeRates`).run(d.id, d.name, d.password, d.area, d.contact, d.wallet, d.commissionRate, JSON.stringify(d.prizeRates), d.avatarUrl),
    saveUser: (u) => db.prepare(`INSERT INTO users (id, name, password, dealerId, area, contact, wallet, commissionRate, prizeRates, betLimits, avatarUrl) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, area=excluded.area, contact=excluded.contact, prizeRates=excluded.prizeRates, betLimits=excluded.betLimits`).run(u.id, u.name, u.password, u.dealerId, u.area, u.contact, u.wallet, u.commissionRate, JSON.stringify(u.prizeRates), JSON.stringify(u.betLimits), u.avatarUrl),
    getDailyResults: () => db.prepare('SELECT * FROM daily_results ORDER BY date DESC LIMIT 100').all(),
    getBetsByUserId: (uid) => db.prepare('SELECT * FROM bets WHERE userId = ? ORDER BY timestamp DESC LIMIT 100').all(uid).map(b => ({...b, numbers: safeParse(b.numbers)})),
    updateGameDrawTime: (id, time) => db.prepare('UPDATE games SET drawTime = ? WHERE id = ?').run(time, id),
    getLiveBooking: (gameId) => db.prepare('SELECT * FROM bets WHERE gameId = ? AND date(timestamp) = ?').all(gameId, getMarketDateString()).map(b => ({...b, numbers: safeParse(b.numbers)})),
    getNumberSummary: (f) => ({ twoDigit: [], oneDigitOpen: [], oneDigitClose: [] }), // Stub for now
    getWinnersReport: (d, g) => null, // Stub for now
    searchBets: (n) => [] // Stub for now
};
