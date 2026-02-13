
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.resolve(__dirname, 'database.sqlite');
const BACKUP_DIR = path.resolve(__dirname, 'backups');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

let db;

// --- CENTRALIZED GAME TIMING LOGIC (PKT TIMEZONE) ---
function isGameOpen(drawTime) {
    try {
        if (!drawTime || !drawTime.includes(':')) return false;
        const now = new Date();
        const pktBias = new Date(now.getTime() + (5 * 60 * 60 * 1000));
        const [drawH, drawM] = drawTime.split(':').map(Number);
        const pktH = pktBias.getUTCHours();
        const currentCycleStart = new Date(pktBias);
        currentCycleStart.setUTCHours(16, 0, 0, 0);
        if (pktH < 16) currentCycleStart.setUTCDate(currentCycleStart.getUTCDate() - 1);
        const currentCycleEnd = new Date(currentCycleStart);
        currentCycleEnd.setUTCHours(drawH, drawM, 0, 0);
        if (drawH < 16) currentCycleEnd.setUTCDate(currentCycleEnd.getUTCDate() + 1);
        return pktBias >= currentCycleStart && pktBias < currentCycleEnd;
    } catch (e) { return false; }
}

const connect = () => {
    try {
        db = new Database(DB_PATH, { timeout: 10000 });
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        console.error(`--- Database Connected at: ${DB_PATH} ---`);
    } catch (error) {
        console.error('CRITICAL: Database connection failed:', error);
        process.exit(1);
    }
};

/**
 * SAFE LIVE BACKUP
 * Creates a consistent copy of the DB even if users are writing to it.
 */
const createSafeBackup = (targetPath = null) => {
    try {
        const timestamp = new Date().toISOString().split('T')[0];
        const backupFile = targetPath || path.join(BACKUP_DIR, `snapshot-${timestamp}-${Date.now()}.sqlite`);
        
        // VACUUM INTO is the gold standard for live SQLite backups
        if (fs.existsSync(backupFile)) fs.unlinkSync(backupFile);
        db.prepare(`VACUUM INTO ?`).run(backupFile);
        
        console.error(`--- Backup Generated: ${backupFile} ---`);
        return backupFile;
    } catch (error) {
        console.error('Backup Error:', error.message);
        throw error;
    }
};

/**
 * PRUNE OLD BACKUPS
 * Keeps only the last 7 days of snapshots to save VPS disk space
 */
const pruneOldBackups = () => {
    try {
        const files = fs.readdirSync(BACKUP_DIR);
        if (files.length > 7) {
            const sorted = files.sort((a, b) => fs.statSync(path.join(BACKUP_DIR, b)).mtime - fs.statSync(path.join(BACKUP_DIR, a)).mtime);
            sorted.slice(7).forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));
            console.error(`--- Pruned old backups ---`);
        }
    } catch (e) {}
};

const verifySchema = () => {
    try {
        const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admins'");
        if (!stmt.get()) console.error('--- WARNING: Database schema missing! ---');
    } catch (error) { console.error('Schema verification error:', error); }
};

const findAccountById = (id, table, ledgerLimit = 15) => {
    try {
        const stmt = db.prepare(`SELECT * FROM ${table} WHERE LOWER(id) = LOWER(?)`);
        const account = stmt.get(id);
        if (!account) return null;
        if (table !== 'games') {
            account.ledger = db.prepare('SELECT * FROM ledgers WHERE LOWER(accountId) = LOWER(?) ORDER BY timestamp DESC LIMIT ?').all(id, ledgerLimit).reverse();
        } else {
            account.isMarketOpen = isGameOpen(account.drawTime);
        }
        if (table === 'users' || table === 'dealers' || table === 'admins') {
            account.commissionRate = Number(account.commissionRate) || 0;
            if (account.prizeRates && typeof account.prizeRates === 'string') account.prizeRates = JSON.parse(account.prizeRates);
            if (account.betLimits && typeof account.betLimits === 'string') account.betLimits = JSON.parse(account.betLimits);
        }
        if ('isRestricted' in account) account.isRestricted = !!account.isRestricted;
        return account;
    } catch (e) { return null; }
};

