
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
        console.error("Schema verify failed. Run db:setup");
        process.exit(1);
    }
};

// --- ACCOUNT HELPERS ---

const findAccountById = (id, table, full = false) => {
    const account = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!account) return null;
    if (account.prizeRates) account.prizeRates = JSON.parse(account.prizeRates);
    if (account.betLimits) account.betLimits = JSON.parse(account.betLimits);
    if ('isRestricted' in account) account.isRestricted = !!account.isRestricted;
    if (full) {
        account.ledger = db.prepare('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp DESC LIMIT 100').all(id).map(e => ({...e, timestamp: new Date(e.timestamp)}));
    }
    return account;
};

const findAccountForLogin = (loginId) => {
    let account = db.prepare('SELECT id FROM admins WHERE id = ?').get(loginId);
    if (account) return { account: db.prepare('SELECT * FROM admins WHERE id = ?').get(loginId), role: 'ADMIN' };
    account = db.prepare('SELECT id FROM dealers WHERE id = ?').get(loginId);
    if (account) return { account: db.prepare('SELECT * FROM dealers WHERE id = ?').get(loginId), role: 'DEALER' };
    account = db.prepare('SELECT id FROM users WHERE id = ?').get(loginId);
    if (account) return { account: db.prepare('SELECT * FROM users WHERE id = ?').get(loginId), role: 'USER' };
    return { account: null, role: null };
};

const getAllFromTable = (table) => {
    const items = db.prepare(`SELECT * FROM ${table}`).all();
    return items.map(i => {
        if (i.prizeRates) i.prizeRates = JSON.parse(i.prizeRates);
        if (i.betLimits) i.betLimits = JSON.parse(i.betLimits);
        return i;
    });
};

// --- WALLET & TRANSACTIONS ---

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

// --- GAME LOGIC ---

const declareWinner = (gameId, winningNumber) => {
    return db.transaction(() => {
        const marketDate = getMarketDateString();
        db.prepare('UPDATE games SET winningNumber = ?, payoutsApproved = 0 WHERE id = ?').run(winningNumber, gameId);
        db.prepare('INSERT INTO daily_results (id, gameId, date, winningNumber) VALUES (?, ?, ?, ?) ON CONFLICT(gameId, date) DO UPDATE SET winningNumber = excluded.winningNumber').run(
            uuidv4(), gameId, marketDate, winningNumber
        );
    })();
};

const getNumberSummary = (filters) => {
    const { date, gameId, dealerId } = filters;
    let sql = `SELECT subGameType, numbers, totalAmount FROM bets WHERE date(timestamp) = ?`;
    const params = [date];
    if (gameId) { sql += ` AND gameId = ?`; params.push(gameId); }
    if (dealerId) { sql += ` AND dealerId = ?`; params.push(dealerId); }

    const bets = db.prepare(sql).all(...params);
    const summary = { twoDigit: {}, oneDigitOpen: {}, oneDigitClose: {} };

    bets.forEach(b => {
        const numbers = JSON.parse(b.numbers);
        const amountPer = b.totalAmount / numbers.length;
        numbers.forEach(num => {
            let cat = 'twoDigit';
            if (b.subGameType.includes('Open')) cat = 'oneDigitOpen';
            else if (b.subGameType.includes('Close')) cat = 'oneDigitClose';
            summary[cat][num] = (summary[cat][num] || 0) + amountPer;
        });
    });

    const format = (obj) => Object.entries(obj).map(([number, stake]) => ({ number, stake })).sort((a,b) => b.stake - a.stake);
    return { twoDigit: format(summary.twoDigit), oneDigitOpen: format(summary.oneDigitOpen), oneDigitClose: format(summary.oneDigitClose) };
};

