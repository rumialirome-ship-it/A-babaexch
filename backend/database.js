const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');

const DB_PATH = path.join(__dirname, 'database.sqlite');
const BCRYPT_ROUNDS = 10;
let db;

// --- LOGGING HELPERS ---
function logError(context, err) {
    const msg = (err && err.message) ? err.message : JSON.stringify(err);
    console.error('--- [' + context + '] ERROR: ' + msg + ' ---');
}

// --- CENTRALIZED GAME TIMING LOGIC (PKT TIMEZONE) ---
function isGameOpen(drawTime) {
    try {
        if (!drawTime || typeof drawTime !== 'string') return false;
        const now = new Date();
        // PKT is UTC+5. We add 5h to UTC time to get PKT-equivalent UTC fields.
        const pktBias = new Date(now.getTime() + (5 * 60 * 60 * 1000));
        const timeParts = drawTime.split(':');
        if (timeParts.length !== 2) return false;

        const drawH = parseInt(timeParts[0], 10);
        const drawM = parseInt(timeParts[1], 10);
        const pktH = pktBias.getUTCHours();

        const currentCycleStart = new Date(pktBias);
        currentCycleStart.setUTCHours(16, 0, 0, 0);
        if (pktH < 16) {
            currentCycleStart.setUTCDate(currentCycleStart.getUTCDate() - 1);
        }

        const currentCycleEnd = new Date(currentCycleStart);
        currentCycleEnd.setUTCHours(drawH, drawM, 0, 0);
        if (drawH < 16) {
            currentCycleEnd.setUTCDate(currentCycleEnd.getUTCDate() + 1);
        }

        return pktBias >= currentCycleStart && pktBias < currentCycleEnd;
    } catch (e) {
        return false;
    }
}

// FIX: Fetch the first admin dynamically instead of using a hardcoded ID.
function getAdminAccount() {
    const row = db.prepare('SELECT id FROM admins LIMIT 1').get();
    if (!row) throw new Error('No admin account found in database.');
    return findAccountById(row.id, 'admins');
}

// --- PASSWORD HELPERS ---
// All passwords are bcrypt-hashed before storage.
// FIX: Idempotent — if the value is already a bcrypt hash (starts with '$2'),
// return it unchanged. This prevents double-hashing when an edit form sends
// back the existing stored hash as the "password" field.
function hashPassword(plain) {
    const s = String(plain);
    if (s.startsWith('$2')) return s; // already hashed, don't double-hash
    return bcrypt.hashSync(s, BCRYPT_ROUNDS);
}

function verifyPassword(plain, hash) {
    // Support legacy plaintext passwords during a transition period.
    // If stored value doesn't look like a bcrypt hash, do a plain compare first,
    // then upgrade the stored password to a hash.
    if (hash && hash.startsWith('$2')) {
        return bcrypt.compareSync(String(plain), hash);
    }
    // Legacy plaintext match (will be migrated on next startup)
    return String(plain) === String(hash);
}

// --- DATABASE CONNECTION ---
const connect = () => {
    try {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        console.log('--- [DATABASE] Connection established. ---');
    } catch (error) {
        logError('DB_CONNECT', error);
        process.exit(1);
    }
};

const verifySchema = () => {
    try {
        const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admins'");
        if (!stmt.get()) {
            console.error('--- [DATABASE] Critical: Schema missing. ---');
            process.exit(1);
        }
    } catch (error) {
        logError('SCHEMA_VERIFY', error);
        process.exit(1);
    }
};

// FIX: Migrate any remaining plaintext passwords to bcrypt hashes on startup.
const migratePasswords = () => {
    const tables = [
        { name: 'admins', type: 'ADMIN' },
        { name: 'dealers', type: 'DEALER' },
        { name: 'users', type: 'USER' },
    ];
    let migrated = 0;
    tables.forEach(({ name }) => {
        const rows = db.prepare('SELECT id, password FROM ' + name).all();
        rows.forEach(row => {
            if (row.password && !row.password.startsWith('$2')) {
                const hashed = hashPassword(row.password);
                db.prepare('UPDATE ' + name + ' SET password = ? WHERE id = ?').run(hashed, row.id);
                migrated++;
            }
        });
    });
    if (migrated > 0) {
        console.log('--- [DATABASE] Migrated ' + migrated + ' plaintext password(s) to bcrypt hashes. ---');
    }
};