const findAccountForLogin = (loginId) => {
    try {
        const lowerCaseLoginId = loginId.toLowerCase();
        const tables = [{ name: 'users', role: 'USER' }, { name: 'dealers', role: 'DEALER' }, { name: 'admins', role: 'ADMIN' }];
        for (const tableInfo of tables) {
            const stmt = db.prepare(`SELECT * FROM ${tableInfo.name} WHERE LOWER(id) = ?`);
            const account = stmt.get(lowerCaseLoginId);
            if (account) return { account, role: tableInfo.role };
        }
    } catch (e) {}
    return { account: null, role: null };
};

const updatePassword = (accountId, contact, newPassword) => {
    const tables = ['users', 'dealers'];
    for (const table of tables) {
        const result = db.prepare(`UPDATE ${table} SET password = ? WHERE id = ? AND contact = ?`).run(newPassword, accountId, contact);
        if (result.changes > 0) return true;
    }
    return false;
};

const getAllFromTable = (table, withLedger = false, ledgerLimit = 5) => {
    try {
        const rows = db.prepare(`SELECT * FROM ${table}`).all();
        return rows.map(acc => {
            try {
                if (table === 'users' || table === 'dealers' || table === 'admins') {
                    acc.commissionRate = Number(acc.commissionRate) || 0;
                    if (withLedger && acc.id) {
                        acc.ledger = db.prepare('SELECT * FROM ledgers WHERE LOWER(accountId) = LOWER(?) ORDER BY timestamp DESC LIMIT ?').all(acc.id, ledgerLimit).reverse();
                    }
                    if (acc.prizeRates && typeof acc.prizeRates === 'string') acc.prizeRates = JSON.parse(acc.prizeRates);
                    if (acc.betLimits && typeof acc.betLimits === 'string') acc.betLimits = JSON.parse(acc.betLimits);
                }
                if (table === 'games' && acc.drawTime) acc.isMarketOpen = isGameOpen(acc.drawTime);
                if (table === 'bets' && acc.numbers) acc.numbers = JSON.parse(acc.numbers);
                if ('isRestricted' in acc) acc.isRestricted = !!acc.isRestricted;
            } catch (e) {}
            return acc;
        });
    } catch (e) { return []; }
};

const runInTransaction = (fn) => db.transaction(fn)();

const addLedgerEntry = (accountId, accountType, description, debit, credit) => {
    const table = accountType.toLowerCase() + 's';
    const account = db.prepare(`SELECT wallet FROM ${table} WHERE LOWER(id) = LOWER(?)`).get(accountId);
    const lastBalance = account ? account.wallet : 0;
    if (debit > 0 && accountType !== 'ADMIN' && lastBalance < debit) throw { status: 400, message: `Insufficient funds.` };
    const newBalance = Math.round((lastBalance - debit + credit) * 100) / 100;
    db.prepare('INSERT INTO ledgers (id, accountId, accountType, timestamp, description, debit, credit, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(uuidv4(), accountId, accountType, new Date().toISOString(), description, debit, credit, newBalance);
    db.prepare(`UPDATE ${table} SET wallet = ? WHERE LOWER(id) = LOWER(?)`).run(newBalance, accountId);
};

const declareWinnerForGame = (gameId, winningNumber) => {
    let finalGame;
    runInTransaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
        if (!game || game.winningNumber) throw { status: 400, message: 'Winner already declared.' };
        db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(winningNumber, gameId);
        finalGame = findAccountById(gameId, 'games');
    });
    return finalGame;
};

const updateWinningNumber = (gameId, newWinningNumber) => {
    let updatedGame;
    runInTransaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
        if (!game || !game.winningNumber || game.payoutsApproved) throw { status: 400, message: 'Cannot update.' };
        db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(newWinningNumber, gameId);
        updatedGame = findAccountById(gameId, 'games');
    });
    return updatedGame;
};

