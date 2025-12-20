
require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const JSON_DB_PATH = path.join(__dirname, 'db.json');

async function main() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        await client.connect();
        console.log('Connected to PostgreSQL for setup.');

        // Drop existing tables for fresh migration
        const tables = ['number_limits', 'ledgers', 'bets', 'games', 'users', 'dealers', 'admins'];
        for (const table of tables) {
            await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
        }

        const schema = `
            CREATE TABLE admins (id TEXT PRIMARY KEY, name TEXT NOT NULL, password TEXT NOT NULL, wallet NUMERIC(20,2) NOT NULL, prizeRates TEXT NOT NULL, avatarUrl TEXT);
            CREATE TABLE dealers (id TEXT PRIMARY KEY, name TEXT NOT NULL, password TEXT NOT NULL, area TEXT, contact TEXT, wallet NUMERIC(20,2) NOT NULL, commissionRate NUMERIC(10,2) NOT NULL, isRestricted INTEGER NOT NULL DEFAULT 0, prizeRates TEXT NOT NULL, avatarUrl TEXT);
            CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, password TEXT NOT NULL, dealerId TEXT NOT NULL, area TEXT, contact TEXT, wallet NUMERIC(20,2) NOT NULL, commissionRate NUMERIC(10,2) NOT NULL, isRestricted INTEGER NOT NULL DEFAULT 0, prizeRates TEXT NOT NULL, betLimits TEXT, avatarUrl TEXT, FOREIGN KEY (dealerId) REFERENCES dealers(id));
            CREATE TABLE games (id TEXT PRIMARY KEY, name TEXT NOT NULL, drawTime TEXT NOT NULL, winningNumber TEXT, payoutsApproved INTEGER DEFAULT 0);
            CREATE TABLE bets (id TEXT PRIMARY KEY, userId TEXT NOT NULL, dealerId TEXT NOT NULL, gameId TEXT NOT NULL, subGameType TEXT NOT NULL, numbers TEXT NOT NULL, amountPerNumber NUMERIC(20,2) NOT NULL, totalAmount NUMERIC(20,2) NOT NULL, timestamp TIMESTAMP NOT NULL, FOREIGN KEY (userId) REFERENCES users(id), FOREIGN KEY (dealerId) REFERENCES dealers(id), FOREIGN KEY (gameId) REFERENCES games(id));
            CREATE TABLE ledgers (id TEXT PRIMARY KEY, accountId TEXT NOT NULL, accountType TEXT NOT NULL, timestamp TIMESTAMP NOT NULL, description TEXT NOT NULL, debit NUMERIC(20,2) NOT NULL, credit NUMERIC(20,2) NOT NULL, balance NUMERIC(20,2) NOT NULL);
            CREATE TABLE number_limits (id SERIAL PRIMARY KEY, gameType TEXT NOT NULL, numberValue TEXT NOT NULL, limitAmount NUMERIC(20,2) NOT NULL, UNIQUE(gameType, numberValue));
        `;

        await client.query(schema);
        console.log('PostgreSQL schema created.');

        if (fs.existsSync(JSON_DB_PATH)) {
            const data = JSON.parse(fs.readFileSync(JSON_DB_PATH, 'utf-8'));
            
            const admin = data.admin;
            await client.query('INSERT INTO admins VALUES ($1,$2,$3,$4,$5,$6)', [admin.id, admin.name, admin.password, admin.wallet, JSON.stringify(admin.prizeRates), admin.avatarUrl]);
            
            for (const d of data.dealers) {
                await client.query('INSERT INTO dealers VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [d.id, d.name, d.password, d.area, d.contact, d.wallet, d.commissionRate, 0, JSON.stringify(d.prizeRates), d.avatarUrl]);
            }
            
            for (const u of data.users) {
                await client.query('INSERT INTO users VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [u.id, u.name, u.password, u.dealerId, u.area, u.contact, u.wallet, u.commissionRate, 0, JSON.stringify(u.prizeRates), JSON.stringify(u.betLimits), u.avatarUrl]);
            }
            
            for (const g of data.games) {
                await client.query('INSERT INTO games VALUES ($1,$2,$3,$4,$5)', [g.id, g.name, g.drawTime, g.winningNumber || null, g.payoutsApproved ? 1 : 0]);
            }
            
            console.log('Seed data migrated to PostgreSQL.');
        }

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

main();
