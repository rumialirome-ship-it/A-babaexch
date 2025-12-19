
const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'database.sqlite');
let db;

// --- CENTRALIZED GAME TIMING LOGIC (TIMEZONE-AWARE) ---
const PKT_OFFSET_HOURS = 5;
const OPEN_HOUR_PKT = 16; // 4:00 PM in Pakistan

/**
 * Calculates the current or next valid betting window (open time to close time) for a game,
 * with all calculations done in UTC to ensure timezone correctness.
 */
function getGameCycle(drawTime) {
    const now = new Date(); // Current server time is UTC
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
        console.log('Database driver loaded successfully.');
    } catch (error) {
        console.error('CRITICAL: Failed to connect to database driver.', error);
        // Do not process.exit(1) here to allow the server to report the error via API if possible
        throw error;
    }
};

const verifySchema = () => {
    try {
        const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admins'");
        const table = stmt.get();
        if (!table) {
            throw new Error('Database schema missing. Table "admins" not found.');
        }
    } catch (error) {
        console.error('Schema verification failed:', error.message);
        throw error;
    }
};

const findAccountById = (id, table) => {
    const stmt = db.prepare(`SELECT * FROM ${table} WHERE id = ?`);
    const account = stmt.get(id);
    if (!account) return null;

    try {
        if (table !== 'games') {
            const ledgerStmt = db.prepare('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp ASC');
            account.ledger = ledgerStmt.all(id);
        } else {
            account.isMarketOpen = isGameOpen(account.drawTime);
        }

        if (account.prizeRates && typeof account.prizeRates === 'string') {
            account.prizeRates = JSON.parse(account.prizeRates);
        }
        if (account.betLimits && typeof account.betLimits === 'string') {
            account.betLimits = JSON.parse(account.betLimits);
        }
        if ('isRestricted' in account) {
            account.isRestricted = !!account.isRestricted;
        }
    } catch (e) {
        console.error(`Failed to parse JSON for ${table} ID ${id}:`, e);
    }
    return account;
};

const findAccountForLogin = (loginId) => {
    const lowerCaseLoginId = loginId.toLowerCase();
    const tables = [
        { name: 'users', role: 'USER' },
        { name: 'dealers', role: 'DEALER' },
        { name: 'admins', role: 'ADMIN' },
    ];
    for (const tableInfo of tables) {
        const stmt = db.prepare(`SELECT * FROM ${tableInfo.name} WHERE lower(id) = ?`);
        const account = stmt.get(lowerCaseLoginId);
        if (account) return { account, role: tableInfo.role };
    }
    return { account: null, role: null };
};

const updatePassword = (accountId, contact, newPassword) => {
    const tables = ['users', 'dealers'];
    let updated = false;
    for (const table of tables) {
        const stmt = db.prepare(`UPDATE ${table} SET password = ? WHERE id = ? AND contact = ?`);
        const result = stmt.run(newPassword, accountId, contact);
        if (result.changes > 0) { updated = true; break; }
    }
    return updated;
};

const getAllFromTable = (table, withLedger = false) => {
    let items = db.prepare(`SELECT * FROM ${table}`).all();
    return items.map(item => {
        try {
            if (withLedger && item.id) {
                item.ledger = db.prepare('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp ASC').all(item.id);
            }
            if (table === 'games' && item.drawTime) {
                item.isMarketOpen = isGameOpen(item.drawTime);
            }
            if (item.prizeRates && typeof item.prizeRates === 'string') {
                item.prizeRates = JSON.parse(item.prizeRates);
            }
            if (item.betLimits && typeof item.betLimits === 'string') {
                item.betLimits = JSON.parse(item.betLimits);
            }
            if (table === 'bets' && item.numbers && typeof item.numbers === 'string') {
                item.numbers = JSON.parse(item.numbers);
            }
            if ('isRestricted' in item) {
                item.isRestricted = !!item.isRestricted;
            }
        } catch (e) {
            console.error(`Error parsing item in ${table}:`, e);
        }
        return item;
    });
};