const approvePayoutsForGame = (gameId) => {
    let updatedGame;
    runInTransaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
        if (!game || !game.winningNumber || game.payoutsApproved) throw { status: 400, message: "Invalid approval." };
        const winningBets = db.prepare('SELECT * FROM bets WHERE gameId = ?').all(gameId).map(b => ({ ...b, numbers: JSON.parse(b.numbers) }));
        const allUsers = Object.fromEntries(getAllFromTable('users').map(u => [u.id, u]));
        const allDealers = Object.fromEntries(getAllFromTable('dealers').map(d => [d.id, d]));
        const admin = findAccountById('Guru', 'admins');
        const getMultiplier = (r, t) => t === "1 Digit Open" ? r.oneDigitOpen : t === "1 Digit Close" ? r.oneDigitClose : r.twoDigit;
        winningBets.forEach(bet => {
            const wins = bet.numbers.filter(n => n === game.winningNumber);
            if (wins.length > 0) {
                const user = allUsers[bet.userId], dealer = allDealers[bet.dealerId];
                if (!user || !dealer) return;
                const userPrize = Math.round(wins.length * bet.amountPerNumber * getMultiplier(user.prizeRates, bet.subGameType) * 100) / 100;
                const dProfit = Math.round(wins.length * bet.amountPerNumber * (getMultiplier(dealer.prizeRates, bet.subGameType) - getMultiplier(user.prizeRates, bet.subGameType)) * 100) / 100;
                addLedgerEntry(user.id, 'USER', `Prize money: ${game.name}`, 0, userPrize);
                addLedgerEntry(admin.id, 'ADMIN', `Prize payout: ${user.name}`, userPrize, 0);
                addLedgerEntry(dealer.id, 'DEALER', `Profit: ${game.name}`, 0, dProfit);
                addLedgerEntry(admin.id, 'ADMIN', `Dealer profit: ${dealer.name}`, dProfit, 0);
            }
        });
        db.prepare('UPDATE games SET payoutsApproved = 1 WHERE id = ?').run(gameId);
        updatedGame = findAccountById(gameId, 'games');
    });
    return updatedGame;
};

const getFinancialSummary = () => {
    const games = db.prepare('SELECT * FROM games WHERE winningNumber IS NOT NULL').all();
    const allBets = db.prepare('SELECT * FROM bets').all().map(b => ({...b, numbers: JSON.parse(b.numbers)}));
    const allUsers = Object.fromEntries(getAllFromTable('users').map(u => [u.id, u])), allDealers = Object.fromEntries(getAllFromTable('dealers').map(d => [d.id, d]));
    const getMultiplier = (r, t) => t === "1 Digit Open" ? r.oneDigitOpen : t === "1 Digit Close" ? r.oneDigitClose : r.twoDigit;
    const summary = games.map(game => {
        const gameBets = allBets.filter(b => b.gameId === game.id);
        const totalStake = gameBets.reduce((s, b) => s + b.totalAmount, 0);
        let payouts = 0, dProfit = 0;
        gameBets.forEach(bet => {
            const wins = bet.numbers.filter(n => n === game.winningNumber);
            if (wins.length > 0) {
                const u = allUsers[bet.userId], d = allDealers[bet.dealerId];
                if (u && d) {
                    payouts += wins.length * bet.amountPerNumber * getMultiplier(u.prizeRates, bet.subGameType);
                    dProfit += wins.length * bet.amountPerNumber * (getMultiplier(d.prizeRates, bet.subGameType) - getMultiplier(u.prizeRates, bet.subGameType));
                }
            }
        });
        const comms = gameBets.reduce((s, b) => {
            const u = allUsers[b.userId], d = allDealers[b.dealerId];
            return u && d ? s + (b.totalAmount * (u.commissionRate / 100)) + (b.totalAmount * ((d.commissionRate - u.commissionRate) / 100)) : s;
        }, 0);
        return { gameName: game.name, winningNumber: game.winningNumber, totalStake, totalPayouts: payouts, totalDealerProfit: dProfit, totalCommissions: comms, netProfit: totalStake - payouts - dProfit - comms };
    });
    const totals = summary.reduce((t, g) => { t.totalStake += g.totalStake; t.totalPayouts += g.totalPayouts; t.totalDealerProfit += g.totalDealerProfit; t.totalCommissions += g.totalCommissions; t.netProfit += g.netProfit; return t; }, { totalStake: 0, totalPayouts: 0, totalDealerProfit: 0, totalCommissions: 0, netProfit: 0 });
    return { games: summary.sort((a,b) => a.gameName.localeCompare(b.gameName)), totals, totalBets: allBets.length };
};

