
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ababa_user:ababa123@localhost:5432/ababa_db',
  max: 15,
  idleTimeoutMillis: 30000,
});

const query = (text, params) => pool.query(text, params);

const safeParse = (str) => {
  try { return typeof str === 'string' ? JSON.parse(str) : str; } catch (e) { return null; }
};

module.exports = {
  pool,
  query,
  getAllFromTable: async (table) => {
    const res = await pool.query(`SELECT * FROM ${table}`);
    return res.rows.map(row => ({
      ...row,
      prizeRates: safeParse(row.prizerates),
      betLimits: safeParse(row.betlimits),
      isMarketOpen: row.ismarketopen,
      drawTime: row.drawtime,
      winningNumber: row.winningnumber
    }));
  },
  findAccountForLogin: async (loginId) => {
    const tables = ['admins', 'dealers', 'users'];
    for (const table of tables) {
      const res = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [loginId]);
      if (res.rows[0]) return { account: res.rows[0], role: table.slice(0, -1).toUpperCase() };
    }
    return { account: null, role: null };
  },
  findAccountById: async (id, table) => {
    const res = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    if (!res.rows[0]) return null;
    const acc = res.rows[0];
    const ledgerRes = await pool.query('SELECT * FROM ledgers WHERE accountId = $1 ORDER BY timestamp DESC LIMIT 100', [id]);
    return { ...acc, ledger: ledgerRes.rows, prizeRates: safeParse(acc.prizerates) };
  }
};
