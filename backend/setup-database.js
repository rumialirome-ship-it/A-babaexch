
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'database.sqlite');

// Remove old DB if exists to ensure clean start
if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
}

const db = new sqlite3.Database(dbPath);

console.log("INITIALIZING PKT STANDARDIZED SQLITE ENGINE...");

db.serialize(() => {
    // Create Tables
    db.run(`CREATE TABLE admins (
        id TEXT PRIMARY KEY, 
        name TEXT NOT NULL, 
        password TEXT NOT NULL, 
        wallet REAL DEFAULT 0, 
        prizeRates TEXT
    )`);

    db.run(`CREATE TABLE dealers (
        id TEXT PRIMARY KEY, 
        name TEXT NOT NULL, 
        password TEXT NOT NULL, 
        area TEXT, 
        contact TEXT, 
        wallet REAL DEFAULT 0, 
        commissionRate REAL DEFAULT 0, 
        isRestricted INTEGER DEFAULT 0, 
        prizeRates TEXT
    )`);

    db.run(`CREATE TABLE users (
        id TEXT PRIMARY KEY, 
        name TEXT NOT NULL, 
        password TEXT NOT NULL, 
        dealerId TEXT, 
        area TEXT, 
        contact TEXT, 
        wallet REAL DEFAULT 0, 
        isRestricted INTEGER DEFAULT 0, 
        prizeRates TEXT, 
        betLimits TEXT,
        FOREIGN KEY(dealerId) REFERENCES dealers(id)
    )`);

    db.run(`CREATE TABLE games (
        id TEXT PRIMARY KEY, 
        name TEXT NOT NULL, 
        drawTime TEXT NOT NULL, 
        winningNumber TEXT, 
        isMarketOpen INTEGER DEFAULT 1
    )`);

    db.run(`CREATE TABLE ledgers (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        accountId TEXT NOT NULL, 
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, 
        description TEXT NOT NULL, 
        debit REAL DEFAULT 0, 
        credit REAL DEFAULT 0, 
        balance REAL DEFAULT 0
    )`);

    db.run(`CREATE TABLE bets (
        id TEXT PRIMARY KEY,
        userId TEXT,
        dealerId TEXT,
        gameId TEXT,
        subGameType TEXT,
        numbers TEXT,
        amountPerNumber REAL,
        totalAmount REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(userId) REFERENCES users(id),
        FOREIGN KEY(dealerId) REFERENCES dealers(id),
        FOREIGN KEY(gameId) REFERENCES games(id)
    )`);

    // Seed Data
    const adminPrizeRates = JSON.stringify({ oneDigitOpen: 90, oneDigitClose: 90, twoDigit: 900 });
    db.run(`INSERT INTO admins (id, name, password, wallet, prizeRates) 
            VALUES ('Guru', 'Guru', 'Pak@4646', 1000000, ?)`, [adminPrizeRates]);

    const games = [
        ['g1', 'Ali Baba', '18:15'], ['g2', 'GSM', '18:45'], ['g3', 'OYO TV', '20:15'],
        ['g4', 'LS1', '20:45'], ['g5', 'OLA TV', '21:15'], ['g6', 'AK', '21:55'],
        ['g7', 'LS2', '23:45'], ['g8', 'AKC', '00:55'], ['g9', 'LS3', '02:10'], ['g10', 'LS4', '03:10']
    ];
    const gameStmt = db.prepare(`INSERT INTO games (id, name, drawTime) VALUES (?, ?, ?)`);
    games.forEach(g => gameStmt.run(g));
    gameStmt.finalize();

    const dealerPrizeRates = JSON.stringify({ oneDigitOpen: 80, oneDigitClose: 80, twoDigit: 800 });
    db.run(`INSERT INTO dealers (id, name, password, area, contact, wallet, commissionRate, prizeRates)
            VALUES ('dealer01', 'ABD-001', 'Pak@123', 'KHI', '03323022123', 50000, 10, ?)`, [dealerPrizeRates]);

    console.log("----------------------------------------");
    console.log("SQLITE PKT SCHEMA DEPLOYED SUCCESSFULLY");
    console.log("----------------------------------------");
});

db.close();
