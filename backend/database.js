
const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'database.sqlite');
let db;

// --- CENTRALIZED GAME TIMING LOGIC (PKT TIMEZONE) ---
const PKT_OFFSET_HOURS = 5;
const OPEN_HOUR_PKT = 16; // 4:00 PM in Pakistan

function getGameCycle(drawTime) {
    const now = new Date(); // UTC
    const [drawHoursPKT, drawMinutesPKT] = drawTime.split(':').map(Number);

    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate();
    
    const openHourUTC = OPEN_HOUR_PKT - PKT_OFFSET_HOURS; // 11:00 AM UTC

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
        if (!stmt.get()) {
            console.error('Database schema missing. Run setup-database.js.');
            process.exit(1);
        }
    } catch (error) {
        process.exit(1);
    }
};

const findAccountById = (id, table) => {
    // CRITICAL FIX: Case-insensitive ID lookup for session restoration stability
    const stmt = db.prepare(`SELECT * FROM ${table} WHERE LOWER(id) = LOWER(?)`);
    const account = stmt.get(id);
    if (!account) return null;
    try {
        if (table !== 'games') {
            account.ledger = db.prepare('SELECT * FROM ledgers WHERE LOWER(accountId) = LOWER(?) ORDER BY timestamp ASC').all(id);
        } else {
            account.isMarketOpen = isGameOpen(account.drawTime);
        }
        if (account.prizeRates) account.prizeRates = JSON.parse(account.prizeRates);
        if (account.betLimits) account.betLimits = JSON.parse(account.betLimits);
        if ('isRestricted' in account) account.isRestricted = !!account.isRestricted;
    } catch (e) {}
    return account;
};

const findAccountForLogin = (loginId) => {
    const lowerCaseLoginId = loginId.toLowerCase();
    const tables = [{ name: 'users', role: 'USER' }, { name: 'dealers', role: 'DEALER' }, { name: 'admins', role: 'ADMIN' }];
    for (const tableInfo of tables) {
        const stmt = db.prepare(`SELECT * FROM ${tableInfo.name} WHERE LOWER(id) = ?`);
        const account = stmt.get(lowerCaseLoginId);
        if (account) return { account, role: tableInfo.role };
    }
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

const getAllFromTable = (table, withLedger = false) => {
    return db.prepare(`SELECT * FROM ${table}`).all().map(acc => {
        try {
            if (withLedger && acc.id) acc.ledger = db.prepare('SELECT * FROM ledgers WHERE LOWER(accountId) = LOWER(?) ORDER BY timestamp ASC').all(acc.id);
            if (table === 'games' && acc.drawTime) acc.isMarketOpen = isGameOpen(acc.drawTime);
            if (acc.prizeRates) acc.prizeRates = JSON.parse(acc.prizeRates);
            if (acc.betLimits) acc.betLimits = JSON.parse(acc.betLimits);
            if (table === 'bets' && acc.numbers) acc.numbers = JSON.parse(acc.numbers);
            if ('isRestricted' in acc) acc.isRestricted = !!acc.isRestricted;
        } catch (e) {}
        return acc;
    });
};

const runInTransaction = (fn) => db.transaction(fn)();

const addLedgerEntry = (accountId, accountType, description, debit, credit) => {
    const table = accountType.toLowerCase() + 's';
    const lastEntry = db.prepare('SELECT balance FROM ledgers WHERE LOWER(accountId) = LOWER(?) ORDER BY timestamp DESC, ROWID DESC LIMIT 1').get(accountId);
    const lastBalance = lastEntry ? lastEntry.balance : 0;
    if (debit > 0 && accountType !== 'ADMIN' && lastBalance < debit) {
        throw { status: 400, message: `Insufficient funds.` };
    }
    const newBalance = lastBalance - debit + credit;
    db.prepare('INSERT INTO ledgers (id, accountId, accountType, timestamp, description, debit, credit, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(uuidv4(), accountId, accountType, new Date().toISOString(), description, debit, credit, newBalance);
    db.prepare(`UPDATE ${table} SET wallet = ? WHERE LOWER(id) = LOWER(?)`).run(newBalance, accountId);
};

const declareWinnerForGame = (gameId, winningNumber) => {
    let finalGame;
    runInTransaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
        if (!game || game.winningNumber) throw { status: 400, message: 'Game not found or winner already declared.' };
        if (game.name === 'AK') {
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(`${winningNumber}_`, gameId);
        } else if (game.name === 'AKC') {
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(winningNumber, gameId);
            const akGame = db.prepare("SELECT * FROM games WHERE name = 'AK'").get();
            if (akGame && akGame.winningNumber && akGame.winningNumber.endsWith('_')) {
                db.prepare("UPDATE games SET winningNumber = ? WHERE name = 'AK'").run(akGame.winningNumber.slice(0, 1) + winningNumber);
            }
        } else {
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(winningNumber, gameId);
        }
        finalGame = findAccountById(gameId, 'games');
    });
    return finalGame;
};

