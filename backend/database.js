
const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

// PERFORMANCE FIX: Use absolute path resolution to prevent PM2 from creating empty DB files in wrong directories
const DB_PATH = path.resolve(__dirname, 'database.sqlite');
let db;

// --- CENTRALIZED GAME TIMING LOGIC (PKT TIMEZONE) ---
function isGameOpen(drawTime) {
    try {
        if (!drawTime || !drawTime.includes(':')) return false;
        
        const now = new Date();
        // Pakistan is UTC+5. Convert current UTC to PKT bias for hour/date extraction.
        const pktBias = new Date(now.getTime() + (5 * 60 * 60 * 1000));
        
        const [drawH, drawM] = drawTime.split(':').map(Number);
        const pktH = pktBias.getUTCHours();

        // 1. Find the START of the current betting cycle (the most recent 4:00 PM PKT)
        const currentCycleStart = new Date(pktBias);
        currentCycleStart.setUTCHours(16, 0, 0, 0);
        
        // If we are currently in the morning (before 4 PM), the cycle actually started yesterday at 4 PM
        if (pktH < 16) {
            currentCycleStart.setUTCDate(currentCycleStart.getUTCDate() - 1);
        }

        // 2. Find the END of this cycle (the Draw Time)
        const currentCycleEnd = new Date(currentCycleStart);
        currentCycleEnd.setUTCHours(drawH, drawM, 0, 0);
        
        // If the draw hour is early morning (00:00 to 15:59), it happens on the 
        // calendar day AFTER the 4:00 PM opening.
        if (drawH < 16) {
            currentCycleEnd.setUTCDate(currentCycleEnd.getUTCDate() + 1);
        }

        // Market is open if we are past 4:00 PM (Start) and before the specific Game Draw (End)
        const isOpen = pktBias >= currentCycleStart && pktBias < currentCycleEnd;
        return isOpen;
    } catch (e) {
        return false;
    }
}

const connect = () => {
    try {
        // PERFORMANCE FIX: Added busy_timeout (10s) to handle concurrent writes from many users
        db = new Database(DB_PATH, { timeout: 10000 });
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL'); // Faster disk writes for VPS
        db.pragma('foreign_keys = ON');
        console.error(`--- Database Connected at: ${DB_PATH} ---`);
    } catch (error) {
        console.error('CRITICAL: Database connection failed:', error);
        process.exit(1);
    }
};

const verifySchema = () => {
    try {
        const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admins'");
        if (!stmt.get()) {
            console.error('--- WARNING: Database schema missing! ---');
        }
    } catch (error) {
        console.error('Schema verification error:', error);
    }
};

