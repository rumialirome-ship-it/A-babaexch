
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'database.sqlite');
const SEED_FILE = path.join(__dirname, 'db.json');

function main() {
    console.log("--- A-Baba Exchange: Database Wipe & Restore ---");

    // 1. Force a complete wipe of the old database file
    if (fs.existsSync(DB_PATH)) {
        console.log("Found existing database file. Deleting for full restoration...");
        try {
            fs.unlinkSync(DB_PATH);
            console.log("Successfully wiped existing database.sqlite");
        } catch (err) {
            console.error("FATAL: Could not delete database file. It is likely locked by PM2.");
            console.error("FIX: Run 'pm2 stop all' and then run this script again.");
            process.exit(1);
        }
    }

    // 2. Open fresh connection
    let db;
    try {
        db = new Database(DB_PATH);
        console.log("Created fresh database.sqlite container.");
    } catch (e) {
        console.error("FATAL: Could not create database. Check your Node/better-sqlite3 versions.");
        console.error(e.message);
        process.exit(1);
    }

    // 3. Re-create Tables
    console.log("Applying schema...");
    db.exec(`
        CREATE TABLE admins (
            id TEXT PRIMARY KEY, 
            name TEXT NOT NULL, 
            password TEXT NOT NULL, 
            wallet REAL DEFAULT 0, 
            prizeRates TEXT, 
            avatarUrl TEXT
        );

        CREATE TABLE dealers (
            id TEXT PRIMARY KEY, 
            name TEXT NOT NULL, 
            password TEXT NOT NULL, 
            area TEXT, 
            contact TEXT, 
            wallet REAL DEFAULT 0, 
            commissionRate REAL DEFAULT 0, 
            isRestricted INTEGER DEFAULT 0, 
            prizeRates TEXT, 
            avatarUrl TEXT
        );

        CREATE TABLE users (
            id TEXT PRIMARY KEY, 
            name TEXT NOT NULL, 
            password TEXT NOT NULL, 
            dealerId TEXT NOT NULL, 
            area TEXT, 
            contact TEXT, 
            wallet REAL DEFAULT 0, 
            commissionRate REAL DEFAULT 0, 
            isRestricted INTEGER DEFAULT 0, 
            prizeRates TEXT, 
            betLimits TEXT, 
            avatarUrl TEXT,
            FOREIGN KEY (dealerId) REFERENCES dealers(id)
        );

        CREATE TABLE games (
            id TEXT PRIMARY KEY, 
            name TEXT NOT NULL, 
            drawTime TEXT NOT NULL, 
            winningNumber TEXT, 
            payoutsApproved INTEGER DEFAULT 0
        );

        CREATE TABLE bets (
            id TEXT PRIMARY KEY, 
            userId TEXT NOT NULL, 
            dealerId TEXT NOT NULL, 
            gameId TEXT NOT NULL, 
            subGameType TEXT NOT NULL, 
            numbers TEXT NOT NULL, 
            amountPerNumber REAL NOT NULL, 
            totalAmount REAL NOT NULL, 
            timestamp TEXT NOT NULL,
            FOREIGN KEY (userId) REFERENCES users(id),
            FOREIGN KEY (dealerId) REFERENCES dealers(id),
            FOREIGN KEY (gameId) REFERENCES games(id)
        );

        CREATE TABLE ledgers (
            id TEXT PRIMARY KEY, 
            accountId TEXT NOT NULL, 
            accountType TEXT NOT NULL, 
            timestamp TEXT NOT NULL, 
            description TEXT NOT NULL, 
            debit REAL DEFAULT 0, 
            credit REAL DEFAULT 0, 
            balance REAL DEFAULT 0
        );

        CREATE TABLE number_limits (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            gameType TEXT NOT NULL, 
            numberValue TEXT NOT NULL, 
            limitAmount REAL NOT NULL, 
            UNIQUE(gameType, numberValue)
        );
    `);
    console.log("Tables created successfully.");

    // 4. Seed Data from db.json
    if (fs.existsSync(SEED_FILE)) {
        console.log(`Seeding data from ${SEED_FILE}...`);
        const data = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));

        db.transaction(() => {
            // Admin
            const insAdmin = db.prepare('INSERT INTO admins (id, name, password, wallet, prizeRates, avatarUrl) VALUES (?, ?, ?, ?, ?, ?)');
            insAdmin.run(data.admin.id, data.admin.name, data.admin.password, data.admin.wallet, JSON.stringify(data.admin.prizeRates), data.admin.avatarUrl);

            // Games
            const insGame = db.prepare('INSERT INTO games (id, name, drawTime) VALUES (?, ?, ?)');
            data.games.forEach(g => {
                insGame.run(g.id, g.name, g.drawTime);
            });
            console.log(`Successfully imported ${data.games.length} games.`);

            // Dealers
            const insDealer = db.prepare('INSERT INTO dealers (id, name, password, area, contact, wallet, commissionRate, prizeRates, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
            data.dealers.forEach(d => {
                insDealer.run(d.id, d.name, d.password, d.area, d.contact, d.wallet, d.commissionRate, JSON.stringify(d.prizeRates), d.avatarUrl);
            });

            // Users
            const insUser = db.prepare('INSERT INTO users (id, name, password, dealerId, area, contact, wallet, commissionRate, prizeRates, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            data.users.forEach(u => {
                insUser.run(u.id, u.name, u.password, u.dealerId, u.area, u.contact, u.wallet, u.commissionRate, JSON.stringify(u.prizeRates), u.avatarUrl);
            });

            // Admin Ledger
            const insLedger = db.prepare('INSERT INTO ledgers (id, accountId, accountType, timestamp, description, debit, credit, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
            if (data.admin.ledger) {
                data.admin.ledger.forEach(l => {
                    insLedger.run(l.id, data.admin.id, 'ADMIN', l.timestamp, l.description, l.debit, l.credit, l.balance);
                });
            }
        })();

        console.log("--- RESTORATION COMPLETE ---");
    } else {
        console.error("WARNING: Seed file (db.json) missing. Database is empty.");
    }

    db.close();
    console.log("SUCCESS: Database is ready. Restart backend with: pm2 restart ababa-backend");
}

main();
