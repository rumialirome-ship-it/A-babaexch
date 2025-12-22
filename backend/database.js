
const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'database.sqlite');
let db;

const PKT_OFFSET_HOURS = 5;
const OPEN_HOUR_PKT = 16; 

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
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
};

const verifySchema = () => {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admins'").get();
    if (!table) process.exit(1);
};

const findAccountById = (id, table) => {
    const account = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!account) return null;
    if (table !== 'games') {
        account.ledger = db.prepare('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp ASC').all(id);
    } else {
        account.isMarketOpen = isGameOpen(account.drawTime);
    }
    if (account.prizeRates) account.prizeRates = JSON.parse(account.prizeRates);
    if (account.betLimits) account.betLimits = JSON.parse(account.betLimits);
    if ('isRestricted' in account) account.isRestricted = !!account.isRestricted;
    return account;
};

const findAccountForLogin = (loginId) => {
    const lowerId = loginId.toLowerCase();
    for (const t of [{n:'users',r:'USER'},{n:'dealers',r:'DEALER'},{n:'admins',r:'ADMIN'}]) {
        const account = db.prepare(`SELECT * FROM ${t.n} WHERE lower(id) = ?`).get(lowerId);
        if (account) return { account, role: t.r };
    }
    return { account: null, role: null };
};

const getAllFromTable = (table, withLedger = false) => {
    return db.prepare(`SELECT * FROM ${table}`).all().map(acc => {
        if (withLedger) acc.ledger = db.prepare('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp ASC').all(acc.id);
        if (table === 'games') acc.isMarketOpen = isGameOpen(acc.drawTime);
        if (acc.prizeRates) acc.prizeRates = JSON.parse(acc.prizeRates);
        if (acc.betLimits) acc.betLimits = JSON.parse(acc.betLimits);
        if (table === 'bets' && acc.numbers) acc.numbers = JSON.parse(acc.numbers);
        if ('isRestricted' in acc) acc.isRestricted = !!acc.isRestricted;
        return acc;
    });
};

const findUsersByDealerId = (dealerId) => {
    return db.prepare('SELECT * FROM users WHERE dealerId = ?').all(dealerId).map(u => {
        u.prizeRates = JSON.parse(u.prizeRates);
        u.betLimits = JSON.parse(u.betLimits);
        u.ledger = db.prepare('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp ASC').all(u.id);
        u.isRestricted = !!u.isRestricted;
        return u;
    });
};

const findBetsByDealerId = (dealerId) => {
    return db.prepare('SELECT * FROM bets WHERE dealerId = ?').all(dealerId).map(b => {
        b.numbers = JSON.parse(b.numbers);
        b.timestamp = new Date(b.timestamp);
        return b;
    });
};

const runInTransaction = (fn) => db.transaction(fn)();

