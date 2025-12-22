
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
    if (!table) process.exit(1);
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
        if (acc.prizeRates) acc.prizeRates = JSON.parse(acc.prizeRates);
        if (acc.betLimits) acc.betLimits = JSON.parse(acc.betLimits);
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
    if (debit > 0 && accountType !== 'ADMIN' && lastBalance < debit) throw { status: 400, message: 'Insufficient funds.' };
    const newBalance = lastBalance - debit + credit;
    db.prepare('INSERT INTO ledgers (id, accountId, accountType, timestamp, description, debit, credit, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), accountId, accountType, new Date().toISOString(), description, debit, credit, newBalance);
    db.prepare(`UPDATE ${table} SET wallet = ? WHERE id = ?`).run(newBalance, accountId);
};

const createUser = (userData, dealerId, initialDeposit) => {
    const dealer = findAccountById(dealerId, 'dealers');
    if (dealer.wallet < initialDeposit) throw { status: 400, message: "Dealer insufficient balance." };
    
    db.prepare('INSERT INTO users (id, name, password, dealerId, area, contact, wallet, commissionRate, isRestricted, prizeRates, betLimits, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(userData.id, userData.name, userData.password, dealerId, userData.area, userData.contact, 0, userData.commissionRate, 0, JSON.stringify(userData.prizeRates), JSON.stringify(userData.betLimits), userData.avatarUrl);
    
    if (initialDeposit > 0) {
        addLedgerEntry(dealerId, 'DEALER', `Initial Load for User: ${userData.name}`, initialDeposit, 0);
        addLedgerEntry(userData.id, 'USER', 'Initial Deposit from Dealer', 0, initialDeposit);
    }
    return findAccountById(userData.id, 'users');
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
    toggleUserRestrictionByDealer: (id, dealerId) => {
        db.prepare('UPDATE users SET isRestricted = 1 - isRestricted WHERE id = ? AND dealerId = ?').run(id, dealerId);
        return findAccountById(id, 'users');
    }
};
