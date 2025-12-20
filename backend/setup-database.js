
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
            CREATE TABLE admins (id TEXT PRIMARY KEY, name TEXT NOT NULL, password TEXT NOT NULL, wallet NUMERIC(20,2) NOT NULL, prizerates TEXT NOT NULL, avatarurl TEXT);
            CREATE TABLE dealers (id TEXT PRIMARY KEY, name TEXT NOT NULL, password TEXT NOT NULL, area TEXT, contact TEXT, wallet NUMERIC(20,2) NOT NULL, commissionrate NUMERIC(10,2) NOT NULL, isrestricted INTEGER NOT NULL DEFAULT 0, prizerates TEXT NOT NULL, betlimits TEXT, avatarurl TEXT);
            CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, password TEXT NOT NULL, dealerid TEXT NOT NULL, area TEXT, contact TEXT, wallet NUMERIC(20,2) NOT NULL, commissionrate NUMERIC(10,2) NOT NULL, isrestricted INTEGER NOT NULL DEFAULT 0, prizerates TEXT NOT NULL, betlimits TEXT, avatarurl TEXT, FOREIGN KEY (dealerid) REFERENCES dealers(id));
            CREATE TABLE games (id TEXT PRIMARY KEY, name TEXT NOT NULL, drawtime TEXT NOT NULL, winningnumber TEXT, payoutsapproved INTEGER DEFAULT 0);
            CREATE TABLE bets (id TEXT PRIMARY KEY, userid TEXT NOT NULL, dealerid TEXT NOT NULL, gameid TEXT NOT NULL, subgametype TEXT NOT NULL, numbers TEXT NOT NULL, amountpernumber NUMERIC(20,2) NOT NULL, totalamount NUMERIC(20,2) NOT NULL, timestamp TIMESTAMP NOT NULL, FOREIGN KEY (userid) REFERENCES users(id), FOREIGN KEY (dealerid) REFERENCES dealers(id), FOREIGN KEY (gameid) REFERENCES games(id));
            CREATE TABLE ledgers (id TEXT PRIMARY KEY, accountid TEXT NOT NULL, accounttype TEXT NOT NULL, timestamp TIMESTAMP NOT NULL, description TEXT NOT NULL, debit NUMERIC(20,2) NOT NULL, credit NUMERIC(20,2) NOT NULL, balance NUMERIC(20,2) NOT NULL);
            CREATE TABLE number_limits (id SERIAL PRIMARY KEY, gametype TEXT NOT NULL, numbervalue TEXT NOT NULL, limitamount NUMERIC(20,2) NOT NULL, UNIQUE(gametype, numbervalue));
        `;

        await client.query(schema);
        console.log('PostgreSQL schema created.');

        if (fs.existsSync(JSON_DB_PATH)) {
            const data = JSON.parse(fs.readFileSync(JSON_DB_PATH, 'utf-8'));
            
            const admin = data.admin;
            await client.query('INSERT INTO admins VALUES ($1,$2,$3,$4,$5,$6)', [admin.id, admin.name, admin.password, admin.wallet, JSON.stringify(admin.prizeRates), admin.avatarUrl]);
            
            for (const d of data.dealers) {
                await client.query('INSERT INTO dealers VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [d.id, d.name, d.password, d.area, d.contact, d.wallet, d.commissionRate, 0, JSON.stringify(d.prizeRates), JSON.stringify(d.betLimits || { oneDigit: 0, twoDigit: 0 }), d.avatarUrl]);
            }
            
            for (const u of data.users) {
                await client.query('INSERT INTO users VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [u.id, u.name, u.password, u.dealerId, u.area, u.contact, u.wallet, u.commissionRate, 0, JSON.stringify(u.prizeRates), JSON.stringify(u.betLimits || { oneDigit: 0, twoDigit: 0 }), u.avatarUrl]);
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