const findAccountById = (id, table, ledgerLimit = 15) => {
    try {
        const stmt = db.prepare(`SELECT * FROM ${table} WHERE LOWER(id) = LOWER(?)`);
        const account = stmt.get(id);
        if (!account) return null;
        
        if (table !== 'games') {
            account.ledger = db.prepare('SELECT * FROM ledgers WHERE LOWER(accountId) = LOWER(?) ORDER BY timestamp DESC LIMIT ?')
                .all(id, ledgerLimit)
                .reverse();
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
    } catch (e) {
        console.error(`DB Error findAccountById (${table}):`, e.message);
        return null;
    }
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
    } catch (e) {
        console.error("Login lookup error:", e.message);
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

const getAllFromTable = (table, withLedger = false, ledgerLimit = 5) => {
    try {
        const rows = db.prepare(`SELECT * FROM ${table}`).all();
        if (rows.length === 0) console.error(`--- Empty data returned for table: ${table} ---`);
        
        return rows.map(acc => {
            try {
                if (table === 'users' || table === 'dealers' || table === 'admins') {
                    acc.commissionRate = Number(acc.commissionRate) || 0;
                    if (withLedger && acc.id) {
                        acc.ledger = db.prepare('SELECT * FROM ledgers WHERE LOWER(accountId) = LOWER(?) ORDER BY timestamp DESC LIMIT ?')
                            .all(acc.id, ledgerLimit)
                            .reverse();
                    }
                    if (acc.prizeRates && typeof acc.prizeRates === 'string') acc.prizeRates = JSON.parse(acc.prizeRates);
                    if (acc.betLimits && typeof acc.betLimits === 'string') acc.betLimits = JSON.parse(acc.betLimits);
                }
                
                if (table === 'games' && acc.drawTime) {
                    acc.isMarketOpen = isGameOpen(acc.drawTime);
                }
                if (table === 'bets' && acc.numbers) acc.numbers = JSON.parse(acc.numbers);
                if ('isRestricted' in acc) acc.isRestricted = !!acc.isRestricted;
            } catch (e) {}
            return acc;
        });
    } catch (e) {
        console.error(`Database fetch error for table ${table}:`, e.message);
        return [];
    }
};

const runInTransaction = (fn) => db.transaction(fn)();

const addLedgerEntry = (accountId, accountType, description, debit, credit) => {
    const table = accountType.toLowerCase() + 's';
    const account = db.prepare(`SELECT wallet FROM ${table} WHERE LOWER(id) = LOWER(?)`).get(accountId);
    const lastBalance = account ? account.wallet : 0;
    
    if (debit > 0 && accountType !== 'ADMIN' && lastBalance < debit) {
        throw { status: 400, message: `Insufficient funds.` };
    }
    
    const newBalance = Math.round((lastBalance - debit + credit) * 100) / 100;
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
    db.prepare('UPDATE dealers SET id = ?, name = ?, password = ?, area = ?, contact = ?, commissionRate = ?, prizeRates = ?, avatarUrl = ? WHERE LOWER(id) = LOWER(?)').run(d.id, d.name, d.password, d.area, d.contact, Number(d.commissionRate), JSON.stringify(d.prizeRates), d.avatarUrl, originalId);
    if (d.id !== originalId) {
        db.prepare('UPDATE users SET dealerId = ? WHERE LOWER(dealerId) = LOWER(?)').run(d.id, originalId);
        db.prepare('UPDATE bets SET dealerId = ? WHERE LOWER(dealerId) = LOWER(?)').run(d.id, originalId);
        db.prepare('UPDATE ledgers SET accountId = ? WHERE LOWER(accountId) = LOWER(?) AND accountType = ?').run(d.id, originalId, 'DEALER');
    }
    return findAccountById(d.id, 'dealers');
};

const updateAdmin = (a, adminId) => {
    db.prepare('UPDATE admins SET name = ?, prizeRates = ?, avatarUrl = ? WHERE LOWER(id) = LOWER(?)').run(a.name, JSON.stringify(a.prizeRates), a.avatarUrl, adminId);
    return findAccountById(adminId, 'admins');
};

const findUsersByDealerId = (id) => db.prepare('SELECT id FROM users WHERE LOWER(dealerId) = LOWER(?)').all(id).map(u => findAccountById(u.id, 'users'));
const findBetsByDealerId = (id) => db.prepare('SELECT * FROM bets WHERE LOWER(dealerId) = LOWER(?) ORDER BY timestamp DESC').all(id).map(b => ({ ...b, numbers: JSON.parse(b.numbers) }));
const findBetsByUserId = (id) => db.prepare('SELECT * FROM bets WHERE LOWER(userId) = LOWER(?) ORDER BY timestamp DESC').all(id).map(b => ({ ...b, numbers: JSON.parse(b.numbers) }));
const findBetsByGameId = (id) => db.prepare('SELECT * FROM bets WHERE gameId = ?').all(id).map(b => ({ ...b, numbers: JSON.parse(b.numbers) }));

const findUserByDealer = (uId, dId) => { 
    const stmt = db.prepare('SELECT * FROM users WHERE LOWER(id) = LOWER(?) AND LOWER(dealerId) = LOWER(?)');
    const userRow = stmt.get(uId, dId);
    if (!userRow) return null;
    return findAccountById(userRow.id, 'users'); 
};

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
    runInTransaction(() => {
        db.prepare('UPDATE users SET id = ?, name = ?, password = ?, area = ?, contact = ?, commissionRate = ?, prizeRates = ?, betLimits = ?, avatarUrl = ? WHERE LOWER(id) = LOWER(?)').run(u.id, u.name, u.password || existing.password, u.area, u.contact, Number(u.commissionRate), JSON.stringify(u.prizeRates), JSON.stringify(u.betLimits), u.avatarUrl, uId);
        if (u.id.toLowerCase() !== uId.toLowerCase()) {
            db.prepare('UPDATE bets SET userId = ? WHERE LOWER(userId) = LOWER(?)').run(u.id, uId);
            db.prepare('UPDATE ledgers SET accountId = ? WHERE LOWER(accountId) = LOWER(?) AND accountType = ?').run(u.id, uId, 'USER');
        }
    });
    return findAccountById(u.id, 'users');
};

const updateUserByAdmin = (u, uId) => {
    const existing = db.prepare('SELECT * FROM users WHERE LOWER(id) = LOWER(?)').get(uId);
    if (!existing) throw { status: 404, message: "User not found." };
    runInTransaction(() => {
        db.prepare('UPDATE users SET name = ?, password = ?, area = ?, contact = ?, commissionRate = ?, prizeRates = ?, betLimits = ?, avatarUrl = ? WHERE LOWER(id) = LOWER(?)').run(u.name, u.password || existing.password, u.area, u.contact, Number(u.commissionRate), JSON.stringify(u.prizeRates), JSON.stringify(u.betLimits), u.avatarUrl, uId);
    });
    return findAccountById(uId, 'users');
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
        const dealer = findAccountById(user.dealerId, 'dealers');
        const game = findAccountById(gId, 'games');
        if (!game || !game.isMarketOpen || (game.winningNumber && !game.winningNumber.endsWith('_'))) {
            throw { status: 400, message: "Market is currently closed for this game." };
        }
        const admin = findAccountById('Guru', 'admins');
        const globalLimits = db.prepare('SELECT * FROM number_limits').all();
        const existingBets = db.prepare('SELECT * FROM bets WHERE gameId = ?').all(gId);
        const userExistingTotal = existingBets.filter(b => b.userId === uId).reduce((s, b) => s + b.totalAmount, 0);
        const requestTotal = groups.reduce((s, g) => s + g.numbers.length * g.amountPerNumber, 0);
        const perDrawLimit = user.betLimits?.perDraw || 0;
        if (perDrawLimit > 0 && (userExistingTotal + requestTotal) > perDrawLimit) throw { status: 400, message: `Limit Reached: Draw total exceeds your PKR ${perDrawLimit} limit.` };
        if (user.wallet < requestTotal) throw { status: 400, message: `Insufficient funds.` };
        const userCommRate = Number(user.commissionRate) || 0;
        const dealerCommRate = Number(dealer.commissionRate) || 0;
        const userComm = Math.round(requestTotal * (userCommRate / 100) * 100) / 100;
        const dComm = Math.round(requestTotal * ((dealerCommRate - userCommRate) / 100) * 100) / 100;
        addLedgerEntry(user.id, 'USER', `Bet placed on ${game.name}`, requestTotal, 0);
        if (userComm > 0) addLedgerEntry(user.id, 'USER', `Comm earned: ${game.name} (${userCommRate}%)`, 0, userComm);
        addLedgerEntry(admin.id, 'ADMIN', `Stake: ${user.name} @ ${game.name}`, 0, requestTotal);
        if (userComm > 0) addLedgerEntry(admin.id, 'ADMIN', `Comm payout: ${user.name}`, userComm, 0);
        if (dComm > 0) { 
            addLedgerEntry(admin.id, 'ADMIN', `Comm payout: ${dealer.name} (Override)`, dComm, 0); 
            addLedgerEntry(dealer.id, 'DEALER', `Comm from ${user.name} @ ${game.name}`, 0, dComm); 
        }
        const created = [];
        groups.forEach(g => {
            const b = { id: uuidv4(), userId: uId, dealerId: dealer.id, gameId: game.id, subGameType: g.subGameType, numbers: JSON.stringify(g.numbers), amountPerNumber: g.amountPerNumber, totalAmount: g.numbers.length * g.amountPerNumber, timestamp: new Date().toISOString() };
            createBet(b); 
            created.push({ ...b, numbers: g.numbers });
        });
        result = created;
    });
    return result;
};