const runInTransaction = (fn) => db.transaction(fn)();

const addLedgerEntry = (accountId, accountType, description, debit, credit) => {
    const table = accountType.toLowerCase() + 's';
    const lastBalanceStmt = db.prepare('SELECT balance FROM ledgers WHERE accountId = ? ORDER BY timestamp DESC, ROWID DESC LIMIT 1');
    const lastEntry = lastBalanceStmt.get(accountId);
    const lastBalance = lastEntry ? lastEntry.balance : 0;

    if (debit > 0 && accountType !== 'ADMIN' && lastBalance < debit) {
        throw { status: 400, message: `Insufficient funds. Balance: ${lastBalance.toFixed(2)}, Required: ${debit.toFixed(2)}.` };
    }
    
    const newBalance = lastBalance - debit + credit;
    db.prepare('INSERT INTO ledgers (id, accountId, accountType, timestamp, description, debit, credit, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), accountId, accountType, new Date().toISOString(), description, debit, credit, newBalance);
    
    db.prepare(`UPDATE ${table} SET wallet = ? WHERE id = ?`).run(newBalance, accountId);
};

const declareWinnerForGame = (gameId, winningNumber) => {
    let finalGame;
    runInTransaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
        if (!game) throw { status: 404, message: 'Game not found.' };
        if (game.winningNumber) throw { status: 400, message: 'Winner already declared.' };

        if (game.name === 'AK') {
            const partialWinner = `${winningNumber}_`;
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(partialWinner, gameId);
        } else if (game.name === 'AKC') {
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(winningNumber, gameId);
            const akGame = db.prepare("SELECT * FROM games WHERE name = 'AK'").get();
            if (akGame && akGame.winningNumber && akGame.winningNumber.endsWith('_')) {
                const fullNumber = akGame.winningNumber.slice(0, 1) + winningNumber;
                db.prepare("UPDATE games SET winningNumber = ? WHERE name = 'AK'").run(fullNumber);
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
        if (!game || !game.winningNumber) throw { status: 400, message: 'Winner not declared.' };
        if (game.payoutsApproved) throw { status: 400, message: 'Payouts already approved.' };

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
        if (!game || !game.winningNumber || game.payoutsApproved) throw { status: 400, message: "Invalid request." };

        const winningBets = db.prepare('SELECT * FROM bets WHERE gameId = ?').all(gameId).map(b => ({ ...b, numbers: JSON.parse(b.numbers) }));
        const winningNumber = game.winningNumber;
        const allUsers = Object.fromEntries(getAllFromTable('users').map(u => [u.id, u]));
        const allDealers = Object.fromEntries(getAllFromTable('dealers').map(d => [d.id, d]));
        const admin = findAccountById('Guru', 'admins');

        const getMultiplier = (rates, type) => type === "1 Digit Open" ? rates.oneDigitOpen : (type === "1 Digit Close" ? rates.oneDigitClose : rates.twoDigit);

        winningBets.forEach(bet => {
            const winCount = bet.numbers.filter(num => {
                if (bet.subGameType === "1 Digit Open") return winningNumber.length === 2 && num === winningNumber[0];
                if (bet.subGameType === "1 Digit Close") return game.name === 'AKC' ? num === winningNumber : (winningNumber.length === 2 && num === winningNumber[1]);
                return num === winningNumber;
            }).length;

            if (winCount > 0) {
                const user = allUsers[bet.userId];
                const dealer = allDealers[bet.dealerId];
                if (!user || !dealer) return;

                const userPrize = winCount * bet.amountPerNumber * getMultiplier(user.prizeRates, bet.subGameType);
                const dealerProfit = winCount * bet.amountPerNumber * (getMultiplier(dealer.prizeRates, bet.subGameType) - getMultiplier(user.prizeRates, bet.subGameType));
                
                addLedgerEntry(user.id, 'USER', `Prize money for ${game.name}`, 0, userPrize);
                addLedgerEntry(admin.id, 'ADMIN', `Prize payout to ${user.name}`, userPrize, 0);
                addLedgerEntry(dealer.id, 'DEALER', `Profit from winner in ${game.name}`, 0, dealerProfit);
                addLedgerEntry(admin.id, 'ADMIN', `Dealer profit payout to ${dealer.name}`, dealerProfit, 0);
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
    const allUsers = Object.fromEntries(getAllFromTable('users').map(u => [u.id, u]));
    const allDealers = Object.fromEntries(getAllFromTable('dealers').map(d => [d.id, d]));

    const getMultiplier = (rates, type) => type === "1 Digit Open" ? rates.oneDigitOpen : (type === "1 Digit Close" ? rates.oneDigitClose : rates.twoDigit);

    const summaryByGame = games.map(game => {
        const gameBets = allBets.filter(b => b.gameId === game.id);
        const totalStake = gameBets.reduce((sum, b) => sum + b.totalAmount, 0);
        let totalPayouts = 0, totalDealerProfit = 0;

        if (!game.winningNumber.endsWith('_')) {
            gameBets.forEach(bet => {
                const winCount = bet.numbers.filter(num => {
                    if (bet.subGameType === "1 Digit Open") return game.winningNumber.length === 2 && num === game.winningNumber[0];
                    if (bet.subGameType === "1 Digit Close") return game.name === 'AKC' ? num === game.winningNumber : (game.winningNumber.length === 2 && num === game.winningNumber[1]);
                    return num === game.winningNumber;
                }).length;

                if (winCount > 0) {
                    const user = allUsers[bet.userId];
                    const dealer = allDealers[bet.dealerId];
                    if (user && dealer) {
                        totalPayouts += winCount * bet.amountPerNumber * getMultiplier(user.prizeRates, bet.subGameType);
                        totalDealerProfit += winCount * bet.amountPerNumber * (getMultiplier(dealer.prizeRates, bet.subGameType) - getMultiplier(user.prizeRates, bet.subGameType));
                    }
                }
            });
        }
        
        const totalCommissions = gameBets.reduce((sum, bet) => {
            const user = allUsers[bet.userId], dealer = allDealers[bet.dealerId];
            if (!user || !dealer) return sum;
            return sum + (bet.totalAmount * (user.commissionRate / 100)) + (bet.totalAmount * ((dealer.commissionRate - user.commissionRate) / 100));
        }, 0);
        
        return { gameName: game.name, winningNumber: game.winningNumber, totalStake, totalPayouts, totalDealerProfit, totalCommissions, netProfit: totalStake - totalPayouts - totalDealerProfit - totalCommissions };
    });

    return {
        games: summaryByGame.sort((a,b) => a.gameName.localeCompare(b.gameName)),
        totals: summaryByGame.reduce((t, g) => { t.totalStake += g.totalStake; t.totalPayouts += g.totalPayouts; t.totalDealerProfit += g.totalDealerProfit; t.totalCommissions += g.totalCommissions; t.netProfit += g.netProfit; return t; }, { totalStake: 0, totalPayouts: 0, totalDealerProfit: 0, totalCommissions: 0, netProfit: 0 }),
        totalBets: allBets.length,
    };
};

const createDealer = (d) => {
    if (db.prepare('SELECT id FROM dealers WHERE lower(id) = ?').get(d.id.toLowerCase())) throw { status: 400, message: "ID taken." };
    db.prepare('INSERT INTO dealers (id, name, password, area, contact, wallet, commissionRate, isRestricted, prizeRates, avatarUrl) VALUES (?,?,?,?,?,?,?,?,?,?)').run(d.id, d.name, d.password, d.area, d.contact, d.wallet || 0, d.commissionRate, 0, JSON.stringify(d.prizeRates), d.avatarUrl);
    if (d.wallet > 0) addLedgerEntry(d.id, 'DEALER', 'Initial Deposit', 0, d.wallet);
    return findAccountById(d.id, 'dealers');
};

const updateDealer = (d, orig) => {
    if (d.id.toLowerCase() !== orig.toLowerCase() && db.prepare('SELECT id FROM dealers WHERE lower(id) = ?').get(d.id.toLowerCase())) throw { status: 400, message: "ID taken." };
    db.prepare('UPDATE dealers SET id=?, name=?, password=?, area=?, contact=?, commissionRate=?, prizeRates=?, avatarUrl=? WHERE id=?').run(d.id, d.name, d.password, d.area, d.contact, d.commissionRate, JSON.stringify(d.prizeRates), d.avatarUrl, orig);
    if (d.id !== orig) { db.prepare('UPDATE users SET dealerId=? WHERE dealerId=?').run(d.id, orig); db.prepare('UPDATE bets SET dealerId=? WHERE dealerId=?').run(d.id, orig); db.prepare('UPDATE ledgers SET accountId=? WHERE accountId=? AND accountType=?').run(d.id, orig, 'DEALER'); }
    return findAccountById(d.id, 'dealers');
};

const findUsersByDealerId = (id) => db.prepare('SELECT * FROM users WHERE dealerId = ?').all(id).map(u => findAccountById(u.id, 'users'));
const findBetsByDealerId = (id) => db.prepare('SELECT * FROM bets WHERE dealerId = ? ORDER BY timestamp DESC').all(id).map(b => ({ ...b, numbers: JSON.parse(b.numbers) }));
const findBetsByGameId = (id) => db.prepare('SELECT * FROM bets WHERE gameId = ?').all(id).map(b => ({ ...b, numbers: JSON.parse(b.numbers) }));
const findUserByDealer = (uid, did) => db.prepare('SELECT * FROM users WHERE id = ? AND dealerId = ?').get(uid, did) ? findAccountById(uid, 'users') : null;

const createUser = (u, did, dep = 0) => {
    if (db.prepare('SELECT id FROM users WHERE lower(id) = ?').get(u.id.toLowerCase())) throw { status: 400, message: "ID taken." };
    const dealer = findAccountById(did, 'dealers');
    if (!dealer || dealer.wallet < dep) throw { status: 400, message: 'Invalid request or funds.' };
    db.prepare('INSERT INTO users (id, name, password, dealerId, area, contact, wallet, commissionRate, isRestricted, prizeRates, betLimits, avatarUrl) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(u.id, u.name, u.password, did, u.area, u.contact, 0, u.commissionRate, 0, JSON.stringify(u.prizeRates), JSON.stringify(u.betLimits), u.avatarUrl);
    if (dep > 0) { addLedgerEntry(did, 'DEALER', `User Initial Deposit: ${u.name}`, dep, 0); addLedgerEntry(u.id, 'USER', `Initial Deposit`, 0, dep); }
    return findAccountById(u.id, 'users');
};

const updateUser = (u, uid, did) => {
    if (!findUserByDealer(uid, did)) throw { status: 404, message: "User not found." };
    db.prepare('UPDATE users SET name=?, password=?, area=?, contact=?, commissionRate=?, prizeRates=?, betLimits=?, avatarUrl=? WHERE id=?').run(u.name, u.password, u.area, u.contact, u.commissionRate, JSON.stringify(u.prizeRates), JSON.stringify(u.betLimits), u.avatarUrl, uid);
    return findAccountById(uid, 'users');
};

const toggleAccountRestrictionByAdmin = (id, type) => {
    const table = type.toLowerCase() + 's';
    const acc = db.prepare(`SELECT isRestricted FROM ${table} WHERE id = ?`).get(id);
    if (!acc) throw { status: 404, message: 'Not found.' };
    db.prepare(`UPDATE ${table} SET isRestricted = ? WHERE id = ?`).run(acc.isRestricted ? 0 : 1, id);
    return findAccountById(id, table);
};

const toggleUserRestrictionByDealer = (uid, did) => {
    const user = db.prepare('SELECT isRestricted FROM users WHERE id = ? AND dealerId = ?').get(uid, did);
    if (!user) throw { status: 404, message: 'Not found.' };
    db.prepare('UPDATE users SET isRestricted = ? WHERE id = ?').run(user.isRestricted ? 0 : 1, uid);
    return findAccountById(uid, 'users');
};

const createBet = (b) => db.prepare('INSERT INTO bets (id, userId, dealerId, gameId, subGameType, numbers, amountPerNumber, totalAmount, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(b.id, b.userId, b.dealerId, b.gameId, b.subGameType, b.numbers, b.amountPerNumber, b.totalAmount, b.timestamp);

const getUserStakesForGame = (uid, gid) => {
    const bets = db.prepare(`SELECT subGameType, numbers, amountPerNumber FROM bets WHERE userId = ? AND gameId = ?`).all(uid, gid);
    const map = new Map();
    bets.forEach(b => {
        try { JSON.parse(b.numbers).forEach(num => { const key = (b.subGameType.includes('1 Digit') ? 'oneDigit' : 'twoDigit') + '-' + num; map.set(key, (map.get(key) || 0) + b.amountPerNumber); }); } catch(e) {}
    });
    return map;
};

const getAllNumberLimits = () => db.prepare('SELECT * FROM number_limits ORDER BY gameType, numberValue ASC').all();
const saveNumberLimit = (l) => { db.prepare('INSERT INTO number_limits (gameType, numberValue, limitAmount) VALUES (?, ?, ?) ON CONFLICT(gameType, numberValue) DO UPDATE SET limitAmount = excluded.limitAmount').run(l.gameType, l.numberValue, l.limitAmount); return db.prepare('SELECT * FROM number_limits WHERE gameType = ? AND numberValue = ?').get(l.gameType, l.numberValue); };
const deleteNumberLimit = (id) => db.prepare('DELETE FROM number_limits WHERE id = ?').run(id);
const getNumberLimit = (t, v) => db.prepare('SELECT * FROM number_limits WHERE gameType = ? AND numberValue = ?').get(t, v);

const getCurrentStakeForNumber = (t, v) => {
    const types = t === '2-digit' ? ['2 Digit', 'Bulk Game', 'Combo Game'] : (t === '1-open' ? ['1 Digit Open'] : ['1 Digit Close']);
    const bets = db.prepare(`SELECT numbers, amountPerNumber FROM bets WHERE subGameType IN (${types.map(() => '?').join(',')}) AND gameId IN (SELECT id FROM games WHERE winningNumber IS NULL OR payoutsApproved = 0)`).all(...types);
    return bets.reduce((sum, b) => sum + (JSON.parse(b.numbers).filter(n => n === v).length * b.amountPerNumber), 0);
};

const getNumberStakeSummary = (f) => {
    let q = 'SELECT subGameType, numbers, amountPerNumber FROM bets', p = [], c = [];
    if (f.gameId) { c.push('gameId = ?'); p.push(f.gameId); }
    if (f.dealerId) { c.push('dealerId = ?'); p.push(f.dealerId); }
    if (f.date) { c.push('date(timestamp) = ?'); p.push(f.date); }
    if (c.length > 0) q += ' WHERE ' + c.join(' AND ');
    const bets = db.prepare(q).all(...p), summary = { '2-digit': new Map(), '1-open': new Map(), '1-close': new Map() };
    bets.forEach(b => { try { const nums = JSON.parse(b.numbers), map = b.subGameType === '1 Digit Open' ? summary['1-open'] : (b.subGameType === '1 Digit Close' ? summary['1-close'] : summary['2-digit']); nums.forEach(n => map.set(n, (map.get(n) || 0) + b.amountPerNumber)); } catch (e) {} });
    const fmt = (m) => Array.from(m.entries()).map(([number, stake]) => ({ number, stake })).sort((a, b) => b.stake - a.stake);
    return { twoDigit: fmt(summary['2-digit']), oneDigitOpen: fmt(summary['1-open']), oneDigitClose: fmt(summary['1-close']) };
};

const placeBulkBets = (uid, gid, groups, plBy = 'USER') => {
    let result = null;
    runInTransaction(() => {
        const user = findAccountById(uid, 'users'), dealer = findAccountById(user.dealerId, 'dealers'), game = findAccountById(gid, 'games'), admin = findAccountById('Guru', 'admins');
        if (!user || user.isRestricted || !dealer || !game || !admin || !game.isMarketOpen) throw { status: 400, message: 'Invalid user, restricted, or market closed.' };
        
        let totalCost = 0;
        groups.forEach(g => {
            totalCost += g.numbers.length * g.amountPerNumber;
            const globalT = g.subGameType === '1 Digit Open' ? '1-open' : (g.subGameType === '1 Digit Close' ? '1-close' : '2-digit');
            g.numbers.forEach(n => {
                const limit = getNumberLimit(globalT, n);
                if (limit && (getCurrentStakeForNumber(globalT, n) + g.amountPerNumber) > limit.limitAmount) throw { status: 400, message: `Limit reached for ${n}` };
            });
        });

        if (user.wallet < totalCost) throw { status: 400, message: 'Insuf. funds' };
        const uComm = totalCost * (user.commissionRate / 100), dComm = totalCost * ((dealer.commissionRate - user.commissionRate) / 100);
        addLedgerEntry(user.id, 'USER', `Bet on ${game.name}`, totalCost, 0);
        if (uComm > 0) addLedgerEntry(user.id, 'USER', `Comm. for ${game.name}`, 0, uComm);
        addLedgerEntry(admin.id, 'ADMIN', `Stake from ${user.name}`, 0, totalCost);
        if (uComm > 0) addLedgerEntry(admin.id, 'ADMIN', `Comm payout ${user.name}`, uComm, 0);
        if (dComm > 0) { addLedgerEntry(admin.id, 'ADMIN', `Comm payout ${dealer.name}`, dComm, 0); addLedgerEntry(dealer.id, 'DEALER', `Comm from ${user.name}`, 0, dComm); }

        result = groups.map(g => {
            const b = { id: uuidv4(), userId: uid, dealerId: dealer.id, gameId: gid, subGameType: g.subGameType, numbers: JSON.stringify(g.numbers), amountPerNumber: g.amountPerNumber, totalAmount: g.numbers.length * g.amountPerNumber, timestamp: new Date().toISOString() };
            createBet(b); return { ...b, numbers: g.numbers };
        });
    });
    return result;
};

const resetAllGames = () => {
    const games = db.prepare('SELECT id, drawTime, winningNumber FROM games WHERE winningNumber IS NOT NULL').all();
    runInTransaction(() => { games.forEach(g => { if (isGameOpen(g.drawTime)) db.prepare('UPDATE games SET winningNumber = NULL, payoutsApproved = 0 WHERE id = ?').run(g.id); }); });
};

module.exports = { connect, verifySchema, findAccountById, findAccountForLogin, updatePassword, getAllFromTable, runInTransaction, addLedgerEntry, createDealer, updateDealer, findUsersByDealerId, findBetsByDealerId, findUserByDealer, createUser, updateUser, toggleAccountRestrictionByAdmin, toggleUserRestrictionByDealer, declareWinnerForGame, updateWinningNumber, approvePayoutsForGame, getFinancialSummary, getAllNumberLimits, saveNumberLimit, deleteNumberLimit, getNumberLimit, getCurrentStakeForNumber, findBetsByGameId, getNumberStakeSummary, placeBulkBets, updateGameDrawTime: (id, t) => { db.prepare('UPDATE games SET drawTime = ? WHERE id = ?').run(t, id); return findAccountById(id, 'games'); }, resetAllGames };
