
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

// Load environment variables
require('dotenv').config();

const poolConfig = {
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
};

if (!process.env.DATABASE_URL) {
    console.error('CRITICAL ERROR: DATABASE_URL is not defined in .env');
    process.exit(1);
}

const pool = new Pool(poolConfig);

const PKT_OFFSET_HOURS = 5;
const OPEN_HOUR_PKT = 16;

/**
 * Maps DB row keys to camelCase for Frontend
 */
function mapRow(row) {
    if (!row) return null;
    const mapped = {};
    for (const key in row) {
        let newKey = key;
        if (key === 'prizerates') newKey = 'prizeRates';
        if (key === 'betlimits') newKey = 'betLimits';
        if (key === 'avatarurl') newKey = 'avatarUrl';
        if (key === 'drawtime') newKey = 'drawTime';
        if (key === 'winningnumber') newKey = 'winningNumber';
        if (key === 'payoutsapproved') newKey = 'payoutsApproved';
        if (key === 'isrestricted') newKey = 'isRestricted';
        if (key === 'commissionrate') newKey = 'commissionRate';
        if (key === 'dealerid') newKey = 'dealerId';
        if (key === 'userid') newKey = 'userId';
        if (key === 'gameid') newKey = 'gameId';
        if (key === 'subgametype') newKey = 'subGameType';
        if (key === 'amountpernumber') newKey = 'amountPerNumber';
        if (key === 'totalamount') newKey = 'totalAmount';
        if (key === 'accountid') newKey = 'accountId';
        if (key === 'accounttype') newKey = 'accountType';
        
        mapped[newKey] = row[key];
    }

    // JSON Parsing safety
    if (typeof mapped.prizeRates === 'string') {
        try { mapped.prizeRates = JSON.parse(mapped.prizeRates); } catch(e) {}
    }
    if (typeof mapped.betLimits === 'string') {
        try { mapped.betLimits = JSON.parse(mapped.betLimits); } catch(e) {}
    }
    if (typeof mapped.numbers === 'string') {
        try { mapped.numbers = JSON.parse(mapped.numbers); } catch(e) {}
    }
    if (mapped.isRestricted !== undefined) mapped.isRestricted = !!mapped.isRestricted;
    if (mapped.payoutsApproved !== undefined) mapped.payoutsApproved = !!mapped.payoutsApproved;

    return mapped;
}

/**
 * Automatically converts SQLite style '?' placeholders to PG style '$1, $2...'
 */
function convertPlaceholders(sql) {
    let index = 1;
    return sql.replace(/\?/g, () => `$${index++}`);
}

function getGameCycle(drawTime) {
    if (!drawTime || typeof drawTime !== 'string' || !drawTime.includes(':')) {
        return { openTime: new Date(), closeTime: new Date() };
    }
    
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
    const { openTime, closeTime } = getGameCycle(drawTime);
    const now = new Date();
    return now >= openTime && now < closeTime;
}

const connect = async () => {
    try {
        const client = await pool.connect();
        console.error('----------------------------------------');
        console.error('A-BABA POSTGRES ENGINE ONLINE');
        console.error('DATABASE: Connection Verified');
        console.error('----------------------------------------');
        client.release();
    } catch (err) {
        console.error('CRITICAL: Failed to connect to PostgreSQL.');
        console.error('ERROR DETAIL:', err.message);
        process.exit(1);
    }
};

const query = async (sql, params = []) => {
    const res = await pool.query(convertPlaceholders(sql), params);
    return res.rows.map(mapRow);
};

const get = async (sql, params = []) => {
    const res = await pool.query(convertPlaceholders(sql), params);
    return mapRow(res.rows[0]);
};

const run = async (sql, params = []) => {
    const res = await pool.query(convertPlaceholders(sql), params);
    return { id: res.rows[0]?.id || null, changes: res.rowCount };
};

const verifySchema = async () => {
    try {
        const res = await get("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = 'admins'");
        if (!res) {
            console.error('CRITICAL: Database schema missing. Run "npm run db:setup".');
            process.exit(1);
        }
    } catch (e) {
        console.error('Schema verification failed:', e.message);
        process.exit(1);
    }
};

const findAccountById = async (id, table) => {
    const account = await get(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    if (!account) return null;

    if (table !== 'games') {
        account.ledger = await query('SELECT * FROM ledgers WHERE accountid = ? ORDER BY timestamp DESC LIMIT 100', [id]);
    } else {
        account.isMarketOpen = isGameOpen(account.drawTime);
    }
    
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
        if (withLedger) {
            acc.ledger = await query('SELECT * FROM ledgers WHERE accountid = ? ORDER BY timestamp DESC LIMIT 50', [acc.id]);
        }
        if (table === 'games') {
            acc.isMarketOpen = isGameOpen(acc.drawTime);
        }
        return acc;
    }));
};

const addLedgerEntry = async (accountId, accountType, description, debit, credit) => {
    const table = accountType.toLowerCase() + 's';
    const lastEntry = await get('SELECT balance FROM ledgers WHERE accountid = ? ORDER BY timestamp DESC, id DESC LIMIT 1', [accountId]);
    const lastBalance = lastEntry ? parseFloat(lastEntry.balance) : 0;

    if (debit > 0 && accountType !== 'ADMIN' && lastBalance < debit) {
        throw { status: 400, message: `Insufficient funds.` };
    }

    const newBalance = lastBalance - debit + credit;
    await run('INSERT INTO ledgers (id, accountid, accounttype, timestamp, description, debit, credit, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
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