// --- CORE ACCOUNT LOOKUP ---
const findAccountById = (id, table) => {
    if (!id) return null;
    try {
        const stmt = db.prepare('SELECT * FROM ' + table + ' WHERE LOWER(id) = LOWER(?)');
        const account = stmt.get(id);
        if (!account) return null;

        if (table !== 'games') {
            account.ledger = db.prepare('SELECT * FROM ledgers WHERE LOWER(accountId) = LOWER(?) ORDER BY timestamp ASC').all(id);
        } else {
            account.isMarketOpen = isGameOpen(account.drawTime);
        }

        if (table === 'users' || table === 'dealers' || table === 'admins') {
            account.commissionRate = Number(account.commissionRate) || 0;
            if (account.prizeRates && typeof account.prizeRates === 'string') {
                account.prizeRates = JSON.parse(account.prizeRates);
            }
            if (account.betLimits && typeof account.betLimits === 'string') {
                account.betLimits = JSON.parse(account.betLimits);
            }
        }

        if ('isRestricted' in account) account.isRestricted = !!account.isRestricted;
        return account;
    } catch (e) {
        logError('FIND_ACCOUNT', e);
        return null;
    }
};

const findAccountForLogin = (loginId) => {
    if (!loginId || typeof loginId !== 'string' || loginId.trim().length === 0) {
        return { account: null, role: null };
    }

    const targetId = loginId.trim().toLowerCase();
    const tables = [
        { name: 'users', role: 'USER' },
        { name: 'dealers', role: 'DEALER' },
        { name: 'admins', role: 'ADMIN' }
    ];

    for (var i = 0; i < tables.length; i++) {
        var info = tables[i];
        try {
            const stmt = db.prepare('SELECT * FROM ' + info.name + ' WHERE LOWER(id) = ?');
            const account = stmt.get(targetId);
            if (account) return { account: account, role: info.role };
        } catch (e) {
            logError('LOGIN_LOOKUP_' + info.role, e);
        }
    }
    return { account: null, role: null };
};

// FIX: Export verifyPassword so server.js can use the bcrypt-aware comparison.
const updatePassword = (accountId, contact, newPassword) => {
    if (!accountId || !contact) return false;
    const tables = ['users', 'dealers'];
    const hashed = hashPassword(newPassword);
    for (var i = 0; i < tables.length; i++) {
        try {
            const result = db.prepare('UPDATE ' + tables[i] + ' SET password = ? WHERE id = ? AND contact = ?').run(hashed, accountId, contact);
            if (result.changes > 0) return true;
        } catch (e) { }
    }
    return false;
};

// FIX: N+1 query eliminated. Fetch all ledger entries for all accounts in a
// single batch query, then assign them into each row in JS — O(1) queries
// instead of O(n) queries.
const getAllFromTable = (table, withLedger = false) => {
    try {
        const rows = db.prepare('SELECT * FROM ' + table).all();

        if (withLedger && rows.length > 0 && (table === 'users' || table === 'dealers' || table === 'admins')) {
            const ids = rows.map(r => r.id);
            const placeholders = ids.map(() => '?').join(',');
            const allLedgers = db.prepare(
                'SELECT * FROM ledgers WHERE LOWER(accountId) IN (' + placeholders + ') ORDER BY timestamp ASC'
            ).all(...ids.map(id => id.toLowerCase()));

            const ledgerMap = {};
            allLedgers.forEach(l => {
                const key = l.accountId.toLowerCase();
                if (!ledgerMap[key]) ledgerMap[key] = [];
                ledgerMap[key].push(l);
            });

            rows.forEach(acc => {
                acc.ledger = ledgerMap[(acc.id || '').toLowerCase()] || [];
            });
        }

        return rows.map(acc => {
            try {
                if (table === 'users' || table === 'dealers' || table === 'admins') {
                    acc.commissionRate = Number(acc.commissionRate) || 0;
                    if (acc.prizeRates && typeof acc.prizeRates === 'string') acc.prizeRates = JSON.parse(acc.prizeRates);
                    if (acc.betLimits && typeof acc.betLimits === 'string') acc.betLimits = JSON.parse(acc.betLimits);
                }
                if (table === 'games' && acc.drawTime) acc.isMarketOpen = isGameOpen(acc.drawTime);
                if (table === 'bets' && acc.numbers) acc.numbers = JSON.parse(acc.numbers);
                if ('isRestricted' in acc) acc.isRestricted = !!acc.isRestricted;
            } catch (inner) { }
            return acc;
        });
    } catch (e) {
        logError('GET_ALL_' + table, e);
        return [];
    }
};

