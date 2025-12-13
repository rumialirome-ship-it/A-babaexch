
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Fix: Node.js 17+ resolves 'localhost' to IPv6 (::1). MySQL often binds to IPv4 (127.0.0.1).
const dbHost = (process.env.DB_HOST === 'localhost' || !process.env.DB_HOST) ? '127.0.0.1' : process.env.DB_HOST;

// MySQL Connection Pool
const pool = mysql.createPool({
    host: dbHost,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ababa_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    decimalNumbers: true // Return decimals as numbers, not strings
});

// --- CENTRALIZED GAME TIMING LOGIC ---
const PKT_OFFSET_HOURS = 5;
const OPEN_HOUR_PKT = 16; 
const RESET_HOUR_UTC = OPEN_HOUR_PKT - PKT_OFFSET_HOURS; // 11:00 UTC

const getMarketDateString = (dateObj) => {
    const d = new Date(dateObj.getTime());
    if (d.getUTCHours() < RESET_HOUR_UTC) {
        d.setUTCDate(d.getUTCDate() - 1);
    }
    return d.toISOString().split('T')[0];
};

function getGameCycle(drawTime) {
    const now = new Date();
    const [drawHoursPKT, drawMinutesPKT] = drawTime.split(':').map(Number);
    const openHourUTC = OPEN_HOUR_PKT - PKT_OFFSET_HOURS;

    let lastOpenTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), openHourUTC, 0, 0));
    if (now.getTime() < lastOpenTime.getTime()) {
        lastOpenTime.setUTCDate(lastOpenTime.getUTCDate() - 1);
    }
    
    let closeTime = new Date(lastOpenTime.getTime());
    const drawHourUTC = (drawHoursPKT - PKT_OFFSET_HOURS + 24) % 24;
    closeTime.setUTCHours(drawHourUTC, drawMinutesPKT, 0, 0);

    if (closeTime.getTime() <= lastOpenTime.getTime()) {
        closeTime.setUTCDate(closeTime.getUTCDate() + 1);
    }
    
    return { openTime: lastOpenTime, closeTime: closeTime };
}

function isGameOpen(drawTime) {
    const now = new Date(); 
    const { openTime, closeTime } = getGameCycle(drawTime);
    return now >= openTime && now < closeTime;
}

// --- HELPER FUNCTIONS ---

// Helper to use either a provided connection (inside transaction) or pool
const execute = async (sql, params, conn = null) => {
    const executor = conn || pool;
    const [rows] = await executor.execute(sql, params);
    return rows;
};

// Optimization: Ensure indexes exist for performance
const ensureIndices = async () => {
    try {
        const conn = await pool.getConnection();
        // Check and add index on bets(timestamp)
        try {
            await conn.execute("CREATE INDEX idx_bets_timestamp ON bets(timestamp)");
            console.log("⚡ Optimized: Created index on bets(timestamp)");
        } catch (e) { /* Index likely exists, ignore */ }
        
        // Check and add index on bets(gameId)
        try {
            await conn.execute("CREATE INDEX idx_bets_gameId ON bets(gameId)");
            console.log("⚡ Optimized: Created index on bets(gameId)");
        } catch (e) { /* Index likely exists, ignore */ }

        conn.release();
    } catch (err) {
        console.error("Index check failed:", err.message);
    }
};

const verifySchema = async () => {
    try {
        const rows = await execute("SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_name = 'admins'", [process.env.DB_NAME || 'ababa_db']);
        if (rows.length === 0) {
            console.error('\nCRITICAL: Database schema not found. Please run "node setup-mysql.js"');
            process.exit(1);
        }
        await ensureIndices(); // Run optimization on startup
        console.log('MySQL schema verified and indices optimized.');
    } catch (error) {
        console.error('MySQL Connection Failed:', error);
        process.exit(1);
    }
};

