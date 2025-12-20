
const fs = require('fs');
const path = require('path');

/**
 * NUCLEAR SQL RECREATOR
 * Wipes all SQL data and regenerates the schema from scratch.
 */
function rebuild() {
    console.log("==================================================");
    console.log("   A-BABA EXCHANGE: SQL RENEWAL & RECREATOR   ");
    console.log("==================================================");

    const DB_PATH = path.join(__dirname, 'database.sqlite');
    const SEED_FILE = path.join(__dirname, 'db.json');

    // 1. Force wipe all database artifacts
    const targets = [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm', DB_PATH + '-journal'];
    
    console.log("[1/4] Destroying existing SQL artifacts...");
    targets.forEach(t => {
        if (fs.existsSync(t)) {
            try {
                fs.unlinkSync(t);
                console.log(`      WIPED: ${path.basename(t)}`);
            } catch (err) {
                console.error(`      ERROR: Cannot delete ${path.basename(t)}. Stop PM2 first.`);
                process.exit(1);
            }
        }
    });

    // 2. Load driver (Check for binary mismatch here)
    let Database;
    try {
        Database = require('better-sqlite3');
    } catch (err) {
        console.error("[2/4] FATAL: SQL Driver is broken (Binary Mismatch).");
        console.error("      ERROR: " + err.message);
        console.error("      FIX: Run 'rm -rf node_modules && npm install' now.");
        process.exit(1);
    }

    // 3. Rebuild Schema
    let db;
    try {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        console.log("[2/4] Initialized fresh SQL instance.");

        console.log("[3/4] Recreating tables and relations...");
        db.exec(`
            CREATE TABLE admins (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, password TEXT NOT NULL, 
                wallet REAL DEFAULT 0, prizeRates TEXT, avatarUrl TEXT
            );
            CREATE TABLE dealers (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, password TEXT NOT NULL, 
                area TEXT, contact TEXT, wallet REAL DEFAULT 0, commissionRate REAL DEFAULT 0, 
                isRestricted INTEGER DEFAULT 0, prizeRates TEXT, avatarUrl TEXT
            );
            CREATE TABLE users (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, password TEXT NOT NULL, 
                dealerId TEXT NOT NULL, area TEXT, contact TEXT, wallet REAL DEFAULT 0, 
                commissionRate REAL DEFAULT 0, isRestricted INTEGER DEFAULT 0, 
                prizeRates TEXT, betLimits TEXT, avatarUrl TEXT,
                FOREIGN KEY (dealerId) REFERENCES dealers(id)
            );
            CREATE TABLE games (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, drawTime TEXT NOT NULL, 
                winningNumber TEXT, payoutsApproved INTEGER DEFAULT 0
            );
            CREATE TABLE bets (
                id TEXT PRIMARY KEY, userId TEXT NOT NULL, dealerId TEXT NOT NULL, 
                gameId TEXT NOT NULL, subGameType TEXT NOT NULL, numbers TEXT NOT NULL, 
                amountPerNumber REAL NOT NULL, totalAmount REAL NOT NULL, timestamp TEXT NOT NULL,
                FOREIGN KEY (userId) REFERENCES users(id),
                FOREIGN KEY (dealerId) REFERENCES dealers(id),
                FOREIGN KEY (gameId) REFERENCES games(id)
            );
            CREATE TABLE ledgers (
                id TEXT PRIMARY KEY, accountId TEXT NOT NULL, accountType TEXT NOT NULL, 
                timestamp TEXT NOT NULL, description TEXT NOT NULL, 
                debit REAL DEFAULT 0, credit REAL DEFAULT 0, balance REAL DEFAULT 0
            );
            CREATE TABLE number_limits (
                id INTEGER PRIMARY KEY AUTOINCREMENT, gameType TEXT NOT NULL, 
                numberValue TEXT NOT NULL, limitAmount REAL NOT NULL, UNIQUE(gameType, numberValue)
            );
        `);
        console.log("      SUCCESS: System tables recreated.");
    } catch (e) {
        console.error("      ERROR: Schema reconstruction failed.");
        console.error(e.message);
        process.exit(1);
    }

    // 4. Seed Guru Data
    if (fs.existsSync(SEED_FILE)) {
        console.log("[4/4] Migrating initial Guru/Dealer data...");
        try {
            const data = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
            db.transaction(() => {
                const insAdmin = db.prepare('INSERT INTO admins (id, name, password, wallet, prizeRates, avatarUrl) VALUES (?,?,?,?,?,?)');
                insAdmin.run(data.admin.id, data.admin.name, data.admin.password, data.admin.wallet, JSON.stringify(data.admin.prizeRates), data.admin.avatarUrl);

                const insGame = db.prepare('INSERT INTO games (id, name, drawTime) VALUES (?,?,?)');
                data.games.forEach(g => insGame.run(g.id, g.name, g.drawTime));

                const insDealer = db.prepare('INSERT INTO dealers (id, name, password, area, contact, wallet, commissionRate, prizeRates, avatarUrl) VALUES (?,?,?,?,?,?,?,?,?)');
                data.dealers.forEach(d => insDealer.run(d.id, d.name, d.password, d.area, d.contact, d.wallet, d.commissionRate, JSON.stringify(d.prizeRates), d.avatarUrl));

                const insUser = db.prepare('INSERT INTO users (id, name, password, dealerId, area, contact, wallet, commissionRate, prizeRates, avatarUrl) VALUES (?,?,?,?,?,?,?,?,?,?)');
                data.users.forEach(u => insUser.run(u.id, u.name, u.password, u.dealerId, u.area, u.contact, u.wallet, u.commissionRate, JSON.stringify(u.prizeRates), u.avatarUrl));

                const insLedger = db.prepare('INSERT INTO ledgers (id, accountId, accountType, timestamp, description, debit, credit, balance) VALUES (?,?,?,?,?,?,?,?)');
                if (data.admin.ledger) {
                    data.admin.ledger.forEach(l => {
                        insLedger.run(l.id, data.admin.id, 'ADMIN', l.timestamp, l.description, l.debit, l.credit, l.balance);
                    });
                }
            })();
            console.log("      SUCCESS: Migration complete.");
        } catch (e) {
            console.error("      ERROR: Migration failed.");
            console.error(e.message);
            process.exit(1);
        }
    }

    db.close();
    console.log("==================================================");
    console.log("   SYSTEM REBUILD SUCCESSFUL! RESTART PM2.   ");
    console.log("==================================================");
}

rebuild();