const runInTransaction = (fn) => db.transaction(fn)();

const addLedgerEntry = (accountId, accountType, description, debit, credit) => {
    if (!accountId) throw new Error('Account ID is required for ledger entry.');

    const table = accountType.toLowerCase() + 's';
    const account = db.prepare('SELECT wallet FROM ' + table + ' WHERE LOWER(id) = LOWER(?)').get(accountId);

    if (!account) {
        throw new Error('Account [' + accountId + '] not found in ' + table);
    }

    const lastBalance = Number(account.wallet) || 0;
    const debitVal = Number(debit) || 0;
    const creditVal = Number(credit) || 0;

    if (debitVal > 0 && accountType !== 'ADMIN' && lastBalance < debitVal) {
        throw new Error('Insufficient funds in account: ' + accountId);
    }

    const newBalance = Math.round((lastBalance - debitVal + creditVal) * 100) / 100;

    db.prepare('INSERT INTO ledgers (id, accountId, accountType, timestamp, description, debit, credit, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(uuidv4(), accountId, accountType, new Date().toISOString(), description, debitVal, creditVal, newBalance);

    db.prepare('UPDATE ' + table + ' SET wallet = ? WHERE LOWER(id) = LOWER(?)').run(newBalance, accountId);
};

const declareWinnerForGame = (gameId, winningNumber) => {
    let finalGame;
    runInTransaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
        // FIX: Allow AK game to be declared again when it only has a partial result (endsWith '_').
        if (!game) throw new Error('Game not found.');
        if (game.winningNumber && !game.winningNumber.endsWith('_')) throw new Error('Game already finalized.');

        if (game.name === 'AK') {
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(winningNumber + '_', gameId);
        } else if (game.name === 'AKC') {
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(winningNumber, gameId);
            const akGame = db.prepare("SELECT * FROM games WHERE name = 'AK'").get();
            if (akGame && akGame.winningNumber && akGame.winningNumber.endsWith('_')) {
                db.prepare("UPDATE games SET winningNumber = ? WHERE name = 'AK'").run(akGame.winningNumber.slice(0, 1) + winningNumber);
            }
        } else {
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(winningNumber, gameId);
        }
        finalGame = findAccountById(gameId, 'games');
    });
    return finalGame;
};

const updateWinningNumber = (gameId, newWinningNumber) => {
    let updatedGame;
    runInTransaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
        if (!game || !game.winningNumber || game.payoutsApproved) throw new Error('Update not allowed.');
        if (game.name === 'AK') {
            const closeDigit = game.winningNumber.endsWith('_') ? '_' : game.winningNumber.slice(1, 2);
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(newWinningNumber + closeDigit, gameId);
        } else if (game.name === 'AKC') {
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(newWinningNumber, gameId);
            const akGame = db.prepare("SELECT * FROM games WHERE name = 'AK'").get();
            if (akGame && akGame.winningNumber && !akGame.winningNumber.endsWith('_')) {
                db.prepare("UPDATE games SET winningNumber = ? WHERE name = 'AK'").run(akGame.winningNumber.slice(0, 1) + newWinningNumber);
            }
        } else {
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(newWinningNumber, gameId);
        }
        updatedGame = findAccountById(gameId, 'games');
    });
    return updatedGame;
};