// Generic finder
const findAccountById = async (id, table, conn = null) => {
    const rows = await execute(`SELECT * FROM ${table} WHERE id = ?`, [id], conn);
    const account = rows[0];
    if (!account) return null;

    try {
        // Fetch ledger
        if (table !== 'games' && table !== 'daily_results') {
            // Optimization: Limit ledger to last 500 entries for initial load
            account.ledger = await execute('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp DESC LIMIT 500', [id], conn);
        } else if (table === 'games') {
            account.isMarketOpen = isGameOpen(account.drawTime);
        }

        // Parse JSON fields
        if (account.prizeRates) {
            if (typeof account.prizeRates === 'string') account.prizeRates = JSON.parse(account.prizeRates);
        }
        if (account.betLimits) {
            if (typeof account.betLimits === 'string') account.betLimits = JSON.parse(account.betLimits);
        }
        if (typeof account.isRestricted !== 'undefined') account.isRestricted = !!account.isRestricted;
        if (typeof account.payoutsApproved !== 'undefined') account.payoutsApproved = !!account.payoutsApproved;

    } catch (e) {
        console.error(`Parse error for ${table} id ${id}`, e);
    }
    return account;
};

const findAccountForLogin = async (loginId) => {
    const lowerId = loginId.toLowerCase();
    const tables = [
        { name: 'users', role: 'USER' },
        { name: 'dealers', role: 'DEALER' },
        { name: 'admins', role: 'ADMIN' },
    ];

    for (const t of tables) {
        const rows = await execute(`SELECT * FROM ${t.name} WHERE LOWER(id) = ?`, [lowerId]);
        if (rows.length > 0) return { account: rows[0], role: t.role };
    }
    return { account: null, role: null };
};

const updatePassword = async (accountId, contact, newPassword) => {
    for (const table of ['users', 'dealers']) {
        const res = await execute(`UPDATE ${table} SET password = ? WHERE id = ? AND contact = ?`, [newPassword, accountId, contact]);
        if (res.affectedRows > 0) return true;
    }
    return false;
};

const getAllFromTable = async (table) => {
    // Dangerous function for large tables, kept for small tables like games/results
    const accounts = await execute(`SELECT * FROM ${table}`);
    if (table === 'daily_results') return accounts;

    const results = await Promise.all(accounts.map(async acc => {
        try {
            if (table === 'games') acc.isMarketOpen = isGameOpen(acc.drawTime);
            if (acc.prizeRates && typeof acc.prizeRates === 'string') acc.prizeRates = JSON.parse(acc.prizeRates);
            if (acc.betLimits && typeof acc.betLimits === 'string') acc.betLimits = JSON.parse(acc.betLimits);
            if (table === 'bets' && acc.numbers && typeof acc.numbers === 'string') acc.numbers = JSON.parse(acc.numbers);
            if (typeof acc.isRestricted !== 'undefined') acc.isRestricted = !!acc.isRestricted;
            if (typeof acc.payoutsApproved !== 'undefined') acc.payoutsApproved = !!acc.payoutsApproved;
            
            acc.ledger = []; 
        } catch (e) { console.error(e); }
        return acc;
    }));
    return results;
};

// Internal helper for ledgers, requires a connection to be part of transaction
const addLedgerEntry = async (conn, accountId, accountType, description, debit, credit) => {
    const table = accountType.toLowerCase() + 's';
    
    const [accRows] = await conn.execute(`SELECT wallet FROM ${table} WHERE id = ? FOR UPDATE`, [accountId]);
    if (accRows.length === 0) throw { status: 404, message: 'Account not found during ledger update.' };
    
    const currentWallet = parseFloat(accRows[0].wallet);

    if (debit > 0 && accountType !== 'ADMIN' && currentWallet < debit) {
        throw { status: 400, message: `Insufficient funds. Wallet: ${currentWallet}, Needed: ${debit}.` };
    }

    const newBalance = currentWallet - debit + credit;
    const entryId = uuidv4();
    const timestamp = new Date().toISOString();

    await conn.execute(
        'INSERT INTO ledgers (id, accountId, accountType, timestamp, description, debit, credit, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [entryId, accountId, accountType, timestamp, description, debit, credit, newBalance]
    );

    await conn.execute(`UPDATE ${table} SET wallet = ? WHERE id = ?`, [newBalance, accountId]);
};

