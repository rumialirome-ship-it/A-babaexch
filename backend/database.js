
const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'database.sqlite');
let db;

// --- CENTRALIZED GAME TIMING LOGIC (TIMEZONE-AWARE) ---
const PKT_OFFSET_HOURS = 5;
const OPEN_HOUR_PKT = 16; // 4:00 PM in Pakistan

function getGameCycle(drawTime) {
    const now = new Date();
    const [drawHoursPKT, drawMinutesPKT] = drawTime.split(':').map(Number);
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate();
    const openHourUTC = OPEN_HOUR_PKT - PKT_OFFSET_HOURS;
    const todayOpen = new Date(Date.UTC(year, month, day, openHourUTC, 0, 0));
    const yesterdayOpen = new Date(todayOpen.getTime() - (24 * 60 * 60 * 1000));

    const calculateCloseTime = (openDate) => {
        const closeDate = new Date(openDate.getTime());
        const drawHourUTC = drawHoursPKT - PKT_OFFSET_HOURS;
        closeDate.setUTCHours(drawHourUTC, drawMinutesPKT, 0, 0);
        if (drawHoursPKT < OPEN_HOUR_PKT) {
            closeDate.setUTCDate(closeDate.getUTCDate() + 1);
        }
        return closeDate;
    };

    const yesterdayCycleClose = calculateCloseTime(yesterdayOpen);
    if (now >= yesterdayOpen && now < yesterdayCycleClose) {
        return { openTime: yesterdayOpen, closeTime: yesterdayCycleClose };
    }
    const todayCycleClose = calculateCloseTime(todayOpen);
    return { openTime: todayOpen, closeTime: todayCycleClose };
}

function isGameOpen(drawTime) {
    const now = new Date();
    const { openTime, closeTime } = getGameCycle(drawTime);
    return now >= openTime && now < closeTime;
}

const connect = () => {
    try {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        console.error('Database connected successfully.');
    } catch (error) {
        console.error('Failed to connect to database:', error);
        process.exit(1);
    }
};

const verifySchema = () => {
    try {
        const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admins'");
        const table = stmt.get();
        if (!table) {
            process.exit(1);
        }
    } catch (error) {
        process.exit(1);
    }
};

const findAccountById = (id, table) => {
    const stmt = db.prepare(`SELECT * FROM ${table} WHERE id = ?`);
    const account = stmt.get(id);
    if (!account) return null;
    if (table !== 'games') {
        account.ledger = db.prepare('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp ASC').all(id);
    } else {
        account.isMarketOpen = isGameOpen(account.drawTime);
    }
    if (account.prizeRates && typeof account.prizeRates === 'string') account.prizeRates = JSON.parse(account.prizeRates);
    if (account.betLimits && typeof account.betLimits === 'string') account.betLimits = JSON.parse(account.betLimits);
    if ('isRestricted' in account) account.isRestricted = !!account.isRestricted;
    return account;
};

const findAccountForLogin = (loginId) => {
    const lowerCaseLoginId = loginId.toLowerCase();
    const tables = [{ name: 'users', role: 'USER' }, { name: 'dealers', role: 'DEALER' }, { name: 'admins', role: 'ADMIN' }];
    for (const tableInfo of tables) {
        const account = db.prepare(`SELECT * FROM ${tableInfo.name} WHERE lower(id) = ?`).get(lowerCaseLoginId);
        if (account) return { account, role: tableInfo.role };
    }
    return { account: null, role: null };
};

const updatePassword = (accountId, contact, newPassword) => {
    const tables = ['users', 'dealers'];
    let updated = false;
    for (const table of tables) {
        const result = db.prepare(`UPDATE ${table} SET password = ? WHERE id = ? AND contact = ?`).run(newPassword, accountId, contact);
        if (result.changes > 0) { updated = true; break; }
    }
    return updated;
};

