
const { Client } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 'postgresql://ababa_user:ababa123@localhost:5432/ababa_db';

async function setup() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log("INITIALIZING POSTGRESQL ENGINE (PKT STANDARDIZED)...");

    await client.query(`
      DROP TABLE IF EXISTS bets CASCADE;
      DROP TABLE IF EXISTS ledgers CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TABLE IF EXISTS dealers CASCADE;
      DROP TABLE IF EXISTS admins CASCADE;
      DROP TABLE IF EXISTS games CASCADE;

      CREATE TABLE admins (
        id TEXT PRIMARY KEY, 
        name TEXT NOT NULL, 
        password TEXT NOT NULL, 
        wallet NUMERIC(20,2) DEFAULT 0, 
        prizeRates TEXT
      );

      CREATE TABLE dealers (
        id TEXT PRIMARY KEY, 
        name TEXT NOT NULL, 
        password TEXT NOT NULL, 
        area TEXT, 
        contact TEXT, 
        wallet NUMERIC(20,2) DEFAULT 0, 
        commissionRate NUMERIC(5,2) DEFAULT 0, 
        isRestricted BOOLEAN DEFAULT FALSE, 
        prizeRates TEXT
      );

      CREATE TABLE users (
        id TEXT PRIMARY KEY, 
        name TEXT NOT NULL, 
        password TEXT NOT NULL, 
        dealerId TEXT REFERENCES dealers(id), 
        area TEXT, 
        contact TEXT, 
        wallet NUMERIC(20,2) DEFAULT 0, 
        isRestricted BOOLEAN DEFAULT FALSE, 
        prizeRates TEXT, 
        betLimits TEXT
      );

      CREATE TABLE games (
        id TEXT PRIMARY KEY, 
        name TEXT NOT NULL, 
        drawTime TEXT NOT NULL, 
        winningNumber TEXT, 
        isMarketOpen BOOLEAN DEFAULT TRUE
      );

      CREATE TABLE ledgers (
        id SERIAL PRIMARY KEY, 
        accountId TEXT NOT NULL, 
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
        description TEXT NOT NULL, 
        debit NUMERIC(20,2) DEFAULT 0, 
        credit NUMERIC(20,2) DEFAULT 0, 
        balance NUMERIC(20,2) DEFAULT 0
      );

      CREATE TABLE bets (
        id TEXT PRIMARY KEY,
        userId TEXT REFERENCES users(id),
        dealerId TEXT REFERENCES dealers(id),
        gameId TEXT REFERENCES games(id),
        subGameType TEXT,
        numbers TEXT,
        amountPerNumber NUMERIC(20,2),
        totalAmount NUMERIC(20,2),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Seed Data (Standard PKT Circuit)
      INSERT INTO admins (id, name, password, wallet, prizeRates) 
      VALUES ('Guru', 'Guru', 'Pak@4646', 1000000, '{"oneDigitOpen":90,"oneDigitClose":90,"twoDigit":900}');

      INSERT INTO games (id, name, drawTime) VALUES 
      ('g1', 'Ali Baba', '18:15'), ('g2', 'GSM', '18:45'), ('g3', 'OYO TV', '20:15'),
      ('g4', 'LS1', '20:45'), ('g5', 'OLA TV', '21:15'), ('g6', 'AK', '21:55'),
      ('g7', 'LS2', '23:45'), ('g8', 'AKC', '00:55'), ('g9', 'LS3', '02:10'), ('g10', 'LS4', '03:10');

      INSERT INTO dealers (id, name, password, area, contact, wallet, commissionRate, prizeRates)
      VALUES ('dealer01', 'ABD-001', 'Pak@123', 'KHI', '03323022123', 50000, 10, '{"oneDigitOpen":80,"oneDigitClose":80,"twoDigit":800}');
    `);
    console.log("----------------------------------------");
    console.log("POSTGRESQL SCHEMA DEPLOYED (PKT READY)");
    console.log("----------------------------------------");
  } catch (err) {
    console.error("DEPLOYMENT FAILURE:", err.message);
  } finally {
    await client.end();
  }
}
setup();
