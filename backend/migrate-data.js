const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Check for required dependencies
let Database;
try {
    Database = require('better-sqlite3');
} catch (e) {
    console.error('\n\x1b[31m%s\x1b[0m', '❌ MISSING DEPENDENCY: better-sqlite3');
    console.error('The restore script should have installed this. Try running "npm install better-sqlite3" manually.');
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

// Known mappings for legacy schemas
const COLUMN_MAPPINGS = {
    bets: { 'type': 'subGameType' },
    ledgers: { 'type': 'accountType' }, // Just in case
    // Add others if needed
};

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

            console.log(`   Found ${rows.length} rows in ${tableName}. analyzing structure...`);

            // 1. Get MySQL Table Definition
            const [mysqlColumnsResult] = await conn.query(`SHOW COLUMNS FROM \`${tableName}\``);
            const mysqlColumnNames = new Set(mysqlColumnsResult.map(c => c.Field));

            // 2. Map SQLite columns to MySQL columns
            const firstRow = rows[0];
            const sourceKeys = Object.keys(firstRow);
            const columnsToMap = []; // Array of { source: 'type', target: 'subGameType' }
            const usedTargets = new Set();

            sourceKeys.forEach(sourceKey => {
                let targetKey = sourceKey;
                // Check if mapping exists
                if (COLUMN_MAPPINGS[tableName] && COLUMN_MAPPINGS[tableName][sourceKey]) {
                    targetKey = COLUMN_MAPPINGS[tableName][sourceKey];
                }

                // Only include if MySQL table has this column
                if (mysqlColumnNames.has(targetKey)) {
                    // Prevent duplicate targets (e.g. if source has both 'type' and 'subGameType' mapping to 'subGameType')
                    if (!usedTargets.has(targetKey)) {
                        columnsToMap.push({ source: sourceKey, target: targetKey });
                        usedTargets.add(targetKey);
                    }
                } else {
                    // console.log(`      Ignored extra column: ${sourceKey}`);
                }
            });

            if (columnsToMap.length === 0) {
                console.log(`   ❌ No matching columns found between SQLite and MySQL for ${tableName}. Skipping.`);
                return;
            }

            const targetColsStr = columnsToMap.map(c => `\`${c.target}\``).join(', ');
            const placeholders = columnsToMap.map(() => '?').join(', ');

            // Construct query
            let sql;
            if (updateOnDup) {
                const updates = columnsToMap.map(c => `\`${c.target}\` = VALUES(\`${c.target}\`)`).join(', ');
                sql = `INSERT INTO \`${tableName}\` (${targetColsStr}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`;
            } else {
                sql = `INSERT IGNORE INTO \`${tableName}\` (${targetColsStr}) VALUES (${placeholders})`;
            }

            let successCount = 0;
            
            // Insert data
            for (const row of rows) {
                const values = columnsToMap.map(colMap => {
                    let val = row[colMap.source];
                    
                    // Convert JSON strings to proper format if needed
                    if (jsonColumns.includes(colMap.target) && typeof val === 'string') {
                        try {
                            JSON.parse(val);
                            return val; 
                        } catch (e) {
                            return '{}';
                        }
                    }
                    // SQLite booleans are 0/1, ensure MySQL compatibility
                    if (typeof val === 'boolean') {
                        return val ? 1 : 0; 
                    }
                    return val;
                });

                try {
                    await conn.execute(sql, values);
                    successCount++;
                } catch (e) {
                    console.error(`   ❌ Failed to insert row (source ID ${row.id || '?' }): ${e.message}`);
                }
            }
            console.log(`   ✅ Successfully migrated ${successCount}/${rows.length} rows.`);
        };

        // --- EXECUTE MIGRATION ---
        // We use 'updateOnDup = true' for accounts so the SQLite wallet balance overwrites the default 0 balance
        await copyTable('admins', ['prizeRates'], true);
        await copyTable('dealers', ['prizeRates'], true);
        await copyTable('users', ['prizeRates', 'betLimits'], true);
        
        // Games: Update existing game definitions
        await copyTable('games', [], true);
        
        // Transactional data: Insert Ignore
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
