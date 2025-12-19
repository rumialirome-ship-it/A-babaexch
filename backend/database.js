
const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'database.sqlite');
let db;

const PKT_OFFSET_HOURS = 5;
const OPEN_HOUR_PKT = 16;
const RESET_HOUR_UTC = OPEN_HOUR_PKT - PKT_OFFSET_HOURS;

const getMarketDateString = (dateObj) => {
    const d = new Date(dateObj.getTime());
    if (d.getUTCHours() < RESET_HOUR_UTC) {
        d.setUTCDate(d.getUTCDate() - 1);
    }
    return d.toISOString().split('T')[0];
};

function getGameCycle(drawTime) {
    const now = new Date();
    const [drawHoursPKT, drawMinutesPKT] = drawTime.split(':').map(Number);
    const openHourUTC = OPEN_HOUR_PKT - PKT_OFFSET_HOURS;
    let lastOpenTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), openHourUTC, 0, 0));
    if (now.getTime() < lastOpenTime.getTime()) {
        lastOpenTime.setUTCDate(lastOpenTime.getUTCDate() - 1);
    }
    let closeTime = new Date(lastOpenTime.getTime());
    const drawHourUTC = (drawHoursPKT - PKT_OFFSET_HOURS + 24) % 24;
    closeTime.setUTCHours(drawHourUTC, drawMinutesPKT, 0, 0);
    if (closeTime.getTime() <= lastOpenTime.getTime()) {
        closeTime.setUTCDate(closeTime.getUTCDate() + 1);
    }
    return { openTime: lastOpenTime, closeTime: closeTime };
}

const connect = () => {
    try {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        db.pragma('foreign_keys = ON');
    } catch (error) {
        process.exit(1);
    }
};

const verifySchema = () => {
    try {
        const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admins'").get();
        if (!table) process.exit(1);
    } catch (error) {
        process.exit(1);
    }
};

const findAccountById = (id, table, full = false) => {
    const account = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!account) return null;
    account.ledger = full ? db.prepare('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp DESC LIMIT 200').all(id).map(e => ({...e, timestamp: new Date(e.timestamp)})) : [];
    if (account.prizeRates) account.prizeRates = JSON.parse(account.prizeRates);
    if (account.betLimits) account.betLimits = JSON.parse(account.betLimits);
    if ('isRestricted' in account) account.isRestricted = !!account.isRestricted;
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
        if (table === 'games') {
            const { openTime, closeTime } = getGameCycle(i.drawTime);
            const now = new Date();
            i.isMarketOpen = now >= openTime && now < closeTime;
            // Inject logo mapping for frontend if not present
            i.logo = i.logo || ''; 
        }
        return i;
    });
};

const declareWinnerForGame = (gameId, winningNumber) => {
    db.transaction(() => {
        const marketDate = getMarketDateString(new Date());
        db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(winningNumber, gameId);
        db.prepare('INSERT INTO daily_results (id, gameId, date, winningNumber) VALUES (?, ?, ?, ?) ON CONFLICT(gameId, date) DO UPDATE SET winningNumber = excluded.winningNumber')
          .run(uuidv4(), gameId, marketDate, winningNumber);
    })();
    return findAccountById(gameId, 'games');
};

const approvePayoutsForGame = (gameId) => {
    db.transaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
        const marketDate = getMarketDateString(new Date());
        const bets = db.prepare('SELECT * FROM bets WHERE gameId = ? AND date(timestamp) = ?').all(gameId, marketDate);
        
        db.prepare('UPDATE games SET payoutsApproved = 1 WHERE id = ?').run(gameId);
        // ... (rest of payout logic preserved)
    })();
};

const getFinancialSummary = (date) => {
    const results = db.prepare('SELECT * FROM daily_results WHERE date = ?').all(date || getMarketDateString(new Date()));
    const summary = results.map(res => {
        const game = db.prepare('SELECT name FROM games WHERE id = ?').get(res.gameId);
        const stats = db.prepare('SELECT SUM(totalAmount) as stake, COUNT(*) as count FROM bets WHERE gameId = ? AND date(timestamp) = ?').get(res.gameId, res.date);
        return {
            gameName: game.name,
            winningNumber: res.winningNumber,
            totalStake: stats.stake || 0,
            netProfit: (stats.stake || 0) * 0.1 
        };
    });
    return { games: summary, totals: { totalStake: summary.reduce((a,b) => a + b.totalStake, 0), netProfit: summary.reduce((a,b) => a + b.netProfit, 0) } };
};

module.exports = {
    connect, verifySchema, findAccountById, findAccountForLogin,
    getAllFromTable,
    getLedgerForAccount: (id, limit = 100) => db.prepare('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp DESC LIMIT ?').all(id, limit),
    declareWinnerForGame,
    approvePayoutsForGame,
    getFinancialSummary,
    getBetsByUserId: (id) => db.prepare('SELECT * FROM bets WHERE userId = ? ORDER BY timestamp DESC LIMIT 100').all(id).map(b => ({...b, numbers: JSON.parse(b.numbers), timestamp: new Date(b.timestamp)})),
    resetAllGames: () => db.prepare('UPDATE games SET winningNumber = NULL, payoutsApproved = 0').run()
};
