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
// We explicitly use 127.0.0.1 if localhost is specified to avoid ECONNREFUSED ::1:3306.
const dbHost = (process.env.DB_HOST === 'localhost' || !process.env.DB_HOST) ? '127.0.0.1' : process.env.DB_HOST;

const mysqlConfig = {
    host: dbHost,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ababa_db',
    decimalNumbers: true
};

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
        // 1. Connect to both databases
        sqlite = new Database(SQLITE_PATH, { readonly: true });
        console.log("✅ Connected to old SQLite database.");

        conn = await mysql.createConnection(mysqlConfig);
        console.log(`✅ Connected to new MySQL database at ${mysqlConfig.host}.`);

        // 2. Disable Foreign Key checks temporarily to allow bulk inserting out of order
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
                    // SQLite stores dates as strings, MySQL accepts them fine usually.
                    // SQLite booleans are 0/1, MySQL tinyint is 0/1. Compatible.
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

        // 1. Admins
        await copyTable('admins', ['prizeRates']);

        // 2. Dealers
        await copyTable('dealers', ['prizeRates']);

        // 3. Users
        await copyTable('users', ['prizeRates', 'betLimits']);

        // 4. Games
        // Games might have static IDs, check logic
        await copyTable('games');

        // 5. Daily Results
        await copyTable('daily_results');

        // 6. Number Limits
        await copyTable('number_limits');

        // 7. Bets
        await copyTable('bets', ['numbers']);

        // 8. Ledgers
        await copyTable('ledgers');

        console.log("\n--- MIGRATION COMPLETE ---");

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
