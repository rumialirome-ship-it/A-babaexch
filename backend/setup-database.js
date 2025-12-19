
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'database.sqlite');
const SEED_FILE = path.join(__dirname, 'db.json');

function main() {
    console.log("--- A-Baba Database Restoration System ---");

    // Force a fresh start by deleting the old DB file if it exists
    if (fs.existsSync(DB_PATH)) {
        console.log("Removing old database for clean restore...");
        fs.unlinkSync(DB_PATH);
    }

    const db = new Database(DB_PATH);
    console.log("Creating fresh tables...");

    db.exec(`
        CREATE TABLE admins (id TEXT PRIMARY KEY, name TEXT, password TEXT, wallet REAL, prizeRates TEXT, avatarUrl TEXT);
        CREATE TABLE dealers (id TEXT PRIMARY KEY, name TEXT, password TEXT, area TEXT, contact TEXT, wallet REAL, commissionRate REAL, isRestricted INTEGER DEFAULT 0, prizeRates TEXT, avatarUrl TEXT);
        CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, password TEXT, dealerId TEXT, area TEXT, contact TEXT, wallet REAL, commissionRate REAL, isRestricted INTEGER DEFAULT 0, prizeRates TEXT, betLimits TEXT, avatarUrl TEXT);
        CREATE TABLE games (id TEXT PRIMARY KEY, name TEXT, drawTime TEXT, winningNumber TEXT, payoutsApproved INTEGER DEFAULT 0);
        CREATE TABLE bets (id TEXT PRIMARY KEY, userId TEXT, dealerId TEXT, gameId TEXT, subGameType TEXT, numbers TEXT, amountPerNumber REAL, totalAmount REAL, timestamp TEXT);
        CREATE TABLE ledgers (id TEXT PRIMARY KEY, accountId TEXT, accountType TEXT, timestamp TEXT, description TEXT, debit REAL, credit REAL, balance REAL);
        CREATE TABLE number_limits (id INTEGER PRIMARY KEY AUTOINCREMENT, gameType TEXT NOT NULL, numberValue TEXT NOT NULL, limitAmount REAL NOT NULL, UNIQUE(gameType, numberValue));
    `);

    if (fs.existsSync(SEED_FILE)) {
        console.log("Seeding data from db.json...");
        const data = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));

        // Seed Admin
        const insAdmin = db.prepare('INSERT INTO admins (id, name, password, wallet, prizeRates, avatarUrl) VALUES (?, ?, ?, ?, ?, ?)');
        insAdmin.run(data.admin.id, data.admin.name, data.admin.password, data.admin.wallet, JSON.stringify(data.admin.prizeRates), data.admin.avatarUrl);

        // Seed Games (The reason they weren't showing)
        const insGame = db.prepare('INSERT INTO games (id, name, drawTime) VALUES (?, ?, ?)');
        data.games.forEach(g => insGame.run(g.id, g.name, g.drawTime));

        // Seed Dealers
        const insDealer = db.prepare('INSERT INTO dealers (id, name, password, area, contact, wallet, commissionRate, prizeRates, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        data.dealers.forEach(d => insDealer.run(d.id, d.name, d.password, d.area, d.contact, d.wallet, d.commissionRate, JSON.stringify(d.prizeRates), d.avatarUrl));

        // Seed Users
        const insUser = db.prepare('INSERT INTO users (id, name, password, dealerId, area, contact, wallet, commissionRate, prizeRates, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        data.users.forEach(u => insUser.run(u.id, u.name, u.password, u.dealerId, u.area, u.contact, u.wallet, u.commissionRate, JSON.stringify(u.prizeRates), u.avatarUrl));

        console.log("Restoration successful. Seed data loaded.");
    } else {
        console.error("CRITICAL: db.json not found. Database is empty!");
    }

    db.close();
}
main();
