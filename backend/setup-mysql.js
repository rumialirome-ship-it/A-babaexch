require('dotenv').config();
let mysql;

try {
    mysql = require('mysql2/promise');
} catch (err) {
    console.error('\n\x1b[31m%s\x1b[0m', '❌ CRITICAL ERROR: Missing Dependencies');
    console.error('The "mysql2" package is not installed.');
    console.error('Please run: npm install');
    process.exit(1);
}

const dbHost = (process.env.DB_HOST === 'localhost' || !process.env.DB_HOST) ? '127.0.0.1' : process.env.DB_HOST;
const dbName = process.env.DB_NAME || 'ababa_db';

const config = {
    host: dbHost,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: null 
};

async function main() {
    console.log(`\n🔌 Connecting to MySQL at ${config.host}...`);
    
    let conn;
    try {
        conn = await mysql.createConnection(config);
    } catch (err) {
        console.error('\n\x1b[31m%s\x1b[0m', '❌ CONNECTION FAILED');
        console.error(`Could not connect to MySQL. Check your .env file.`);
        console.error(`Error: ${err.message}`);
        process.exit(1);
    }

    try {
        console.log(`🛠️  Checking database '${dbName}'...`);
        await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        await conn.query(`USE \`${dbName}\``);
        
        console.log("📝 Creating tables...");

        const queries = [
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

        for (const q of queries) {
            await conn.query(q);
        }
        
        console.log("✅ Tables verified.");
        
        // --- DATA SEEDING ---

        // 1. Admin
        const [adminRows] = await conn.query("SELECT * FROM admins WHERE id = 'Guru'");
        if (adminRows.length === 0) {
            await conn.query(
                `INSERT INTO admins (id, name, password, wallet, prizeRates, avatarUrl) VALUES (?, ?, ?, ?, ?, ?)`,
                ['Guru', 'Guru', 'Pak@4646', 900000, JSON.stringify({ oneDigitOpen: 90, oneDigitClose: 90, twoDigit: 900 }), 'https://i.pravatar.cc/150?u=Guru']
            );
            console.log("👤 Admin 'Guru' created.");
        }

        // 2. Games
        // Check if ANY games exist. If not, seed them.
        const [gameRows] = await conn.query("SELECT id FROM games LIMIT 1");
        if (gameRows.length === 0) {
            console.log("🎲 Seeding default games...");
            const games = [
                { id: "g1", name: "Ali Baba", drawTime: "18:15" },
                { id: "g2", name: "GSM", drawTime: "18:45" },
                { id: "g3", name: "OYO TV", drawTime: "20:15" },
                { id: "g4", name: "LS1", drawTime: "20:45" },
                { id: "g5", name: "OLA TV", drawTime: "21:15" },
                { id: "g6", name: "AK", drawTime: "21:55" },
                { id: "g7", name: "LS2", drawTime: "23:45" },
                { id: "g8", "name": "AKC", drawTime: "00:55" },
                { id: "g9", "name": "LS3", drawTime: "02:10" }
            ];

            for (const g of games) {
                await conn.query(
                    `INSERT INTO games (id, name, drawTime) VALUES (?, ?, ?)`,
                    [g.id, g.name, g.drawTime]
                );
            }
            console.log("✅ Default Games inserted.");
        }

        console.log('\n\x1b[32m%s\x1b[0m', '🎉 DATABASE SETUP COMPLETE!');
        console.log('You can now restart your backend server: pm2 restart ababa-backend');

    } catch (e) {
        console.error("\n❌ SETUP FAILED:", e);
    } finally {
        conn.end();
    }
}

main();