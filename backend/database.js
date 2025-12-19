
const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'database.sqlite');
let db;

// --- TIMEZONE & MARKET LOGIC ---
const PKT_OFFSET_HOURS = 5;
const OPEN_HOUR_PKT = 16;

function getGameCycle(drawTime) {
    const now = new Date();
    const [drawHoursPKT, drawMinutesPKT] = drawTime.split(':').map(Number);
    const openHourUTC = OPEN_HOUR_PKT - PKT_OFFSET_HOURS;
    
    const todayOpen = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), openHourUTC, 0, 0));
    const yesterdayOpen = new Date(todayOpen.getTime() - (24 * 60 * 60 * 1000));

    const calculateCloseTime = (openDate) => {
        const closeDate = new Date(openDate.getTime());
        const drawHourUTC = drawHoursPKT - PKT_OFFSET_HOURS;
        closeDate.setUTCHours(drawHourUTC, drawMinutesPKT, 0, 0);
        if (drawHoursPKT < OPEN_HOUR_PKT) closeDate.setUTCDate(closeDate.getUTCDate() + 1);
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
    } catch (error) {
        console.error('Failed to connect to database:', error);
        throw error;
    }
};

const verifySchema = () => {
    try {
        db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admins'").get();
    } catch (error) {
        throw new Error('Database schema missing.');
    }
};

const findAccountById = (id, table) => {
    const account = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!account) return null;

    try {
        if (table !== 'games') {
            account.ledger = db.prepare('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp ASC').all(id);
        } else {
            account.isMarketOpen = isGameOpen(account.drawTime);
        }
        if (account.prizeRates) account.prizeRates = JSON.parse(account.prizeRates);
        if (account.betLimits) account.betLimits = JSON.parse(account.betLimits);
        if ('isRestricted' in account) account.isRestricted = !!account.isRestricted;
    } catch (e) { console.error(`JSON Parse Error for ${table} ${id}`, e); }
    return account;
};

const findAccountForLogin = (loginId) => {
    const tables = [{ n: 'users', r: 'USER' }, { n: 'dealers', r: 'DEALER' }, { n: 'admins', r: 'ADMIN' }];
    for (const t of tables) {
        const acc = db.prepare(`SELECT * FROM ${t.n} WHERE lower(id) = ?`).get(loginId.toLowerCase());
        if (acc) return { account: acc, role: t.r };
    }
    return { account: null, role: null };
};

const getAllFromTable = (table, withLedger = false) => {
    const items = db.prepare(`SELECT * FROM ${table}`).all();
    return items.map(item => {
        try {
            if (withLedger && item.id) item.ledger = db.prepare('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp ASC').all(item.id);
            if (table === 'games' && item.drawTime) item.isMarketOpen = isGameOpen(item.drawTime);
            if (item.prizeRates) item.prizeRates = JSON.parse(item.prizeRates);
            if (item.betLimits) item.betLimits = JSON.parse(item.betLimits);
            if (table === 'bets' && item.numbers) item.numbers = JSON.parse(item.numbers);
            if ('isRestricted' in item) item.isRestricted = !!item.isRestricted;
        } catch (e) {}
        return item;
    });
};

const addLedgerEntry = (accountId, accountType, description, debit, credit) => {
    const table = accountType.toLowerCase() + 's';
    const lastEntry = db.prepare('SELECT balance FROM ledgers WHERE accountId = ? ORDER BY timestamp DESC, ROWID DESC LIMIT 1').get(accountId);
    const lastBalance = lastEntry ? lastEntry.balance : 0;

    if (debit > 0 && accountType !== 'ADMIN' && lastBalance < debit) {
        throw { status: 400, message: `Insufficient funds.` };
    }
    
    const newBalance = lastBalance - debit + credit;
    db.prepare('INSERT INTO ledgers (id, accountId, accountType, timestamp, description, debit, credit, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), accountId, accountType, new Date().toISOString(), description, debit, credit, newBalance);
    
    db.prepare(`UPDATE ${table} SET wallet = ? WHERE id = ?`).run(newBalance, accountId);
};

const declareWinnerForGame = (gameId, winningNumber) => {
    let finalGame;
    db.transaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
        if (!game) throw { status: 404, message: 'Game not found.' };
        if (game.winningNumber && !game.winningNumber.endsWith('_')) throw { status: 400, message: 'Winner already declared.' };

        if (game.name === 'AK') {
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(`${winningNumber}_`, gameId);
        } else if (game.name === 'AKC') {
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(winningNumber, gameId);
            const ak = db.prepare("SELECT * FROM games WHERE name = 'AK'").get();
            if (ak && ak.winningNumber && ak.winningNumber.endsWith('_')) {
                db.prepare("UPDATE games SET winningNumber = ? WHERE id = ?").run(ak.winningNumber.slice(0, 1) + winningNumber, ak.id);
            }
        } else {
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(winningNumber, gameId);
        }
        finalGame = findAccountById(gameId, 'games');
    })();
    return finalGame;
};

