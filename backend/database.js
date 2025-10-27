const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'database.sqlite');
let db;

/**
 * Connects to the SQLite database.
 */
const connect = () => {
    try {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        console.log('Database connected successfully.');
    } catch (error) {
        console.error('Failed to connect to database:', error);
        process.exit(1);
    }
};

/**
 * Verifies that the database schema seems to exist.
 */
const verifySchema = () => {
    try {
        const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admins'");
        const table = stmt.get();
        if (!table) {
            console.error('\n\n--- CRITICAL DATABASE ERROR ---');
            console.error('Database schema is missing. The "admins" table was not found.');
            console.error('This means the database setup script was not run or failed.');
            console.error('ACTION REQUIRED: Please stop the server, delete the database.sqlite file,');
            console.error('and run "npm run db:setup" in the /backend directory to initialize it.\n\n');
            process.exit(1);
        }
    } catch (error) {
        console.error('Failed to verify database schema:', error);
        process.exit(1);
    }
};

/**
 * Generic function to find an account by ID and type.
 * @param {string} id - The account ID.
 * @param {'admins' | 'dealers' | 'users'} table - The table to search in.
 * @returns {object | null} The account object or null if not found.
 */
const findAccountById = (id, table) => {
    const stmt = db.prepare(`SELECT * FROM ${table} WHERE id = ?`);
    const account = stmt.get(id);
    if (!account) return null;

    try {
        // Attach ledger
        const ledgerStmt = db.prepare('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp ASC');
        account.ledger = ledgerStmt.all(id);

        // Parse JSON fields safely
        if (account.prizeRates && typeof account.prizeRates === 'string') {
            account.prizeRates = JSON.parse(account.prizeRates);
        }
        if (account.betLimits && typeof account.betLimits === 'string') {
            account.betLimits = JSON.parse(account.betLimits);
        }
        
        // Convert boolean
        if ('isRestricted' in account) {
            account.isRestricted = !!account.isRestricted;
        }
    } catch (e) {
        console.error(`Failed to parse data for account in table ${table} with id ${id}`, e);
        // Return account with raw data to avoid crashing the entire request
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
        if (account) {
            return { account, role: tableInfo.role };
        }
    }
    return { account: null, role: null };
};

const updatePassword = (accountId, contact, newPassword) => {
    const tables = ['users', 'dealers'];
    let updated = false;
    for (const table of tables) {
        const stmt = db.prepare(`UPDATE ${table} SET password = ? WHERE id = ? AND contact = ?`);
        const result = stmt.run(newPassword, accountId, contact);
        if (result.changes > 0) {
            updated = true;
            break;
        }
    }
    return updated;
};

const getLedgerForAccount = (accountId) => {
    return db.prepare('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp ASC').all(accountId);
};

const getAllFromTable = (table, withLedger = false) => {
    let accounts = db.prepare(`SELECT * FROM ${table}`).all();
    return accounts.map(acc => {
        try {
            if (withLedger && acc.id) {
                acc.ledger = getLedgerForAccount(acc.id);
            }
            if (acc.prizeRates && typeof acc.prizeRates === 'string') {
                acc.prizeRates = JSON.parse(acc.prizeRates);
            }
            if (acc.betLimits && typeof acc.betLimits === 'string') {
                acc.betLimits = JSON.parse(acc.betLimits);
            }
            if (table === 'bets' && acc.numbers && typeof acc.numbers === 'string') {
                acc.numbers = JSON.parse(acc.numbers);
            }
            if ('isRestricted' in acc) {
                acc.isRestricted = !!acc.isRestricted;
            }
        } catch (e) {
            console.error(`Failed to parse data for item in table ${table} with id ${acc.id}`, e);
        }
        return acc;
    });
};

const runInTransaction = (fn) => {
    db.transaction(fn)();
};