// --- TRANSACTIONAL WRAPPERS FOR SERVER.JS ---

const performUserTopUp = async (dealerId, userId, amount) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const user = await findAccountById(userId, 'users', conn);
        const dealer = await findAccountById(dealerId, 'dealers', conn);
        if (!user || user.dealerId !== dealerId) throw new Error("Invalid User");
        
        await addLedgerEntry(conn, dealerId, 'DEALER', `Top-Up for User: ${user.name}`, amount, 0);
        await addLedgerEntry(conn, userId, 'USER', `Top-Up from Dealer: ${dealer.name}`, 0, amount);
        
        await conn.commit();
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
};

const performUserWithdrawal = async (dealerId, userId, amount) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const user = await findAccountById(userId, 'users', conn);
        const dealer = await findAccountById(dealerId, 'dealers', conn);
        if (!user || user.dealerId !== dealerId) throw new Error("Invalid User");

        await addLedgerEntry(conn, userId, 'USER', `Withdrawal by Dealer: ${dealer.name}`, amount, 0);
        await addLedgerEntry(conn, dealerId, 'DEALER', `Withdrawal from User: ${user.name}`, 0, amount);

        await conn.commit();
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
};

const performDealerTopUp = async (adminId, dealerId, amount) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const dealer = await findAccountById(dealerId, 'dealers', conn);
        
        await addLedgerEntry(conn, adminId, 'ADMIN', `Top-Up for Dealer: ${dealer.name}`, amount, 0);
        await addLedgerEntry(conn, dealerId, 'DEALER', 'Top-Up from Admin', 0, amount);
        
        await conn.commit();
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
};

const performDealerWithdrawal = async (adminId, dealerId, amount) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const dealer = await findAccountById(dealerId, 'dealers', conn);
        
        await addLedgerEntry(conn, dealerId, 'DEALER', 'Withdrawal by Admin', amount, 0);
        await addLedgerEntry(conn, adminId, 'ADMIN', `Withdrawal from Dealer: ${dealer.name}`, 0, amount);
        
        await conn.commit();
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
};

const createUser = async (userData, dealerId, initialDeposit) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const existing = await execute('SELECT id FROM users WHERE LOWER(id) = ?', [userData.id.toLowerCase()], conn);
        if (existing.length > 0) throw { status: 400, message: "User Login ID taken." };

        const dealer = await findAccountById(dealerId, 'dealers', conn);
        if (dealer.wallet < initialDeposit) throw { status: 400, message: 'Dealer insufficient funds.' };

        await conn.execute(
            'INSERT INTO users (id, name, password, dealerId, area, contact, wallet, commissionRate, isRestricted, prizeRates, betLimits, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [userData.id, userData.name, userData.password, dealerId, userData.area, userData.contact, 0, userData.commissionRate, 0, JSON.stringify(userData.prizeRates), JSON.stringify(userData.betLimits), userData.avatarUrl]
        );

        if (initialDeposit > 0) {
            await addLedgerEntry(conn, dealerId, 'DEALER', `Initial Deposit for User: ${userData.name}`, initialDeposit, 0);
            await addLedgerEntry(conn, userData.id, 'USER', `Initial Deposit from Dealer: ${dealer.name}`, 0, initialDeposit);
        }

        await conn.commit();
        return await findAccountById(userData.id, 'users');
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
};

const createDealer = async (dealerData) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const existing = await execute('SELECT id FROM dealers WHERE LOWER(id) = ?', [dealerData.id.toLowerCase()], conn);
        if (existing.length > 0) throw { status: 400, message: "Dealer Login ID taken." };

        const initialAmount = dealerData.wallet || 0;
        
        const prizeRatesStr = typeof dealerData.prizeRates === 'string' 
            ? dealerData.prizeRates 
            : JSON.stringify(dealerData.prizeRates);

        await conn.execute(
            'INSERT INTO dealers (id, name, password, area, contact, wallet, commissionRate, isRestricted, prizeRates, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [dealerData.id, dealerData.name, dealerData.password, dealerData.area, dealerData.contact, 0, dealerData.commissionRate, 0, prizeRatesStr, dealerData.avatarUrl]
        );

        if (initialAmount > 0) {
            await addLedgerEntry(conn, dealerData.id, 'DEALER', 'Initial Deposit by Admin', 0, initialAmount);
        }
        await conn.commit();
        return await findAccountById(dealerData.id, 'dealers');
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
};