const approvePayoutsForGame = (gameId) => {
    let updatedGame;
    runInTransaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
        if (!game || !game.winningNumber || game.payoutsApproved || (game.name === 'AK' && game.winningNumber.endsWith('_'))) throw new Error("Invalid state for approval.");
        const winningBets = db.prepare('SELECT * FROM bets WHERE gameId = ?').all(gameId).map(b => {
            b.numbers = JSON.parse(b.numbers);
            return b;
        });

        // FIX: Use batch getAllFromTable (no longer N+1) and dynamic admin lookup.
        const allUsers = Object.fromEntries(getAllFromTable('users').map(u => [u.id, u]));
        const allDealers = Object.fromEntries(getAllFromTable('dealers').map(d => [d.id, d]));
        const admin = getAdminAccount();
        const getMultiplier = (r, t) => t === "1 Digit Open" ? r.oneDigitOpen : t === "1 Digit Close" ? r.oneDigitClose : r.twoDigit;

        winningBets.forEach(bet => {
            const wins = bet.numbers.filter(n => {
                if (bet.subGameType === "1 Digit Open") return game.winningNumber.length === 2 && n === game.winningNumber[0];
                if (bet.subGameType === "1 Digit Close") return game.name === 'AKC' ? n === game.winningNumber : (game.winningNumber.length === 2 && n === game.winningNumber[1]);
                return n === game.winningNumber;
            });
            if (wins.length > 0) {
                const user = allUsers[bet.userId], dealer = allDealers[bet.dealerId];
                if (!user || !dealer) return;
                const userPrize = Math.round(wins.length * bet.amountPerNumber * getMultiplier(user.prizeRates, bet.subGameType) * 100) / 100;
                const dProfit = Math.round(wins.length * bet.amountPerNumber * (getMultiplier(dealer.prizeRates, bet.subGameType) - getMultiplier(user.prizeRates, bet.subGameType)) * 100) / 100;
                addLedgerEntry(user.id, 'USER', 'Prize won: ' + game.name, 0, userPrize);
                addLedgerEntry(admin.id, 'ADMIN', 'Prize paid: ' + user.name, userPrize, 0);
                if (dProfit > 0) {
                    addLedgerEntry(dealer.id, 'DEALER', 'Profit: ' + game.name, 0, dProfit);
                    addLedgerEntry(admin.id, 'ADMIN', 'Dealer cut: ' + dealer.name, dProfit, 0);
                }
            }
        });
        db.prepare('UPDATE games SET payoutsApproved = 1 WHERE id = ?').run(gameId);
        updatedGame = findAccountById(gameId, 'games');
    });
    return updatedGame;
};

const getFinancialSummary = () => {
    try {
        const games = db.prepare('SELECT * FROM games WHERE winningNumber IS NOT NULL').all();
        const allBets = db.prepare('SELECT * FROM bets').all().map(b => {
            b.numbers = JSON.parse(b.numbers);
            return b;
        });
        // FIX: Use batch queries (no N+1)
        const allUsers = Object.fromEntries(getAllFromTable('users').map(u => [u.id, u]));
        const allDealers = Object.fromEntries(getAllFromTable('dealers').map(d => [d.id, d]));
        const getMultiplier = (r, t) => t === "1 Digit Open" ? r.oneDigitOpen : t === "1 Digit Close" ? r.oneDigitClose : r.twoDigit;

        const summary = games.map(game => {
            const gameBets = allBets.filter(b => b.gameId === game.id);
            const totalStake = gameBets.reduce((s, b) => s + b.totalAmount, 0);
            let payouts = 0, dProfit = 0;
            if (!game.winningNumber.endsWith('_')) {
                gameBets.forEach(bet => {
                    const wins = bet.numbers.filter(n => {
                        if (bet.subGameType === "1 Digit Open") return game.winningNumber.length === 2 && n === game.winningNumber[0];
                        if (bet.subGameType === "1 Digit Close") return game.name === 'AKC' ? n === game.winningNumber : (game.winningNumber.length === 2 && n === game.winningNumber[1]);
                        return n === game.winningNumber;
                    });
                    if (wins.length > 0) {
                        const u = allUsers[bet.userId], d = allDealers[bet.dealerId];
                        if (u && d) {
                            payouts += wins.length * bet.amountPerNumber * getMultiplier(u.prizeRates, bet.subGameType);
                            dProfit += wins.length * bet.amountPerNumber * (getMultiplier(d.prizeRates, bet.subGameType) - getMultiplier(u.prizeRates, bet.subGameType));
                        }
                    }
                });
            }
            const comms = gameBets.reduce((s, b) => {
                const u = allUsers[b.userId], d = allDealers[b.dealerId];
                return u && d ? s + (b.totalAmount * (u.commissionRate / 100)) + (b.totalAmount * ((d.commissionRate - u.commissionRate) / 100)) : s;
            }, 0);
            return { gameName: game.name, winningNumber: game.winningNumber, totalStake, totalPayouts: payouts, totalDealerProfit: dProfit, totalCommissions: comms, netProfit: totalStake - payouts - dProfit - comms };
        });

        const totals = summary.reduce((t, g) => { t.totalStake += g.totalStake; t.totalPayouts += g.totalPayouts; t.totalDealerProfit += g.totalDealerProfit; t.totalCommissions += g.totalCommissions; t.netProfit += g.netProfit; return t; }, { totalStake: 0, totalPayouts: 0, totalDealerProfit: 0, totalCommissions: 0, netProfit: 0 });
        return { games: summary.sort((a, b) => a.gameName.localeCompare(b.gameName)), totals: totals, totalBets: allBets.length };
    } catch (e) {
        logError('FINANCIAL_SUMMARY', e);
        return { games: [], totals: { totalStake: 0, totalPayouts: 0, totalDealerProfit: 0, totalCommissions: 0, netProfit: 0 }, totalBets: 0 };
    }
};