const updateWinningNumber = (gameId, num) => {
    db.transaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
        if (!game || !game.winningNumber) throw { status: 400, message: 'Winner not declared.' };
        if (game.payoutsApproved) throw { status: 400, message: 'Payouts approved.' };

        if (game.name === 'AK') {
            const close = game.winningNumber.endsWith('_') ? '_' : game.winningNumber[1];
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(num + close, gameId);
        } else if (game.name === 'AKC') {
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(num, gameId);
            const ak = db.prepare("SELECT * FROM games WHERE name = 'AK'").get();
            if (ak && ak.winningNumber && !ak.winningNumber.endsWith('_')) {
                db.prepare("UPDATE games SET winningNumber = ? WHERE id = ?").run(ak.winningNumber[0] + num, ak.id);
            }
        } else {
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(num, gameId);
        }
    })();
    return findAccountById(gameId, 'games');
};

const approvePayoutsForGame = (gameId) => {
    let updatedGame;
    db.transaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
        if (!game || !game.winningNumber || game.payoutsApproved || game.winningNumber.endsWith('_')) throw { status: 400, message: "Invalid request." };

        const bets = db.prepare('SELECT * FROM bets WHERE gameId = ?').all(gameId).map(b => ({ ...b, numbers: JSON.parse(b.numbers) }));
        const winNum = game.winningNumber;
        const allUsers = Object.fromEntries(getAllFromTable('users').map(u => [u.id, u]));
        const allDealers = Object.fromEntries(getAllFromTable('dealers').map(d => [d.id, d]));
        const admin = findAccountById('Guru', 'admins');

        const mult = (r, t) => t === "1 Digit Open" ? r.oneDigitOpen : (t === "1 Digit Close" ? r.oneDigitClose : r.twoDigit);

        bets.forEach(b => {
            const wins = b.numbers.filter(n => {
                if (b.subGameType === "1 Digit Open") return n === winNum[0];
                if (b.subGameType === "1 Digit Close") return game.name === 'AKC' ? n === winNum : n === winNum[1];
                return n === winNum;
            }).length;

            if (wins > 0) {
                const user = allUsers[b.userId], dealer = allDealers[b.dealerId];
                if (!user || !dealer) return;
                const userPrize = wins * b.amountPerNumber * mult(user.prizeRates, b.subGameType);
                const dealerProfit = wins * b.amountPerNumber * (mult(dealer.prizeRates, b.subGameType) - mult(user.prizeRates, b.subGameType));
                
                addLedgerEntry(user.id, 'USER', `Prize for ${game.name}`, 0, userPrize);
                addLedgerEntry(admin.id, 'ADMIN', `Payout ${user.name}`, userPrize, 0);
                if (dealerProfit > 0) {
                    addLedgerEntry(dealer.id, 'DEALER', `Profit ${game.name}`, 0, dealerProfit);
                    addLedgerEntry(admin.id, 'ADMIN', `Profit ${dealer.name}`, dealerProfit, 0);
                }
            }
        });

        db.prepare('UPDATE games SET payoutsApproved = 1 WHERE id = ?').run(gameId);
        updatedGame = findAccountById(gameId, 'games');
    })();
    return updatedGame;
};

