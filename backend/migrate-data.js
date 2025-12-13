const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Check for required dependencies
let Database;
try {
    Database = require('better-sqlite3');
} catch (e) {
    console.error('\n\x1b[31m%s\x1b[0m', '❌ MISSING DEPENDENCY: better-sqlite3');
    console.error('Run: npm install better-sqlite3');
    process.exit(1);
}

let mysql;
try {
    mysql = require('mysql2/promise');
} catch (e) {
    console.error('\n\x1b[31m%s\x1b[0m', '❌ MISSING DEPENDENCY: mysql2');
    console.error('Run: npm install mysql2');
    process.exit(1);
}

const SQLITE_PATH = path.join(__dirname, 'database.sqlite');

// Fix: Node.js 17+ resolves 'localhost' to IPv6 (::1). MySQL often binds to IPv4 (127.0.0.1).
const dbHost = (process.env.DB_HOST === 'localhost' || !process.env.DB_HOST) ? '127.0.0.1' : process.env.DB_HOST;
const dbName = process.env.DB_NAME || 'ababa_db';

async function migrate() {
    console.log("--- STARTING DATA MIGRATION (SQLite -> MySQL) ---");

    if (!fs.existsSync(SQLITE_PATH)) {
        console.error(`❌ Error: Old database file not found at ${SQLITE_PATH}`);
        console.error("Please upload your 'database.sqlite' file to the 'backend' folder.");
        process.exit(1);
    }

    let sqlite;
    let conn;

    try {
        // 1. Connect to SQLite
        sqlite = new Database(SQLITE_PATH, { readonly: true });
        console.log("✅ Connected to old SQLite database.");

        // 2. Connect to MySQL Server (Explicitly NO database selected)
        const connectionConfig = {
            host: dbHost,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: null, // Explicitly null to avoid 'Unknown database' error
            decimalNumbers: true
        };

        console.log(`⏳ Connecting to MySQL at ${dbHost}...`);
        conn = await mysql.createConnection(connectionConfig);
        console.log(`✅ Connected to MySQL server.`);

        // 3. Create and Select Database
        console.log(`⏳ Ensuring database '${dbName}' exists...`);
        await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        await conn.query(`USE \`${dbName}\``);
        console.log(`✅ Database '${dbName}' selected.`);

        // 4. Create Tables (If they don't exist yet)
        const schemaQueries = [
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

        console.log(`⏳ Verifying table structure...`);
        for (const query of schemaQueries) {
            await conn.query(query);
        }
        
        // 5. Disable Foreign Key checks for bulk insert
        await conn.query('SET FOREIGN_KEY_CHECKS = 0');

        // --- HELPER TO COPY TABLES ---
        const copyTable = async (tableName, jsonColumns = [], updateOnDup = false) => {
            console.log(`\n⏳ Migrating table: ${tableName}...`);
            
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

            console.log(`   Found ${rows.length} rows in ${tableName}. Inserting...`);

            const firstRow = rows[0];
            const columns = Object.keys(firstRow);
            const placeholders = columns.map(() => '?').join(', ');
            
            // Construct query: INSERT ... ON DUPLICATE KEY UPDATE if requested
            let sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
            if (updateOnDup) {
                const updates = columns.map(col => `${col} = VALUES(${col})`).join(', ');
                sql += ` ON DUPLICATE KEY UPDATE ${updates}`;
            } else {
                sql = `INSERT IGNORE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
            }

            let successCount = 0;
            
            for (const row of rows) {
                const values = columns.map(col => {
                    let val = row[col];
                    if (jsonColumns.includes(col) && typeof val === 'string') {
                        try {
                            // Ensure it's valid JSON for MySQL
                            return JSON.stringify(JSON.parse(val));
                        } catch (e) {
                            return '{}';
                        }
                    }
                    if (typeof val === 'boolean') {
                        return val ? 1 : 0; // SQLite usually has 0/1 anyway, but JS might read as bool
                    }
                    return val;
                });

                try {
                    await conn.execute(sql, values);
                    successCount++;
                } catch (e) {
                    console.error(`   ❌ Failed to insert row ID ${row.id}: ${e.message}`);
                }
            }
            console.log(`   ✅ Successfully migrated ${successCount}/${rows.length} rows.`);
        };

        // --- EXECUTE MIGRATION ---
        // We use 'updateOnDup = true' for critical tables so old data overrides empty default data
        await copyTable('admins', ['prizeRates'], true);
        await copyTable('dealers', ['prizeRates'], true);
        await copyTable('users', ['prizeRates', 'betLimits'], true);
        
        // Games: Keep old data if exists
        await copyTable('games', [], true);
        
        // Transactional data
        await copyTable('daily_results');
        await copyTable('number_limits');
        await copyTable('bets', ['numbers']);
        await copyTable('ledgers');

        console.log("\n--- MIGRATION COMPLETE ---");
        console.log("Your old users and data should now be restored.");

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