const addLedgerEntry = (accountId, accountType, description, debit, credit) => {
    const table = accountType.toLowerCase() + 's';
    const lastBalance = db.prepare('SELECT balance FROM ledgers WHERE accountId = ? ORDER BY timestamp DESC, ROWID DESC LIMIT 1').get(accountId)?.balance || 0;
    
    // Safety check for debits (only if not admin)
    if (debit > 0 && accountType !== 'ADMIN' && lastBalance < debit) {
        throw { status: 400, message: `Insufficient funds in ${accountId} wallet.` };
    }

    const newBalance = lastBalance - debit + credit;
    db.prepare('INSERT INTO ledgers (id, accountId, accountType, timestamp, description, debit, credit, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), accountId, accountType, new Date().toISOString(), description, debit, credit, newBalance);
    
    db.prepare(`UPDATE ${table} SET wallet = ? WHERE id = ?`).run(newBalance, accountId);
    return newBalance;
};

const placeBulkBets = (userId, gameId, betGroups) => {
    let results;
    runInTransaction(() => {
        const user = findAccountById(userId, 'users');
        const game = findAccountById(gameId, 'games');
        const dealer = findAccountById(user.dealerId, 'dealers');
        const admin = findAccountById('Guru', 'admins');

        if (!game.isMarketOpen) throw { status: 400, message: 'Market is closed.' };
        if (user.isRestricted) throw { status: 403, message: 'Account is locked.' };

        let totalStake = 0;
        betGroups.forEach(g => totalStake += g.numbers.length * g.amountPerNumber);
        
        // 1. Deduct from User
        addLedgerEntry(user.id, 'USER', `Game Stake: ${game.name}`, totalStake, 0);

        // 2. Calculate and distribute Commissions
        const userComm = totalStake * (user.commissionRate / 100);
        const dealerComm = totalStake * ((dealer.commissionRate - user.commissionRate) / 100);

        if (userComm > 0) addLedgerEntry(user.id, 'USER', `Bet Commission: ${game.name}`, 0, userComm);
        if (dealerComm > 0) addLedgerEntry(dealer.id, 'DEALER', `User Bet Margin: ${user.name}`, 0, dealerComm);

        // 3. Admin Ledger
        addLedgerEntry(admin.id, 'ADMIN', `Stake In: ${user.name} (${game.name})`, 0, totalStake);
        if (userComm + dealerComm > 0) {
            addLedgerEntry(admin.id, 'ADMIN', `Commission Payout: ${game.name}`, userComm + dealerComm, 0);
        }

        results = betGroups.map(g => {
            const betId = uuidv4();
            db.prepare('INSERT INTO bets (id, userId, dealerId, gameId, subGameType, numbers, amountPerNumber, totalAmount, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
              .run(betId, userId, dealer.id, gameId, g.subGameType, JSON.stringify(g.numbers), g.amountPerNumber, g.numbers.length * g.amountPerNumber, new Date().toISOString());
            return { id: betId, ...g };
        });
    });
    return results;
};

const topUpUserWallet = (dealerId, userId, amount) => {
    runInTransaction(() => {
        const dealer = findAccountById(dealerId, 'dealers');
        const user = findAccountById(userId, 'users');
        if (dealer.wallet < amount) throw { status: 400, message: 'Insufficient dealer balance.' };

        addLedgerEntry(dealer.id, 'DEALER', `Funds Transfer to User: ${user.name}`, amount, 0);
        addLedgerEntry(user.id, 'USER', `Deposit from Dealer: ${dealer.name}`, 0, amount);
    });
};

const withdrawFromUserWallet = (dealerId, userId, amount) => {
    runInTransaction(() => {
        const dealer = findAccountById(dealerId, 'dealers');
        const user = findAccountById(userId, 'users');
        if (user.wallet < amount) throw { status: 400, message: 'User has insufficient balance.' };

        addLedgerEntry(user.id, 'USER', `Withdrawal to Dealer: ${dealer.name}`, amount, 0);
        addLedgerEntry(dealer.id, 'DEALER', `Funds Recovered from User: ${user.name}`, 0, amount);
    });
};

const createUser = (userData, dealerId, initialDeposit) => {
    let newUser;
    runInTransaction(() => {
        db.prepare('INSERT INTO users (id, name, password, dealerId, area, contact, wallet, commissionRate, isRestricted, prizeRates, betLimits, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(userData.id, userData.name, userData.password, dealerId, userData.area, userData.contact, 0, userData.commissionRate, 0, JSON.stringify(userData.prizeRates), JSON.stringify(userData.betLimits), userData.avatarUrl);
        
        if (initialDeposit > 0) {
            topUpUserWallet(dealerId, userData.id, initialDeposit);
        }
        newUser = findAccountById(userData.id, 'users');
    });
    return newUser;
};

const updateUser = (userData, id, dealerId) => {
    db.prepare('UPDATE users SET name = ?, password = ?, area = ?, contact = ?, commissionRate = ?, prizeRates = ?, betLimits = ?, avatarUrl = ? WHERE id = ? AND dealerId = ?')
      .run(userData.name, userData.password, userData.area, userData.contact, userData.commissionRate, JSON.stringify(userData.prizeRates), JSON.stringify(userData.betLimits), userData.avatarUrl, id, dealerId);
    return findAccountById(id, 'users');
};

const updateDealer = (dealerData, id) => {
    db.prepare('UPDATE dealers SET name = ?, password = ?, area = ?, contact = ?, prizeRates = ?, avatarUrl = ? WHERE id = ?')
      .run(dealerData.name, dealerData.password, dealerData.area, dealerData.contact, JSON.stringify(dealerData.prizeRates), dealerData.avatarUrl, id);
    return findAccountById(id, 'dealers');
};

module.exports = {
    connect, verifySchema, findAccountById, findAccountForLogin,
    getAllFromTable, findUsersByDealerId, findBetsByDealerId,
    runInTransaction, addLedgerEntry, createUser, updateUser, updateDealer,
    topUpUserWallet, withdrawFromUserWallet, placeBulkBets,
    toggleUserRestrictionByDealer: (id, dealerId) => {
        db.prepare('UPDATE users SET isRestricted = 1 - isRestricted WHERE id = ? AND dealerId = ?').run(id, dealerId);
        return findAccountById(id, 'users');
    }
};
