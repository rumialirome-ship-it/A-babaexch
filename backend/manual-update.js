
const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'database.sqlite');
const ADMIN_ID = 'Guru';
const DEPOSIT_AMOUNT = 900000000;
const DEPOSIT_DESCRIPTION = 'Manual System Deposit (via script)';

console.log('--- A-Baba Admin Wallet Update Script ---');

let db;
try {
    db = new Database(DB_PATH);
    console.log('Successfully connected to database.sqlite.');
} catch (error) {
    console.error('Failed to connect to the database. Ensure this script is in the `backend` directory.');
    console.error(error);
    process.exit(1);
}

const transaction = db.transaction(() => {
    // Check if this deposit has already been made by this script
    const checkStmt = db.prepare('SELECT id FROM ledgers WHERE accountId = ? AND description = ?');
    const existingEntry = checkStmt.get(ADMIN_ID, DEPOSIT_DESCRIPTION);

    if (existingEntry) {
        console.log('Deposit has already been applied by this script. Aborting to prevent duplicate entries.');
        return;
    }

    // 1. Get the admin's current wallet balance from the last ledger entry.
    const lastBalanceStmt = db.prepare('SELECT balance FROM ledgers WHERE accountId = ? ORDER BY timestamp DESC, ROWID DESC LIMIT 1');
    const lastEntry = lastBalanceStmt.get(ADMIN_ID);
    const lastBalance = lastEntry ? lastEntry.balance : 0;
    console.log(`Admin's last known balance: ${lastBalance}`);

    // 2. Calculate new balance
    const newBalance = lastBalance + DEPOSIT_AMOUNT;
    console.log(`New balance will be: ${newBalance}`);

    // 3. Insert the new ledger entry
    const insertLedgerStmt = db.prepare('INSERT INTO ledgers (id, accountId, accountType, timestamp, description, debit, credit, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    insertLedgerStmt.run(uuidv4(), ADMIN_ID, 'ADMIN', new Date().toISOString(), DEPOSIT_DESCRIPTION, 0, DEPOSIT_AMOUNT, newBalance);
    console.log('Ledger entry created successfully.');

    // 4. Update the admin's wallet in the admins table
    const updateWalletStmt = db.prepare('UPDATE admins SET wallet = ? WHERE id = ?');
    const result = updateWalletStmt.run(newBalance, ADMIN_ID);
    
    if (result.changes === 0) {
        throw new Error(`Failed to update wallet for admin ID: ${ADMIN_ID}. Admin not found.`);
    }
    console.log('Admin wallet updated successfully.');
    console.log('\n--- UPDATE COMPLETE ---');
    console.log('Please delete this script (manual-update.js) now.');
});

try {
    transaction();
} catch (error) {
    console.error('\n--- TRANSACTION FAILED ---');
    console.error('An error occurred. No changes were made to the database.');
    console.error(error.message);
} finally {
    if (db) {
        db.close();
        console.log('Database connection closed.');
    }
}
