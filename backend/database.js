
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ababa_user:ababa123@localhost:5432/ababa_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Helper to handle PostgreSQL's lowercase column names and JSON parsing
const mapResult = (row) => {
  if (!row) return null;
  const safeParse = (str) => {
    try { return typeof str === 'string' ? JSON.parse(str) : str; } 
    catch (e) { return null; }
  };

  return {
    ...row,
    prizeRates: safeParse(row.prizerates),
    betLimits: safeParse(row.betlimits),
    isMarketOpen: row.ismarketopen,
    drawTime: row.drawtime,
    winningNumber: row.winningnumber,
    isRestricted: row.isrestricted,
    dealerId: row.dealerid,
    commissionRate: row.commissionrate ? parseFloat(row.commissionrate) : 0,
    wallet: row.wallet ? parseFloat(row.wallet) : 0
  };
};

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  
  getAllFromTable: async (table) => {
    const res = await pool.query(`SELECT * FROM ${table}`);
    return res.rows.map(mapResult);
  },

  findAccountForLogin: async (loginId) => {
    const tables = ['admins', 'dealers', 'users'];
    for (const table of tables) {
      const res = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [loginId]);
      if (res.rows[0]) return { 
        account: mapResult(res.rows[0]), 
        role: table.slice(0, -1).toUpperCase() 
      };
    }
    return { account: null, role: null };
  },

  findAccountById: async (id, table) => {
    const res = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    if (!res.rows[0]) return null;
    const acc = mapResult(res.rows[0]);
    
    // Fetch ledger for this account
    const ledgerRes = await pool.query(
      'SELECT * FROM ledgers WHERE accountId = $1 ORDER BY timestamp DESC LIMIT 100', 
      [id]
    );
    acc.ledger = ledgerRes.rows.map(l => ({
        ...l,
        debit: parseFloat(l.debit),
        credit: parseFloat(l.credit),
        balance: parseFloat(l.balance)
    }));
    return acc;
  }
};