const addLedgerEntry = (accountId, accountType, description, debit, credit) => {
    const table = accountType.toLowerCase() + 's';
    
    const lastBalanceStmt = db.prepare('SELECT balance FROM ledgers WHERE accountId = ? ORDER BY timestamp DESC LIMIT 1');
    const lastEntry = lastBalanceStmt.get(accountId);
    const lastBalance = lastEntry ? lastEntry.balance : 0;

    // Robust check: Ensure non-admin accounts cannot have a negative balance.
    if (debit > 0 && accountType !== 'ADMIN' && lastBalance < debit) {
        throw { 
            status: 400, 
            message: `Insufficient funds. Wallet has ${lastBalance.toFixed(2)}, but transaction requires ${debit.toFixed(2)}.` 
        };
    }
    
    const newBalance = lastBalance - debit + credit;
    
    const insertLedgerStmt = db.prepare('INSERT INTO ledgers (id, accountId, accountType, timestamp, description, debit, credit, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    insertLedgerStmt.run(uuidv4(), accountId, accountType, new Date().toISOString(), description, debit, credit, newBalance);
    
    const updateWalletStmt = db.prepare(`UPDATE ${table} SET wallet = ? WHERE id = ?`);
    updateWalletStmt.run(newBalance, accountId);
};

const getFinancialSummary = () => {
    const games = db.prepare('SELECT * FROM games WHERE winningNumber IS NOT NULL').all();
    const allBets = db.prepare('SELECT * FROM bets').all().map(b => ({...b, numbers: JSON.parse(b.numbers)}));
    const allUsers = Object.fromEntries(getAllFromTable('users').map(u => [u.id, u]));
    const allDealers = Object.fromEntries(getAllFromTable('dealers').map(d => [d.id, d]));

    const getPrizeMultiplier = (rates, subGameType) => {
        if (subGameType === "1 Digit Open") return rates.oneDigitOpen;
        if (subGameType === "1 Digit Close") return rates.oneDigitClose;
        return rates.twoDigit;
    };

    const summaryByGame = games.map(game => {
        const gameBets = allBets.filter(b => b.gameId === game.id);
        const totalStake = gameBets.reduce((sum, b) => sum + b.totalAmount, 0);

        let totalPayouts = 0;
        let totalDealerProfit = 0;

        gameBets.forEach(bet => {
            const winningNumbersInBet = bet.numbers.filter(num => {
                switch (bet.subGameType) {
                    case "1 Digit Open": return num === game.winningNumber[0];
                    case "1 Digit Close": return num === game.winningNumber[1];
                    default: return num === game.winningNumber;
                }
            });

            if (winningNumbersInBet.length > 0) {
                const user = allUsers[bet.userId];
                const dealer = allDealers[bet.dealerId];
                if (!user || !dealer) return;

                const userPrize = winningNumbersInBet.length * bet.amountPerNumber * getPrizeMultiplier(user.prizeRates, bet.subGameType);
                const dealerProfit = winningNumbersInBet.length * bet.amountPerNumber * (getPrizeMultiplier(dealer.prizeRates, bet.subGameType) - getPrizeMultiplier(user.prizeRates, bet.subGameType));
                
                totalPayouts += userPrize;
                totalDealerProfit += dealerProfit;
            }
        });
        
        const totalCommissions = gameBets.reduce((sum, bet) => {
            const user = allUsers[bet.userId];
            const dealer = allDealers[bet.dealerId];
            if (!user || !dealer) return sum;

            const userCommission = bet.totalAmount * (user.commissionRate / 100);
            const dealerCommission = bet.totalAmount * ((dealer.commissionRate - user.commissionRate) / 100);
            return sum + userCommission + dealerCommission;
        }, 0);
        
        const netProfit = totalStake - totalPayouts - totalDealerProfit - totalCommissions;

        return {
            gameName: game.name,
            winningNumber: game.winningNumber,
            totalStake,
            totalPayouts,
            totalDealerProfit,
            totalCommissions,
            netProfit,
        };
    });

    const grandTotal = summaryByGame.reduce((totals, game) => {
        totals.totalStake += game.totalStake;
        totals.totalPayouts += game.totalPayouts;
        totals.totalDealerProfit += game.totalDealerProfit;
        totals.totalCommissions += game.totalCommissions;
        totals.netProfit += game.netProfit;
        return totals;
    }, { totalStake: 0, totalPayouts: 0, totalDealerProfit: 0, totalCommissions: 0, netProfit: 0 });

    return {
        games: summaryByGame.sort((a,b) => a.gameName.localeCompare(b.gameName)),
        totals: grandTotal,
        totalBets: allBets.length,
    };
};

const createDealer = (dealerData) => {
    const existing = db.prepare('SELECT id FROM dealers WHERE lower(id) = ?').get(dealerData.id.toLowerCase());
    if (existing) {
        throw { status: 400, message: "This Dealer Login ID is already taken." };
    }
    const initialAmount = dealerData.wallet || 0;
    db.prepare('INSERT INTO dealers (id, name, password, area, contact, wallet, commissionRate, isRestricted, prizeRates, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(dealerData.id, dealerData.name, dealerData.password, dealerData.area, dealerData.contact, 0, dealerData.commissionRate, 0, JSON.stringify(dealerData.prizeRates), dealerData.avatarUrl);

    addLedgerEntry(dealerData.id, 'DEALER', initialAmount > 0 ? 'Initial Deposit' : 'Account Created', 0, initialAmount);
    return findAccountById(dealerData.id, 'dealers');
};

const updateDealer = (dealerData, originalId) => {
    const dealer = db.prepare('SELECT * FROM dealers WHERE id = ?').get(originalId);
    if (!dealer) {
        throw { status: 404, message: 'Dealer not found.' };
    }
    const idChanged = dealerData.id !== originalId;
    if (idChanged) {
        const existing = db.prepare('SELECT id FROM dealers WHERE lower(id) = ?').get(dealerData.id.toLowerCase());
        if (existing) {
            throw { status: 400, message: 'Dealer Login ID already taken.' };
        }
    }
    const updatedDealer = { ...dealer, ...dealerData };
    db.prepare('UPDATE dealers SET id = ?, name = ?, password = ?, area = ?, contact = ?, commissionRate = ?, prizeRates = ?, avatarUrl = ? WHERE id = ?')
        .run(updatedDealer.id, updatedDealer.name, updatedDealer.password, updatedDealer.area, updatedDealer.contact, updatedDealer.commissionRate, JSON.stringify(updatedDealer.prizeRates), updatedDealer.avatarUrl, originalId);
    if (idChanged) {
        db.prepare('UPDATE users SET dealerId = ? WHERE dealerId = ?').run(updatedDealer.id, originalId);
    }
    return findAccountById(updatedDealer.id, 'dealers');
};

const createUser = (userData, dealerId, initialDeposit) => {
    const dealer = findAccountById(dealerId, 'dealers');
    if (!dealer) throw { status: 404, message: 'Dealer not found.' };

    const existingUser = db.prepare('SELECT id FROM users WHERE lower(id) = ?').get(userData.id.toLowerCase());
    if (existingUser) throw { status: 400, message: "This User Login ID is already taken." };

    if (initialDeposit > 0 && dealer.wallet < initialDeposit) {
        throw { status: 400, message: `Insufficient funds for initial deposit. Available: ${dealer.wallet}` };
    }
    // SECURE CHANGE: Force the dealerId from the authenticated session, ignoring any value in userData
    const newUser = { ...userData, dealerId: dealerId, wallet: 0, isRestricted: 0 };
    db.prepare('INSERT INTO users (id, name, password, dealerId, area, contact, wallet, commissionRate, isRestricted, prizeRates, betLimits, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(newUser.id, newUser.name, newUser.password, newUser.dealerId, newUser.area, newUser.contact, 0, newUser.commissionRate, 0, JSON.stringify(newUser.prizeRates), newUser.betLimits ? JSON.stringify(newUser.betLimits) : null, newUser.avatarUrl);

    if (initialDeposit > 0) {
        addLedgerEntry(dealer.id, 'DEALER', `Initial Deposit for new user: ${newUser.name}`, initialDeposit, 0);
        addLedgerEntry(newUser.id, 'USER', `Initial Deposit from Dealer: ${dealer.name}`, 0, initialDeposit);
    } else {
        addLedgerEntry(newUser.id, 'USER', 'Account Created', 0, 0);
    }
    return findAccountById(newUser.id, 'users');
};

const updateUser = (userData, userId, dealerId) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND dealerId = ?').get(userId, dealerId);
    if (!user) throw { status: 404, message: "User not found or you don't have permission." };

    const updatedUser = { ...user, ...userData };
    const stmt = db.prepare('UPDATE users SET name = ?, password = ?, area = ?, contact = ?, commissionRate = ?, prizeRates = ?, betLimits = ?, avatarUrl = ? WHERE id = ?');
    stmt.run(updatedUser.name, updatedUser.password, updatedUser.area, updatedUser.contact, updatedUser.commissionRate, JSON.stringify(updatedUser.prizeRates), updatedUser.betLimits ? JSON.stringify(updatedUser.betLimits) : null, updatedUser.avatarUrl, userId);

    return findAccountById(userId, 'users');
};

const findUserByDealer = (userId, dealerId) => {
     const user = db.prepare('SELECT * FROM users WHERE id = ? AND dealerId = ?').get(userId, dealerId);
     return user;
}

const toggleUserRestrictionByDealer = (userId, dealerId) => {
    const user = db.prepare('SELECT isRestricted FROM users WHERE id = ? AND dealerId = ?').get(userId, dealerId);
    if (!user) throw { status: 404, message: 'User not found or you do not have permission.' };
    
    const newStatus = !user.isRestricted;
    db.prepare('UPDATE users SET isRestricted = ? WHERE id = ?').run(newStatus ? 1 : 0, userId);
    
    return findAccountById(userId, 'users');
};

const toggleAccountRestrictionByAdmin = (accountId, accountType) => {
    const table = accountType === 'user' ? 'users' : 'dealers';
    const account = db.prepare(`SELECT isRestricted FROM ${table} WHERE id = ?`).get(accountId);
    if (!account) throw { status: 404, message: 'Account not found.' };
    
    const newStatus = !account.isRestricted;
    db.prepare(`UPDATE ${table} SET isRestricted = ? WHERE id = ?`).run(newStatus ? 1 : 0, accountId);
    
    return findAccountById(accountId, table);
};


// New functions to abstract direct DB access from server.js
const findUsersByDealerId = (dealerId) => {
    const users = db.prepare('SELECT * FROM users WHERE dealerId = ?').all(dealerId);
    return users.map(u => {
        try {
            u.prizeRates = JSON.parse(u.prizeRates);
            if (u.betLimits && typeof u.betLimits === 'string') {
                u.betLimits = JSON.parse(u.betLimits);
            }
            u.isRestricted = !!u.isRestricted;
            u.ledger = getLedgerForAccount(u.id);
        } catch (e) {
            console.error(`Failed to parse data for user with id ${u.id}`, e);
        }
        return u;
    });
};

const createBet = (bet) => {
    return db.prepare('INSERT INTO bets (id, userId, dealerId, gameId, subGameType, numbers, amountPerNumber, totalAmount, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        bet.id, bet.userId, bet.dealerId, bet.gameId, bet.subGameType, bet.numbers, bet.amountPerNumber, bet.totalAmount, bet.timestamp
    );
};

const declareWinnerForGame = (gameId, winningNumber) => {
    const result = db.prepare('UPDATE games SET winningNumber = ?, payoutsApproved = 0 WHERE id = ?').run(winningNumber, gameId);
    if (result.changes === 0) return null;
    return db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
};

const updateWinningNumber = (gameId, newWinningNumber) => {
    const game = db.prepare('SELECT payoutsApproved FROM games WHERE id = ?').get(gameId);
    if (!game) {
        throw { status: 404, message: 'Game not found.' };
    }
    if (game.payoutsApproved) {
        throw { status: 403, message: 'Cannot edit winning number after payouts have been approved.' };
    }
    const result = db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(newWinningNumber, gameId);
    if (result.changes === 0) return null; // Or throw an error if no changes were made
    return db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
};


const approvePayoutsForGame = (gameId) => {
    let updatedGame = null;
    db.transaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
        if (!game || !game.winningNumber || game.payoutsApproved) {
            throw { status: 400, message: 'Game not ready for payout.' };
        }

        const gameBets = db.prepare('SELECT * FROM bets WHERE gameId = ?').all(game.id);
        
        gameBets.forEach(bet => {
            const numbers = JSON.parse(bet.numbers);
            const winningNumbersInBet = numbers.filter(num => {
                switch (bet.subGameType) {
                    case "1 Digit Open": return num === game.winningNumber[0];
                    case "1 Digit Close": return num === game.winningNumber[1];
                    default: return num === game.winningNumber;
                }
            });

            if (winningNumbersInBet.length > 0) {
                const user = findAccountById(bet.userId, 'users');
                const dealer = findAccountById(bet.dealerId, 'dealers');
                if (!user || !dealer) return;

                const getPrizeMultiplier = (rates, subGameType) => {
                    if (subGameType === "1 Digit Open") return rates.oneDigitOpen;
                    if (subGameType === "1 Digit Close") return rates.oneDigitClose;
                    return rates.twoDigit;
                };

                const userPrize = winningNumbersInBet.length * bet.amountPerNumber * getPrizeMultiplier(user.prizeRates, bet.subGameType);
                const dealerProfit = winningNumbersInBet.length * bet.amountPerNumber * (getPrizeMultiplier(dealer.prizeRates, bet.subGameType) - getPrizeMultiplier(user.prizeRates, bet.subGameType));
                
                if (userPrize > 0) {
                    addLedgerEntry('Guru', 'ADMIN', `Payout to user ${user.name}`, userPrize, 0);
                    addLedgerEntry(user.id, 'USER', `Prize Won - ${game.name}`, 0, userPrize);
                }
                if (dealerProfit > 0) {
                    addLedgerEntry('Guru', 'ADMIN', `Profit to dealer ${dealer.name}`, dealerProfit, 0);
                    addLedgerEntry(dealer.id, 'DEALER', `Profit from User Prize - ${game.name}`, 0, dealerProfit);
                }
            }
        });

        db.prepare('UPDATE games SET payoutsApproved = 1 WHERE id = ?').run(game.id);
        updatedGame = db.prepare('SELECT * FROM games WHERE id = ?').get(game.id);
    })();
    return updatedGame;
};


module.exports = {
    connect,
    verifySchema,
    findAccountById,
    findAccountForLogin,
    updatePassword,
    getLedgerForAccount,
    getAllFromTable,
    runInTransaction,
    addLedgerEntry,
    getFinancialSummary,
    createDealer,
    updateDealer,
    createUser,
    updateUser,
    findUserByDealer,
    toggleUserRestrictionByDealer,
    toggleAccountRestrictionByAdmin,
    findUsersByDealerId,
    createBet,
    declareWinnerForGame,
    updateWinningNumber,
    approvePayoutsForGame,
};