const createDealer = (d) => {
    if (db.prepare('SELECT id FROM dealers WHERE LOWER(id) = ?').get(d.id.toLowerCase())) throw { status: 400, message: "Taken." };
    db.prepare('INSERT INTO dealers (id, name, password, area, contact, wallet, commissionRate, isRestricted, prizeRates, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(d.id, d.name, d.password, d.area, d.contact, d.wallet || 0, d.commissionRate, 0, JSON.stringify(d.prizeRates), d.avatarUrl);
    if (d.wallet > 0) addLedgerEntry(d.id, 'DEALER', 'Initial Deposit', 0, d.wallet);
    return findAccountById(d.id, 'dealers');
};

const updateDealer = (d, originalId) => {
    if (d.id.toLowerCase() !== originalId.toLowerCase() && db.prepare('SELECT id FROM dealers WHERE LOWER(id) = ?').get(d.id.toLowerCase())) throw { status: 400, message: "Taken." };
    db.prepare('UPDATE dealers SET id = ?, name = ?, password = ?, area = ?, contact = ?, commissionRate = ?, prizeRates = ?, avatarUrl = ? WHERE LOWER(id) = LOWER(?)').run(d.id, d.name, d.password, d.area, d.contact, Number(d.commissionRate), JSON.stringify(d.prizeRates), d.avatarUrl, originalId);
    return findAccountById(d.id, 'dealers');
};

const updateAdmin = (a, adminId) => {
    db.prepare('UPDATE admins SET name = ?, prizeRates = ?, avatarUrl = ? WHERE LOWER(id) = LOWER(?)').run(a.name, JSON.stringify(a.prizeRates), a.avatarUrl, adminId);
    return findAccountById(adminId, 'admins');
};

const findUsersByDealerId = (id) => db.prepare('SELECT id FROM users WHERE LOWER(dealerId) = LOWER(?)').all(id).map(u => findAccountById(u.id, 'users'));
const findBetsByDealerId = (id) => db.prepare('SELECT * FROM bets WHERE LOWER(dealerId) = LOWER(?) ORDER BY timestamp DESC').all(id).map(b => ({ ...b, numbers: JSON.parse(b.numbers) }));
const findBetsByUserId = (id) => db.prepare('SELECT * FROM bets WHERE LOWER(userId) = LOWER(?) ORDER BY timestamp DESC').all(id).map(b => ({ ...b, numbers: JSON.parse(b.numbers) }));

const findUserByDealer = (uId, dId) => { 
    const stmt = db.prepare('SELECT * FROM users WHERE LOWER(id) = LOWER(?) AND LOWER(dealerId) = LOWER(?)');
    const userRow = stmt.get(uId, dId);
    if (!userRow) return null;
    return findAccountById(userRow.id, 'users'); 
};

const createUser = (u, dId, dep = 0) => {
    if (db.prepare('SELECT id FROM users WHERE LOWER(id) = ?').get(u.id.toLowerCase())) throw { status: 400, message: "Taken." };
    db.prepare('INSERT INTO users (id, name, password, dealerId, area, contact, wallet, commissionRate, isRestricted, prizeRates, betLimits, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(u.id, u.name, u.password, dId, u.area, u.contact, 0, u.commissionRate, 0, JSON.stringify(u.prizeRates), JSON.stringify(u.betLimits), u.avatarUrl);
    if (dep > 0) { addLedgerEntry(dId, 'DEALER', `User Initial: ${u.name}`, dep, 0); addLedgerEntry(u.id, 'USER', `Initial from Dealer`, 0, dep); }
    return findAccountById(u.id, 'users');
};

const updateUser = (u, uId, dId) => {
    db.prepare('UPDATE users SET id = ?, name = ?, password = ?, area = ?, contact = ?, commissionRate = ?, prizeRates = ?, betLimits = ?, avatarUrl = ? WHERE LOWER(id) = LOWER(?)').run(u.id, u.name, u.password, u.area, u.contact, Number(u.commissionRate), JSON.stringify(u.prizeRates), JSON.stringify(u.betLimits), u.avatarUrl, uId);
    return findAccountById(u.id, 'users');
};

const deleteUserByDealer = (uId, dId) => {
    runInTransaction(() => {
        db.prepare('DELETE FROM ledgers WHERE LOWER(accountId) = LOWER(?) AND accountType = ?').run(uId, 'USER');
        db.prepare('DELETE FROM bets WHERE LOWER(userId) = LOWER(?)').run(uId);
        db.prepare('DELETE FROM users WHERE LOWER(id) = LOWER(?)').run(uId);
    });
    return true;
};

const toggleAccountRestrictionByAdmin = (id, type) => {
    let result;
    runInTransaction(() => {
        const table = type.toLowerCase() + 's';
        const acc = db.prepare(`SELECT isRestricted FROM ${table} WHERE LOWER(id) = LOWER(?)`).get(id);
        const status = acc.isRestricted ? 0 : 1;
        db.prepare(`UPDATE ${table} SET isRestricted = ? WHERE LOWER(id) = LOWER(?)`).run(status, id);
        result = findAccountById(id, table);
    });
    return result;
};

const placeBulkBets = (uId, gId, groups, placedBy = 'USER') => {
    let result = null;
    runInTransaction(() => {
        const user = findAccountById(uId, 'users');
        if (!user || user.isRestricted) throw { status: 403, message: 'Restricted or not found.' };
        const dealer = findAccountById(user.dealerId, 'dealers');
        const game = findAccountById(gId, 'games');
        if (!game || !game.isMarketOpen) throw { status: 400, message: "Market is currently closed." };
        const admin = findAccountById('Guru', 'admins');
        const requestTotal = groups.reduce((s, g) => s + g.numbers.length * g.amountPerNumber, 0);
        if (user.wallet < requestTotal) throw { status: 400, message: `Insufficient funds.` };
        addLedgerEntry(user.id, 'USER', `Bet on ${game.name}`, requestTotal, 0);
        addLedgerEntry(admin.id, 'ADMIN', `Stake: ${user.name}`, 0, requestTotal);
        const created = [];
        groups.forEach(g => {
            const b = { id: uuidv4(), userId: uId, dealerId: dealer.id, gameId: game.id, subGameType: g.subGameType, numbers: JSON.stringify(g.numbers), amountPerNumber: g.amountPerNumber, totalAmount: g.numbers.length * g.amountPerNumber, timestamp: new Date().toISOString() };
            db.prepare('INSERT INTO bets (id, userId, dealerId, gameId, subGameType, numbers, amountPerNumber, totalAmount, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(b.id, b.userId, b.dealerId, b.gameId, b.subGameType, b.numbers, b.amountPerNumber, b.totalAmount, b.timestamp);
            created.push({ ...b, numbers: g.numbers });
        });
        result = created;
    });
    return result;
};

function resetAllGames() {
    runInTransaction(() => {
        db.prepare('UPDATE games SET winningNumber = NULL, payoutsApproved = 0').run();
        db.prepare('DELETE FROM bets').run(); 
    });
    console.error('--- [DATABASE] Daily Reset Completed Successfully ---');
}

module.exports = { connect, verifySchema, findAccountById, findAccountForLogin, updatePassword, getAllFromTable, runInTransaction, addLedgerEntry, createDealer, updateDealer, updateAdmin, findUsersByDealerId, findUserByDealer, findBetsByUserId, createUser, updateUser, deleteUserByDealer, toggleAccountRestrictionByAdmin, declareWinnerForGame, updateWinningNumber, approvePayoutsForGame, getFinancialSummary, placeBulkBets, resetAllGames, createSafeBackup, pruneOldBackups, findBetsByDealerId };