const updateUser = async (userData, userId, dealerId) => {
    const conn = await pool.getConnection();
    try {
        const [rows] = await conn.execute('SELECT * FROM users WHERE id = ? AND dealerId = ?', [userId, dealerId]);
        if (rows.length === 0) throw { status: 404, message: "User not found or access denied." };
        const existing = rows[0];
        
        const newPassword = userData.password || existing.password;
        await conn.execute(
            'UPDATE users SET name=?, password=?, area=?, contact=?, commissionRate=?, prizeRates=?, betLimits=?, avatarUrl=? WHERE id=?',
            [userData.name, newPassword, userData.area, userData.contact, userData.commissionRate, JSON.stringify(userData.prizeRates), JSON.stringify(userData.betLimits), userData.avatarUrl, userId]
        );
        return await findAccountById(userId, 'users', conn);
    } finally {
        conn.release();
    }
};

const updateDealer = async (dealerData, originalId) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const newId = dealerData.id;
        if (newId.toLowerCase() !== originalId.toLowerCase()) {
             const existing = await execute('SELECT id FROM dealers WHERE LOWER(id) = ?', [newId.toLowerCase()], conn);
             if (existing.length > 0) throw { status: 400, message: "Dealer ID taken." };
        }

        const prizeRatesStr = typeof dealerData.prizeRates === 'string' 
            ? dealerData.prizeRates 
            : JSON.stringify(dealerData.prizeRates);

        await conn.execute(
            'UPDATE dealers SET id=?, name=?, password=?, area=?, contact=?, commissionRate=?, prizeRates=?, avatarUrl=? WHERE id=?',
            [newId, dealerData.name, dealerData.password, dealerData.area, dealerData.contact, dealerData.commissionRate, prizeRatesStr, dealerData.avatarUrl, originalId]
        );

        if (newId !== originalId) {
            await conn.execute('UPDATE users SET dealerId=? WHERE dealerId=?', [newId, originalId]);
            await conn.execute('UPDATE bets SET dealerId=? WHERE dealerId=?', [newId, originalId]);
            await conn.execute("UPDATE ledgers SET accountId=? WHERE accountId=? AND accountType='DEALER'", [newId, originalId]);
        }
        await conn.commit();
        return await findAccountById(newId, 'dealers');
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
};

const getMarketDateForDeclaration = (drawTime) => {
    const { openTime } = getGameCycle(drawTime);
    const now = new Date();
    let marketDate;
    if (now.getTime() < openTime.getTime()) {
        const prev = new Date(openTime.getTime());
        prev.setUTCDate(prev.getUTCDate() - 1);
        marketDate = prev.toISOString().split('T')[0];
    } else {
        marketDate = openTime.toISOString().split('T')[0];
    }
    return marketDate;
};

