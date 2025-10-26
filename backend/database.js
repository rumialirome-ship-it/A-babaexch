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
    db, // Export db for complex transactions
};