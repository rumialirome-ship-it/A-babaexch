
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'database.sqlite');
const SEED_DATA_PATH = path.join(__dirname, 'db.json');

function main() {
    if (fs.existsSync(DB_PATH)) {
        console.log("Database already exists. Skipping initialization.");
        return;
    }
    
    const db = new Database(DB_PATH);
    
    db.exec(`
        CREATE TABLE admins (id TEXT PRIMARY KEY, name TEXT, password TEXT, wallet REAL, prizeRates TEXT, avatarUrl TEXT);
        CREATE TABLE dealers (id TEXT PRIMARY KEY, name TEXT, password TEXT, area TEXT, contact TEXT, wallet REAL, commissionRate REAL, isRestricted INTEGER DEFAULT 0, prizeRates TEXT, avatarUrl TEXT);
        CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, password TEXT, dealerId TEXT, area TEXT, contact TEXT, wallet REAL, commissionRate REAL, isRestricted INTEGER DEFAULT 0, prizeRates TEXT, betLimits TEXT, avatarUrl TEXT);
        CREATE TABLE games (id TEXT PRIMARY KEY, name TEXT, drawTime TEXT, winningNumber TEXT, payoutsApproved INTEGER DEFAULT 0);
        CREATE TABLE bets (id TEXT PRIMARY KEY, userId TEXT, dealerId TEXT, gameId TEXT, subGameType TEXT, numbers TEXT, amountPerNumber REAL, totalAmount REAL, timestamp TEXT);
        CREATE TABLE ledgers (id TEXT PRIMARY KEY, accountId TEXT, accountType TEXT, timestamp TEXT, description TEXT, debit REAL, credit REAL, balance REAL);
        CREATE TABLE daily_results (id TEXT PRIMARY KEY, gameId TEXT, date TEXT, winningNumber TEXT, UNIQUE(gameId, date));
        CREATE TABLE number_limits (id INTEGER PRIMARY KEY AUTOINCREMENT, gameType TEXT NOT NULL, numberValue TEXT NOT NULL, limitAmount REAL NOT NULL, UNIQUE(gameType, numberValue));

        -- PERFORMANCE INDICES --
        CREATE INDEX idx_bets_performance ON bets (gameId, timestamp);
        CREATE INDEX idx_ledgers_fast_sync ON ledgers (accountId, timestamp DESC);
        CREATE INDEX idx_users_dealer ON users (dealerId);
    `);
    
    console.log("Tables created. Seeding initial data...");

    if (fs.existsSync(SEED_DATA_PATH)) {
        const seedData = JSON.parse(fs.readFileSync(SEED_DATA_PATH, 'utf8'));

        // Seed Admin
        const insertAdmin = db.prepare('INSERT INTO admins (id, name, password, wallet, prizeRates, avatarUrl) VALUES (?, ?, ?, ?, ?, ?)');
        insertAdmin.run(seedData.admin.id, seedData.admin.name, seedData.admin.password, seedData.admin.wallet, JSON.stringify(seedData.admin.prizeRates), seedData.admin.avatarUrl);

        // Seed Games
        const insertGame = db.prepare('INSERT INTO games (id, name, drawTime) VALUES (?, ?, ?)');
        seedData.games.forEach(game => {
            insertGame.run(game.id, game.name, game.drawTime);
        });

        // Seed Dealers
        const insertDealer = db.prepare('INSERT INTO dealers (id, name, password, area, contact, wallet, commissionRate, prizeRates, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        seedData.dealers.forEach(dealer => {
            insertDealer.run(dealer.id, dealer.name, dealer.password, dealer.area, dealer.contact, dealer.wallet, dealer.commissionRate, JSON.stringify(dealer.prizeRates), dealer.avatarUrl);
        });

        // Seed Users
        const insertUser = db.prepare('INSERT INTO users (id, name, password, dealerId, area, contact, wallet, commissionRate, prizeRates, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        seedData.users.forEach(user => {
            insertUser.run(user.id, user.name, user.password, user.dealerId, user.area, user.contact, user.wallet, user.commissionRate, JSON.stringify(user.prizeRates), user.avatarUrl);
        });

        console.log("Initial data seeded successfully.");
    } else {
        console.warn("db.json not found. Database initialized but empty.");
    }

    db.close();
}
main();
