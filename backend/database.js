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
    db, // Export db for complex transactions
};