const getAllFromTable = (table, withLedger = false) => {
    let items = db.prepare(`SELECT * FROM ${table}`).all();
    return items.map(acc => {
        if (withLedger && acc.id) acc.ledger = db.prepare('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp ASC').all(acc.id);
        if (table === 'games' && acc.drawTime) acc.isMarketOpen = isGameOpen(acc.drawTime);
        if (acc.prizeRates && typeof acc.prizeRates === 'string') acc.prizeRates = JSON.parse(acc.prizeRates);
        if (acc.betLimits && typeof acc.betLimits === 'string') acc.betLimits = JSON.parse(acc.betLimits);
        if (table === 'bets' && acc.numbers && typeof acc.numbers === 'string') acc.numbers = JSON.parse(acc.numbers);
        if ('isRestricted' in acc) acc.isRestricted = !!acc.isRestricted;
        return acc;
    });
};

const runInTransaction = (fn) => db.transaction(fn)();

const addLedgerEntry = (accountId, accountType, description, debit, credit) => {
    const table = accountType.toLowerCase() + 's';
    const lastEntry = db.prepare('SELECT balance FROM ledgers WHERE accountId = ? ORDER BY timestamp DESC, ROWID DESC LIMIT 1').get(accountId);
    const lastBalance = lastEntry ? lastEntry.balance : 0;
    if (debit > 0 && accountType !== 'ADMIN' && lastBalance < debit) {
        throw { status: 400, message: `Insufficient funds for ${accountId}.` };
    }
    const newBalance = lastBalance - debit + credit;
    db.prepare('INSERT INTO ledgers (id, accountId, accountType, timestamp, description, debit, credit, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), accountId, accountType, new Date().toISOString(), description, debit, credit, newBalance);
    db.prepare(`UPDATE ${table} SET wallet = ? WHERE id = ?`).run(newBalance, accountId);
};

const createUser = (userData, dealerId, initialDeposit = 0) => {
    const existing = db.prepare('SELECT id FROM users WHERE lower(id) = ?').get(userData.id.toLowerCase());
    if (existing) throw { status: 400, message: `User ID ${userData.id} is taken.` };
    db.prepare('INSERT INTO users (id, name, password, dealerId, area, contact, wallet, commissionRate, isRestricted, prizeRates, betLimits, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(userData.id, userData.name, userData.password, dealerId, userData.area, userData.contact, 0, userData.commissionRate, 0, JSON.stringify(userData.prizeRates), JSON.stringify(userData.betLimits), userData.avatarUrl);
    if (initialDeposit > 0) {
        addLedgerEntry(dealerId, 'DEALER', `Initial Deposit for User: ${userData.name}`, initialDeposit, 0);
        addLedgerEntry(userData.id, 'USER', `Initial Deposit from Dealer`, 0, initialDeposit);
    }
    return findAccountById(userData.id, 'users');
};

const bulkImportUsers = (usersArray) => {
    let count = 0;
    runInTransaction(() => {
        for (const u of usersArray) {
            const existing = db.prepare('SELECT id FROM users WHERE lower(id) = ?').get(u.id.toLowerCase());
            if (existing) continue; // Skip duplicates
            db.prepare('INSERT INTO users (id, name, password, dealerId, area, contact, wallet, commissionRate, isRestricted, prizeRates, betLimits, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
              .run(u.id, u.name, u.password, u.dealerId, u.area, u.contact, u.wallet || 0, u.commissionRate || 0, 0, JSON.stringify(u.prizeRates), JSON.stringify(u.betLimits || {}), u.avatarUrl || "");
            
            if (u.wallet > 0) {
                db.prepare('INSERT INTO ledgers (id, accountId, accountType, timestamp, description, debit, credit, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
                  .run(uuidv4(), u.id, 'USER', new Date().toISOString(), "Bulk Import Initial Balance", 0, u.wallet, u.wallet);
            }
            count++;
        }
    });
    return count;
};

const updateDealer = (dealerData, originalId) => {
    const newId = dealerData.id;
    db.prepare('UPDATE dealers SET id = ?, name = ?, password = ?, area = ?, contact = ?, commissionRate = ?, prizeRates = ?, avatarUrl = ? WHERE id = ?')
      .run(newId, dealerData.name, dealerData.password, dealerData.area, dealerData.contact, dealerData.commissionRate, JSON.stringify(dealerData.prizeRates), dealerData.avatarUrl, originalId);
    if (newId.toLowerCase() !== originalId.toLowerCase()) {
        db.prepare('UPDATE users SET dealerId = ? WHERE dealerId = ?').run(newId, originalId);
        db.prepare('UPDATE bets SET dealerId = ? WHERE dealerId = ?').run(newId, originalId);
        db.prepare('UPDATE ledgers SET accountId = ? WHERE accountId = ? AND accountType = ?').run(newId, originalId, 'DEALER');
    }
    return findAccountById(newId, 'dealers');
};

const declareWinnerForGame = (gameId, winningNumber) => {
    let finalGame;
    runInTransaction(() => {
        db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(winningNumber, gameId);
        finalGame = findAccountById(gameId, 'games');
    });
    return finalGame;
};

const approvePayoutsForGame = (gameId) => {
    runInTransaction(() => {
        db.prepare('UPDATE games SET payoutsApproved = 1 WHERE id = ?').run(gameId);
    });
    return findAccountById(gameId, 'games');
};

const getFinancialSummary = () => {
    const admin = findAccountById('Guru', 'admins');
    return { totals: { netProfit: admin.wallet }, games: [], totalBets: 0 };
};

const getNumberStakeSummary = () => ({ twoDigit: [], oneDigitOpen: [], oneDigitClose: [] });

const placeBulkBets = (userId, gameId, betGroups) => {
    runInTransaction(() => {
        const total = betGroups.reduce((s, g) => s + g.numbers.length * g.amountPerNumber, 0);
        addLedgerEntry(userId, 'USER', 'Bets Placed', total, 0);
    });
    return [];
};

function resetAllGames() {
    runInTransaction(() => {
        db.prepare('UPDATE games SET winningNumber = NULL, payoutsApproved = 0').run();
    });
}

module.exports = {
    connect, verifySchema, findAccountById, findAccountForLogin, updatePassword, getAllFromTable,
    runInTransaction, addLedgerEntry, createDealer: (d) => {
        db.prepare('INSERT INTO dealers (id, name, password, area, contact, wallet, commissionRate, isRestricted, prizeRates, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(d.id, d.name, d.password, d.area, d.contact, d.wallet || 0, d.commissionRate, 0, JSON.stringify(d.prizeRates), d.avatarUrl);
        return findAccountById(d.id, 'dealers');
    },
    updateDealer, findUsersByDealerId: (id) => getAllFromTable('users').filter(u => u.dealerId === id),
    findUserByDealer: (uid, did) => getAllFromTable('users').find(u => u.id === uid && u.dealerId === did),
    createUser, bulkImportUsers,
    toggleAccountRestrictionByAdmin: (id, t) => {
        db.prepare(`UPDATE ${t}s SET isRestricted = 1 - isRestricted WHERE id = ?`).run(id);
        return findAccountById(id, `${t}s`);
    },
    declareWinnerForGame, updateWinningNumber: (id, n) => {
        db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(n, id);
        return findAccountById(id, 'games');
    },
    approvePayoutsForGame, getFinancialSummary, getNumberStakeSummary, placeBulkBets,
    updateGameDrawTime: (id, t) => {
        db.prepare('UPDATE games SET drawTime = ? WHERE id = ?').run(t, id);
        return findAccountById(id, 'games');
    },
    resetAllGames, findBetsByGameId: (id) => getAllFromTable('bets').filter(b => b.gameId === id),
    findBetsByDealerId: (id) => getAllFromTable('bets').filter(b => b.dealerId === id)
};
