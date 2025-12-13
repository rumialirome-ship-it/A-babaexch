const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Check for required dependencies and provide helpful error messages
let Database;
try {
    Database = require('better-sqlite3');
} catch (e) {
    console.error('\n\x1b[31m%s\x1b[0m', '❌ MISSING DEPENDENCY: better-sqlite3');
    console.error('To read your old data, you need to install the SQLite driver temporarily.');
    console.error('\nPlease run the following command in the backend folder:');
    console.error('\x1b[36m%s\x1b[0m', '    npm install better-sqlite3');
    console.error('\nThen run this script again.\n');
    process.exit(1);
}

let mysql;
try {
    mysql = require('mysql2/promise');
} catch (e) {
    console.error('\n\x1b[31m%s\x1b[0m', '❌ MISSING DEPENDENCY: mysql2');
    console.error('Please run: npm install mysql2');
    process.exit(1);
}

const SQLITE_PATH = path.join(__dirname, 'database.sqlite');

// Fix: Node.js 17+ resolves 'localhost' to IPv6 (::1). MySQL often binds to IPv4 (127.0.0.1).
const dbHost = (process.env.DB_HOST === 'localhost' || !process.env.DB_HOST) ? '127.0.0.1' : process.env.DB_HOST;
const dbName = process.env.DB_NAME || 'ababa_db';

// Config WITHOUT database selected initially
const mysqlConfig = {
    host: dbHost,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    decimalNumbers: true
};

const SCHEMA_QUERIES = [
    `CREATE TABLE IF NOT EXISTS admins (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        wallet DECIMAL(15,2) NOT NULL,
        prizeRates JSON NOT NULL,
        avatarUrl TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS dealers (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        area VARCHAR(255),
        contact VARCHAR(255),
        wallet DECIMAL(15,2) NOT NULL,
        commissionRate DECIMAL(5,2) NOT NULL,
        isRestricted BOOLEAN DEFAULT FALSE,
        prizeRates JSON NOT NULL,
        avatarUrl TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        dealerId VARCHAR(255) NOT NULL,
        area VARCHAR(255),
        contact VARCHAR(255),
        wallet DECIMAL(15,2) NOT NULL,
        commissionRate DECIMAL(5,2) NOT NULL,
        isRestricted BOOLEAN DEFAULT FALSE,
        prizeRates JSON NOT NULL,
        betLimits JSON,
        avatarUrl TEXT,
        FOREIGN KEY (dealerId) REFERENCES dealers(id)
    )`,
    `CREATE TABLE IF NOT EXISTS games (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        drawTime VARCHAR(10) NOT NULL,
        winningNumber VARCHAR(10),
        payoutsApproved BOOLEAN DEFAULT FALSE
    )`,
    `CREATE TABLE IF NOT EXISTS bets (
        id VARCHAR(255) PRIMARY KEY,
        userId VARCHAR(255) NOT NULL,
        dealerId VARCHAR(255) NOT NULL,
        gameId VARCHAR(255) NOT NULL,
        subGameType VARCHAR(50) NOT NULL,
        numbers JSON NOT NULL,
        amountPerNumber DECIMAL(10,2) NOT NULL,
        totalAmount DECIMAL(15,2) NOT NULL,
        timestamp DATETIME NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id),
        FOREIGN KEY (dealerId) REFERENCES dealers(id),
        FOREIGN KEY (gameId) REFERENCES games(id)
    )`,
    `CREATE TABLE IF NOT EXISTS ledgers (
        id VARCHAR(255) PRIMARY KEY,
        accountId VARCHAR(255) NOT NULL,
        accountType VARCHAR(50) NOT NULL,
        timestamp DATETIME NOT NULL,
        description TEXT NOT NULL,
        debit DECIMAL(15,2) NOT NULL,
        credit DECIMAL(15,2) NOT NULL,
        balance DECIMAL(15,2) NOT NULL,
        INDEX (accountId)
    )`,
    `CREATE TABLE IF NOT EXISTS daily_results (
        id VARCHAR(255) PRIMARY KEY,
        gameId VARCHAR(255) NOT NULL,
        date DATE NOT NULL,
        winningNumber VARCHAR(10) NOT NULL,
        UNIQUE KEY (gameId, date)
    )`,
    `CREATE TABLE IF NOT EXISTS number_limits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        gameType VARCHAR(50) NOT NULL,
        numberValue VARCHAR(10) NOT NULL,
        limitAmount DECIMAL(15,2) NOT NULL,
        UNIQUE KEY (gameType, numberValue)
    )`
];

