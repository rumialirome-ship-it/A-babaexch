
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'database.sqlite');
const JSON_DB_PATH = path.join(__dirname, 'db.json');

async function main() {
    if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
    const db = new sqlite3.Database(DB_PATH);

    const schema = `
        CREATE TABLE admins (id TEXT PRIMARY KEY, name TEXT NOT NULL, password TEXT NOT NULL, wallet REAL NOT NULL, prizeRates TEXT NOT NULL, avatarUrl TEXT);
        CREATE TABLE dealers (id TEXT PRIMARY KEY, name TEXT NOT NULL, password TEXT NOT NULL, area TEXT, contact TEXT, wallet REAL NOT NULL, commissionRate REAL NOT NULL, isRestricted INTEGER NOT NULL DEFAULT 0, prizeRates TEXT NOT NULL, avatarUrl TEXT);
        CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, password TEXT NOT NULL, dealerId TEXT NOT NULL, area TEXT, contact TEXT, wallet REAL NOT NULL, commissionRate REAL NOT NULL, isRestricted INTEGER NOT NULL DEFAULT 0, prizeRates TEXT NOT NULL, betLimits TEXT, avatarUrl TEXT, FOREIGN KEY (dealerId) REFERENCES dealers(id));
        CREATE TABLE games (id TEXT PRIMARY KEY, name TEXT NOT NULL, drawTime TEXT NOT NULL, winningNumber TEXT, payoutsApproved INTEGER DEFAULT 0);
        CREATE TABLE bets (id TEXT PRIMARY KEY, userId TEXT NOT NULL, dealerId TEXT NOT NULL, gameId TEXT NOT NULL, subGameType TEXT NOT NULL, numbers TEXT NOT NULL, amountPerNumber REAL NOT NULL, totalAmount REAL NOT NULL, timestamp TEXT NOT NULL, FOREIGN KEY (userId) REFERENCES users(id), FOREIGN KEY (dealerId) REFERENCES dealers(id), FOREIGN KEY (gameId) REFERENCES games(id));
        CREATE TABLE ledgers (id TEXT PRIMARY KEY, accountId TEXT NOT NULL, accountType TEXT NOT NULL, timestamp TEXT NOT NULL, description TEXT NOT NULL, debit REAL NOT NULL, credit REAL NOT NULL, balance REAL NOT NULL);
        CREATE TABLE number_limits (id INTEGER PRIMARY KEY AUTOINCREMENT, gameType TEXT NOT NULL, numberValue TEXT NOT NULL, limitAmount REAL NOT NULL, UNIQUE(gameType, numberValue));
    `;

    db.serialize(() => {
        schema.split(';').filter(s => s.trim()).forEach(s => db.run(s));
        
        if (fs.existsSync(JSON_DB_PATH)) {
            const data = JSON.parse(fs.readFileSync(JSON_DB_PATH, 'utf-8'));
            const admin = data.admin;
            db.run('INSERT INTO admins VALUES (?,?,?,?,?,?)', [admin.id, admin.name, admin.password, admin.wallet, JSON.stringify(admin.prizeRates), admin.avatarUrl]);
            data.dealers.forEach(d => db.run('INSERT INTO dealers VALUES (?,?,?,?,?,?,?,?,?,?)', [d.id, d.name, d.password, d.area, d.contact, d.wallet, d.commissionRate, 0, JSON.stringify(d.prizeRates), d.avatarUrl]));
            data.users.forEach(u => db.run('INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [u.id, u.name, u.password, u.dealerId, u.area, u.contact, u.wallet, u.commissionRate, 0, JSON.stringify(u.prizeRates), JSON.stringify(u.betLimits), u.avatarUrl]));
            data.games.forEach(g => db.run('INSERT INTO games VALUES (?,?,?,?,?)', [g.id, g.name, g.drawTime, g.winningNumber || null, g.payoutsApproved ? 1 : 0]));
        }
    });

    console.log('Database initialized successfully.');
}
main();
