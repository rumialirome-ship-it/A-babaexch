const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'database.sqlite');
let db;

function connect() {
    try {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        console.log('Database connected successfully for migration.');
    } catch (error) {
        console.error('Failed to connect to database:', error);
        process.exit(1);
    }
}

function tableExists(tableName) {
    const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?");
    return !!stmt.get(tableName);
}

function columnExists(tableName, columnName) {
    const stmt = db.prepare(`PRAGMA table_info(${tableName})`);
    const columns = stmt.all();
    return columns.some(col => col.name === columnName);
}

function indexExists(indexName) {
    const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name = ?");
    return !!stmt.get(indexName);
}

function runMigration() {
    console.log('Starting database migration check...');

    db.transaction(() => {
        // --- Table: admins ---
        if (!tableExists('admins')) {
            db.exec(`CREATE TABLE admins (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, password TEXT NOT NULL, wallet REAL NOT NULL, prizeRates TEXT NOT NULL, avatarUrl TEXT
            );`);
            console.log('✅ Created table: admins');
        }

        // --- Table: dealers ---
        if (!tableExists('dealers')) {
            db.exec(`CREATE TABLE dealers (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, password TEXT NOT NULL, area TEXT, contact TEXT, wallet REAL NOT NULL, commissionRate REAL NOT NULL, isRestricted INTEGER NOT NULL DEFAULT 0, prizeRates TEXT NOT NULL, avatarUrl TEXT
            );`);
            console.log('✅ Created table: dealers');
        }

        // --- Table: users ---
        if (!tableExists('users')) {
            db.exec(`CREATE TABLE users (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, password TEXT NOT NULL, dealerId TEXT NOT NULL, area TEXT, contact TEXT, wallet REAL NOT NULL, commissionRate REAL NOT NULL, isRestricted INTEGER NOT NULL DEFAULT 0, prizeRates TEXT NOT NULL, betLimits TEXT, avatarUrl TEXT,
                FOREIGN KEY (dealerId) REFERENCES dealers(id)
            );`);
            console.log('✅ Created table: users');
        } else {
             if (!columnExists('users', 'betLimits')) {
                db.exec(`ALTER TABLE users ADD COLUMN betLimits TEXT;`);
                console.log('✅ Added column "betLimits" to "users" table.');
            }
        }

        // --- Table: games ---
        if (!tableExists('games')) {
            db.exec(`CREATE TABLE games (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, drawTime TEXT NOT NULL, winningNumber TEXT, payoutsApproved INTEGER DEFAULT 0
            );`);
            console.log('✅ Created table: games');
        } else {
            if (!columnExists('games', 'payoutsApproved')) {
                db.exec(`ALTER TABLE games ADD COLUMN payoutsApproved INTEGER DEFAULT 0;`);
                console.log('✅ Added column "payoutsApproved" to "games" table.');
            }
        }

        // --- Table: bets ---
        if (!tableExists('bets')) {
            db.exec(`CREATE TABLE bets (
                id TEXT PRIMARY KEY, userId TEXT NOT NULL, dealerId TEXT NOT NULL, gameId TEXT NOT NULL, subGameType TEXT NOT NULL, numbers TEXT NOT NULL, amountPerNumber REAL NOT NULL, totalAmount REAL NOT NULL, timestamp TEXT NOT NULL,
                FOREIGN KEY (userId) REFERENCES users(id), FOREIGN KEY (dealerId) REFERENCES dealers(id), FOREIGN KEY (gameId) REFERENCES games(id)
            );`);
            console.log('✅ Created table: bets');
        }

        // --- Table: ledgers ---
        if (!tableExists('ledgers')) {
            db.exec(`CREATE TABLE ledgers (
                id TEXT PRIMARY KEY, accountId TEXT NOT NULL, accountType TEXT NOT NULL, timestamp TEXT NOT NULL, description TEXT NOT NULL, debit REAL NOT NULL, credit REAL NOT NULL, balance REAL NOT NULL
            );`);
            console.log('✅ Created table: ledgers');
        }

        // --- Table: number_limits ---
        if (!tableExists('number_limits')) {
            db.exec(`CREATE TABLE number_limits (
                id INTEGER PRIMARY KEY AUTOINCREMENT, gameType TEXT NOT NULL, numberValue TEXT NOT NULL, limitAmount REAL NOT NULL, UNIQUE(gameType, numberValue)
            );`);
            console.log('✅ Created table: number_limits');
        }

        // --- Table: daily_results ---
        if (!tableExists('daily_results')) {
            db.exec(`CREATE TABLE daily_results (
                id TEXT PRIMARY KEY, gameId TEXT NOT NULL, date TEXT NOT NULL, winningNumber TEXT NOT NULL,
                FOREIGN KEY (gameId) REFERENCES games(id), UNIQUE(gameId, date)
            );`);
            console.log('✅ Created table: daily_results');
        }
        
        // --- Indexes ---
        if (!indexExists('idx_ledgers_accountId')) {
            db.exec('CREATE INDEX idx_ledgers_accountId ON ledgers(accountId);');
            console.log('✅ Created index: idx_ledgers_accountId');
        }
        if (!indexExists('idx_bets_userId')) {
            db.exec('CREATE INDEX idx_bets_userId ON bets(userId);');
            console.log('✅ Created index: idx_bets_userId');
        }
        if (!indexExists('idx_users_dealerId')) {
            db.exec('CREATE INDEX idx_users_dealerId ON users(dealerId);');
            console.log('✅ Created index: idx_users_dealerId');
        }
        if (!indexExists('idx_daily_results_gameId_date')) {
            db.exec('CREATE INDEX idx_daily_results_gameId_date ON daily_results(gameId, date);');
            console.log('✅ Created index: idx_daily_results_gameId_date');
        }
        
    })();
    
    console.log('Migration check complete.');
}


function main() {
    connect();
    runMigration();
    if (db) {
        db.close();
        console.log('Database connection closed.');
    }
}

main();