const declareWinnerForGame = async (gameId, winningNumber) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const game = await findAccountById(gameId, 'games', conn);
        if (!game) throw { status: 404, message: 'Game not found' };
        if (game.winningNumber) throw { status: 400, message: 'Winner already declared' };

        const marketDate = getMarketDateForDeclaration(game.drawTime);
        const upsertSql = `INSERT INTO daily_results (id, gameId, date, winningNumber) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE winningNumber = VALUES(winningNumber)`;

        if (game.name === 'AK') {
            if (!/^\d$/.test(winningNumber)) throw { status: 400, message: 'AK open must be 1 digit' };
            await conn.execute('UPDATE games SET winningNumber = ? WHERE id = ?', [`${winningNumber}_`, gameId]);
        } else if (game.name === 'AKC') {
            if (!/^\d$/.test(winningNumber)) throw { status: 400, message: 'AKC must be 1 digit' };
            await conn.execute('UPDATE games SET winningNumber = ? WHERE id = ?', [winningNumber, gameId]);
            await conn.execute(upsertSql, [uuidv4(), gameId, marketDate, winningNumber]);

            // Auto-update AK
            const [akRows] = await conn.execute("SELECT * FROM games WHERE name = 'AK'");
            if (akRows[0] && akRows[0].winningNumber && akRows[0].winningNumber.endsWith('_')) {
                const fullNumber = akRows[0].winningNumber.slice(0, 1) + winningNumber;
                await conn.execute("UPDATE games SET winningNumber = ? WHERE id = ?", [fullNumber, akRows[0].id]);
                const akDate = getMarketDateForDeclaration(akRows[0].drawTime);
                await conn.execute(upsertSql, [uuidv4(), akRows[0].id, akDate, fullNumber]);
            }
        } else {
            if (!/^\d{2}$/.test(winningNumber)) throw { status: 400, message: 'Must be 2 digits' };
            await conn.execute('UPDATE games SET winningNumber = ? WHERE id = ?', [winningNumber, gameId]);
            await conn.execute(upsertSql, [uuidv4(), gameId, marketDate, winningNumber]);
        }
        
        await conn.commit();
        return await findAccountById(gameId, 'games');
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
};

const placeBulkBets = async (userId, gameId, betGroups, placedBy) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const user = await findAccountById(userId, 'users', conn);
        if (!user || user.isRestricted) throw { status: 403, message: 'User restricted or not found' };
        
        const dealer = await findAccountById(user.dealerId, 'dealers', conn);
        const game = await findAccountById(gameId, 'games', conn);
        const admin = await findAccountById('Guru', 'admins', conn); // Hardcoded ID from setup

        if (!game.isMarketOpen) throw { status: 400, message: 'Market Closed' };

        // Handle AK/AKC logic
        let akcGame = null;
        let mainGameGroups = betGroups;
        let akcGroups = [];

        if (game.name === 'AK') {
            const [akcRows] = await conn.execute("SELECT * FROM games WHERE name = 'AKC'");
            if (akcRows.length === 0) throw new Error("AKC Not found");
            akcGame = akcRows[0];
            akcGame.isMarketOpen = isGameOpen(akcGame.drawTime);
            
            akcGroups = betGroups.filter(g => g.subGameType === '1 Digit Close');
            mainGameGroups = betGroups.filter(g => g.subGameType !== '1 Digit Close');
        } else if (game.name === 'AKC') {
             if (betGroups.some(g => g.subGameType !== '1 Digit Close')) throw { status: 400, message: 'AKC only allows close bets' };
        }

        if (akcGroups.length > 0 && !akcGame.isMarketOpen) throw { status: 400, message: 'AKC Market Closed' };

        // Calculations
        const totalAmount = betGroups.reduce((sum, g) => sum + g.numbers.length * g.amountPerNumber, 0);
        
        // Ledger Updates via Helper
        await addLedgerEntry(conn, userId, 'USER', `Bet on ${game.name} by ${placedBy}`, totalAmount, 0);
        // Comm/Profit logic simplifed: user pays full, we distribute comms
        const userComm = totalAmount * (user.commissionRate / 100);
        const dealerComm = totalAmount * ((dealer.commissionRate - user.commissionRate) / 100);
        
        if (userComm > 0) await addLedgerEntry(conn, userId, 'USER', 'Commission', 0, userComm);
        
        // Admin gets full stake, pays out comms
        await addLedgerEntry(conn, admin.id, 'ADMIN', `Stake from ${user.name}`, 0, totalAmount);
        if (userComm > 0) await addLedgerEntry(conn, admin.id, 'ADMIN', `Comm to ${user.name}`, userComm, 0);
        if (dealerComm > 0) {
            await addLedgerEntry(conn, admin.id, 'ADMIN', `Comm to ${dealer.name}`, dealerComm, 0);
            await addLedgerEntry(conn, dealer.id, 'DEALER', `Comm from ${user.name}`, 0, dealerComm);
        }

        // Insert Bets
        const insertBet = async (gid, groups) => {
            for (const group of groups) {
                for (const num of group.numbers) {
                    const betId = uuidv4();
                    const ts = new Date().toISOString();
                    await conn.execute(
                        'INSERT INTO bets (id, userId, dealerId, gameId, subGameType, numbers, amountPerNumber, totalAmount, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        [betId, userId, dealer.id, gid, group.subGameType, JSON.stringify([num]), group.amountPerNumber, group.amountPerNumber, ts]
                    );
                }
            }
        };

        await insertBet(game.id, mainGameGroups);
        if (akcGame) await insertBet(akcGame.id, akcGroups);

        await conn.commit();
        // Return summary only to reduce payload
        return { count: totalAmount / betGroups[0]?.amountPerNumber, total: totalAmount }; 

    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
};

