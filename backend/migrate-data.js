const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Check for required dependencies
let Database;
try {
    Database = require('better-sqlite3');
} catch (e) {
    console.error('\n\x1b[31m%s\x1b[0m', '❌ MISSING DEPENDENCY: better-sqlite3');
    process.exit(1);
}

let mysql;
try {
    mysql = require('mysql2/promise');
} catch (e) {
    console.error('\n\x1b[31m%s\x1b[0m', '❌ MISSING DEPENDENCY: mysql2');
    process.exit(1);
}

const SQLITE_PATH = path.join(__dirname, 'database.sqlite');
const dbHost = (process.env.DB_HOST === 'localhost' || !process.env.DB_HOST) ? '127.0.0.1' : process.env.DB_HOST;
const dbName = process.env.DB_NAME || 'ababa_db';

// Explicit column mappings (Legacy SQLite -> New MySQL)
const COLUMN_MAPPINGS = {
    bets: { 'type': 'subGameType' },
    ledgers: { 'type': 'accountType' },
};

async function migrate() {
    console.log("--- STARTING DATA MIGRATION (v2 - Strict Mode) ---");

    if (!fs.existsSync(SQLITE_PATH)) {
        console.error(`❌ Error: database.sqlite not found.`);
        process.exit(1);
    }

    let sqlite;
    let conn;

    try {
        sqlite = new Database(SQLITE_PATH, { readonly: true });
        
        console.log(`⏳ Connecting to MySQL at ${dbHost}...`);
        conn = await mysql.createConnection({
            host: dbHost,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            multipleStatements: true
        });

        await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        await conn.query(`USE \`${dbName}\``);
        await conn.query('SET FOREIGN_KEY_CHECKS = 0');

        const copyTable = async (tableName, jsonColumns = [], updateOnDup = false) => {
            console.log(`\n⏳ Processing table: ${tableName}...`);
            
            // 1. Get MySQL Schema
            const [cols] = await conn.query(`SHOW COLUMNS FROM \`${tableName}\``);
            const validMysqlColumns = new Set(cols.map(c => c.Field));
            // console.log(`   Valid MySQL Columns: ${[...validMysqlColumns].join(', ')}`);

            // 2. Get SQLite Data
            let rows;
            try {
                rows = sqlite.prepare(`SELECT * FROM ${tableName}`).all();
            } catch (e) {
                console.log(`   ⚠️ Table ${tableName} missing in SQLite. Skipping.`);
                return;
            }

            if (rows.length === 0) {
                console.log(`   ℹ️ Table ${tableName} is empty.`);
                return;
            }

            // 3. Prepare Mapping
            // We look at the first row of SQLite data to decide how to map columns
            const sampleRow = rows[0];
            const sqliteKeys = Object.keys(sampleRow);
            
            const activeMapping = []; // Stores { source: 'type', target: 'subGameType' }

            sqliteKeys.forEach(sourceKey => {
                let targetKey = sourceKey;

                // Apply explicit mapping if available
                if (COLUMN_MAPPINGS[tableName] && COLUMN_MAPPINGS[tableName][sourceKey]) {
                    targetKey = COLUMN_MAPPINGS[tableName][sourceKey];
                }

                // CRITICAL: Only map this column if the target exists in MySQL
                if (validMysqlColumns.has(targetKey)) {
                    // Avoid adding the same target column twice
                    if (!activeMapping.find(m => m.target === targetKey)) {
                        activeMapping.push({ source: sourceKey, target: targetKey });
                    }
                }
            });

            if (activeMapping.length === 0) {
                console.log(`   ❌ No matching columns found for ${tableName}. Skipping.`);
                return;
            }

            // 4. Construct SQL
            const targetColsStr = activeMapping.map(m => `\`${m.target}\``).join(', ');
            const placeholders = activeMapping.map(() => '?').join(', ');
            
            let sql;
            if (updateOnDup) {
                const updateStr = activeMapping.map(m => `\`${m.target}\` = VALUES(\`${m.target}\`)`).join(', ');
                sql = `INSERT INTO \`${tableName}\` (${targetColsStr}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateStr}`;
            } else {
                sql = `INSERT IGNORE INTO \`${tableName}\` (${targetColsStr}) VALUES (${placeholders})`;
            }

            // 5. Insert Data
            let successCount = 0;
            for (const row of rows) {
                const values = activeMapping.map(m => {
                    let val = row[m.source];
                    // Fix JSON strings
                    if (jsonColumns.includes(m.target) && typeof val === 'string') {
                        try { JSON.parse(val); return val; } catch { return '{}'; }
                    }
                    // Fix Booleans (SQLite 0/1 -> MySQL)
                    if (typeof val === 'boolean') return val ? 1 : 0;
                    return val;
                });

                try {
                    await conn.execute(sql, values);
                    successCount++;
                } catch (e) {
                    console.error(`   ❌ Failed row ${row.id || '?'}: ${e.message}`);
                }
            }
            console.log(`   ✅ Migrated ${successCount}/${rows.length} rows.`);
        };

        // --- EXECUTION ORDER ---
        await copyTable('admins', ['prizeRates'], true);
        await copyTable('dealers', ['prizeRates'], true);
        await copyTable('users', ['prizeRates', 'betLimits'], true);
        await copyTable('games', [], true);
        await copyTable('daily_results');
        await copyTable('number_limits');
        await copyTable('bets', ['numbers']);
        await copyTable('ledgers');

        console.log("\n✅ MIGRATION COMPLETE");

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