const getFinancialSummary = () => {
    const games = db.prepare('SELECT * FROM games WHERE winningNumber IS NOT NULL AND winningNumber NOT LIKE "%_"').all();
    const allBets = db.prepare('SELECT * FROM bets').all().map(b => ({...b, numbers: JSON.parse(b.numbers)}));
    const allUsers = Object.fromEntries(getAllFromTable('users').map(u => [u.id, u]));
    const allDealers = Object.fromEntries(getAllFromTable('dealers').map(d => [d.id, d]));
    const mult = (r, t) => t === "1 Digit Open" ? r.oneDigitOpen : (t === "1 Digit Close" ? r.oneDigitClose : r.twoDigit);

    const summary = games.map(g => {
        const gameBets = allBets.filter(b => b.gameId === g.id);
        const totalStake = gameBets.reduce((s, b) => s + b.totalAmount, 0);
        let payouts = 0, dProfit = 0, comm = 0;

        gameBets.forEach(b => {
            const u = allUsers[b.userId], d = allDealers[b.dealerId];
            if (!u || !d) return;
            comm += (b.totalAmount * (u.commissionRate / 100)) + (b.totalAmount * ((d.commissionRate - u.commissionRate) / 100));
            const wins = b.numbers.filter(n => {
                if (b.subGameType === "1 Digit Open") return n === g.winningNumber[0];
                if (b.subGameType === "1 Digit Close") return g.name === 'AKC' ? n === g.winningNumber : n === g.winningNumber[1];
                return n === g.winningNumber;
            }).length;
            if (wins > 0) {
                payouts += wins * b.amountPerNumber * mult(u.prizeRates, b.subGameType);
                dProfit += wins * b.amountPerNumber * (mult(d.prizeRates, b.subGameType) - mult(u.prizeRates, b.subGameType));
            }
        });
        return { gameName: g.name, winningNumber: g.winningNumber, totalStake, totalPayouts: payouts, totalDealerProfit: dProfit, totalCommissions: comm, netProfit: totalStake - payouts - dProfit - comm };
    });

    return { games: summary, totals: summary.reduce((t, g) => { t.totalStake += g.totalStake; t.totalPayouts += g.totalPayouts; t.totalDealerProfit += g.totalDealerProfit; t.totalCommissions += g.totalCommissions; t.netProfit += g.netProfit; return t; }, { totalStake: 0, totalPayouts: 0, totalDealerProfit: 0, totalCommissions: 0, netProfit: 0 }), totalBets: allBets.length };
};

const placeBulkBets = (uid, gid, groups) => {
    let result = null;
    db.transaction(() => {
        const user = findAccountById(uid, 'users'), dealer = findAccountById(user.dealerId, 'dealers'), game = findAccountById(gid, 'games'), admin = findAccountById('Guru', 'admins');
        if (!user || user.isRestricted || !dealer || !game || !admin || !isGameOpen(game.drawTime)) throw { status: 400, message: 'Invalid user or market closed.' };
        
        const total = groups.reduce((s, g) => s + g.numbers.length * g.amountPerNumber, 0);
        if (user.wallet < total) throw { status: 400, message: 'Insufficient funds.' };

        const uComm = total * (user.commissionRate / 100), dComm = total * ((dealer.commissionRate - user.commissionRate) / 100);
        addLedgerEntry(user.id, 'USER', `Bet on ${game.name}`, total, 0);
        if (uComm > 0) addLedgerEntry(user.id, 'USER', `Comm. for ${game.name}`, 0, uComm);
        addLedgerEntry(admin.id, 'ADMIN', `Stake from ${user.name}`, 0, total);
        if (uComm > 0) addLedgerEntry(admin.id, 'ADMIN', `Comm payout ${user.name}`, uComm, 0);
        if (dComm > 0) { addLedgerEntry(admin.id, 'ADMIN', `Comm payout ${dealer.name}`, dComm, 0); addLedgerEntry(dealer.id, 'DEALER', `Comm from ${user.name}`, 0, dComm); }

        result = groups.map(g => {
            const id = uuidv4();
            const ts = new Date().toISOString();
            db.prepare('INSERT INTO bets (id, userId, dealerId, gameId, subGameType, numbers, amountPerNumber, totalAmount, timestamp) VALUES (?,?,?,?,?,?,?,?,?)').run(id, uid, dealer.id, gid, g.subGameType, JSON.stringify(g.numbers), g.amountPerNumber, g.numbers.length * g.amountPerNumber, ts);
            return { id, userId: uid, dealerId: dealer.id, gameId: gid, subGameType: g.subGameType, numbers: g.numbers, amountPerNumber: g.amountPerNumber, totalAmount: g.numbers.length * g.amountPerNumber, timestamp: ts };
        });
    })();
    return result;
};