async function migrate() {
    console.log("--- STARTING DATA MIGRATION (SQLite -> MySQL) ---");

    if (!fs.existsSync(SQLITE_PATH)) {
        console.error(`❌ Error: Old database file not found at ${SQLITE_PATH}`);
        console.log("If you don't have existing data, you don't need to run this script.");
        process.exit(1);
    }

    let sqlite;
    let conn;

    try {
        // 1. Connect to SQLite
        sqlite = new Database(SQLITE_PATH, { readonly: true });
        console.log("✅ Connected to old SQLite database.");

        // 2. Connect to MySQL Server (No DB selected yet)
        conn = await mysql.createConnection(mysqlConfig);
        console.log(`✅ Connected to MySQL server at ${mysqlConfig.host}.`);

        // 3. Create and Select Database
        console.log(`⏳ ensuring database '${dbName}' exists...`);
        await conn.query(`CREATE DATABASE IF NOT EXISTS ${dbName}`);
        await conn.query(`USE ${dbName}`);
        console.log(`✅ Database '${dbName}' selected.`);

        // 4. Create Tables (Schema)
        console.log(`⏳ Verifying table structure...`);
        for (const query of SCHEMA_QUERIES) {
            await conn.query(query);
        }
        console.log(`✅ Table structure verified.`);

        // 5. Disable Foreign Key checks for bulk insert
        await conn.query('SET FOREIGN_KEY_CHECKS = 0');

        // --- HELPER TO COPY TABLES ---
        const copyTable = async (tableName, jsonColumns = []) => {
            console.log(`\n⏳ Migrating table: ${tableName}...`);
            
            // Get data from SQLite
            let rows;
            try {
                rows = sqlite.prepare(`SELECT * FROM ${tableName}`).all();
            } catch (e) {
                console.log(`   ⚠️ Table ${tableName} does not exist in SQLite. Skipping.`);
                return;
            }

            if (rows.length === 0) {
                console.log(`   ℹ️ Table ${tableName} is empty. Skipping.`);
                return;
            }

            // Prepare Insert Statement
            const firstRow = rows[0];
            const columns = Object.keys(firstRow);
            const placeholders = columns.map(() => '?').join(', ');
            const sql = `INSERT IGNORE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;

            let successCount = 0;
            
            // Process in chunks to be safe
            for (const row of rows) {
                const values = columns.map(col => {
                    let val = row[col];
                    // Convert JSON strings from SQLite to Objects for MySQL driver, 
                    // or keep as valid JSON strings.
                    if (jsonColumns.includes(col) && typeof val === 'string') {
                        try {
                            return JSON.stringify(JSON.parse(val)); // Ensure clean JSON
                        } catch (e) {
                            return '{}';
                        }
                    }
                    // Fix: SQLite dates might be ISO strings, MySQL needs proper handling if strict,
                    // but usually standard ISO strings work fine.
                    return val;
                });

                try {
                    await conn.execute(sql, values);
                    successCount++;
                } catch (e) {
                    console.error(`   ❌ Failed to insert row ID ${row.id}: ${e.message}`);
                }
            }
            console.log(`   ✅ Migrated ${successCount}/${rows.length} rows.`);
        };

        // --- EXECUTE MIGRATION ---

        await copyTable('admins', ['prizeRates']);
        await copyTable('dealers', ['prizeRates']);
        await copyTable('users', ['prizeRates', 'betLimits']);
        await copyTable('games');
        await copyTable('daily_results');
        await copyTable('number_limits');
        await copyTable('bets', ['numbers']);
        await copyTable('ledgers');

        console.log("\n--- MIGRATION COMPLETE ---");
        console.log("You can now start the server: pm2 restart ababa-backend");

    } catch (err) {
        console.error("\n❌ MIGRATION FAILED:", err);
    } finally {
        if (conn) {
            await conn.query('SET FOREIGN_KEY_CHECKS = 1');
            conn.end();
        }
        if (sqlite) sqlite.close();
    }
}

migrate();
