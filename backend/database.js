
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'database.sqlite');

// Ensure database file exists
if (!fs.existsSync(dbPath)) {
    console.warn("WARNING: database.sqlite not found. Please run 'npm run db:setup'.");
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('CRITICAL: Could not connect to database', err);
    } else {
        console.log('SQLITE ENGINE: Connected to local database file.');
    }
});

// Helper for Promisified queries
const query = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
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

const get = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const mapResult = (row) => {
    if (!row) return null;
    const safeParse = (str) => {
        if (!str) return null;
        try { return typeof str === 'string' ? JSON.parse(str) : str; } 
        catch (e) { return null; }
    };

    return {
        ...row,
        id: row.id,
        name: row.name,
        prizeRates: safeParse(row.prizeRates || row.prizerates),
        betLimits: safeParse(row.betLimits || row.betlimits),
        isMarketOpen: !!(row.isMarketOpen || row.ismarketopen),
        drawTime: row.drawTime || row.drawtime,
        winningNumber: row.winningNumber || row.winningnumber,
        isRestricted: !!(row.isRestricted || row.isrestricted),
        dealerId: row.dealerId || row.dealerid,
        commissionRate: parseFloat(row.commissionRate || row.commissionrate || 0),
        wallet: parseFloat(row.wallet || 0)
    };
};

module.exports = {
    db,
    query,
    run,
    get,
    
    getAllFromTable: async (table) => {
        const rows = await query(`SELECT * FROM ${table}`);
        return rows.map(mapResult);
    },

    findAccountForLogin: async (loginId) => {
        const tables = ['admins', 'dealers', 'users'];
        for (const table of tables) {
            const row = await get(`SELECT * FROM ${table} WHERE id = ?`, [loginId]);
            if (row) return { 
                account: mapResult(row), 
                role: table.slice(0, -1).toUpperCase() 
            };
        }
        return { account: null, role: null };
    },

    findAccountById: async (id, table) => {
        const row = await get(`SELECT * FROM ${table} WHERE id = ?`, [id]);
        if (!row) return null;
        const acc = mapResult(row);
        
        const ledgerRows = await query(
            'SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp DESC LIMIT 100', 
            [id]
        );
        acc.ledger = ledgerRows.map(l => ({
            ...l,
            debit: parseFloat(l.debit || 0),
            credit: parseFloat(l.credit || 0),
            balance: parseFloat(l.balance || 0),
            timestamp: new Date(l.timestamp)
        }));
        return acc;
    }
};