const getNumberStakeSummary = (f) => {
    let q = 'SELECT subGameType, numbers, amountPerNumber FROM bets', p = [], c = [];
    if (f.gameId) { c.push('gameId = ?'); p.push(f.gameId); }
    if (f.dealerId) { c.push('dealerId = ?'); p.push(f.dealerId); }
    if (f.date) { c.push('date(timestamp) = ?'); p.push(f.date); }
    if (c.length > 0) q += ' WHERE ' + c.join(' AND ');
    const bets = db.prepare(q).all(...p), sum = { '2-digit': new Map(), '1-open': new Map(), '1-close': new Map() };
    bets.forEach(b => { 
        try { 
            const nums = JSON.parse(b.numbers), map = b.subGameType === '1 Digit Open' ? sum['1-open'] : (b.subGameType === '1 Digit Close' ? sum['1-close'] : sum['2-digit']); 
            nums.forEach(n => map.set(n, (map.get(n) || 0) + b.amountPerNumber)); 
        } catch (e) {} 
    });
    const fmt = (m) => Array.from(m.entries()).map(([number, stake]) => ({ number, stake })).sort((a, b) => b.stake - a.stake);
    return { twoDigit: fmt(sum['2-digit']), oneDigitOpen: fmt(sum['1-open']), oneDigitClose: fmt(sum['1-close']) };
};

const toggleRestriction = (id, table) => {
    const acc = db.prepare(`SELECT isRestricted FROM ${table} WHERE id = ?`).get(id);
    if (!acc) throw { status: 404, message: 'Not found.' };
    db.prepare(`UPDATE ${table} SET isRestricted = ? WHERE id = ?`).run(acc.isRestricted ? 0 : 1, id);
    return !!(acc.isRestricted ? 0 : 1);
};

module.exports = { 
    connect, verifySchema, findAccountById, findAccountForLogin, getAllFromTable, addLedgerEntry, getFinancialSummary, declareWinnerForGame, updateWinningNumber, approvePayoutsForGame, placeBulkBets, getNumberStakeSummary,
    saveDealer: (d) => db.prepare('INSERT INTO dealers (id, name, password, area, contact, wallet, commissionRate, prizeRates, avatarUrl) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, area=excluded.area, contact=excluded.contact, commissionRate=excluded.commissionRate, prizeRates=excluded.prizeRates, avatarUrl=excluded.avatarUrl').run(d.id, d.name, d.password, d.area, d.contact, d.wallet || 0, d.commissionRate, JSON.stringify(d.prizeRates), d.avatarUrl),
    saveUser: (u) => db.prepare('INSERT INTO users (id, name, password, dealerId, area, contact, wallet, commissionRate, prizeRates, betLimits, avatarUrl) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, area=excluded.area, contact=excluded.contact, commissionRate=excluded.commissionRate, prizeRates=excluded.prizeRates, betLimits=excluded.betLimits, avatarUrl=excluded.avatarUrl').run(u.id, u.name, u.password, u.dealerId, u.area, u.contact, u.wallet || 0, u.commissionRate, JSON.stringify(u.prizeRates), JSON.stringify(u.betLimits), u.avatarUrl),
    updateGameDrawTime: (id, t) => db.prepare('UPDATE games SET drawTime = ? WHERE id = ?').run(t, id),
    toggleRestriction,
    resetAllGames: () => { 
        db.prepare('UPDATE games SET winningNumber = NULL, payoutsApproved = 0 WHERE payoutsApproved = 1').run(); 
    },
    runInTransaction: (fn) => db.transaction(fn)()
};
