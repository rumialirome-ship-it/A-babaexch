import path from 'path';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { execSync } from 'child_process';

const DB_PATH = path.join(process.cwd(), 'database.sqlite');
let db: Database.Database;

// --- ROBUST LOGGING HELPER ---
function logError(context: string, err: any) {
    const msg = (err && err.message) ? err.message : JSON.stringify(err);
    console.error('--- [' + context + '] ERROR: ' + msg + ' ---');
}

// --- CENTRALIZED GAME TIMING LOGIC (PKT TIMEZONE) ---
function isGameOpen(drawTime: string) {
    try {
        if (!drawTime || typeof drawTime !== 'string') return false;
        const now = new Date();
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

export const connect = () => {
    try {
        console.error('--- [DATABASE] Initializing. CWD: ' + process.cwd() + ' ---');
        console.error('--- [DATABASE] Path: ' + DB_PATH + ' ---');
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        console.error('--- Database Opened at ' + DB_PATH + ' ---');
        // Test query to verify integrity immediately
        db.prepare("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1").get();
    } catch (error: any) {
        logError('DB_CONNECT_OR_QUERY', error);
        console.error('--- [DATABASE] Wiping and rebuilding corrupt/malformed database... ---');
        try {
            if (db) {
                db.close();
            }
        } catch (e) {}
        
        try {
            if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
            if (fs.existsSync(DB_PATH + '-wal')) fs.unlinkSync(DB_PATH + '-wal');
            if (fs.existsSync(DB_PATH + '-shm')) fs.unlinkSync(DB_PATH + '-shm');
        } catch (unlinkErr) {
            console.error('Error deleting corrupted DB files:', unlinkErr);
        }

        try {
            execSync('npx tsx scripts/setup-db.ts', { stdio: 'inherit' });
            db = new Database(DB_PATH);
            db.pragma('journal_mode = WAL');
            db.pragma('foreign_keys = ON');
            console.error('--- Clean Database successfully restored and connected ---');
        } catch (setupErr) {
            logError('REBUILD_FAILED', setupErr);
            process.exit(1);
        }
    }
};

export const verifySchema = () => {
    try {
        const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admins'");
        if (!stmt.get()) {
            console.error('--- [DATABASE] Critical: Schema missing. ---');
            console.error('--- [DATABASE] Please run: npm run setup-db ---');
            process.exit(1);
        }
        const gamesCount = (db.prepare('SELECT COUNT(*) as count FROM games').get() as any).count;
        console.error('[DEBUG] Games count in existing DB: ' + gamesCount);
    } catch (error: any) {
        logError('SCHEMA_VERIFY', error);
        console.error('--- [DATABASE] Wiping and rebuilding corrupt/malformed database inside verifySchema... ---');
        try {
            if (db) {
                db.close();
            }
        } catch (e) {}
        
        try {
            if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
            if (fs.existsSync(DB_PATH + '-wal')) fs.unlinkSync(DB_PATH + '-wal');
            if (fs.existsSync(DB_PATH + '-shm')) fs.unlinkSync(DB_PATH + '-shm');
        } catch (unlinkErr) {}

        try {
            execSync('npx tsx scripts/setup-db.ts', { stdio: 'inherit' });
            db = new Database(DB_PATH);
            db.pragma('journal_mode = WAL');
            db.pragma('foreign_keys = ON');
            console.error('--- Clean Database successfully restored and connected inside verifySchema ---');
        } catch (setupErr) {
            logError('REBUILD_FAILED_VERIFY', setupErr);
            process.exit(1);
        }
    }
};

// --- INTERNAL FAST LOOKUP (NO LEDGERS) ---
const findAccountByIdInternal = (id: string, table: string) => {
    try {
        const stmt = db.prepare('SELECT * FROM ' + table + ' WHERE LOWER(id) = LOWER(?)');
        const account = stmt.get(id) as any;
        if (!account) return null;
        
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
        return null;
    }
};

export const findAccountById = (id: string, table: string) => {
    if (!id) return null;
    try {
        const stmt = db.prepare('SELECT * FROM ' + table + ' WHERE LOWER(id) = LOWER(?)');
        const account = stmt.get(id) as any;
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

export const findAccountForLogin = (loginId: string) => {
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
            const account = stmt.get(targetId) as any;
            if (account) return { account: account, role: info.role };
        } catch (e) {
            logError('LOGIN_LOOKUP_' + info.role, e);
        }
    }
    return { account: null, role: null };
};

export const getAllFromTable = (table: string, withLedger = false) => {
    try {
        const rows = db.prepare('SELECT * FROM ' + table).all() as any[];
        return rows.map(acc => {
            try {
                if (table === 'users' || table === 'dealers' || table === 'admins') {
                    acc.commissionRate = Number(acc.commissionRate) || 0;
                    if (withLedger && acc.id) {
                        acc.ledger = db.prepare('SELECT * FROM ledgers WHERE LOWER(accountId) = LOWER(?) ORDER BY timestamp ASC').all(acc.id);
                    }
                    if (acc.prizeRates && typeof acc.prizeRates === 'string') acc.prizeRates = JSON.parse(acc.prizeRates);
                    if (acc.betLimits && typeof acc.betLimits === 'string') acc.betLimits = JSON.parse(acc.betLimits);
                }
                if (table === 'games' && acc.drawTime) acc.isMarketOpen = isGameOpen(acc.drawTime);
                if (table === 'bets' && acc.numbers) acc.numbers = JSON.parse(acc.numbers);
                if ('isRestricted' in acc) acc.isRestricted = !!acc.isRestricted;
            } catch (inner) {}
            return acc;
        });
    } catch (e) {
        logError('GET_ALL_' + table, e);
        return [];
    }
};

export function getStats() {
    try {
        const counts = {
            games: (db.prepare('SELECT COUNT(*) as c FROM games').get() as any).c,
            users: (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c,
            dealers: (db.prepare('SELECT COUNT(*) as c FROM dealers').get() as any).c,
            bets: (db.prepare('SELECT COUNT(*) as c FROM bets').get() as any).c,
        };
        return counts;
    } catch (e) {
        return { error: 'Failed to fetch stats' };
    }
}

export const runInTransaction = (fn: () => void) => db.transaction(fn)();

export const addLedgerEntry = (accountId: string, accountType: string, description: string, debit: number, credit: number) => {
    if (!accountId) throw new Error('Account ID is required for ledger entry.');
    
    const table = accountType.toLowerCase() + 's';
    const account = db.prepare('SELECT wallet FROM ' + table + ' WHERE LOWER(id) = LOWER(?)').get(accountId) as any;
    
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

export const declareWinnerForGame = (gameId: string, winningNumber: string) => {
    let finalGame;
    runInTransaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId) as any;
        if (!game) throw new Error('Game not found.');
        if (game.winningNumber && !game.winningNumber.endsWith('_')) throw new Error('Game already finalized.');
        
        if (game.name === 'AK') {
            if (!game.winningNumber) {
                db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(winningNumber + '_', gameId);
            } else {
                db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(game.winningNumber.slice(0, 1) + winningNumber, gameId);
            }
        } else if (game.name === 'AKC') {
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(winningNumber, gameId);
            const akGame = db.prepare("SELECT * FROM games WHERE name = 'AK'").get() as any;
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

export const approvePayoutsForGame = (gameId: string) => {
    let updatedGame;
    runInTransaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId) as any;
        if (!game || !game.winningNumber || game.payoutsApproved || (game.name === 'AK' && game.winningNumber.endsWith('_'))) throw new Error("Invalid state for approval.");
        const winningBets = db.prepare('SELECT * FROM bets WHERE gameId = ?').all(gameId) as any[];
        winningBets.forEach(b => { b.numbers = JSON.parse(b.numbers); });

        const allUsers = Object.fromEntries(getAllFromTable('users').map(u => [u.id, u]));
        const allDealers = Object.fromEntries(getAllFromTable('dealers').map(d => [d.id, d]));
        const admin = findAccountByIdInternal('Guru', 'admins');
        const getMultiplier = (r: any, t: string) => t === "1 Digit Open" ? r.oneDigitOpen : t === "1 Digit Close" ? r.oneDigitClose : r.twoDigit;
        
        winningBets.forEach(bet => {
            const wins = bet.numbers.filter((n: string) => {
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
                addLedgerEntry(dealer.id, 'DEALER', 'Profit: ' + game.name, 0, dProfit);
                addLedgerEntry(admin.id, 'ADMIN', 'Dealer cut: ' + dealer.name, dProfit, 0);
            }
        });
        db.prepare('UPDATE games SET payoutsApproved = 1 WHERE id = ?').run(gameId);
        updatedGame = findAccountById(gameId, 'games');
    });
    return updatedGame;
};

export const getFinancialSummary = () => {
    try {
        const games = db.prepare('SELECT * FROM games').all() as any[];
        
        const allUsers = Object.fromEntries(getAllFromTable('users').map(u => [u.id, u]));
        const allDealers = Object.fromEntries(getAllFromTable('dealers').map(d => [d.id, d]));
        const getMultiplier = (r: any, t: string) => t === "1 Digit Open" ? r.oneDigitOpen : t === "1 Digit Close" ? r.oneDigitClose : r.twoDigit;
        
        const summary = games.map(game => {
            // Get total stake using SQL SUM
            const stakeRow = db.prepare('SELECT SUM(totalAmount) as total FROM bets WHERE gameId = ?').get(game.id) as any;
            const totalStake = stakeRow ? (stakeRow.total || 0) : 0;
            
            let payouts = 0, dProfit = 0, comms = 0;
            
            // Only fetch bets and calculate payouts if the game is fully finalized
            if (game.winningNumber && !game.winningNumber.endsWith('_')) {
                const gameBets = db.prepare('SELECT * FROM bets WHERE gameId = ?').all(game.id) as any[];
                gameBets.forEach(bet => {
                    try {
                        const betNums = JSON.parse(bet.numbers);
                        const wins = betNums.filter((n: string) => {
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
                        
                        const u = allUsers[bet.userId], d = allDealers[bet.dealerId];
                        if (u && d) {
                            comms += (bet.totalAmount * (u.commissionRate / 100)) + (bet.totalAmount * ((d.commissionRate - u.commissionRate) / 100));
                        }
                    } catch (e) {}
                });
            } else {
                // For live games, we still need commissions
                const gameBets = db.prepare('SELECT userId, dealerId, totalAmount FROM bets WHERE gameId = ?').all(game.id) as any[];
                gameBets.forEach(bet => {
                    const u = allUsers[bet.userId], d = allDealers[bet.dealerId];
                    if (u && d) {
                        comms += (bet.totalAmount * (u.commissionRate / 100)) + (bet.totalAmount * ((d.commissionRate - u.commissionRate) / 100));
                    }
                });
            }

            return { 
                gameName: game.name, 
                winningNumber: game.winningNumber, 
                totalStake, 
                totalPayouts: Math.round(payouts * 100) / 100, 
                totalDealerProfit: Math.round(dProfit * 100) / 100, 
                totalCommissions: Math.round(comms * 100) / 100, 
                netProfit: Math.round((totalStake - payouts - dProfit - comms) * 100) / 100 
            };
        });
        
        const totals = summary.reduce((t, g) => { 
            t.totalStake += g.totalStake; 
            t.totalPayouts += g.totalPayouts; 
            t.totalDealerProfit += g.totalDealerProfit; 
            t.totalCommissions += g.totalCommissions; 
            t.netProfit += g.netProfit; 
            return t; 
        }, { totalStake: 0, totalPayouts: 0, totalDealerProfit: 0, totalCommissions: 0, netProfit: 0 });
        
        const betsCountRow = db.prepare('SELECT COUNT(*) as count FROM bets').get() as any;
        return { 
            games: summary.sort((a,b) => a.gameName.localeCompare(b.gameName)), 
            totals: totals, 
            totalBets: betsCountRow ? betsCountRow.count : 0 
        };
    } catch (e) {
        logError('FINANCIAL_SUMMARY', e);
        return { games: [], totals: { totalStake: 0, totalPayouts: 0, totalDealerProfit: 0, totalCommissions: 0, netProfit: 0 }, totalBets: 0 };
    }
};

export const createDealer = (d: any) => {
    if (db.prepare('SELECT id FROM dealers WHERE LOWER(id) = ?').get(d.id.toLowerCase())) throw new Error("ID taken.");
    db.prepare('INSERT INTO dealers (id, name, password, area, contact, wallet, commissionRate, isRestricted, prizeRates, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(d.id, d.name, d.password, d.area, d.contact, d.wallet || 0, d.commissionRate, 0, JSON.stringify(d.prizeRates), d.avatarUrl);
    if (d.wallet > 0) addLedgerEntry(d.id, 'DEALER', 'Initial setup', 0, d.wallet);
    return findAccountById(d.id, 'dealers');
};

export const updateDealer = (d: any, originalId: string) => {
    const users = db.prepare('SELECT id, name, commissionRate FROM users WHERE LOWER(dealerId) = LOWER(?)').all(originalId) as any[];
    const newComm = Number(d.commissionRate);
    for (const u of users) {
        if (Number(u.commissionRate) > newComm) {
            throw new Error(`Cannot lower Dealer commission rate to ${newComm}% because User "${u.name}" (${u.id}) has a commission rate of ${u.commissionRate}%. Please lower user commission rates first.`);
        }
    }

    db.prepare('UPDATE dealers SET id = ?, name = ?, password = ?, area = ?, contact = ?, commissionRate = ?, prizeRates = ?, avatarUrl = ? WHERE LOWER(id) = LOWER(?)')
      .run(d.id, d.name, d.password, d.area, d.contact, Number(d.commissionRate), JSON.stringify(d.prizeRates), d.avatarUrl, originalId);
      
    if (d.id !== originalId) {
        db.prepare('UPDATE users SET dealerId = ? WHERE LOWER(dealerId) = LOWER(?)').run(d.id, originalId);
        db.prepare('UPDATE bets SET dealerId = ? WHERE LOWER(dealerId) = LOWER(?)').run(d.id, originalId);
        db.prepare('UPDATE ledgers SET accountId = ? WHERE LOWER(accountId) = LOWER(?) AND accountType = ?').run(d.id, originalId, 'DEALER');
    }
    return findAccountById(d.id, 'dealers');
};

export const updateAdmin = (a: any, adminId: string) => {
    db.prepare('UPDATE admins SET name = ?, prizeRates = ?, avatarUrl = ? WHERE LOWER(id) = LOWER(?)').run(a.name, JSON.stringify(a.prizeRates), a.avatarUrl, adminId);
    return findAccountById(adminId, 'admins');
};

export const topupAdminWallet = (adminId: string, amount: number) => {
    runInTransaction(() => {
        addLedgerEntry(adminId, 'ADMIN', 'Admin self top-up', 0, amount);
    });
    return findAccountById(adminId, 'admins');
};

export const updateDealerProfile = (dealerId: string, updates: any) => {
    const dealer = findAccountById(dealerId, 'dealers');
    if (!dealer) throw new Error('Dealer not found');
    
    // Whitelist updates
    const allowed = ['name', 'contact', 'area', 'avatarUrl', 'prizeRates', 'password'];
    const finalData = { ...dealer };
    
    allowed.forEach(key => {
        if (updates[key] !== undefined) {
            if (key === 'prizeRates' && updates[key]) {
                 finalData.prizeRates = {
                     twoDigit: Number(updates[key].twoDigit) || dealer.prizeRates.twoDigit,
                     oneDigitOpen: Number(updates[key].oneDigitOpen) || dealer.prizeRates.oneDigitOpen,
                     oneDigitClose: Number(updates[key].oneDigitClose) || dealer.prizeRates.oneDigitClose,
                 };
            } else {
                finalData[key] = updates[key];
            }
        }
    });

    db.prepare('UPDATE dealers SET data = ? WHERE id = ?').run(JSON.stringify(finalData), dealerId);
    return finalData;
};

export const findUsersByDealerId = (id: string) => db.prepare('SELECT id FROM users WHERE LOWER(dealerId) = LOWER(?)').all(id).map((u: any) => findAccountById(u.id, 'users'));
export const findBetsByDealerId = (id: string) => db.prepare('SELECT * FROM bets WHERE LOWER(dealerId) = LOWER(?) ORDER BY timestamp DESC').all(id).map((b: any) => {
    b.numbers = JSON.parse(b.numbers);
    return b;
});
export const findBetsByUserId = (id: string, limit = 1000) => {
    return db.prepare('SELECT * FROM bets WHERE LOWER(userId) = LOWER(?) ORDER BY timestamp DESC LIMIT ?').all(id, limit).map((b: any) => {
        try {
            b.numbers = JSON.parse(b.numbers);
        } catch (e) {
            b.numbers = [];
        }
        return b;
    });
};

export const findUserByDealer = (uId: string, dId: string) => { 
    const stmt = db.prepare('SELECT id FROM users WHERE LOWER(id) = LOWER(?) AND LOWER(dealerId) = LOWER(?)');
    const userRow = stmt.get(uId, dId) as any;
    if (!userRow) return null;
    return findAccountById(userRow.id, 'users'); 
};

export const createUser = (u: any, dId: string, dep = 0) => {
    if (db.prepare('SELECT id FROM users WHERE LOWER(id) = ?').get(u.id.toLowerCase())) throw new Error("Username exists.");
    
    // User dealer prize rates as default if not explicitly provided in u
    const dealer = findAccountById(dId, 'dealers');
    const dComm = dealer ? (dealer.commissionRate ?? 0) : 0;
    if (Number(u.commissionRate) > dComm) {
        throw new Error(`User commission rate (${u.commissionRate}%) cannot exceed the Dealer's commission rate of (${dComm}%).`);
    }
    
    const finalPrizeRates = u.prizeRates || (dealer ? dealer.prizeRates : { oneDigitOpen: 9.5, oneDigitClose: 9.5, twoDigit: 90 });
    
    db.prepare('INSERT INTO users (id, name, password, dealerId, area, contact, wallet, commissionRate, isRestricted, prizeRates, betLimits, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(u.id, u.name, u.password, dId, u.area, u.contact, 0, u.commissionRate, 0, JSON.stringify(finalPrizeRates), JSON.stringify(u.betLimits || { oneDigit: 1000, twoDigit: 5000, perDraw: 20000 }), u.avatarUrl);
    if (dep > 0) { addLedgerEntry(dId, 'DEALER', 'Seed funding: ' + u.name, dep, 0); addLedgerEntry(u.id, 'USER', 'Initial deposit', 0, dep); }
    return findAccountById(u.id, 'users');
};

export const updateUser = (u: any, uId: string, dId: string) => {
    const dealer = findAccountById(dId, 'dealers');
    const dComm = dealer ? (dealer.commissionRate ?? 0) : 0;
    if (Number(u.commissionRate) > dComm) {
        throw new Error(`User commission rate (${u.commissionRate}%) cannot exceed the Dealer's commission rate of (${dComm}%).`);
    }

    db.prepare('UPDATE users SET id = ?, name = ?, password = ?, area = ?, contact = ?, commissionRate = ?, prizeRates = ?, betLimits = ?, avatarUrl = ? WHERE LOWER(id) = LOWER(?) AND LOWER(dealerId) = LOWER(?)')
      .run(u.id, u.name, u.password, u.area, u.contact, Number(u.commissionRate), JSON.stringify(u.prizeRates), JSON.stringify(u.betLimits), u.avatarUrl, uId, dId);
    
    if (u.id.toLowerCase() !== uId.toLowerCase()) {
        db.prepare('UPDATE bets SET userId = ? WHERE LOWER(userId) = LOWER(?)').run(u.id, uId);
        db.prepare('UPDATE ledgers SET accountId = ? WHERE LOWER(accountId) = LOWER(?) AND accountType = ?').run(u.id, uId, 'USER');
    }
    return findAccountById(u.id, 'users');
};

export const updateUserByAdmin = (u: any, uId: string) => {
    const user = findAccountById(uId, 'users');
    if (!user) throw new Error("User not found.");
    const dealer = findAccountById(user.dealerId, 'dealers');
    const dComm = dealer ? (dealer.commissionRate ?? 0) : 0;
    if (Number(u.commissionRate) > dComm) {
        throw new Error(`User commission rate (${u.commissionRate}%) cannot exceed the Dealer's commission rate of (${dComm}%).`);
    }

    db.prepare('UPDATE users SET name = ?, password = ?, area = ?, contact = ?, commissionRate = ?, prizeRates = ?, betLimits = ?, avatarUrl = ? WHERE LOWER(id) = LOWER(?)').run(u.name, u.password, u.area, u.contact, Number(u.commissionRate), JSON.stringify(u.prizeRates), JSON.stringify(u.betLimits), u.avatarUrl, uId);
    return findAccountById(uId, 'users');
};

export const deleteUserByDealer = (uId: string, dId: string) => {
    runInTransaction(() => {
        db.prepare('DELETE FROM ledgers WHERE LOWER(accountId) = LOWER(?) AND accountType = ?').run(uId, 'USER');
        db.prepare('DELETE FROM bets WHERE LOWER(userId) = LOWER(?)').run(uId);
        db.prepare('DELETE FROM users WHERE LOWER(id) = LOWER(?) AND LOWER(dealerId) = LOWER(?)').run(uId, dId);
    });
    return true;
};

export const toggleAccountRestrictionByAdmin = (id: string, type: string) => {
    let result;
    runInTransaction(() => {
        const table = type.toLowerCase() + 's';
        const acc = db.prepare('SELECT isRestricted FROM ' + table + ' WHERE LOWER(id) = LOWER(?)').get(id) as any;
        if (!acc) throw new Error('Not found.');
        const status = acc.isRestricted ? 0 : 1;
        db.prepare('UPDATE ' + table + ' SET isRestricted = ? WHERE LOWER(id) = LOWER(?)').run(status, id);
        if (type.toLowerCase() === 'dealer') db.prepare('UPDATE users SET isRestricted = ? WHERE LOWER(dealerId) = LOWER(?)').run(status, id);
        result = findAccountById(id, table);
    });
    return result;
};

export const toggleUserRestrictionByDealer = (uId: string, dId: string) => {
    const user = db.prepare('SELECT isRestricted FROM users WHERE LOWER(id) = LOWER(?) AND LOWER(dealerId) = LOWER(?)').get(uId, dId) as any;
    if (!user) throw new Error('Not found.');
    db.prepare('UPDATE users SET isRestricted = ? WHERE LOWER(id) = LOWER(?)').run(user.isRestricted ? 0 : 1, uId);
    return findAccountById(uId, 'users');
};

export function getNumberStakeSummary(params: any) {
    try {
        let query = 'SELECT gameId, subGameType, numbers, amountPerNumber, totalAmount FROM bets';
        const vals: any[] = [], conds: string[] = [];
        if (params.gameId) { conds.push('gameId = ?'); vals.push(params.gameId); }
        if (params.dealerId) { conds.push('LOWER(dealerId) = LOWER(?)'); vals.push(params.dealerId); }
        if (params.date) { conds.push('date(timestamp) = ?'); vals.push(params.date); }
        if (conds.length > 0) query += ' WHERE ' + conds.join(' AND ');
        
        const bets = db.prepare(query).all(...vals) as any[];
        const map2 = new Map(), mapO = new Map(), mapC = new Map(), mapG = new Map();
        
        bets.forEach(b => {
            mapG.set(b.gameId, (mapG.get(b.gameId) || 0) + b.totalAmount);
            try {
                const nums = JSON.parse(b.numbers), amt = b.amountPerNumber;
                let target;
                if (b.subGameType === '1 Digit Open') target = mapO;
                else if (b.subGameType === '1 Digit Close') target = mapC;
                else target = map2;
                nums.forEach((n: string) => target.set(n, (target.get(n) || 0) + amt));
            } catch (e) {}
        });
        
        const sort = (m: Map<string, number>) => Array.from(m.entries()).map(e => ({ number: e[0], stake: e[1] })).sort((a, b) => b.stake - a.stake);
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

export const placeBulkBets = (uId: string, gId: string, groups: any[]) => {
    let result = null;
    runInTransaction(() => {
        const user = findAccountByIdInternal(uId, 'users');
        if (!user || user.isRestricted) throw new Error('Access denied.');
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gId) as any;
        if (!game || !isGameOpen(game.drawTime)) throw new Error("Market is closed.");
        const dealer = findAccountByIdInternal(user.dealerId, 'dealers');
        if (!dealer) throw new Error('Dealer not found.');
        const requestTotal = groups.reduce((s, g) => s + (g.numbers?.length || 0) * (g.amountPerNumber || 0), 0);
        if (requestTotal <= 0) throw new Error('Invalid stake.');
        if (user.wallet < requestTotal) throw new Error('Balance too low.');
        
        // Bet threshold / limit validations
        const limits = user.betLimits || {};
        const oneDigitLimit = Number(limits.oneDigit) || 0;
        const twoDigitLimit = Number(limits.twoDigit) || 0;
        const perDrawLimit = Number(limits.perDraw) || 0;

        if (perDrawLimit > 0) {
            const existingSum = db.prepare('SELECT SUM(totalAmount) as total FROM bets WHERE LOWER(userId) = LOWER(?) AND gameId = ?').get(uId, gId) as any;
            const existingTotal = existingSum ? (Number(existingSum.total) || 0) : 0;
            if ((existingTotal + requestTotal) > perDrawLimit) {
                throw new Error(`Bet exceeds the per-draw limit of Rs ${perDrawLimit.toLocaleString()}. (Current total on this market: Rs ${existingTotal.toLocaleString()})`);
            }
        }

        let newOneDigitTotal = 0;
        let newTwoDigitTotal = 0;
        for (var idxG = 0; idxG < groups.length; idxG++) {
            const g = groups[idxG];
            const isOneDigit = g.subGameType === '1 Digit Open' || g.subGameType === '1 Digit Close' || g.subGameType === 'OneDigitOpen' || g.subGameType === 'OneDigitClose';
            const groupTotal = (g.numbers?.length || 0) * (g.amountPerNumber || 0);
            if (isOneDigit) {
                newOneDigitTotal += groupTotal;
            } else {
                newTwoDigitTotal += groupTotal;
            }
        }

        if (oneDigitLimit > 0 && newOneDigitTotal > 0) {
            const existingOneDigitSum = db.prepare("SELECT SUM(totalAmount) as total FROM bets WHERE LOWER(userId) = LOWER(?) AND gameId = ? AND subGameType IN ('1 Digit Open', '1 Digit Close', 'OneDigitOpen', 'OneDigitClose')").get(uId, gId) as any;
            const existingOneDigitTotal = existingOneDigitSum ? (Number(existingOneDigitSum.total) || 0) : 0;
            if ((existingOneDigitTotal + newOneDigitTotal) > oneDigitLimit) {
                throw new Error(`Bet exceeds the 1-Digit total limit of Rs ${oneDigitLimit.toLocaleString()}. (Current total on 1-Digit for this market: Rs ${existingOneDigitTotal.toLocaleString()})`);
            }
        }

        if (twoDigitLimit > 0 && newTwoDigitTotal > 0) {
            const existingTwoDigitSum = db.prepare("SELECT SUM(totalAmount) as total FROM bets WHERE LOWER(userId) = LOWER(?) AND gameId = ? AND subGameType NOT IN ('1 Digit Open', '1 Digit Close', 'OneDigitOpen', 'OneDigitClose')").get(uId, gId) as any;
            const existingTwoDigitTotal = existingTwoDigitSum ? (Number(existingTwoDigitSum.total) || 0) : 0;
            if ((existingTwoDigitTotal + newTwoDigitTotal) > twoDigitLimit) {
                throw new Error(`Bet exceeds the 2-Digit total limit of Rs ${twoDigitLimit.toLocaleString()}. (Current total on 2-Digit for this market: Rs ${existingTwoDigitTotal.toLocaleString()})`);
            }
        }
        
        const admin = findAccountByIdInternal('Guru', 'admins');
        if (!admin) throw new Error('System account missing.');
        
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
        const insertStmt = db.prepare('INSERT INTO bets (id, userId, dealerId, gameId, subGameType, numbers, amountPerNumber, totalAmount, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const now = new Date().toISOString();
        
        for (var i = 0; i < groups.length; i++) {
            var g = groups[i];
            const betId = uuidv4();
            const totalAmount = g.numbers.length * g.amountPerNumber;
            const numbersJson = JSON.stringify(g.numbers);
            
            insertStmt.run(betId, uId, dealer.id, game.id, g.subGameType, numbersJson, g.amountPerNumber, totalAmount, now);
            
            created.push({
                id: betId, userId: uId, dealerId: dealer.id, gameId: game.id,
                subGameType: g.subGameType, numbers: g.numbers,
                amountPerNumber: g.amountPerNumber, totalAmount: totalAmount,
                timestamp: now
            });
        }
        result = created;
    });
    return result;
};


export const updateWinningNumber = (gameId: string, newWinningNumber: string) => {
    runInTransaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId) as any;
        if (!game) throw new Error('Game not found.');
        if (game.payoutsApproved) throw new Error('Cannot update winning number after payouts are approved.');
        
        let finalNum = newWinningNumber;
        if (game.name === 'AK') {
            if (newWinningNumber.length === 1) {
                finalNum = newWinningNumber + '_';
            } else {
                finalNum = newWinningNumber;
            }
        }
        
        db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(finalNum, gameId);
        
        // If it's AKC, we might need to update the AK game too if it's currently in "_" state
        if (game.name === 'AKC') {
            const akGame = db.prepare("SELECT * FROM games WHERE name = 'AK'").get() as any;
            if (akGame && akGame.winningNumber && akGame.winningNumber.endsWith('_')) {
                db.prepare("UPDATE games SET winningNumber = ? WHERE name = 'AK'").run(akGame.winningNumber.slice(0, 1) + finalNum);
            }
        }
    });
    return findAccountById(gameId, 'games');
};

export const updateGameDrawTime = (id: string, time: string) => {
    db.prepare('UPDATE games SET drawTime = ? WHERE id = ?').run(time, id);
    return findAccountById(id, 'games');
};

export function getAllNumberLimits() { return db.prepare('SELECT * FROM number_limits').all(); }
export function saveNumberLimit(limit: any) {
    db.prepare('INSERT OR REPLACE INTO number_limits (gameType, numberValue, limitAmount) VALUES (?, ?, ?)').run(limit.gameType, limit.numberValue, limit.limitAmount);
    return db.prepare('SELECT * FROM number_limits WHERE gameType = ? AND numberValue = ?').get(limit.gameType, limit.numberValue);
}
export function deleteNumberLimit(id: string) { db.prepare('DELETE FROM number_limits WHERE id = ?').run(id); }

export function resetAllGames() {
    try {
        runInTransaction(() => {
            db.prepare('UPDATE games SET winningNumber = NULL, payoutsApproved = 0').run();
            db.prepare('DELETE FROM bets').run(); 
        });
        console.error('--- [DATABASE] Daily Reset Triggered. ---');
    } catch (e) {
        logError('DAILY_RESET', e);
    }
}