// Optimized Paginated Getters
const getPaginatedDealers = async ({ page = 1, limit = 25, search = '' }) => {
    const offset = (page - 1) * limit;
    let query = "SELECT * FROM dealers";
    let countQuery = "SELECT COUNT(*) as count FROM dealers";
    const params = [];

    if (search) {
        query += " WHERE name LIKE ? OR id LIKE ?";
        countQuery += " WHERE name LIKE ? OR id LIKE ?";
        const p = `%${search}%`;
        params.push(p, p);
    }
    
    query += " LIMIT ? OFFSET ?";
    const [countRows] = await execute(countQuery, params.slice(0, 2));
    const [rows] = await execute(query, [...params, limit.toString(), offset.toString()]);

    return {
        items: rows,
        totalItems: countRows[0].count,
        totalPages: Math.ceil(countRows[0].count / limit),
        currentPage: parseInt(page),
    };
};

const getPaginatedUsers = async ({ page = 1, limit = 25, search = '' }) => {
    const offset = (page - 1) * limit;
    let query = "SELECT * FROM users";
    let countQuery = "SELECT COUNT(*) as count FROM users";
    const params = [];

    if (search) {
        query += " WHERE name LIKE ? OR id LIKE ?";
        countQuery += " WHERE name LIKE ? OR id LIKE ?";
        const p = `%${search}%`;
        params.push(p, p);
    }
    
    query += " LIMIT ? OFFSET ?";
    const [countRows] = await execute(countQuery, params.slice(0, 2));
    const [rows] = await execute(query, [...params, limit.toString(), offset.toString()]);

    return {
        items: rows,
        totalItems: countRows[0].count,
        totalPages: Math.ceil(countRows[0].count / limit),
        currentPage: parseInt(page),
    };
};

// Optimized Bet Getters - Specific filtering at DB level
const findBetsByDealerId = async (id) => {
    const rows = await execute('SELECT * FROM bets WHERE dealerId = ? ORDER BY timestamp DESC LIMIT 500', [id]);
    return rows.map(b => ({...b, numbers: JSON.parse(b.numbers)}));
};

const findBetsByUserId = async (id) => {
    const rows = await execute('SELECT * FROM bets WHERE userId = ? ORDER BY timestamp DESC LIMIT 200', [id]);
    return rows.map(b => ({...b, numbers: JSON.parse(b.numbers)}));
};

const findUsersByDealerId = async (id) => {
    const rows = await execute('SELECT * FROM users WHERE dealerId = ?', [id]);
    return rows; // Ledger fetching skipped for performance in lists
};

const resetAllGames = async () => {
    await execute('UPDATE games SET winningNumber = NULL, payoutsApproved = 0');
};

