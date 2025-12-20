
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ababa_user:ababa123@localhost:5432/ababa_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const query = async (text, params) => {
  return await pool.query(text, params);
};

const safeParse = (str) => {
  try { return str ? (typeof str === 'string' ? JSON.parse(str) : str) : null; } 
  catch (e) { return null; }
};

module.exports = {
  pool,
  query,
  verifySchema: async () => {
    try {
      const res = await pool.query("SELECT to_regclass('public.admins') as exists");
      return !!res.rows[0].exists;
    } catch (e) { return false; }
  },
  getAllFromTable: async (table) => {
    const res = await pool.query(`SELECT * FROM ${table}`);
    return res.rows.map(item => {
      // Map postgres lowercase keys to camelCase for the frontend
      const mapped = { ...item };
      if (item.prizerates) mapped.prizeRates = safeParse(item.prizerates);
      if (item.ismarketopen !== undefined) mapped.isMarketOpen = item.ismarketopen;
      if (item.drawtime) mapped.drawTime = item.drawtime;
      if (item.winningnumber) mapped.winningNumber = item.winningnumber;
      return mapped;
    });
  },
  findAccountForLogin: async (loginId) => {
    const roles = ['users', 'dealers', 'admins'];
    for (const table of roles) {
      const res = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [loginId]);
      if (res.rows[0]) return { account: res.rows[0], role: table.slice(0, -1).toUpperCase() };
    }
    return { account: null, role: null };
  },
  findAccountById: async (id, table) => {
    const res = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    const acc = res.rows[0];
    if (!acc) return null;
    const ledgerRes = await pool.query('SELECT * FROM ledgers WHERE accountId = $1 ORDER BY timestamp DESC LIMIT 100', [id]);
    acc.ledger = ledgerRes.rows;
    return acc;
  }
};
