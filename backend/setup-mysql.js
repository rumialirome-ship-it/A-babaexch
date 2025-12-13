const mysql = require('mysql2/promise');
require('dotenv').config();

const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
};

async function main() {
    const conn = await mysql.createConnection(config);
    try {
        await conn.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'ababa_db'}`);
        await conn.query(`USE ${process.env.DB_NAME || 'ababa_db'}`);
        
        console.log("Database created/selected.");

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
        
        console.log("Tables created successfully.");
        
        // Seed Admin if not exists
        const [rows] = await conn.query("SELECT * FROM admins WHERE id = 'Guru'");
        if (rows.length === 0) {
            await conn.query(
                `INSERT INTO admins (id, name, password, wallet, prizeRates, avatarUrl) VALUES (?, ?, ?, ?, ?, ?)`,
                ['Guru', 'Guru', 'Pak@4646', 900000, JSON.stringify({ oneDigitOpen: 90, oneDigitClose: 90, twoDigit: 900 }), 'https://i.pravatar.cc/150?u=Guru']
            );
            console.log("Admin seeded.");
        }

    } catch (e) {
        console.error("Setup Failed:", e);
    } finally {
        conn.end();
    }
}

main();