const updateWinningNumber = (gameId, newWinningNumber) => {
    let updatedGame;
    runInTransaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
        if (!game || !game.winningNumber || game.payoutsApproved) throw { status: 400, message: 'Cannot update.' };
        if (game.name === 'AK') {
            const closeDigit = game.winningNumber.endsWith('_') ? '_' : game.winningNumber.slice(1, 2);
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(newWinningNumber + closeDigit, gameId);
        } else if (game.name === 'AKC') {
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(newWinningNumber, gameId);
            const akGame = db.prepare("SELECT * FROM games WHERE name = 'AK'").get();
            if (akGame && akGame.winningNumber && !akGame.winningNumber.endsWith('_')) {
                db.prepare("UPDATE games SET winningNumber = ? WHERE name = 'AK'").run(akGame.winningNumber.slice(0, 1) + newWinningNumber);
            }
        } else {
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(newWinningNumber, gameId);
        }
        updatedGame = findAccountById(gameId, 'games');
    });
    return updatedGame;
};

const approvePayoutsForGame = (gameId) => {
    let updatedGame;
    runInTransaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
        if (!game || !game.winningNumber || game.payoutsApproved || (game.name === 'AK' && game.winningNumber.endsWith('_'))) throw { status: 400, message: "Invalid approval." };
        const winningBets = db.prepare('SELECT * FROM bets WHERE gameId = ?').all(gameId).map(b => ({ ...b, numbers: JSON.parse(b.numbers) }));
        const allUsers = Object.fromEntries(getAllFromTable('users').map(u => [u.id, u]));
        const allDealers = Object.fromEntries(getAllFromTable('dealers').map(d => [d.id, d]));
        const admin = findAccountById('Guru', 'admins');
        const getMultiplier = (r, t) => t === "1 Digit Open" ? r.oneDigitOpen : t === "1 Digit Close" ? r.oneDigitClose : r.twoDigit;
        winningBets.forEach(bet => {
            const wins = bet.numbers.filter(n => {
                if (bet.subGameType === "1 Digit Open") return game.winningNumber.length === 2 && n === game.winningNumber[0];
                if (bet.subGameType === "1 Digit Close") return game.name === 'AKC' ? n === game.winningNumber : (game.winningNumber.length === 2 && n === game.winningNumber[1]);
                return n === game.winningNumber;
            });
            if (wins.length > 0) {
                const user = allUsers[bet.userId], dealer = allDealers[bet.dealerId];
                if (!user || !dealer) return;
                const userPrize = wins.length * bet.amountPerNumber * getMultiplier(user.prizeRates, bet.subGameType);
                const dProfit = wins.length * bet.amountPerNumber * (getMultiplier(dealer.prizeRates, bet.subGameType) - getMultiplier(user.prizeRates, bet.subGameType));
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
        if (!game.winningNumber.endsWith('_')) {
            gameBets.forEach(bet => {
                const wins = bet.numbers.filter(n => {
                    if (bet.subGameType === "1 Digit Open") return game.winningNumber.length === 2 && n === game.winningNumber[0];
                    if (bet.subGameType === "1 Digit Close") return game.name === 'AKC' ? n === game.winningNumber : (game.winningNumber.length === 2 && n === game.winningNumber[1]);
                    return n === game.winningNumber;
                });
                if (wins.length > 0) {
                    const u = allUsers[bet.userId], d = allDealers[bet.dealerId];
                    if (u && d) {
                        payouts += wins.length * bet.amountPerNumber * getMultiplier(u.prizeRates, bet.subGameType);
                        dProfit += wins.length * bet.amountPerNumber * (getMultiplier(d.prizeRates, bet.subGameType) - getMultiplier(u.prizeRates, bet.subGameType));
                    }
                }
            });
        }
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
    db.prepare('UPDATE dealers SET id = ?, name = ?, password = ?, area = ?, contact = ?, commissionRate = ?, prizeRates = ?, avatarUrl = ? WHERE LOWER(id) = LOWER(?)').run(d.id, d.name, d.password, d.area, d.contact, d.commissionRate, JSON.stringify(d.prizeRates), d.avatarUrl, originalId);
    if (d.id !== originalId) {
        db.prepare('UPDATE users SET dealerId = ? WHERE LOWER(dealerId) = LOWER(?)').run(d.id, originalId);
        db.prepare('UPDATE bets SET dealerId = ? WHERE LOWER(dealerId) = LOWER(?)').run(d.id, originalId);
        db.prepare('UPDATE ledgers SET accountId = ? WHERE LOWER(accountId) = LOWER(?) AND accountType = ?').run(d.id, originalId, 'DEALER');
    }
    return findAccountById(d.id, 'dealers');
};

const findUsersByDealerId = (id) => db.prepare('SELECT id FROM users WHERE LOWER(dealerId) = LOWER(?)').all(id).map(u => findAccountById(u.id, 'users'));
const findBetsByDealerId = (id) => db.prepare('SELECT * FROM bets WHERE LOWER(dealerId) = LOWER(?) ORDER BY timestamp DESC').all(id).map(b => ({ ...b, numbers: JSON.parse(b.numbers) }));
const findBetsByUserId = (id) => db.prepare('SELECT * FROM bets WHERE LOWER(userId) = LOWER(?) ORDER BY timestamp DESC').all(id).map(b => ({ ...b, numbers: JSON.parse(b.numbers) }));
const findBetsByGameId = (id) => db.prepare('SELECT * FROM bets WHERE gameId = ?').all(id).map(b => ({ ...b, numbers: JSON.parse(b.numbers) }));
const findUserByDealer = (u, d) => { const user = db.prepare('SELECT * FROM users WHERE LOWER(id) = LOWER(?) AND LOWER(dealerId) = LOWER(?)').get(u, d); return user ? findAccountById(u.id, 'users') : null; };

const createUser = (u, dId, dep = 0) => {
    if (db.prepare('SELECT id FROM users WHERE LOWER(id) = ?').get(u.id.toLowerCase())) throw { status: 400, message: "Taken." };
    const dealer = findAccountById(dId, 'dealers');
    if (!dealer || dealer.wallet < dep) throw { status: 400, message: 'Insufficient.' };
    db.prepare('INSERT INTO users (id, name, password, dealerId, area, contact, wallet, commissionRate, isRestricted, prizeRates, betLimits, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(u.id, u.name, u.password, dId, u.area, u.contact, 0, u.commissionRate, 0, JSON.stringify(u.prizeRates), JSON.stringify(u.betLimits), u.avatarUrl);
    if (dep > 0) { addLedgerEntry(dId, 'DEALER', `User Initial: ${u.name}`, dep, 0); addLedgerEntry(u.id, 'USER', `Initial from Dealer`, 0, dep); }
    return findAccountById(u.id, 'users');
};

const updateUser = (u, uId, dId) => {
    const existing = findUserByDealer(uId, dId);
    if (!existing) throw { status: 404, message: "Not found." };
    
    // Support potential ID change for user if requested, although currently uId is original
    db.prepare('UPDATE users SET id = ?, name = ?, password = ?, area = ?, contact = ?, commissionRate = ?, prizeRates = ?, betLimits = ?, avatarUrl = ? WHERE LOWER(id) = LOWER(?)').run(u.id, u.name, u.password || existing.password, u.area, u.contact, u.commissionRate, JSON.stringify(u.prizeRates), JSON.stringify(u.betLimits), u.avatarUrl, uId);
    
    if (u.id !== uId) {
        db.prepare('UPDATE bets SET userId = ? WHERE LOWER(userId) = LOWER(?)').run(u.id, uId);
        db.prepare('UPDATE ledgers SET accountId = ? WHERE LOWER(accountId) = LOWER(?) AND accountType = ?').run(u.id, uId, 'USER');
    }
    
    return findAccountById(u.id, 'users');
};

const deleteUserByDealer = (uId, dId) => {
    const user = findUserByDealer(uId, dId);
    if (!user) throw { status: 404, message: "User not found." };
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
        if (!acc) throw { status: 404, message: 'Not found.' };
        const status = acc.isRestricted ? 0 : 1;
        db.prepare(`UPDATE ${table} SET isRestricted = ? WHERE LOWER(id) = LOWER(?)`).run(status, id);
        if (type.toLowerCase() === 'dealer') db.prepare(`UPDATE users SET isRestricted = ? WHERE LOWER(dealerId) = LOWER(?)`).run(status, id);
        result = findAccountById(id, table);
    });
    return result;
};

const toggleUserRestrictionByDealer = (uId, dId) => {
    const user = db.prepare('SELECT isRestricted FROM users WHERE LOWER(id) = LOWER(?) AND LOWER(dealerId) = LOWER(?)').get(uId, dId);
    if (!user) throw { status: 404, message: 'Not found.' };
    db.prepare('UPDATE users SET isRestricted = ? WHERE LOWER(id) = LOWER(?)').run(user.isRestricted ? 0 : 1, uId);
    return findAccountById(uId, 'users');
};

const createBet = (b) => db.prepare('INSERT INTO bets (id, userId, dealerId, gameId, subGameType, numbers, amountPerNumber, totalAmount, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(b.id, b.userId, b.dealerId, b.gameId, b.subGameType, b.numbers, b.amountPerNumber, b.totalAmount, b.timestamp);

const getNumberStakeSummary = ({ gameId, dealerId, date }) => {
    let query = 'SELECT gameId, subGameType, numbers, amountPerNumber, totalAmount FROM bets';
    const params = [], cond = [];
    if (gameId) { cond.push('gameId = ?'); params.push(gameId); }
    if (dealerId) { cond.push('LOWER(dealerId) = LOWER(?)'); params.push(dealerId); }
    if (date) { cond.push('date(timestamp) = ?'); params.push(date); }
    if (cond.length > 0) query += ' WHERE ' + cond.join(' AND ');
    const bets = db.prepare(query).all(...params);
    const summary = { '2-digit': new Map(), '1-open': new Map(), '1-close': new Map(), 'game-breakdown': new Map() };
    bets.forEach(b => {
        summary['game-breakdown'].set(b.gameId, (summary['game-breakdown'].get(b.gameId) || 0) + b.totalAmount);
        try {
            const nums = JSON.parse(b.numbers), amt = b.amountPerNumber;
            let target;
            if (b.subGameType === '1 Digit Open') target = summary['1-open'];
            else if (b.subGameType === '1 Digit Close') target = summary['1-close'];
            else target = summary['2-digit'];
            nums.forEach(n => target.set(n, (target.get(n) || 0) + amt));
        } catch (e) {}
    });
    const sort = (m) => Array.from(m.entries()).map(([number, stake]) => ({ number, stake })).sort((a, b) => b.stake - a.stake);
    return { twoDigit: sort(summary['2-digit']), oneDigitOpen: sort(summary['1-open']), oneDigitClose: sort(summary['1-close']), gameBreakdown: Array.from(summary['game-breakdown'].entries()).map(([gameId, stake]) => ({ gameId, stake })) };
};

const placeBulkBets = (uId, gId, groups, placedBy = 'USER') => {
    let result = null;
    runInTransaction(() => {
        const user = findAccountById(uId, 'users');
        if (!user || user.isRestricted) throw { status: 403, message: 'Restricted or not found.' };
        const dealer = findAccountById(user.dealerId, 'dealers'), game = findAccountById(gId, 'games'), admin = findAccountById('Guru', 'admins');
        let akc = null, mainG = groups, akcG = [];
        if (game.name === 'AK') {
            akc = db.prepare("SELECT * FROM games WHERE name = 'AK'").get(); // Fixed query for AKC consistency
            akc = findAccountById(akc.id, 'games');
            akcG = groups.filter(g => g.subGameType === '1 Digit Close');
            mainG = groups.filter(g => g.subGameType !== '1 Digit Close');
        }
        if ((mainG.length > 0 && !game.isMarketOpen) || (akcG.length > 0 && (!akc || !akc.isMarketOpen))) throw { status: 400, message: `Closed.` };
        const cost = groups.reduce((s, g) => s + g.numbers.length * g.amountPerNumber, 0);
        if (user.wallet < cost) throw { status: 400, message: `Insufficient.` };
        const userComm = cost * (user.commissionRate / 100), dComm = cost * ((dealer.commissionRate - user.commissionRate) / 100);
        addLedgerEntry(user.id, 'USER', `Bet placed on ${game.name}`, cost, 0);
        if (userComm > 0) addLedgerEntry(user.id, 'USER', `Comm earned`, 0, userComm);
        addLedgerEntry(admin.id, 'ADMIN', `Stake: ${user.name}`, 0, cost);
        if (userComm > 0) addLedgerEntry(admin.id, 'ADMIN', `Comm to user`, userComm, 0);
        if (dComm > 0) { addLedgerEntry(admin.id, 'ADMIN', `Comm to dealer`, dComm, 0); addLedgerEntry(dealer.id, 'DEALER', `Comm from ${user.name}`, 0, dComm); }
        const created = [];
        const save = (id, grps) => grps.forEach(g => {
            const b = { id: uuidv4(), userId: uId, dealerId: dealer.id, gameId: id, subGameType: g.subGameType, numbers: JSON.stringify(g.numbers), amountPerNumber: g.amountPerNumber, totalAmount: g.numbers.length * g.amountPerNumber, timestamp: new Date().toISOString() };
            createBet(b); created.push({ ...b, numbers: g.numbers });
        });
        save(game.id, mainG);
        if (akc) save(akc.id, akcG);
        result = created;
    });
    return result;
};

const updateGameDrawTime = (id, time) => {
    db.prepare('UPDATE games SET drawTime = ? WHERE id = ?').run(time, id);
    return findAccountById(id, 'games');
};

function getAllNumberLimits() {
    return db.prepare('SELECT * FROM number_limits').all();
}

function saveNumberLimit(limit) {
    const stmt = db.prepare('INSERT OR REPLACE INTO number_limits (gameType, numberValue, limitAmount) VALUES (?, ?, ?)');
    stmt.run(limit.gameType, limit.numberValue, limit.limitAmount);
    return db.prepare('SELECT * FROM number_limits WHERE gameType = ? AND numberValue = ?').get(limit.gameType, limit.numberValue);
}

function deleteNumberLimit(id) {
    db.prepare('DELETE FROM number_limits WHERE id = ?').run(id);
}

function resetAllGames() {
    runInTransaction(() => {
        db.prepare('UPDATE games SET winningNumber = NULL, payoutsApproved = 0').run();
        db.prepare('DELETE FROM bets').run(); 
    });
    console.error('--- [DATABASE] 4:00 PM PKT Boundary Reached. Market Restarted. ---');
}

module.exports = {
    connect, verifySchema, findAccountById, findAccountForLogin, updatePassword, getAllFromTable, runInTransaction, addLedgerEntry, createDealer, updateDealer, findUsersByDealerId, findUserByDealer, findBetsByUserId, createUser, updateUser, deleteUserByDealer, toggleAccountRestrictionByAdmin, toggleUserRestrictionByDealer, declareWinnerForGame, updateWinningNumber, approvePayoutsForGame, getFinancialSummary, getNumberStakeSummary, placeBulkBets, updateGameDrawTime, resetAllGames, getAllNumberLimits, saveNumberLimit, deleteNumberLimit, findBetsByDealerId, findBetsByGameId
};
