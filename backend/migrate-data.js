const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Check for required dependencies
let Database;
try {
    Database = require('better-sqlite3');
} catch (e) {
    console.error('\n\x1b[31m%s\x1b[0m', '❌ MISSING DEPENDENCY: better-sqlite3');
    console.error('The restore.sh script should have installed this. Try running "npm install better-sqlite3" manually.');
    process.exit(1);
}

let mysql;
try {
    mysql = require('mysql2/promise');
} catch (e) {
    console.error('\n\x1b[31m%s\x1b[0m', '❌ MISSING DEPENDENCY: mysql2');
    console.error('Try running "npm install mysql2" manually.');
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

        // 2. Connect to MySQL Server
        const connectionConfig = {
            host: dbHost,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            decimalNumbers: true,
            multipleStatements: true
        };

        console.log(`⏳ Connecting to MySQL at ${dbHost}...`);
        conn = await mysql.createConnection(connectionConfig);
        console.log(`✅ Connected to MySQL server.`);

        // 3. Select Database
        await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        await conn.query(`USE \`${dbName}\``);
        console.log(`✅ Database '${dbName}' selected.`);

        // 4. Disable Foreign Key checks for bulk insert
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
            
            // Construct query
            let sql;
            if (updateOnDup) {
                // If row exists (e.g., default admin), UPDATE it with values from SQLite (Wallet balance, password, etc)
                const updates = columns.map(col => `${col} = VALUES(${col})`).join(', ');
                sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`;
            } else {
                // Otherwise just insert, ignore if exists (keep historical logs intact)
                sql = `INSERT IGNORE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
            }

            let successCount = 0;
            
            // Batch insert could be faster but line-by-line is safer for debugging data types
            for (const row of rows) {
                const values = columns.map(col => {
                    let val = row[col];
                    // Convert JSON strings to proper format
                    if (jsonColumns.includes(col) && typeof val === 'string') {
                        try {
                            // Validate JSON
                            JSON.parse(val);
                            return val; 
                        } catch (e) {
                            return '{}';
                        }
                    }
                    // SQLite booleans are 0/1 integers, MySQL treats them similarly but ensure consistency
                    if (typeof val === 'boolean') {
                        return val ? 1 : 0; 
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
        // We use 'updateOnDup = true' for accounts so the SQLite wallet balance overwrites the default 0 balance
        await copyTable('admins', ['prizeRates'], true);
        await copyTable('dealers', ['prizeRates'], true);
        await copyTable('users', ['prizeRates', 'betLimits'], true);
        
        // Games: Update existing game definitions (winning numbers etc)
        await copyTable('games', [], true);
        
        // Transactional data: Insert Ignore (don't overwrite if UUID exists, ledgers are immutable logs)
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