const getFinancialSummary = async (date) => {
    const targetDate = date || getMarketDateString(new Date());
    
    // Time range for market day
    const start = new Date(targetDate);
    start.setUTCHours(11, 0, 0, 0); // 16:00 PKT - 5 = 11:00 UTC
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    
    const startStr = start.toISOString();
    const endStr = end.toISOString();

    const results = await execute('SELECT gameId, winningNumber FROM daily_results WHERE date = ?', [targetDate]);
    const games = await execute('SELECT * FROM games');
    
    // Fetch only relevant columns for betting aggregation
    const bets = await execute(
        'SELECT gameId, subGameType, numbers, totalAmount FROM bets WHERE timestamp >= ? AND timestamp < ?', 
        [startStr, endStr]
    );

    const totals = { totalStake: 0, totalPayouts: 0, totalDealerProfit: 0, totalCommissions: 0, netProfit: 0 };
    const gameStats = {};

    games.forEach(g => {
        gameStats[g.id] = { 
            gameName: g.name, 
            winningNumber: results.find(r => r.gameId === g.id)?.winningNumber || '',
            totalStake: 0, totalPayouts: 0, totalDealerProfit: 0, totalCommissions: 0, netProfit: 0 
        };
    });

    // Process bets in memory (Fast for ~50k rows, avoids complex SQL joins for now)
    for (const bet of bets) {
        if (!gameStats[bet.gameId]) continue;
        const stats = gameStats[bet.gameId];
        const amount = parseFloat(bet.totalAmount);
        
        stats.totalStake += amount;
        totals.totalStake += amount;

        // Simplified Profit/Commission calc logic
        // (In a real scenario, commissions are stored in ledgers, but here we approximate for display speed)
        // Assuming ~5% comm average for display
        const comm = amount * 0.05; 
        stats.totalCommissions += comm;
        totals.totalCommissions += comm;

        // Payout Calc
        const winNum = stats.winningNumber;
        if (winNum && !winNum.includes('_')) {
            const betNums = typeof bet.numbers === 'string' ? JSON.parse(bet.numbers) : bet.numbers;
            // Check win (Simplified logic for summary speed)
            let isWin = false;
            if (bet.subGameType === '2 Digit' && betNums.includes(winNum)) isWin = true;
            // ... (Add other types if needed, but usually 2 digit is main volume)
            
            if (isWin) {
                const payout = amount * 9; // Approx multiplier
                stats.totalPayouts += payout;
                totals.totalPayouts += payout;
            }
        }
        
        stats.netProfit = stats.totalStake - stats.totalPayouts - stats.totalCommissions;
        totals.netProfit += stats.netProfit;
    }

    return { 
        games: Object.values(gameStats), 
        totals, 
        totalBets: bets.length 
    };
};

module.exports = {
    connect: () => console.log("MySQL Pool Active"),
    verifySchema,
    findAccountById,
    findAccountForLogin,
    updatePassword,
    getAllFromTable,
    performUserTopUp,
    performUserWithdrawal,
    performDealerTopUp,
    performDealerWithdrawal,
    createUser,
    updateUser,
    createDealer,
    updateDealer,
    findUsersByDealerId,
    findBetsByDealerId,
    findBetsByUserId, 
    findUserByDealer: async (uid, did) => {
        const [rows] = await execute('SELECT id FROM users WHERE id = ? AND dealerId = ?', [uid, did]);
        return rows[0];
    },
    resetAllGames,
    placeBulkBets,
    declareWinnerForGame,
    getFinancialSummary, 
    getPaginatedDealers,
    getPaginatedUsers,
    // Lightweight Directory Fetchers
    getDealerList: async () => await execute('SELECT id, name FROM dealers ORDER BY name'),
    getUserList: async () => await execute('SELECT id, name, dealerId FROM users ORDER BY name'),
    
    toggleUserRestrictionByDealer: async (uid, did) => {
        await execute('UPDATE users SET isRestricted = NOT isRestricted WHERE id = ? AND dealerId = ?', [uid, did]);
        return findAccountById(uid, 'users');
    },
    toggleAccountRestrictionByAdmin: async (id, type) => {
        const table = type.toLowerCase() + 's';
        await execute(`UPDATE ${table} SET isRestricted = NOT isRestricted WHERE id = ?`, [id]);
        return findAccountById(id, table);
    }
};
