
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

// Configure connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Alternatively, if DATABASE_URL is not provided, pg uses PGHOST, PGUSER, PGDATABASE, PGPASSWORD, PGPORT from .env automatically
});

const PKT_OFFSET_HOURS = 5;
const OPEN_HOUR_PKT = 16;

/**
 * Automatically converts SQLite style '?' placeholders to PG style '$1, $2...'
 */
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
        await pool.query('SELECT NOW()');
        console.error('Database connected successfully (PostgreSQL).');
    } catch (err) {
        console.error('Failed to connect to PostgreSQL:', err);
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
        console.error('CRITICAL: Database schema missing in PostgreSQL. Run npm run db:setup.');
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

    // PG automatically handles JSON in columns if typed as JSONB, 
    // but here we maintain the string-based parsing for compatibility with existing setup-database logic if it seeds as strings
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
        if (withLedger) acc.ledger = await query('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp ASC', [acc.id]);
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
