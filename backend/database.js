
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

// Load environment variables if not already loaded
require('dotenv').config();

const poolConfig = {
    connectionString: process.env.DATABASE_URL,
    // Ensure SCRAM authentication doesn't fail if password is not explicitly in string
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
};

// Fallback for local development if DATABASE_URL is partial
if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes(':') && !process.env.DATABASE_URL.startsWith('postgres')) {
    console.error('CRITICAL: DATABASE_URL appears invalid. It must be a full PostgreSQL connection string.');
}

const pool = new Pool(poolConfig);

const PKT_OFFSET_HOURS = 5;
const OPEN_HOUR_PKT = 16;

function convertPlaceholders(sql) {
    let index = 1;
    return sql.replace(/\?/g, () => `$${index++}`);
}

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

const connect = async () => {
    try {
        const client = await pool.connect();
        console.error('############################################################');
        console.error('>>> A-BABA POSTGRES ENGINE ONLINE <<<');
        console.error('############################################################');
        client.release();
    } catch (err) {
        console.error('CRITICAL: Failed to connect to PostgreSQL:', err.message);
        console.error('Check your DATABASE_URL in the .env file.');
        process.exit(1);
    }
};

const query = async (sql, params = []) => {
    const res = await pool.query(convertPlaceholders(sql), params);
    return res.rows;
};

const get = async (sql, params = []) => {
    const res = await pool.query(convertPlaceholders(sql), params);
    return res.rows[0];
};

const run = async (sql, params = []) => {
    const res = await pool.query(convertPlaceholders(sql), params);
    return { id: res.rows[0]?.id || null, changes: res.rowCount };
};

const verifySchema = async () => {
    const res = await get("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = 'admins'");
    if (!res) {
        console.error('CRITICAL: Database schema missing. Run "npm run db:setup" first.');
        process.exit(1);
    }
};

const findAccountById = async (id, table) => {
    const account = await get(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    if (!account) return null;

    if (table !== 'games') {
        const ledgers = await query('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp DESC LIMIT 100', [id]);
        account.ledger = ledgers;
    } else {
        account.isMarketOpen = isGameOpen(account.drawTime);
    }

    if (typeof account.prizeRates === 'string') account.prizeRates = JSON.parse(account.prizeRates);
    if (typeof account.betLimits === 'string') account.betLimits = JSON.parse(account.betLimits);
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
        if (withLedger) acc.ledger = await query('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp DESC LIMIT 50', [acc.id]);
        if (table === 'games') acc.isMarketOpen = isGameOpen(acc.drawTime);
        if (typeof acc.prizeRates === 'string') acc.prizeRates = JSON.parse(acc.prizeRates);
        if (typeof acc.betLimits === 'string') acc.betLimits = JSON.parse(acc.betLimits);
        if (typeof acc.numbers === 'string') acc.numbers = JSON.parse(acc.numbers);
        if (acc.isRestricted !== undefined) acc.isRestricted = !!acc.isRestricted;
        return acc;
    }));
};

const addLedgerEntry = async (accountId, accountType, description, debit, credit) => {
    const table = accountType.toLowerCase() + 's';
    const lastEntry = await get('SELECT balance FROM ledgers WHERE accountId = ? ORDER BY timestamp DESC, id DESC LIMIT 1', [accountId]);
    const lastBalance = lastEntry ? parseFloat(lastEntry.balance) : 0;

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
    runInTransaction: async (fn) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await fn(client);
            await client.query('COMMIT');
            return result;
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    },
    updatePassword: async (id, contact, pass) => {
        for (const t of ['users', 'dealers']) {
            const res = await run(`UPDATE ${t} SET password = ? WHERE id = ? AND contact = ?`, [pass, id, contact]);
            if (res.changes > 0) return true;
        }
        return false;
    }
};