const getWinnersReport = (date, gameId) => {
    const result = db.prepare('SELECT winningNumber FROM daily_results WHERE date = ? AND gameId = ?').get(date, gameId);
    if (!result) return null;
    const winNum = result.winningNumber;
    
    const bets = db.prepare('SELECT * FROM bets WHERE gameId = ? AND date(timestamp) = ?').all(gameId, date);
    const winners = [];
    let totalPayout = 0;

    bets.forEach(b => {
        const user = findAccountById(b.userId, 'users');
        const dealer = findAccountById(b.dealerId, 'dealers');
        const nums = JSON.parse(b.numbers);
        const winList = nums.filter(n => {
            if (b.subGameType.includes('Open')) return n === winNum[0];
            if (b.subGameType.includes('Close')) return n === winNum[1];
            return n === winNum;
        });

        if (winList.length > 0) {
            const multiplier = b.subGameType.includes('Open') ? user.prizeRates.oneDigitOpen : (b.subGameType.includes('Close') ? user.prizeRates.oneDigitClose : user.prizeRates.twoDigit);
            const payout = winList.length * b.amountPerNumber * multiplier;
            totalPayout += payout;
            winners.push({
                userName: user.name,
                dealerName: dealer.name,
                totalPayout: payout,
                winningBets: [{ subGameType: b.subGameType, winningNumbers: winList, amountPerNumber: b.amountPerNumber, payout }]
            });
        }
    });

    return { gameName: db.prepare('SELECT name FROM games WHERE id = ?').get(gameId).name, winningNumber: winNum, totalPayout, winners };
};

module.exports = {
    connect, verifySchema, findAccountById, findAccountForLogin, getAllFromTable,
    updateWallet, declareWinner, getNumberSummary, getWinnersReport,
    getDailyResults: () => db.prepare('SELECT * FROM daily_results ORDER BY date DESC LIMIT 200').all(),
    getBetsByUserId: (uid) => db.prepare('SELECT * FROM bets WHERE userId = ? ORDER BY timestamp DESC LIMIT 100').all(uid).map(b => ({...b, numbers: JSON.parse(b.numbers)})),
    toggleRestriction: (id, table) => {
        const current = db.prepare(`SELECT isRestricted FROM ${table} WHERE id = ?`).get(id).isRestricted;
        db.prepare(`UPDATE ${table} SET isRestricted = ? WHERE id = ?`).run(current ? 0 : 1, id);
    },
    saveDealer: (d) => db.prepare(`INSERT INTO dealers (id, name, password, area, contact, wallet, commissionRate, prizeRates, avatarUrl) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, area=excluded.area, contact=excluded.contact, commissionRate=excluded.commissionRate, prizeRates=excluded.prizeRates`).run(d.id, d.name, d.password, d.area, d.contact, d.wallet, d.commissionRate, JSON.stringify(d.prizeRates), d.avatarUrl),
    saveUser: (u) => db.prepare(`INSERT INTO users (id, name, password, dealerId, area, contact, wallet, commissionRate, prizeRates, betLimits, avatarUrl) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, area=excluded.area, contact=excluded.contact, prizeRates=excluded.prizeRates, betLimits=excluded.betLimits`).run(u.id, u.name, u.password, u.dealerId, u.area, u.contact, u.wallet, u.commissionRate, JSON.stringify(u.prizeRates), JSON.stringify(u.betLimits), u.avatarUrl),
    getLiveBooking: (gameId) => db.prepare('SELECT * FROM bets WHERE gameId = ? AND date(timestamp) = ?').all(gameId, getMarketDateString()).map(b => ({...b, numbers: JSON.parse(b.numbers)})),
    searchBets: (num) => db.prepare(`SELECT b.*, u.name as userName, d.name as dealerName, g.name as gameName FROM bets b JOIN users u ON b.userId = u.id JOIN dealers d ON b.dealerId = d.id JOIN games g ON b.gameId = g.id WHERE b.numbers LIKE ?`).all(`%${num}%`).map(b => ({...b, numbers: JSON.parse(b.numbers)})),
    updateDrawTime: (id, time) => db.prepare('UPDATE games SET drawTime = ? WHERE id = ?').run(time, id)
};
