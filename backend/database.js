
const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'database.sqlite');
let db;

const connect = () => {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
};

const verifySchema = () => {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admins'").get();
    if (!table) throw new Error("Database not initialized.");
};

const findAccountById = (id, table) => {
    const account = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!account) return null;
    if (table !== 'games') {
        account.ledger = db.prepare('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp ASC').all(id);
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
        if (acc.prizeRates && typeof acc.prizeRates === 'string') acc.prizeRates = JSON.parse(acc.prizeRates);
        if (acc.betLimits && typeof acc.betLimits === 'string') acc.betLimits = JSON.parse(acc.betLimits);
        if (table === 'bets' && acc.numbers) acc.numbers = JSON.parse(acc.numbers);
        if ('isRestricted' in acc) acc.isRestricted = !!acc.isRestricted;
        return acc;
    });
};

const findUsersByDealerId = (dealerId) => {
    return db.prepare('SELECT * FROM users WHERE dealerId = ?').all(dealerId).map(u => {
        u.prizeRates = JSON.parse(u.prizeRates);
        u.betLimits = u.betLimits ? JSON.parse(u.betLimits) : null;
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
    
    if (debit > 0 && accountType !== 'ADMIN' && lastBalance < debit) {
        throw { status: 400, message: `Insufficient funds for ${accountId}. Balance: ${lastBalance}` };
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
        const dealer = findAccountById(user.dealerId, 'dealers');
        const admin = findAccountById('Guru', 'admins');
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);

        let totalStake = 0;
        betGroups.forEach(g => totalStake += g.numbers.length * g.amountPerNumber);
        
        // 1. Deduct full stake from User
        addLedgerEntry(user.id, 'USER', `Stake: ${game.name}`, totalStake, 0);

        // 2. Instant Commissions (Margin Logic)
        const userComm = totalStake * (user.commissionRate / 100);
        const dealerCommMargin = totalStake * ((dealer.commissionRate - user.commissionRate) / 100);

        if (userComm > 0) {
            addLedgerEntry(user.id, 'USER', `Comm: ${game.name}`, 0, userComm);
        }
        if (dealerCommMargin > 0) {
            addLedgerEntry(dealer.id, 'DEALER', `User Comm Margin: ${user.name} (${game.name})`, 0, dealerCommMargin);
        }

        // 3. Admin tracks totals
        addLedgerEntry(admin.id, 'ADMIN', `Stake In: ${user.name} (${game.name})`, 0, totalStake);
        const totalSysPayout = userComm + dealerCommMargin;
        if (totalSysPayout > 0) {
            addLedgerEntry(admin.id, 'ADMIN', `Comm Out: ${game.name}`, totalSysPayout, 0);
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

const approvePayouts = (gameId) => {
    runInTransaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
        const admin = findAccountById('Guru', 'admins');
        
        if (!game.winningNumber) throw new Error("Winning number not set.");
        if (game.payoutsApproved) throw new Error("Payouts already approved.");

        const bets = db.prepare('SELECT * FROM bets WHERE gameId = ?').all(gameId);
        
        bets.forEach(bet => {
            const user = findAccountById(bet.userId, 'users');
            const dealer = findAccountById(bet.dealerId, 'dealers');
            const numbers = JSON.parse(bet.numbers);
            const winNum = game.winningNumber;
            
            let winCount = 0;
            numbers.forEach(n => {
                if (bet.subGameType === '1 Digit Open' && winNum[0] === n) winCount++;
                else if (bet.subGameType === '1 Digit Close' && winNum[1] === n) winCount++;
                else if (bet.subGameType === '2 Digit' && winNum === n) winCount++;
            });

            if (winCount > 0) {
                // Get rates based on sub-game type
                const getRate = (rates, type) => {
                    if (type === '1 Digit Open') return rates.oneDigitOpen;
                    if (type === '1 Digit Close') return rates.oneDigitClose;
                    return rates.twoDigit;
                };

                const userRate = getRate(user.prizeRates, bet.subGameType);
                const dealerRate = getRate(dealer.prizeRates, bet.subGameType);
                const adminRate = getRate(admin.prizeRates, bet.subGameType);

                const stakePerWin = bet.amountPerNumber;
                
                // User's Prize: Stake * User Rate
                const userPrize = winCount * stakePerWin * userRate;
                
                // Dealer's Profit Margin: Stake * (Dealer Rate - User Rate)
                const dealerProfit = winCount * stakePerWin * (dealerRate - userRate);

                // Admin's Payout: Total amount leaving the system
                const totalSystemPayout = userPrize + dealerProfit;

                // 1. Admin Pays Out
                addLedgerEntry(admin.id, 'ADMIN', `Payout: ${game.name} Winner ${user.name}`, totalSystemPayout, 0);

                // 2. User gets prize
                addLedgerEntry(user.id, 'USER', `Win: ${game.name} (${winNum})`, 0, userPrize);

                // 3. Dealer gets margin
                if (dealerProfit > 0) {
                    addLedgerEntry(dealer.id, 'DEALER', `User Win Margin: ${user.name} (${game.name})`, 0, dealerProfit);
                }
            }
        });

        db.prepare('UPDATE games SET payoutsApproved = 1 WHERE id = ?').run(gameId);
    });
};

const topUpUserWallet = (dealerId, userId, amount) => {
    runInTransaction(() => {
        const dealer = findAccountById(dealerId, 'dealers');
        const user = findAccountById(userId, 'users');
        addLedgerEntry(dealer.id, 'DEALER', `Top-up for ${user.name}`, amount, 0);
        addLedgerEntry(user.id, 'USER', `Deposit from ${dealer.name}`, 0, amount);
    });
};

const withdrawFromUserWallet = (dealerId, userId, amount) => {
    runInTransaction(() => {
        const dealer = findAccountById(dealerId, 'dealers');
        const user = findAccountById(userId, 'users');
        addLedgerEntry(user.id, 'USER', `Withdraw to ${dealer.name}`, amount, 0);
        addLedgerEntry(dealer.id, 'DEALER', `Recovered from ${user.name}`, 0, amount);
    });
};

module.exports = {
    connect, verifySchema, findAccountById, findAccountForLogin,
    getAllFromTable, findUsersByDealerId, findBetsByDealerId,
    runInTransaction, addLedgerEntry, placeBulkBets,
    topUpUserWallet, withdrawFromUserWallet,
    approvePayouts,
    declareWinner: (id, num) => db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(num, id),
    updateDrawTime: (id, time) => db.prepare('UPDATE games SET drawTime = ? WHERE id = ?').run(time, id),
    toggleAccountRestriction: (id, table) => {
        db.prepare(`UPDATE ${table} SET isRestricted = 1 - isRestricted WHERE id = ?`).run(id);
        return findAccountById(id, table);
    },
    createUser: (userData, dealerId, initialDeposit) => {
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
    },
    updateUser: (userData, id, dealerId) => {
        db.prepare('UPDATE users SET name=?, password=?, area=?, contact=?, commissionRate=?, prizeRates=?, betLimits=?, avatarUrl=? WHERE id=? AND dealerId=?')
          .run(userData.name, userData.password, userData.area, userData.contact, userData.commissionRate, JSON.stringify(userData.prizeRates), JSON.stringify(userData.betLimits), userData.avatarUrl, id, dealerId);
        return findAccountById(id, 'users');
    },
    updateDealer: (data, id) => {
        db.prepare('UPDATE dealers SET name=?, password=?, area=?, contact=?, commissionRate=?, prizeRates=?, avatarUrl=? WHERE id=?')
          .run(data.name, data.password, data.area, data.contact, data.commissionRate, JSON.stringify(data.prizeRates), data.avatarUrl, id);
        return findAccountById(id, 'dealers');
    },
    getFinancialSummary: () => {
        const games = db.prepare('SELECT * FROM games').all();
        const admin = findAccountById('Guru', 'admins');
        return {
            games: games.map(g => ({
                gameName: g.name,
                winningNumber: g.winningNumber || '---',
                totalStake: db.prepare('SELECT SUM(totalAmount) as s FROM bets WHERE gameId=?').get(g.id).s || 0,
                totalPayouts: 0,
                netProfit: 0
            })),
            totals: { totalStake: 0, netProfit: admin.wallet },
            totalBets: db.prepare('SELECT COUNT(*) as c FROM bets').get().c
        };
    }
};
