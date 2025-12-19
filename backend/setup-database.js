
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'database.sqlite');

function main() {
    if (fs.existsSync(DB_PATH)) return;
    const db = new Database(DB_PATH);
    
    db.exec(`
        CREATE TABLE admins (id TEXT PRIMARY KEY, name TEXT, password TEXT, wallet REAL, prizeRates TEXT, avatarUrl TEXT);
        CREATE TABLE dealers (id TEXT PRIMARY KEY, name TEXT, password TEXT, area TEXT, contact TEXT, wallet REAL, commissionRate REAL, isRestricted INTEGER DEFAULT 0, prizeRates TEXT, avatarUrl TEXT);
        CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, password TEXT, dealerId TEXT, area TEXT, contact TEXT, wallet REAL, commissionRate REAL, isRestricted INTEGER DEFAULT 0, prizeRates TEXT, betLimits TEXT, avatarUrl TEXT);
        CREATE TABLE games (id TEXT PRIMARY KEY, name TEXT, drawTime TEXT, winningNumber TEXT, payoutsApproved INTEGER DEFAULT 0);
        CREATE TABLE bets (id TEXT PRIMARY KEY, userId TEXT, dealerId TEXT, gameId TEXT, subGameType TEXT, numbers TEXT, amountPerNumber REAL, totalAmount REAL, timestamp TEXT);
        CREATE TABLE ledgers (id TEXT PRIMARY KEY, accountId TEXT, accountType TEXT, timestamp TEXT, description TEXT, debit REAL, credit REAL, balance REAL);
        CREATE TABLE daily_results (id TEXT PRIMARY KEY, gameId TEXT, date TEXT, winningNumber TEXT, UNIQUE(gameId, date));

        -- PERFORMANCE INDICES --
        CREATE INDEX idx_bets_performance ON bets (gameId, timestamp);
        CREATE INDEX idx_ledgers_fast_sync ON ledgers (accountId, timestamp DESC);
        CREATE INDEX idx_users_dealer ON users (dealerId);
    `);
    
    console.log("Database initialized with scale-ready indices.");
    db.close();
}
main();
