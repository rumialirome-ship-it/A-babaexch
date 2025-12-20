
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'database.sqlite');
let db;

const PKT_OFFSET_HOURS = 5;
const OPEN_HOUR_PKT = 16; 

function getGameCycle(drawTime) {
    const now = new Date();
    const [drawHoursPKT, drawMinutesPKT] = drawTime.split(':').map(Number);
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate();
    const openHourUTC = OPEN_HOUR_PKT - PKT_OFFSET_HOURS;

    const todayOpen = new Date(Date.UTC(year, month, day, openHourUTC, 0, 0));
    const yesterdayOpen = new Date(todayOpen.getTime() - (24 * 60 * 60 * 1000));

    const calculateCloseTime = (openDate) => {
        const closeDate = new Date(openDate.getTime());
        const drawHourUTC = drawHoursPKT - PKT_OFFSET_HOURS;
        closeDate.setUTCHours(drawHourUTC, drawMinutesPKT, 0, 0);
        if (drawHoursPKT < OPEN_HOUR_PKT) {
            closeDate.setUTCDate(closeDate.getUTCDate() + 1);
        }
        return closeDate;
    };

    const yesterdayCycleClose = calculateCloseTime(yesterdayOpen);
    if (now >= yesterdayOpen && now < yesterdayCycleClose) {
        return { openTime: yesterdayOpen, closeTime: yesterdayCycleClose };
    }
    const todayCycleClose = calculateCloseTime(todayOpen);
    return { openTime: todayOpen, closeTime: todayCycleClose };
}

function isGameOpen(drawTime) {
    const now = new Date();
    const { openTime, closeTime } = getGameCycle(drawTime);
    return now >= openTime && now < closeTime;
}

const connect = () => {
    db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) {
            console.error('Failed to connect to database:', err);
            process.exit(1);
        }
        console.error('Database connected successfully (SQLite3).');
        db.run('PRAGMA journal_mode = WAL');
        db.run('PRAGMA foreign_keys = ON');
    });
};

const query = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const get = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const run = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, changes: this.changes });
        });
    });
};

const verifySchema = async () => {
    const row = await get("SELECT name FROM sqlite_master WHERE type='table' AND name='admins'");
    if (!row) {
        console.error('CRITICAL: Database schema missing. Run npm run db:setup.');
        process.exit(1);
    }
};

const findAccountById = async (id, table) => {
    const account = await get(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    if (!account) return null;

    if (table !== 'games') {
        const ledgers = await query('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp ASC', [id]);
        account.ledger = ledgers;
    } else {
        account.isMarketOpen = isGameOpen(account.drawTime);
    }

    if (account.prizeRates) account.prizeRates = JSON.parse(account.prizeRates);
    if (account.betLimits) account.betLimits = JSON.parse(account.betLimits);
    if (account.isRestricted !== undefined) account.isRestricted = !!account.isRestricted;
    
    return account;
};

const findAccountForLogin = async (loginId) => {
    const tables = [{ name: 'users', role: 'USER' }, { name: 'dealers', role: 'DEALER' }, { name: 'admins', role: 'ADMIN' }];
    for (const tableInfo of tables) {
        const account = await get(`SELECT * FROM ${tableInfo.name} WHERE lower(id) = ?`, [loginId.toLowerCase()]);
        if (account) return { account, role: tableInfo.role };
    }
    return { account: null, role: null };
};

const getAllFromTable = async (table, withLedger = false) => {
    const rows = await query(`SELECT * FROM ${table}`);
    return Promise.all(rows.map(async (acc) => {
        if (withLedger) acc.ledger = await query('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp ASC', [acc.id]);
        if (table === 'games') acc.isMarketOpen = isGameOpen(acc.drawTime);
        if (acc.prizeRates) acc.prizeRates = JSON.parse(acc.prizeRates);
        if (acc.betLimits) acc.betLimits = JSON.parse(acc.betLimits);
        if (acc.numbers) acc.numbers = JSON.parse(acc.numbers);
        if (acc.isRestricted !== undefined) acc.isRestricted = !!acc.isRestricted;
        return acc;
    }));
};

const addLedgerEntry = async (accountId, accountType, description, debit, credit) => {
    const table = accountType.toLowerCase() + 's';
    const lastEntry = await get('SELECT balance FROM ledgers WHERE accountId = ? ORDER BY timestamp DESC, ROWID DESC LIMIT 1', [accountId]);
    const lastBalance = lastEntry ? lastEntry.balance : 0;

    if (debit > 0 && accountType !== 'ADMIN' && lastBalance < debit) {
        throw { status: 400, message: `Insufficient funds.` };
    }

    const newBalance = lastBalance - debit + credit;
    await run('INSERT INTO ledgers (id, accountId, accountType, timestamp, description, debit, credit, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [uuidv4(), accountId, accountType, new Date().toISOString(), description, debit, credit, newBalance]);
    await run(`UPDATE ${table} SET wallet = ? WHERE id = ?`, [newBalance, accountId]);
};

module.exports = {
    connect, verifySchema, findAccountById, findAccountForLogin, getAllFromTable, addLedgerEntry, get, run, query,
    runInTransaction: (fn) => db.serialize(fn),
    updatePassword: async (id, contact, pass) => {
        for (const t of ['users', 'dealers']) {
            const res = await run(`UPDATE ${t} SET password = ? WHERE id = ? AND contact = ?`, [pass, id, contact]);
            if (res.changes > 0) return true;
        }
        return false;
    }
};