const updateGameDrawTime = (id, time) => {
    db.prepare('UPDATE games SET drawTime = ? WHERE id = ?').run(time, id);
    return findAccountById(id, 'games');
};

function getAllNumberLimits() { return db.prepare('SELECT * FROM number_limits').all(); }
function saveNumberLimit(limit) {
    const stmt = db.prepare('INSERT OR REPLACE INTO number_limits (gameType, numberValue, limitAmount) VALUES (?, ?, ?)');
    stmt.run(limit.gameType, limit.numberValue, limit.limitAmount);
    return db.prepare('SELECT * FROM number_limits WHERE gameType = ? AND numberValue = ?').get(limit.gameType, limit.numberValue);
}
function deleteNumberLimit(id) { db.prepare('DELETE FROM number_limits WHERE id = ?').run(id); }

function resetAllGames() {
    runInTransaction(() => {
        db.prepare('UPDATE games SET winningNumber = NULL, payoutsApproved = 0').run();
        db.prepare('DELETE FROM bets').run(); 
    });
    console.error('--- [DATABASE] Market Reset Successful ---');
}

module.exports = { connect, verifySchema, findAccountById, findAccountForLogin, updatePassword, getAllFromTable, runInTransaction, addLedgerEntry, createDealer, updateDealer, updateAdmin, findUsersByDealerId, findUserByDealer, findBetsByUserId, createUser, updateUser, updateUserByAdmin, deleteUserByDealer, toggleAccountRestrictionByAdmin, toggleUserRestrictionByDealer, declareWinnerForGame, updateWinningNumber, approvePayoutsForGame, getFinancialSummary, getNumberStakeSummary, placeBulkBets, updateGameDrawTime, resetAllGames, getAllNumberLimits, saveNumberLimit, deleteNumberLimit, findBetsByDealerId, findBetsByGameId };