const createDealer = (d) => {
    if (db.prepare('SELECT id FROM dealers WHERE LOWER(id) = ?').get(d.id.toLowerCase())) throw new Error("ID taken.");
    // FIX: hash password before insert
    db.prepare('INSERT INTO dealers (id, name, password, area, contact, wallet, commissionRate, isRestricted, prizeRates, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(d.id, d.name, hashPassword(d.password), d.area, d.contact, d.wallet || 0, d.commissionRate, 0, JSON.stringify(d.prizeRates), d.avatarUrl);
    if (d.wallet > 0) addLedgerEntry(d.id, 'DEALER', 'Initial setup', 0, d.wallet);
    return findAccountById(d.id, 'dealers');
};

const updateDealer = (d, originalId) => {
    // FIX: hash password before update
    db.prepare('UPDATE dealers SET id = ?, name = ?, password = ?, area = ?, contact = ?, commissionRate = ?, prizeRates = ?, avatarUrl = ? WHERE LOWER(id) = LOWER(?)')
        .run(d.id, d.name, hashPassword(d.password), d.area, d.contact, Number(d.commissionRate), JSON.stringify(d.prizeRates), d.avatarUrl, originalId);

    if (d.id !== originalId) {
        db.prepare('UPDATE users SET dealerId = ? WHERE LOWER(dealerId) = LOWER(?)').run(d.id, originalId);
        db.prepare('UPDATE bets SET dealerId = ? WHERE LOWER(dealerId) = LOWER(?)').run(d.id, originalId);
        db.prepare('UPDATE ledgers SET accountId = ? WHERE LOWER(accountId) = LOWER(?) AND accountType = ?').run(d.id, originalId, 'DEALER');
    }
    return findAccountById(d.id, 'dealers');
};

// FIX: Added password to the UPDATE so admin can change their password.
const updateAdmin = (a, adminId) => {
    const updateStmt = a.password
        ? db.prepare('UPDATE admins SET name = ?, password = ?, prizeRates = ?, avatarUrl = ? WHERE LOWER(id) = LOWER(?)')
        : db.prepare('UPDATE admins SET name = ?, prizeRates = ?, avatarUrl = ? WHERE LOWER(id) = LOWER(?)');

    if (a.password) {
        updateStmt.run(a.name, hashPassword(a.password), JSON.stringify(a.prizeRates), a.avatarUrl, adminId);
    } else {
        updateStmt.run(a.name, JSON.stringify(a.prizeRates), a.avatarUrl, adminId);
    }
    return findAccountById(adminId, 'admins');
};

// FIX: Eliminated N+1 — fetch all users then batch-load ledgers in one query.
const findUsersByDealerId = (dealerId) => {
    const users = db.prepare('SELECT * FROM users WHERE LOWER(dealerId) = LOWER(?)').all(dealerId);
    if (users.length === 0) return [];

    const ids = users.map(u => u.id);
    const placeholders = ids.map(() => '?').join(',');
    const allLedgers = db.prepare(
        "SELECT * FROM ledgers WHERE LOWER(accountId) IN (" + placeholders + ") AND accountType = 'USER' ORDER BY timestamp ASC"
    ).all(...ids.map(id => id.toLowerCase()));

    const ledgerMap = {};
    allLedgers.forEach(l => {
        const key = l.accountId.toLowerCase();
        if (!ledgerMap[key]) ledgerMap[key] = [];
        ledgerMap[key].push(l);
    });

    return users.map(acc => {
        acc.commissionRate = Number(acc.commissionRate) || 0;
        if (acc.prizeRates && typeof acc.prizeRates === 'string') acc.prizeRates = JSON.parse(acc.prizeRates);
        if (acc.betLimits && typeof acc.betLimits === 'string') acc.betLimits = JSON.parse(acc.betLimits);
        if ('isRestricted' in acc) acc.isRestricted = !!acc.isRestricted;
        acc.ledger = ledgerMap[(acc.id || '').toLowerCase()] || [];
        return acc;
    });
};

const findBetsByDealerId = (id) => db.prepare('SELECT * FROM bets WHERE LOWER(dealerId) = LOWER(?) ORDER BY timestamp DESC').all(id).map(b => {
    b.numbers = JSON.parse(b.numbers);
    return b;
});
const findBetsByUserId = (id) => db.prepare('SELECT * FROM bets WHERE LOWER(userId) = LOWER(?) ORDER BY timestamp DESC').all(id).map(b => {
    b.numbers = JSON.parse(b.numbers);
    return b;
});
const findBetsByGameId = (id) => db.prepare('SELECT * FROM bets WHERE gameId = ?').all(id).map(b => {
    b.numbers = JSON.parse(b.numbers);
    return b;
});

const findUserByDealer = (uId, dId) => {
    const stmt = db.prepare('SELECT id FROM users WHERE LOWER(id) = LOWER(?) AND LOWER(dealerId) = LOWER(?)');
    const userRow = stmt.get(uId, dId);
    if (!userRow) return null;
    return findAccountById(userRow.id, 'users');
};

const createUser = (u, dId, dep = 0) => {
    if (db.prepare('SELECT id FROM users WHERE LOWER(id) = ?').get(u.id.toLowerCase())) throw new Error("Username exists.");
    // FIX: hash password before insert
    db.prepare('INSERT INTO users (id, name, password, dealerId, area, contact, wallet, commissionRate, isRestricted, prizeRates, betLimits, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(u.id, u.name, hashPassword(u.password), dId, u.area, u.contact, 0, u.commissionRate, 0, JSON.stringify(u.prizeRates), JSON.stringify(u.betLimits), u.avatarUrl);
    if (dep > 0) { addLedgerEntry(dId, 'DEALER', 'Seed funding: ' + u.name, dep, 0); addLedgerEntry(u.id, 'USER', 'Initial deposit', 0, dep); }
    return findAccountById(u.id, 'users');
};

const updateUser = (u, uId, dId) => {
    // FIX: hash password before update
    db.prepare('UPDATE users SET id = ?, name = ?, password = ?, area = ?, contact = ?, commissionRate = ?, prizeRates = ?, betLimits = ?, avatarUrl = ? WHERE LOWER(id) = LOWER(?) AND LOWER(dealerId) = LOWER(?)')
        .run(u.id, u.name, hashPassword(u.password), u.area, u.contact, Number(u.commissionRate), JSON.stringify(u.prizeRates), JSON.stringify(u.betLimits), u.avatarUrl, uId, dId);

    if (u.id.toLowerCase() !== uId.toLowerCase()) {
        db.prepare('UPDATE bets SET userId = ? WHERE LOWER(userId) = LOWER(?)').run(u.id, uId);
        db.prepare('UPDATE ledgers SET accountId = ? WHERE LOWER(accountId) = LOWER(?) AND accountType = ?').run(u.id, uId, 'USER');
    }
    return findAccountById(u.id, 'users');
};

const updateUserByAdmin = (u, uId) => {
    // FIX: hash password before update
    db.prepare('UPDATE users SET name = ?, password = ?, area = ?, contact = ?, commissionRate = ?, prizeRates = ?, betLimits = ?, avatarUrl = ? WHERE LOWER(id) = LOWER(?)').run(u.name, hashPassword(u.password), u.area, u.contact, Number(u.commissionRate), JSON.stringify(u.prizeRates), JSON.stringify(u.betLimits), u.avatarUrl, uId);
    return findAccountById(uId, 'users');
};

const deleteUserByDealer = (uId, dId) => {
    runInTransaction(() => {
        db.prepare('DELETE FROM ledgers WHERE LOWER(accountId) = LOWER(?) AND accountType = ?').run(uId, 'USER');
        db.prepare('DELETE FROM bets WHERE LOWER(userId) = LOWER(?)').run(uId);
        db.prepare('DELETE FROM users WHERE LOWER(id) = LOWER(?) AND LOWER(dealerId) = LOWER(?)').run(uId, dId);
    });
    return true;
};

const toggleAccountRestrictionByAdmin = (id, type) => {
    let result;
    runInTransaction(() => {
        const table = type.toLowerCase() + 's';
        const acc = db.prepare('SELECT isRestricted FROM ' + table + ' WHERE LOWER(id) = LOWER(?)').get(id);
        if (!acc) throw new Error('Not found.');
        const status = acc.isRestricted ? 0 : 1;
        db.prepare('UPDATE ' + table + ' SET isRestricted = ? WHERE LOWER(id) = LOWER(?)').run(status, id);
        if (type.toLowerCase() === 'dealer') db.prepare('UPDATE users SET isRestricted = ? WHERE LOWER(dealerId) = LOWER(?)').run(status, id);
        result = findAccountById(id, table);
    });
    return result;
};

const toggleUserRestrictionByDealer = (uId, dId) => {
    const user = db.prepare('SELECT isRestricted FROM users WHERE LOWER(id) = LOWER(?) AND LOWER(dealerId) = LOWER(?)').get(uId, dId);
    if (!user) throw new Error('Not found.');
    db.prepare('UPDATE users SET isRestricted = ? WHERE LOWER(id) = LOWER(?)').run(user.isRestricted ? 0 : 1, uId);
    return findAccountById(uId, 'users');
};

function getNumberStakeSummary(params) {
    try {
        let query = 'SELECT gameId, subGameType, numbers, amountPerNumber, totalAmount FROM bets';
        const vals = [], conds = [];
        if (params.gameId) { conds.push('gameId = ?'); vals.push(params.gameId); }
        if (params.dealerId) { conds.push('LOWER(dealerId) = LOWER(?)'); vals.push(params.dealerId); }
        if (params.date) { conds.push('date(timestamp) = ?'); vals.push(params.date); }
        if (conds.length > 0) query += ' WHERE ' + conds.join(' AND ');

        const bets = db.prepare(query).all(...vals);
        const map2 = new Map(), mapO = new Map(), mapC = new Map(), mapG = new Map();

        bets.forEach(b => {
            mapG.set(b.gameId, (mapG.get(b.gameId) || 0) + b.totalAmount);
            try {
                const nums = JSON.parse(b.numbers), amt = b.amountPerNumber;
                let target;
                if (b.subGameType === '1 Digit Open') target = mapO;
                else if (b.subGameType === '1 Digit Close') target = mapC;
                else target = map2;
                nums.forEach(n => target.set(n, (target.get(n) || 0) + amt));
            } catch (e) { }
        });

        const sort = (m) => Array.from(m.entries()).map(e => ({ number: e[0], stake: e[1] })).sort((a, b) => b.stake - a.stake);
        return {
            twoDigit: sort(map2),
            oneDigitOpen: sort(mapO),
            oneDigitClose: sort(mapC),
            gameBreakdown: Array.from(mapG.entries()).map(e => ({ gameId: e[0], stake: e[1] }))
        };
    } catch (e) {
        logError('NUMBER_SUMMARY', e);
        return { twoDigit: [], oneDigitOpen: [], oneDigitClose: [], gameBreakdown: [] };
    }
}

const placeBulkBets = (uId, gId, groups) => {
    let result = null;
    runInTransaction(() => {
        const user = findAccountById(uId, 'users');
        if (!user || user.isRestricted) throw new Error('Access denied.');
        const game = findAccountById(gId, 'games');
        // FIX: Use isMarketOpen flag set by findAccountById, no duplicate isGameOpen call.
        if (!game || !game.isMarketOpen) throw new Error("Market is closed.");
        const dealer = findAccountById(user.dealerId, 'dealers');
        const requestTotal = groups.reduce((s, g) => s + g.numbers.length * g.amountPerNumber, 0);
        if (user.wallet < requestTotal) throw new Error('Balance too low.');

        // FIX: Validate commission rates to prevent negative dealer commission.
        if (user.commissionRate > dealer.commissionRate) {
            throw new Error('Configuration error: user commission rate exceeds dealer rate.');
        }

        // FIX: Use dynamic admin lookup, not hardcoded 'Guru'.
        const admin = getAdminAccount();
        const userComm = Math.round(requestTotal * (user.commissionRate / 100) * 100) / 100;
        const dComm = Math.round(requestTotal * ((dealer.commissionRate - user.commissionRate) / 100) * 100) / 100;

        addLedgerEntry(user.id, 'USER', 'Bet: ' + game.name, requestTotal, 0);
        if (userComm > 0) addLedgerEntry(user.id, 'USER', 'Comm earned', 0, userComm);
        addLedgerEntry(admin.id, 'ADMIN', 'Stake: ' + user.name, 0, requestTotal);
        if (userComm > 0) addLedgerEntry(admin.id, 'ADMIN', 'Comm paid', userComm, 0);
        if (dComm > 0) {
            addLedgerEntry(admin.id, 'ADMIN', 'Override payout', dComm, 0);
            addLedgerEntry(dealer.id, 'DEALER', 'Comm cut: ' + user.name, 0, dComm);
        }

        const created = [];
        for (var i = 0; i < groups.length; i++) {
            var g = groups[i];
            const b = {
                id: uuidv4(), userId: uId, dealerId: dealer.id, gameId: game.id,
                subGameType: g.subGameType, numbers: JSON.stringify(g.numbers),
                amountPerNumber: g.amountPerNumber, totalAmount: g.numbers.length * g.amountPerNumber,
                timestamp: new Date().toISOString()
            };
            db.prepare('INSERT INTO bets (id, userId, dealerId, gameId, subGameType, numbers, amountPerNumber, totalAmount, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(b.id, b.userId, b.dealerId, b.gameId, b.subGameType, b.numbers, b.amountPerNumber, b.totalAmount, b.timestamp);
            b.numbers = g.numbers;
            created.push(b);
        }
        result = created;
    });
    return result;
};

const updateGameDrawTime = (id, time) => {
    db.prepare('UPDATE games SET drawTime = ? WHERE id = ?').run(time, id);
    return findAccountById(id, 'games');
};

function getAllNumberLimits() { return db.prepare('SELECT * FROM number_limits').all(); }
function saveNumberLimit(limit) {
    db.prepare('INSERT OR REPLACE INTO number_limits (gameType, numberValue, limitAmount) VALUES (?, ?, ?)').run(limit.gameType, limit.numberValue, limit.limitAmount);
    return db.prepare('SELECT * FROM number_limits WHERE gameType = ? AND numberValue = ?').get(limit.gameType, limit.numberValue);
}
function deleteNumberLimit(id) { db.prepare('DELETE FROM number_limits WHERE id = ?').run(id); }

// FIX: Only delete today's bets on reset, not all historical records.
function resetAllGames() {
    try {
        runInTransaction(() => {
            db.prepare('UPDATE games SET winningNumber = NULL, payoutsApproved = 0').run();
            db.prepare("DELETE FROM bets WHERE date(timestamp) = date('now')").run();
        });
        console.log('--- [DATABASE] Daily Reset Triggered. ---');
    } catch (e) {
        logError('DAILY_RESET', e);
    }
}

module.exports = {
    connect, verifySchema, migratePasswords, verifyPassword,
    findAccountById, findAccountForLogin, updatePassword, getAllFromTable,
    runInTransaction, addLedgerEntry, createDealer, updateDealer, updateAdmin,
    findUsersByDealerId, findUserByDealer, findBetsByUserId, createUser, updateUser,
    updateUserByAdmin, deleteUserByDealer, toggleAccountRestrictionByAdmin,
    toggleUserRestrictionByDealer, declareWinnerForGame, updateWinningNumber,
    approvePayoutsForGame, getFinancialSummary, getNumberStakeSummary, placeBulkBets,
    updateGameDrawTime, resetAllGames, getAllNumberLimits, saveNumberLimit,
    deleteNumberLimit, findBetsByDealerId, findBetsByGameId
};