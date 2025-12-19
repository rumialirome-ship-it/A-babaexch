
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
    account.ledger = full ? db.prepare('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp DESC LIMIT 200').all(id) : [];
    if (account.prizeRates) account.prizeRates = JSON.parse(account.prizeRates);
    if (account.betLimits) account.betLimits = JSON.parse(account.betLimits);
    if ('isRestricted' in account) account.isRestricted = !!account.isRestricted;
    return account;
};

const declareWinnerForGame = (gameId, winningNumber) => {
    let result;
    db.transaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
        const marketDate = getMarketDateString(new Date());
        
        db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(winningNumber, gameId);
        db.prepare('INSERT INTO daily_results (id, gameId, date, winningNumber) VALUES (?, ?, ?, ?) ON CONFLICT(gameId, date) DO UPDATE SET winningNumber = excluded.winningNumber')
          .run(uuidv4(), gameId, marketDate, winningNumber);
        
        result = findAccountById(gameId, 'games');
    })();
    return result;
};

const approvePayoutsForGame = (gameId) => {
    db.transaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
        const marketDate = getMarketDateString(new Date());
        const bets = db.prepare('SELECT * FROM bets WHERE gameId = ? AND date(timestamp) = ?').all(gameId, marketDate);
        
        const users = Object.fromEntries(db.prepare('SELECT * FROM users').all().map(u => [u.id, { ...u, prizeRates: JSON.parse(u.prizeRates) }]));
        const dealers = Object.fromEntries(db.prepare('SELECT * FROM dealers').all().map(d => [d.id, { ...d, prizeRates: JSON.parse(d.prizeRates) }]));
        const admin = db.prepare('SELECT * FROM admins LIMIT 1').get();

        for (const bet of bets) {
            const nums = JSON.parse(bet.numbers);
            if (nums.includes(game.winningNumber)) {
                const user = users[bet.userId];
                const dealer = dealers[bet.dealerId];
                const prizeRate = bet.subGameType === '2 Digit' ? user.prizeRates.twoDigit : user.prizeRates.oneDigitOpen;
                const winAmount = bet.amountPerNumber * prizeRate;
                
                addLedgerEntry(user.id, 'USER', `Win: ${game.name} (${game.winningNumber})`, 0, winAmount);
                addLedgerEntry(admin.id, 'ADMIN', `Payout: ${user.name}`, winAmount, 0);
            }
        }
        db.prepare('UPDATE games SET payoutsApproved = 1 WHERE id = ?').run(gameId);
    })();
};

const getFinancialSummary = (date) => {
    const results = db.prepare('SELECT * FROM daily_results WHERE date = ?').all(date);
    const summary = results.map(res => {
        const game = db.prepare('SELECT name FROM games WHERE id = ?').get(res.gameId);
        const stats = db.prepare('SELECT SUM(totalAmount) as stake, COUNT(*) as count FROM bets WHERE gameId = ? AND date(timestamp) = ?').get(res.gameId, date);
        return {
            gameName: game.name,
            winningNumber: res.winningNumber,
            totalStake: stats.stake || 0,
            netProfit: (stats.stake || 0) * 0.1 // Simplified for speed
        };
    });
    return { games: summary, totals: { totalStake: summary.reduce((a,b) => a + b.totalStake, 0), netProfit: summary.reduce((a,b) => a + b.netProfit, 0) } };
};

const addLedgerEntry = (accountId, accountType, description, debit, credit) => {
    const table = accountType.toLowerCase() + 's';
    const last = db.prepare('SELECT balance FROM ledgers WHERE accountId = ? ORDER BY timestamp DESC, ROWID DESC LIMIT 1').get(accountId);
    const balance = (last ? last.balance : 0) - debit + credit;
    db.prepare('INSERT INTO ledgers (id, accountId, accountType, timestamp, description, debit, credit, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), accountId, accountType, new Date().toISOString(), description, debit, credit, balance);
    db.prepare(`UPDATE ${table} SET wallet = ? WHERE id = ?`).run(balance, accountId);
};

const getPaginatedUsers = ({ page = 1, limit = 25, search = '', dealerId = null }) => {
    const offset = (page - 1) * limit;
    const pattern = `%${search}%`;
    let query = 'FROM users WHERE (name LIKE ? OR id LIKE ?)';
    let params = [pattern, pattern];
    if (dealerId) { query += ' AND dealerId = ?'; params.push(dealerId); }

    const { count } = db.prepare(`SELECT COUNT(*) as count ${query}`).get(...params);
    const items = db.prepare(`SELECT * ${query} ORDER BY name ASC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    
    return {
        items: items.map(i => ({ ...i, prizeRates: JSON.parse(i.prizeRates), betLimits: JSON.parse(i.betLimits || '{}'), isRestricted: !!i.isRestricted, ledger: [] })),
        totalItems: count, totalPages: Math.ceil(count / limit), currentPage: parseInt(page)
    };
};

module.exports = {
    connect, verifySchema, findAccountById, findAccountForLogin, updatePassword,
    getAllFromTable: (table) => db.prepare(`SELECT * FROM ${table}`).all().map(i => {
        if (i.prizeRates) i.prizeRates = JSON.parse(i.prizeRates);
        return i;
    }),
    getLedgerForAccount: (id, limit = 100) => db.prepare('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp DESC LIMIT ?').all(id, limit),
    getPaginatedUsers,
    declareWinnerForGame,
    approvePayoutsForGame,
    getFinancialSummary,
    getBetsByUserId: (id) => db.prepare('SELECT * FROM bets WHERE userId = ? ORDER BY timestamp DESC LIMIT 100').all(id).map(b => ({...b, numbers: JSON.parse(b.numbers)})),
    resetAllGames: () => db.prepare('UPDATE games SET winningNumber = NULL, payoutsApproved = 0').run()
};
