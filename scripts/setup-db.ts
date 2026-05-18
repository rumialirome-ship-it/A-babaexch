import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

const DB_PATH = path.join(process.cwd(), 'database.sqlite');
const JSON_DB_PATH = path.join(process.cwd(), 'backend', 'db.json');

function main() {
    if (fs.existsSync(DB_PATH)) {
        const db = new Database(DB_PATH);
        try {
            const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admins'");
            if (stmt.get()) {
                console.error('Database file already exists and is initialized. Aborting setup to prevent data loss.');
                db.close();
                return;
            }
            console.error('Database file exists but is not initialized. Proceeding with setup...');
            db.close();
            fs.unlinkSync(DB_PATH); // Delete empty/invalid DB to start fresh
        } catch (e) {
            console.error('Database file is corrupt or invalid. Recreating...');
            db.close();
            fs.unlinkSync(DB_PATH);
        }
    }

    if (!fs.existsSync(JSON_DB_PATH)) {
        console.error('db.json not found at ' + JSON_DB_PATH + '. Cannot migrate data.');
        process.exit(1);
    }

    const db = new Database(DB_PATH);
    console.error('Created new SQLite database at:', DB_PATH);

    const jsonData = JSON.parse(fs.readFileSync(JSON_DB_PATH, 'utf-8'));

    const createSchema = () => {
        db.exec(`
            CREATE TABLE admins (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                password TEXT NOT NULL,
                wallet REAL NOT NULL,
                prizeRates TEXT NOT NULL,
                avatarUrl TEXT
            );
            CREATE TABLE dealers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                password TEXT NOT NULL,
                area TEXT,
                contact TEXT,
                wallet REAL NOT NULL,
                commissionRate REAL NOT NULL,
                isRestricted INTEGER NOT NULL DEFAULT 0,
                prizeRates TEXT NOT NULL,
                avatarUrl TEXT
            );
            CREATE TABLE users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                password TEXT NOT NULL,
                dealerId TEXT NOT NULL,
                area TEXT,
                contact TEXT,
                wallet REAL NOT NULL,
                commissionRate REAL NOT NULL,
                isRestricted INTEGER NOT NULL DEFAULT 0,
                prizeRates TEXT NOT NULL,
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
                debit REAL NOT NULL,
                credit REAL NOT NULL,
                balance REAL NOT NULL
            );
            CREATE TABLE number_limits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                gameType TEXT NOT NULL,
                numberValue TEXT NOT NULL,
                limitAmount REAL NOT NULL,
                UNIQUE(gameType, numberValue)
            );
            CREATE INDEX idx_ledgers_accountId ON ledgers(accountId);
            CREATE INDEX idx_bets_userId ON bets(userId);
            CREATE INDEX idx_users_dealerId ON users(dealerId);
        `);
        console.error('Database schema created.');
    };
    
    const migrateData = () => {
        const insertAdmin = db.prepare('INSERT INTO admins (id, name, password, wallet, prizeRates, avatarUrl) VALUES (?, ?, ?, ?, ?, ?)');
        const insertDealer = db.prepare('INSERT INTO dealers (id, name, password, area, contact, wallet, commissionRate, isRestricted, prizeRates, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const insertUser = db.prepare('INSERT INTO users (id, name, password, dealerId, area, contact, wallet, commissionRate, isRestricted, prizeRates, betLimits, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const insertGame = db.prepare('INSERT INTO games (id, name, drawTime, winningNumber, payoutsApproved) VALUES (?, ?, ?, ?, ?)');
        const insertBet = db.prepare('INSERT INTO bets (id, userId, dealerId, gameId, subGameType, numbers, amountPerNumber, totalAmount, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const insertLedger = db.prepare('INSERT INTO ledgers (id, accountId, accountType, timestamp, description, debit, credit, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

        db.transaction(() => {
            // Admin
            const admin = jsonData.admin;
            insertAdmin.run(admin.id, admin.name, admin.password, admin.wallet, JSON.stringify(admin.prizeRates), admin.avatarUrl);
            admin.ledger.forEach((l: any) => insertLedger.run(uuidv4(), admin.id, 'ADMIN', new Date(l.timestamp).toISOString(), l.description, l.debit, l.credit, l.balance));
            
            // Dealers
            jsonData.dealers.forEach((dealer: any) => {
                insertDealer.run(dealer.id, dealer.name, dealer.password, dealer.area, dealer.contact, dealer.wallet, dealer.commissionRate, dealer.isRestricted ? 1 : 0, JSON.stringify(dealer.prizeRates), dealer.avatarUrl);
                dealer.ledger.forEach((l: any) => insertLedger.run(uuidv4(), dealer.id, 'DEALER', new Date(l.timestamp).toISOString(), l.description, l.debit, l.credit, l.balance));
            });

            // Users
            jsonData.users.forEach((user: any) => {
                insertUser.run(user.id, user.name, user.password, user.dealerId, user.area, user.contact, user.wallet, user.commissionRate, user.isRestricted ? 1 : 0, JSON.stringify(user.prizeRates), user.betLimits ? JSON.stringify(user.betLimits) : null, user.avatarUrl);
                user.ledger.forEach((l: any) => insertLedger.run(uuidv4(), user.id, 'USER', new Date(l.timestamp).toISOString(), l.description, l.debit, l.credit, l.balance));
            });

            // Games
            jsonData.games.forEach((game: any) => {
                insertGame.run(game.id, game.name, game.drawTime, game.winningNumber || null, game.payoutsApproved ? 1 : 0);
            });

            // Bets
            jsonData.bets.forEach((bet: any) => {
                insertBet.run(bet.id, bet.userId, bet.dealerId, bet.gameId, bet.subGameType, JSON.stringify(bet.numbers), bet.amountPerNumber, bet.totalAmount, new Date(bet.timestamp).toISOString());
            });
            
            console.error('Data migration complete.');
        })();
    };

    try {
        createSchema();
        migrateData();
        console.error('\nDatabase setup successful!');
    } catch (error) {
        console.error('An error occurred during database setup:', error);
        if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH); // Clean up failed DB creation
    } finally {
        db.close();
    }
}

main();
