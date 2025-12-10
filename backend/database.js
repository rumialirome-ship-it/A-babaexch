
const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'database.sqlite');
let db;

// --- CENTRALIZED GAME TIMING LOGIC (TIMEZONE-AWARE) ---
const PKT_OFFSET_HOURS = 5;
const OPEN_HOUR_PKT = 16; // 4:00 PM in Pakistan
const RESET_HOUR_UTC = OPEN_HOUR_PKT - PKT_OFFSET_HOURS; // 11:00 UTC

/**
 * Determines the "market day" for a given date, factoring in the daily reset time.
 * All calculations are in UTC to ensure consistency.
 * @param {Date} dateObj The date object.
 * @returns {string} A string in 'YYYY-MM-DD' format representing the market day in UTC.
 */
const getMarketDateString = (dateObj) => {
    const d = new Date(dateObj.getTime());
    // The market day is based on the 11:00 UTC (4 PM PKT) reset time.
    // If a bet is placed before 11:00 UTC on a given day, it belongs to the *previous* day's market cycle.
    if (d.getUTCHours() < RESET_HOUR_UTC) {
        d.setUTCDate(d.getUTCDate() - 1);
    }
    return d.toISOString().split('T')[0];
};


/**
 * Calculates the current or next valid betting window (open time to close time) for a game,
 * with all calculations done in UTC to ensure timezone correctness. This is the single source of truth for game state.
 * @param {string} drawTime - The game's draw time in "HH:MM" format, assumed to be in PKT.
 * @returns {{openTime: Date, closeTime: Date}} Date objects representing absolute UTC time.
 */
function getGameCycle(drawTime) {
    const now = new Date(); // Current server time is UTC
    const [drawHoursPKT, drawMinutesPKT] = drawTime.split(':').map(Number);
    const openHourUTC = OPEN_HOUR_PKT - PKT_OFFSET_HOURS;

    let lastOpenTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), openHourUTC, 0, 0));
    if (now.getTime() < lastOpenTime.getTime()) {
        lastOpenTime.setUTCDate(lastOpenTime.getUTCDate() - 1);
    }
    
    let closeTime = new Date(lastOpenTime.getTime());
    const drawHourUTC = (drawHoursPKT - PKT_OFFSET_HOURS + 24) % 24;

    closeTime.setUTCHours(drawHourUTC, drawMinutesPKT, 0, 0);

    // If setting the time made it earlier than or equal to the open time, it must be for the next day.
    if (closeTime.getTime() <= lastOpenTime.getTime()) {
        closeTime.setUTCDate(closeTime.getUTCDate() + 1);
    }
    
    return { openTime: lastOpenTime, closeTime: closeTime };
}


/**
 * Checks if a game is currently within its valid betting window.
 * This is the public function that uses the cycle calculator.
 * @param {string} drawTime - The game's draw time in "HH:MM" format (PKT).
 * @returns {boolean}
 */
function isGameOpen(drawTime) {
    const now = new Date(); // Current server time (UTC)
    const { openTime, closeTime } = getGameCycle(drawTime);
    return now >= openTime && now < closeTime;
}


/**
 * Connects to the SQLite database.
 */
const connect = () => {
    try {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        console.error('Database connected successfully.');
    } catch (error) {
        console.error('Failed to connect to database:', error);
        process.exit(1);
    }
};

/**
 * Verifies that the database schema seems to exist.
 */
const verifySchema = () => {
    try {
        const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admins'");
        const table = stmt.get();
        if (!table) {
            console.error('\n\n--- CRITICAL DATABASE ERROR ---');
            console.error('Database schema is missing. The "admins" table was not found.');
            console.error('This is usually because the database setup script was not run or failed.');
            console.error('ACTION REQUIRED: Please stop the server, delete the database.sqlite file,');
            console.error('and run "npm run db:setup" in the /backend directory to initialize it.\n\n');
            process.exit(1);
        }
    } catch (error) {
        console.error('Failed to verify database schema:', error);
        process.exit(1);
    }
};

/**
 * Generic function to find an account by ID and type.
 * @param {string} id - The account ID.
 * @param {'admins' | 'dealers' | 'users' | 'games'} table - The table to search in.
 * @returns {object | null} The account object or null if not found.
 */
const findAccountById = (id, table) => {
    const stmt = db.prepare(`SELECT * FROM ${table} WHERE id = ?`);
    const account = stmt.get(id);
    if (!account) return null;

    try {
        // Attach ledger for non-game tables
        if (table !== 'games' && table !== 'daily_results') {
            const ledgerStmt = db.prepare('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp ASC');
            account.ledger = ledgerStmt.all(id);
        } else if (table === 'games') {
            // Dynamically determine if the game market is open based on time.
            account.isMarketOpen = isGameOpen(account.drawTime);
        }

        // Parse JSON fields safely
        if (account.prizeRates && typeof account.prizeRates === 'string') {
            account.prizeRates = JSON.parse(account.prizeRates);
        }
        if (account.betLimits && typeof account.betLimits === 'string') {
            account.betLimits = JSON.parse(account.betLimits);
        }
        
        // Convert boolean
        if ('isRestricted' in account) {
            account.isRestricted = !!account.isRestricted;
        }
    } catch (e) {
        console.error(`Failed to parse data for account in table ${table} with id ${id}`, e);
        // Return account with raw data to avoid crashing the entire request
    }

    return account;
};

const findAccountForLogin = (loginId) => {
    const lowerCaseLoginId = loginId.toLowerCase();

    const tables = [
        { name: 'users', role: 'USER' },
        { name: 'dealers', role: 'DEALER' },
        { name: 'admins', role: 'ADMIN' },
    ];

    for (const tableInfo of tables) {
        const stmt = db.prepare(`SELECT * FROM ${tableInfo.name} WHERE lower(id) = ?`);
        const account = stmt.get(lowerCaseLoginId);
        if (account) {
            return { account, role: tableInfo.role };
        }
    }
    return { account: null, role: null };
};

const updatePassword = (accountId, contact, newPassword) => {
    const tables = ['users', 'dealers'];
    let updated = false;
    for (const table of tables) {
        const stmt = db.prepare(`UPDATE ${table} SET password = ? WHERE id = ? AND contact = ?`);
        const result = stmt.run(newPassword, accountId, contact);
        if (result.changes > 0) {
            updated = true;
            break;
        }
    }
    return updated;
};

const getLedgerForAccount = (accountId) => {
    return db.prepare('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp ASC').all(accountId);
};

const getAllFromTable = (table, withLedger = false) => {
    let accounts = db.prepare(`SELECT * FROM ${table}`).all();
    if (table === 'daily_results') return accounts;
    return accounts.map(acc => {
        try {
            if (withLedger && acc.id) {
                acc.ledger = getLedgerForAccount(acc.id);
            }
            if (table === 'games' && acc.drawTime) {
                acc.isMarketOpen = isGameOpen(acc.drawTime);
            }
            if (acc.prizeRates && typeof acc.prizeRates === 'string') {
                acc.prizeRates = JSON.parse(acc.prizeRates);
            }
            if (acc.betLimits && typeof acc.betLimits === 'string') {
                acc.betLimits = JSON.parse(acc.betLimits);
            }
            if (table === 'bets' && acc.numbers && typeof acc.numbers === 'string') {
                acc.numbers = JSON.parse(acc.numbers);
            }
            if ('isRestricted' in acc) {
                acc.isRestricted = !!acc.isRestricted;
            }
        } catch (e) {
            console.error(`Failed to parse data for item in table ${table} with id ${acc.id}`, e);
        }
        return acc;
    });
};

const runInTransaction = (fn) => {
    db.transaction(fn)();
};

const addLedgerEntry = (accountId, accountType, description, debit, credit) => {
    const table = accountType.toLowerCase() + 's';
    
    const lastBalanceStmt = db.prepare('SELECT balance FROM ledgers WHERE accountId = ? ORDER BY timestamp DESC, ROWID DESC LIMIT 1');
    const lastEntry = lastBalanceStmt.get(accountId);
    const lastBalance = lastEntry ? lastEntry.balance : 0;

    // Robust check: Ensure non-admin accounts cannot have a negative balance.
    if (debit > 0 && accountType !== 'ADMIN' && lastBalance < debit) {
        throw { 
            status: 400, 
            message: `Insufficient funds. Wallet has ${lastBalance.toFixed(2)}, but transaction requires ${debit.toFixed(2)}.` 
        };
    }
    
    const newBalance = lastBalance - debit + credit;
    
    const insertLedgerStmt = db.prepare('INSERT INTO ledgers (id, accountId, accountType, timestamp, description, debit, credit, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    insertLedgerStmt.run(uuidv4(), accountId, accountType, new Date().toISOString(), description, debit, credit, newBalance);
    
    const updateWalletStmt = db.prepare(`UPDATE ${table} SET wallet = ? WHERE id = ?`);
    updateWalletStmt.run(newBalance, accountId);
};

// Helper to determine the market date for a result being declared NOW.
const getMarketDateForDeclaration = (drawTime) => {
    const { openTime } = getGameCycle(drawTime);
    const now = new Date();
    let marketDate;

    if (now.getTime() < openTime.getTime()) {
        // `now` is before today's market has opened.
        // Therefore, the result being declared must be for the *previous* market day.
        const previousMarketOpenTime = new Date(openTime.getTime());
        previousMarketOpenTime.setUTCDate(previousMarketOpenTime.getUTCDate() - 1);
        marketDate = previousMarketOpenTime.toISOString().split('T')[0];
    } else {
        // `now` is during or after today's market open time.
        // The result is for the current market day.
        marketDate = openTime.toISOString().split('T')[0];
    }
    return marketDate;
};


const declareWinnerForGame = (gameId, winningNumber) => {
    let finalGame;
    runInTransaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
        if (!game) throw { status: 404, message: 'Game not found.' };
        if (game.winningNumber) throw { status: 400, message: 'Winner has already been declared for this game.' };

        const marketDateForDb = getMarketDateForDeclaration(game.drawTime);
        
        const upsertResultStmt = db.prepare('INSERT INTO daily_results (id, gameId, date, winningNumber) VALUES (?, ?, ?, ?) ON CONFLICT(gameId, date) DO UPDATE SET winningNumber = excluded.winningNumber');

        if (game.name === 'AK') {
            if (!/^\d$/.test(winningNumber)) {
                throw { status: 400, message: 'AK open winner must be a single digit.' };
            }
            const partialWinner = `${winningNumber}_`;
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(partialWinner, gameId);
        } else if (game.name === 'AKC') {
            if (!/^\d$/.test(winningNumber)) {
                throw { status: 400, message: 'AKC winner must be a single digit.' };
            }
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(winningNumber, gameId);
            upsertResultStmt.run(uuidv4(), gameId, marketDateForDb, winningNumber);

            const akGame = db.prepare("SELECT * FROM games WHERE name = 'AK'").get();
            if (akGame && akGame.winningNumber && akGame.winningNumber.endsWith('_')) {
                const openDigit = akGame.winningNumber.slice(0, 1);
                const fullNumber = openDigit + winningNumber;
                db.prepare("UPDATE games SET winningNumber = ? WHERE name = 'AK'").run(fullNumber);
                
                const akMarketDate = getMarketDateForDeclaration(akGame.drawTime);
                upsertResultStmt.run(uuidv4(), akGame.id, akMarketDate, fullNumber);
            }
        } else {
            if (!/^\d{2}$/.test(winningNumber)) {
                throw { status: 400, message: 'Winning number must be a 2-digit number.' };
            }
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(winningNumber, gameId);
            upsertResultStmt.run(uuidv4(), gameId, marketDateForDb, winningNumber);
        }
        finalGame = findAccountById(gameId, 'games');
    });
    return finalGame;
};

const updateWinningNumber = (gameId, newWinningNumber) => {
    let updatedGame;
    runInTransaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
        if (!game || !game.winningNumber) {
            throw { status: 400, message: 'Cannot update: Game not found or winner not declared.' };
        }
        if (game.payoutsApproved) {
            throw { status: 400, message: 'Cannot update: Payouts have already been approved.' };
        }

        const marketDateForDb = getMarketDateForDeclaration(game.drawTime);
        
        const upsertResultStmt = db.prepare('INSERT INTO daily_results (id, gameId, date, winningNumber) VALUES (?, ?, ?, ?) ON CONFLICT(gameId, date) DO UPDATE SET winningNumber = excluded.winningNumber');

        if (game.name === 'AK') {
            if (!/^\d$/.test(newWinningNumber)) {
                throw { status: 400, message: 'New AK open winner must be a single digit.' };
            }
            const closeDigit = game.winningNumber.endsWith('_') ? '_' : game.winningNumber.slice(1, 2);
            const updatedNumber = newWinningNumber + closeDigit;
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(updatedNumber, gameId);
            if (!updatedNumber.endsWith('_')) {
                upsertResultStmt.run(uuidv4(), gameId, marketDateForDb, updatedNumber);
            }
        } else if (game.name === 'AKC') {
            if (!/^\d$/.test(newWinningNumber)) {
                throw { status: 400, message: 'New AKC winner must be a single digit.' };
            }
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(newWinningNumber, gameId);
            upsertResultStmt.run(uuidv4(), gameId, marketDateForDb, newWinningNumber);
            
            const akGame = db.prepare("SELECT * FROM games WHERE name = 'AK'").get();
            if (akGame && akGame.winningNumber && !akGame.winningNumber.endsWith('_')) {
                const openDigit = akGame.winningNumber.slice(0, 1);
                const fullNumber = openDigit + newWinningNumber;
                db.prepare("UPDATE games SET winningNumber = ? WHERE name = 'AK'").run(fullNumber);
                
                const akMarketDate = getMarketDateForDeclaration(akGame.drawTime);
                upsertResultStmt.run(uuidv4(), akGame.id, akMarketDate, fullNumber);
            }
        } else {
            if (!/^\d{2}$/.test(newWinningNumber)) {
                throw { status: 400, message: 'New winning number must be a 2-digit number.' };
            }
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(newWinningNumber, gameId);
            upsertResultStmt.run(uuidv4(), gameId, marketDateForDb, newWinningNumber);
        }
        updatedGame = findAccountById(gameId, 'games');
    });
    return updatedGame;
};

const approvePayoutsForGame = (gameId) => {
    let updatedGame;
    runInTransaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
        if (!game || !game.winningNumber) {
            throw { status: 400, message: "Winner must be declared before approving payouts." };
        }
        if (game.payoutsApproved) {
            throw { status: 400, message: "Payouts have already been approved for this game." };
        }
        if (game.name === 'AK' && game.winningNumber.endsWith('_')) {
            throw { status: 400, message: "Cannot approve payouts for AK until the close number from AKC is declared." };
        }

        // Determine the market day for which payouts are being approved.
        const marketDateForPayouts = getMarketDateForDeclaration(game.drawTime);

        // Fetch all bets for the game and filter them to the correct market day.
        const allGameBets = db.prepare('SELECT * FROM bets WHERE gameId = ?').all(gameId);
        const winningBets = allGameBets
            .filter(bet => getMarketDateString(new Date(bet.timestamp)) === marketDateForPayouts)
            .map(b => ({
                ...b,
                numbers: JSON.parse(b.numbers)
            }));
        
        const winningNumber = game.winningNumber;
        const allUsers = Object.fromEntries(getAllFromTable('users').map(u => [u.id, u]));
        const allDealers = Object.fromEntries(getAllFromTable('dealers').map(d => [d.id, d]));
        const admin = findAccountById('Guru', 'admins');

        const getPrizeMultiplier = (rates, subGameType) => {
            if (subGameType === "1 Digit Open") return rates.oneDigitOpen;
            if (subGameType === "1 Digit Close") return rates.oneDigitClose;
            return rates.twoDigit;
        };

        winningBets.forEach(bet => {
            const winningNumbersInBet = bet.numbers.filter(num => {
                let isWin = false;
                switch (bet.subGameType) {
                    case "1 Digit Open":
                        if (winningNumber.length === 2) { isWin = num === winningNumber[0]; }
                        break;
                    case "1 Digit Close":
                        if (game.name === 'AKC') { isWin = num === winningNumber; } 
                        else if (winningNumber.length === 2) { isWin = num === winningNumber[1]; }
                        break;
                    default: // 2 Digit, Bulk Game, Combo Game
                        isWin = num === winningNumber;
                        break;
                }
                return isWin;
            });

            if (winningNumbersInBet.length > 0) {
                const user = allUsers[bet.userId];
                const dealer = allDealers[bet.dealerId];
                if (!user || !dealer) return;

                const userPrize = winningNumbersInBet.length * bet.amountPerNumber * getPrizeMultiplier(user.prizeRates, bet.subGameType);
                const dealerProfit = winningNumbersInBet.length * bet.amountPerNumber * (getPrizeMultiplier(dealer.prizeRates, bet.subGameType) - getPrizeMultiplier(user.prizeRates, bet.subGameType));
                
                // Payout to user
                addLedgerEntry(user.id, 'USER', `Prize money for ${game.name}`, 0, userPrize);
                addLedgerEntry(admin.id, 'ADMIN', `Prize payout to ${user.name}`, userPrize, 0);

                // Profit to dealer
                addLedgerEntry(dealer.id, 'DEALER', `Profit from winner in ${game.name}`, 0, dealerProfit);
                addLedgerEntry(admin.id, 'ADMIN', `Dealer profit payout to ${dealer.name}`, dealerProfit, 0);
            }
        });

        db.prepare('UPDATE games SET payoutsApproved = 1 WHERE id = ?').run(gameId);
        updatedGame = findAccountById(gameId, 'games');
    });
    return updatedGame;
};


const getFinancialSummary = (targetDate) => {
    // If no date is provided, default to the current market date.
    const date = targetDate || getMarketDateString(new Date());

    // 1. Fetch all necessary data
    const allBets = db.prepare('SELECT * FROM bets').all().map(b => ({...b, numbers: JSON.parse(b.numbers)}));
    const allUsers = Object.fromEntries(getAllFromTable('users').map(u => [u.id, u]));
    const allDealers = Object.fromEntries(getAllFromTable('dealers').map(d => [d.id, d]));
    const allGames = getAllFromTable('games'); // Get all game definitions (name, etc.)

    // 2. Filter bets for the target market date
    const betsForDate = allBets.filter(bet => getMarketDateString(new Date(bet.timestamp)) === date);

    // 3. Get results specifically for the target date
    const resultsForDate = db.prepare('SELECT gameId, winningNumber FROM daily_results WHERE date = ?').all(date);
    const winningNumbersMap = new Map(resultsForDate.map(r => [r.gameId, r.winningNumber]));

    const getPrizeMultiplier = (rates, subGameType) => {
        if (!rates) return 0;
        if (subGameType === "1 Digit Open") return rates.oneDigitOpen;
        if (subGameType === "1 Digit Close") return rates.oneDigitClose;
        return rates.twoDigit;
    };

    // 4. Process each game that has a result on the target date
    const summaryByGame = Array.from(winningNumbersMap.entries()).map(([gameId, winningNumber]) => {
        const game = allGames.find(g => g.id === gameId);
        if (!game || winningNumber.endsWith('_')) return null; // Skip if game def not found or result is partial (like AK_)

        const gameBets = betsForDate.filter(b => b.gameId === game.id);
        const totalStake = gameBets.reduce((sum, b) => sum + b.totalAmount, 0);

        let totalPayouts = 0;
        let totalDealerProfit = 0;

        gameBets.forEach(bet => {
            const winningNumbersInBet = bet.numbers.filter(num => {
                let isWin = false;
                switch (bet.subGameType) {
                    case "1 Digit Open": if (winningNumber.length === 2) isWin = num === winningNumber[0]; break;
                    case "1 Digit Close": if (game.name === 'AKC') isWin = num === winningNumber; else if (winningNumber.length === 2) isWin = num === winningNumber[1]; break;
                    default: isWin = num === winningNumber; break;
                }
                return isWin;
            });

            if (winningNumbersInBet.length > 0) {
                const user = allUsers[bet.userId];
                const dealer = allDealers[bet.dealerId];
                if (!user || !dealer) return;

                const userPrize = winningNumbersInBet.length * bet.amountPerNumber * getPrizeMultiplier(user.prizeRates, bet.subGameType);
                const dealerProfit = winningNumbersInBet.length * bet.amountPerNumber * (getPrizeMultiplier(dealer.prizeRates, bet.subGameType) - getPrizeMultiplier(user.prizeRates, bet.subGameType));
                
                totalPayouts += userPrize;
                totalDealerProfit += dealerProfit;
            }
        });

        const totalCommissions = gameBets.reduce((sum, bet) => {
            const user = allUsers[bet.userId];
            const dealer = allDealers[bet.dealerId];
            if (!user || !dealer) return sum;

            const userCommission = bet.totalAmount * (user.commissionRate / 100);
            const dealerCommission = bet.totalAmount * ((dealer.commissionRate - user.commissionRate) / 100);
            return sum + userCommission + dealerCommission;
        }, 0);

        const netProfit = totalStake - totalPayouts - totalDealerProfit - totalCommissions;

        return {
            gameName: game.name,
            winningNumber: winningNumber,
            totalStake, totalPayouts, totalDealerProfit, totalCommissions, netProfit,
        };
    }).filter(Boolean); // Filter out nulls

    // 5. Calculate grand total
    const grandTotal = summaryByGame.reduce((totals, game) => {
        totals.totalStake += game.totalStake;
        totals.totalPayouts += game.totalPayouts;
        totals.totalDealerProfit += game.totalDealerProfit;
        totals.totalCommissions += game.totalCommissions;
        totals.netProfit += game.netProfit;
        return totals;
    }, { totalStake: 0, totalPayouts: 0, totalDealerProfit: 0, totalCommissions: 0, netProfit: 0 });

    return {
        games: summaryByGame.sort((a,b) => a.gameName.localeCompare(b.gameName)),
        totals: grandTotal,
        totalBets: betsForDate.length,
    };
};

const getWinnersReport = (gameId, date) => {
    const game = findAccountById(gameId, 'games');
    const result = db.prepare('SELECT winningNumber FROM daily_results WHERE gameId = ? AND date = ?').get(gameId, date);

    if (!game || !result || !result.winningNumber || result.winningNumber.endsWith('_')) {
        return null;
    }

    const winningNumber = result.winningNumber;
    const allUsers = Object.fromEntries(getAllFromTable('users').map(u => [u.id, u]));
    const allDealers = Object.fromEntries(getAllFromTable('dealers').map(d => [d.id, d]));

    const allGameBets = db.prepare('SELECT * FROM bets WHERE gameId = ?').all(gameId);
    const marketDayBets = allGameBets.filter(bet => getMarketDateString(new Date(bet.timestamp)) === date);

    const winners = [];
    let totalPayout = 0;

    const getPrizeMultiplier = (rates, subGameType) => {
        if (!rates) return 0;
        switch (subGameType) {
            case "1 Digit Open": return rates.oneDigitOpen;
            case "1 Digit Close": return rates.oneDigitClose;
            default: return rates.twoDigit;
        }
    };
    
    marketDayBets.forEach(bet => {
        const user = allUsers[bet.userId];
        const dealer = allDealers[bet.dealerId];
        if (!user || !dealer) return;

        const betNumbers = JSON.parse(bet.numbers);
        const winningBetNumbers = [];

        betNumbers.forEach(num => {
            let isWin = false;
            switch (bet.subGameType) {
                case "1 Digit Open": if (winningNumber.length === 2) isWin = num === winningNumber[0]; break;
                case "1 Digit Close": if (game.name === 'AKC') isWin = num === winningNumber; else if (winningNumber.length === 2) isWin = num === winningNumber[1]; break;
                default: isWin = num === winningNumber; break;
            }
            if (isWin) {
                winningBetNumbers.push(num);
            }
        });

        if (winningBetNumbers.length > 0) {
            const payoutForThisBet = winningBetNumbers.length * bet.amountPerNumber * getPrizeMultiplier(user.prizeRates, bet.subGameType);
            totalPayout += payoutForThisBet;

            winners.push({
                userId: user.id,
                userName: user.name,
                dealerName: dealer.name,
                betId: bet.id,
                subGameType: bet.subGameType,
                winningNumbers: winningBetNumbers,
                amountPerNumber: bet.amountPerNumber,
                payout: payoutForThisBet,
            });
        }
    });
    
    const winnersByUser = winners.reduce((acc, winner) => {
        if (!acc[winner.userId]) {
            acc[winner.userId] = {
                userName: winner.userName,
                dealerName: winner.dealerName,
                totalPayout: 0,
                winningBets: []
            };
        }
        acc[winner.userId].totalPayout += winner.payout;
        acc[winner.userId].winningBets.push({
            subGameType: winner.subGameType,
            winningNumbers: winner.winningNumbers,
            amountPerNumber: winner.amountPerNumber,
            payout: winner.payout
        });
        return acc;
    }, {});

    return {
        gameName: game.name,
        winningNumber: winningNumber,
        totalPayout: totalPayout,
        winners: Object.values(winnersByUser).sort((a, b) => b.totalPayout - a.totalPayout),
    };
};


const createDealer = (dealerData) => {
    const existing = db.prepare('SELECT id FROM dealers WHERE lower(id) = ?').get(dealerData.id.toLowerCase());
    if (existing) {
        throw { status: 400, message: "This Dealer Login ID is already taken." };
    }
    const initialAmount = dealerData.wallet || 0;
    db.prepare('INSERT INTO dealers (id, name, password, area, contact, wallet, commissionRate, isRestricted, prizeRates, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(dealerData.id, dealerData.name, dealerData.password, dealerData.area, dealerData.contact, initialAmount, dealerData.commissionRate, 0, JSON.stringify(dealerData.prizeRates), dealerData.avatarUrl);
    
    if (initialAmount > 0) {
        addLedgerEntry(dealerData.id, 'DEALER', 'Initial Deposit by Admin', 0, initialAmount);
    }
    return findAccountById(dealerData.id, 'dealers');
};

const updateDealer = (dealerData, originalId) => {
    const newId = dealerData.id;
    const isIdChanged = newId.toLowerCase() !== originalId.toLowerCase();

    if (isIdChanged) {
        const existing = db.prepare('SELECT id FROM dealers WHERE lower(id) = ?').get(newId.toLowerCase());
        if (existing) {
            throw { status: 400, message: "This Dealer Login ID is already taken." };
        }
    }
    
    db.prepare('UPDATE dealers SET id = ?, name = ?, password = ?, area = ?, contact = ?, commissionRate = ?, prizeRates = ?, avatarUrl = ? WHERE id = ?')
      .run(newId, dealerData.name, dealerData.password, dealerData.area, dealerData.contact, dealerData.commissionRate, JSON.stringify(dealerData.prizeRates), dealerData.avatarUrl, originalId);
    
    if (isIdChanged) {
        // Cascade update to related tables
        db.prepare('UPDATE users SET dealerId = ? WHERE dealerId = ?').run(newId, originalId);
        db.prepare('UPDATE bets SET dealerId = ? WHERE dealerId = ?').run(newId, originalId);
        db.prepare('UPDATE ledgers SET accountId = ? WHERE accountId = ? AND accountType = ?').run(newId, originalId, 'DEALER');
    }
    return findAccountById(newId, 'dealers');
};

const findUsersByDealerId = (dealerId) => {
    return db.prepare('SELECT * FROM users WHERE dealerId = ?').all(dealerId).map(u => findAccountById(u.id, 'users'));
};

const findBetsByDealerId = (dealerId) => {
    const stmt = db.prepare('SELECT * FROM bets WHERE dealerId = ? ORDER BY timestamp DESC');
    const bets = stmt.all(dealerId);
    return bets.map(b => {
        try {
            if (b.numbers && typeof b.numbers === 'string') {
                b.numbers = JSON.parse(b.numbers);
            }
        } catch (e) {
            console.error(`Failed to parse numbers for bet id ${b.id}`, e);
        }
        return b;
    });
};

const findBetsByGameId = (gameId) => {
    // This function should return bets for the CURRENTLY ACTIVE market day for a given game.
    const currentMarketDate = getMarketDateString(new Date());

    const allBetsForGame = db.prepare('SELECT * FROM bets WHERE gameId = ?').all(gameId);

    const liveBets = allBetsForGame.filter(bet => {
        const betMarketDate = getMarketDateString(new Date(bet.timestamp));
        return betMarketDate === currentMarketDate;
    });

    return liveBets.map(b => {
        try {
            if (b.numbers && typeof b.numbers === 'string') {
                b.numbers = JSON.parse(b.numbers);
            }
        } catch (e) {
            console.error(`Failed to parse numbers for bet id ${b.id}`, e);
        }
        return b;
    });
};

const findUserByDealer = (userId, dealerId) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND dealerId = ?').get(userId, dealerId);
    return user ? findAccountById(userId, 'users') : null;
};

const createUser = (userData, dealerId, initialDeposit = 0) => {
    const existing = db.prepare('SELECT id FROM users WHERE lower(id) = ?').get(userData.id.toLowerCase());
    if (existing) throw { status: 400, message: "This User Login ID is already taken." };
    
    const dealer = findAccountById(dealerId, 'dealers');
    if (!dealer) throw { status: 404, message: 'Dealer not found.' };
    if (dealer.wallet < initialDeposit) throw { status: 400, message: 'Dealer has insufficient funds for initial deposit.' };

    db.prepare('INSERT INTO users (id, name, password, dealerId, area, contact, wallet, commissionRate, isRestricted, prizeRates, betLimits, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(userData.id, userData.name, userData.password, dealerId, userData.area, userData.contact, 0, userData.commissionRate, 0, JSON.stringify(userData.prizeRates), JSON.stringify(userData.betLimits), userData.avatarUrl);

    if (initialDeposit > 0) {
        addLedgerEntry(dealerId, 'DEALER', `Initial Deposit for User: ${userData.name}`, initialDeposit, 0);
        addLedgerEntry(userData.id, 'USER', `Initial Deposit from Dealer: ${dealer.name}`, 0, initialDeposit);
    }
    return findAccountById(userData.id, 'users');
};

const updateUser = (userData, userId, dealerId) => {
    const existing = findUserByDealer(userId, dealerId);
    if (!existing) throw { status: 404, message: "User not found or does not belong to this dealer." };

    const newPassword = userData.password || existing.password;
    
    db.prepare('UPDATE users SET name = ?, password = ?, area = ?, contact = ?, commissionRate = ?, prizeRates = ?, betLimits = ?, avatarUrl = ? WHERE id = ?')
      .run(userData.name, newPassword, userData.area, userData.contact, userData.commissionRate, JSON.stringify(userData.prizeRates), JSON.stringify(userData.betLimits), userData.avatarUrl, userId);
    
    return findAccountById(userId, 'users');
};

const toggleAccountRestrictionByAdmin = (accountId, accountType) => {
    const table = accountType.toLowerCase() + 's';
    const account = db.prepare(`SELECT isRestricted FROM ${table} WHERE id = ?`).get(accountId);
    if (!account) throw { status: 404, message: 'Account not found.' };
    
    db.prepare(`UPDATE ${table} SET isRestricted = ? WHERE id = ?`).run(account.isRestricted ? 0 : 1, accountId);
    return findAccountById(accountId, table);
};

const toggleUserRestrictionByDealer = (userId, dealerId) => {
    const user = db.prepare('SELECT isRestricted FROM users WHERE id = ? AND dealerId = ?').get(userId, dealerId);
    if (!user) throw { status: 404, message: 'User not found or does not belong to you.' };
    
    db.prepare('UPDATE users SET isRestricted = ? WHERE id = ?').run(user.isRestricted ? 0 : 1, userId);
    return findAccountById(userId, 'users');
};

const createBet = (betData) => {
    db.prepare('INSERT INTO bets (id, userId, dealerId, gameId, subGameType, numbers, amountPerNumber, totalAmount, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(
        betData.id, betData.userId, betData.dealerId, betData.gameId, betData.subGameType, betData.numbers, betData.amountPerNumber, betData.totalAmount, betData.timestamp
    );
};

const getUserStakesForGame = (userId, gameId) => {
    const stmt = db.prepare(`
        SELECT subGameType, numbers, amountPerNumber 
        FROM bets 
        WHERE userId = ? AND gameId = ?
    `);
    const userBetsForGame = stmt.all(userId, gameId);

    const stakesMap = new Map(); // Key: 'oneDigit-7' or 'twoDigit-42', Value: total stake

    userBetsForGame.forEach(bet => {
        try {
            const numbers = JSON.parse(bet.numbers);
            const amount = bet.amountPerNumber;
            const isOneDigit = bet.subGameType === '1 Digit Open' || bet.subGameType === '1 Digit Close';
            const typeKey = isOneDigit ? 'oneDigit' : 'twoDigit';

            numbers.forEach(num => {
                const key = `${typeKey}-${num}`;
                const currentStake = stakesMap.get(key) || 0;
                stakesMap.set(key, currentStake + amount);
            });
        } catch(e) {
            console.error(`Error parsing numbers for bet in getUserStakesForGame: ${e}`);
        }
    });

    return stakesMap;
};


// Number Limit Functions
const getAllNumberLimits = () => db.prepare('SELECT * FROM number_limits ORDER BY gameType, numberValue ASC').all();
const saveNumberLimit = ({ gameType, numberValue, limitAmount }) => {
    const stmt = db.prepare('INSERT INTO number_limits (gameType, numberValue, limitAmount) VALUES (?, ?, ?) ON CONFLICT(gameType, numberValue) DO UPDATE SET limitAmount = excluded.limitAmount');
    stmt.run(gameType, numberValue, limitAmount);
    return db.prepare('SELECT * FROM number_limits WHERE gameType = ? AND numberValue = ?').get(gameType, numberValue);
};
const deleteNumberLimit = (id) => db.prepare('DELETE FROM number_limits WHERE id = ?').run(id);
const getNumberLimit = (gameType, numberValue) => db.prepare('SELECT * FROM number_limits WHERE gameType = ? AND numberValue = ?').get(gameType, numberValue);

const getCurrentStakeForNumber = (gameType, numberValue) => {
    const subGameTypes = gameType === '2-digit' 
        ? ['2 Digit', 'Bulk Game', 'Combo Game'] 
        : gameType === '1-open' 
        ? ['1 Digit Open'] 
        : ['1 Digit Close'];
    
    const placeholders = subGameTypes.map(() => '?').join(',');
    
    let totalStake = 0;
    
    const bets = db.prepare(`
        SELECT numbers, amountPerNumber 
        FROM bets 
        WHERE subGameType IN (${placeholders}) 
        AND gameId IN (SELECT id FROM games WHERE winningNumber IS NULL OR payoutsApproved = 0)`
    ).all(...subGameTypes);

    for (const bet of bets) {
        const numbers = JSON.parse(bet.numbers);
        if (numbers.includes(numberValue)) {
            // This logic is slightly flawed for combo/bulk as one line item might contribute to the stake on a number.
            // Let's assume a bet with ['12', '34'] for 10 is two separate 10 rupee stakes.
            const occurrences = numbers.filter(n => n === numberValue).length;
            totalStake += occurrences * bet.amountPerNumber;
        }
    }
    return totalStake;
};

const getNumberStakeSummary = ({ gameId, dealerId, date }) => {
    let query = 'SELECT subGameType, numbers, amountPerNumber FROM bets';
    const params = [];
    const conditions = [];

    if (gameId) {
        conditions.push('gameId = ?');
        params.push(gameId);
    }
    if (dealerId) {
        conditions.push('dealerId = ?');
        params.push(dealerId);
    }
    if (date) {
        conditions.push('date(timestamp) = ?');
        params.push(date);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    const stmt = db.prepare(query);
    const bets = stmt.all(...params);

    const summary = {
        '2-digit': new Map(),
        '1-open': new Map(),
        '1-close': new Map(),
    };

    bets.forEach(bet => {
        try {
            const numbers = JSON.parse(bet.numbers);
            const amount = bet.amountPerNumber;

            let targetMap;
            switch (bet.subGameType) {
                case '2 Digit':
                case 'Bulk Game':
                case 'Combo Game':
                    targetMap = summary['2-digit'];
                    break;
                case '1 Digit Open':
                    targetMap = summary['1-open'];
                    break;
                case '1 Digit Close':
                    targetMap = summary['1-close'];
                    break;
                default:
                    return;
            }
            
            numbers.forEach(num => {
                targetMap.set(num, (targetMap.get(num) || 0) + amount);
            });
        } catch (e) {
            console.error(`Could not parse numbers for bet: ${e}`);
        }
    });
    
    const formatAndSort = (map) => {
        return Array.from(map.entries())
            .map(([number, stake]) => ({ number, stake }))
            .sort((a, b) => b.stake - a.stake);
    };

    return {
        twoDigit: formatAndSort(summary['2-digit']),
        oneDigitOpen: formatAndSort(summary['1-open']),
        oneDigitClose: formatAndSort(summary['1-close']),
    };
};

const searchBetsByNumber = (number) => {
    if (!number || number.trim() === '') {
        return { bets: [], summary: { number: '', count: 0, totalStake: 0 } };
    }
    
    const numbersJsonString = JSON.stringify([number]);

    const stmt = db.prepare(`
        SELECT 
            b.id as betId,
            u.name as userName,
            d.name as dealerName,
            g.name as gameName,
            b.subGameType,
            b.amountPerNumber as amount,
            b.timestamp
        FROM bets b
        JOIN users u ON b.userId = u.id
        JOIN dealers d ON b.dealerId = d.id
        JOIN games g ON b.gameId = g.id
        WHERE b.numbers = ?
        ORDER BY b.timestamp DESC
    `);
    
    const searchResults = stmt.all(numbersJsonString);

    const flatBets = searchResults.map(bet => ({
        ...bet,
        number: number 
    }));

    const totalStake = flatBets.reduce((sum, bet) => sum + bet.amount, 0);

    const summary = {
        number: number,
        count: flatBets.length,
        totalStake: totalStake
    };

    return { bets: flatBets, summary };
};


const placeBulkBets = (userId, gameId, betGroups, placedBy = 'USER') => {
    let finalResult = null;
    runInTransaction(() => {
        // 1. Initial validation and data fetching
        const user = findAccountById(userId, 'users');
        if (!user) throw { status: 404, message: `User with ID ${userId} not found` };
        if (user.isRestricted) throw { status: 403, message: 'The selected user account is restricted.' };

        const dealer = findAccountById(user.dealerId, 'dealers');
        const game = findAccountById(gameId, 'games');
        const admin = findAccountById('Guru', 'admins');

        if (!dealer || !game || !admin) throw { status: 404, message: 'Dealer, Game or Admin not found' };
        if (!Array.isArray(betGroups) || betGroups.length === 0) throw { status: 400, message: 'Invalid bet format.' };
        
        // --- NEW LOGIC: Setup for AK/AKC split ---
        let akcGame = null;
        let mainGameGroups = betGroups;
        let akcGroups = [];

        if (game.name === 'AK') {
            akcGame = db.prepare("SELECT * FROM games WHERE name = 'AKC'").get();
            if (!akcGame) throw { status: 500, message: "AKC game configuration not found. Cannot place close bets." };
            akcGame.isMarketOpen = isGameOpen(akcGame.drawTime); // Manually check market status
            
            akcGroups = betGroups.filter(g => g.subGameType === '1 Digit Close');
            mainGameGroups = betGroups.filter(g => g.subGameType !== '1 Digit Close');
        } else if (game.name === 'AKC') {
             const invalidGroup = betGroups.find(g => g.subGameType !== '1 Digit Close');
             if (invalidGroup) {
                 throw { status: 400, message: 'Only 1 Digit Close bets are allowed for the AKC game.' };
             }
        }
        
        // 2. Centralized Game Open/Close Check
        if (mainGameGroups.length > 0 && !game.isMarketOpen) {
            throw { status: 400, message: `Betting is currently closed for ${game.name}.` };
        }
        if (akcGroups.length > 0 && (!akcGame || !akcGame.isMarketOpen)) {
             throw { status: 400, message: `Betting is currently closed for AKC.` };
        }

        // 3. Calculate total cost and check wallet
        const totalTransactionAmount = betGroups.reduce((sum, g) => sum + g.numbers.length * g.amountPerNumber, 0);
        if (user.wallet < totalTransactionAmount) {
            throw { status: 400, message: `Insufficient funds for user ${user.name}. Required: ${totalTransactionAmount.toFixed(2)}, Available: ${user.wallet.toFixed(2)}` };
        }

        // 4. User and Global Bet Limits Check (helper function)
        const checkLimits = (targetGameId, groups) => {
            if (!groups || groups.length === 0) return;
            
            // 4a. User Bet Limits
            const oneDigitLimit = user.betLimits?.oneDigit || 0;
            const twoDigitLimit = user.betLimits?.twoDigit || 0;
            if (oneDigitLimit > 0 || twoDigitLimit > 0) {
                const existingStakes = getUserStakesForGame(userId, targetGameId);
                const incomingStakes = new Map();
                groups.forEach(group => {
                    const isOneDigit = group.subGameType.includes('1 Digit');
                    const typeKey = isOneDigit ? 'oneDigit' : 'twoDigit';
                    group.numbers.forEach(num => {
                        const key = `${typeKey}-${num}`;
                        incomingStakes.set(key, (incomingStakes.get(key) || 0) + group.amountPerNumber);
                    });
                });
                for (const [key, incomingAmount] of incomingStakes.entries()) {
                    const [type, number] = key.split('-');
                    const limit = (type === 'oneDigit') ? oneDigitLimit : twoDigitLimit;
                    if (limit > 0) {
                        const existingAmount = existingStakes.get(key) || 0;
                        if ((existingAmount + incomingAmount) > limit) {
                            throw { status: 400, message: `User's bet limit of Rs ${limit.toFixed(2)} for number '${number}' has been exceeded.` };
                        }
                    }
                }
            }

            // 4b. Global Number Limits
            groups.forEach(group => {
                const globalLimitGameType = group.subGameType === '1 Digit Open' ? '1-open' : group.subGameType === '1 Digit Close' ? '1-close' : '2-digit';
                group.numbers.forEach(numberValue => {
                    const limit = getNumberLimit(globalLimitGameType, numberValue);
                    if (!limit || limit.limitAmount <= 0) return;
                    const currentStake = getCurrentStakeForNumber(globalLimitGameType, numberValue);
                    if ((currentStake + group.amountPerNumber) > limit.limitAmount) {
                        throw { status: 400, message: `Global bet limit for number '${numberValue}' has been reached.` };
                    }
                });
            });
        };

        checkLimits(game.id, mainGameGroups);
        if (akcGame) {
            checkLimits(akcGame.id, akcGroups);
        }

        // 5. Process Ledger Entries (based on the grand total)
        // **FIXED FINANCIAL LOGIC**
        const totalUserCommission = totalTransactionAmount * (user.commissionRate / 100);
        const totalDealerCommission = totalTransactionAmount * ((dealer.commissionRate - user.commissionRate) / 100);
        const betDescription = `Bet placed on ${game.name}${akcGame ? ' & AKC' : ''} by ${placedBy}`;
        
        // 1. User places bet
        addLedgerEntry(user.id, 'USER', betDescription, totalTransactionAmount, 0);
        // 2. Stake goes to Admin
        addLedgerEntry(admin.id, 'ADMIN', `Stake from ${user.name}`, 0, totalTransactionAmount);
        
        // 3. Admin pays user commission
        if (totalUserCommission > 0) {
            addLedgerEntry(admin.id, 'ADMIN', `Commission to user ${user.name}`, totalUserCommission, 0);
            addLedgerEntry(user.id, 'USER', `Commission earned`, 0, totalUserCommission);
        }
        // 4. Admin pays dealer commission
        if (totalDealerCommission > 0) {
            addLedgerEntry(admin.id, 'ADMIN', `Commission to dealer ${dealer.name}`, totalDealerCommission, 0);
            addLedgerEntry(dealer.id, 'DEALER', `Commission from ${user.name}'s bet`, 0, totalDealerCommission);
        }

        // 6. Create Bet Records
        const createdBets = [];
        const createRecordsForGame = (targetGameId, groups) => {
             groups.forEach(group => {
                // **MODIFICATION START**
                // For each number in the group, including duplicates, create a separate bet record.
                group.numbers.forEach(number => {
                    const totalAmountForThisBet = group.amountPerNumber; // A single number bet has a totalAmount equal to amountPerNumber
                    const newBet = {
                        id: uuidv4(),
                        userId: user.id,
                        dealerId: dealer.id,
                        gameId: targetGameId,
                        subGameType: group.subGameType,
                        numbers: JSON.stringify([number]), // Store as an array with a single number
                        amountPerNumber: group.amountPerNumber,
                        totalAmount: totalAmountForThisBet,
                        timestamp: new Date().toISOString()
                    };
                    createBet(newBet);
                    createdBets.push({ ...newBet, numbers: [number] });
                });
                // **MODIFICATION END**
            });
        };
        
        createRecordsForGame(game.id, mainGameGroups);
        if (akcGame) {
            createRecordsForGame(akcGame.id, akcGroups);
        }
        
        finalResult = createdBets;
    });
    return finalResult;
};

const updateGameDrawTime = (gameId, newDrawTime) => {
    let updatedGame;
    if (!/^\d{2}:\d{2}$/.test(newDrawTime)) {
        throw { status: 400, message: 'Invalid time format. Please use HH:MM.' };
    }

    runInTransaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
        if (!game) throw { status: 404, message: 'Game not found.' };
        if (game.winningNumber) {
            throw { status: 400, message: 'Cannot change draw time after a winner has been declared. Please use "Edit Winner" if you need to make corrections.' };
        }
        
        db.prepare('UPDATE games SET drawTime = ? WHERE id = ?')
          .run(newDrawTime, gameId);
        
        updatedGame = findAccountById(gameId, 'games');
    });
    return updatedGame;
};

function resetAllGames() {
    // This function is scheduled to run daily at 4:00 PM PKT.
    // It resets the winning numbers and approval status for all games,
    // allowing a new betting cycle to begin.
    // Historical bets remain unaffected as they are timestamped.
    try {
        const stmt = db.prepare(`
            UPDATE games 
            SET winningNumber = NULL, payoutsApproved = 0
        `);
        const result = stmt.run();
        console.log(`Daily game reset complete. ${result.changes} games have been reset for the new cycle.`);
    } catch (error) {
        console.error('Error during daily game reset:', error);
        // We shouldn't throw here as it might crash the timer loop in server.js
    }
}

const reprocessPayoutsForMarketDay = (gameId, date) => {
    let resultSummary = {};
    runInTransaction(() => {
        const game = findAccountById(gameId, 'games');
        if (!game) throw { status: 404, message: "Game not found." };

        const result = db.prepare('SELECT winningNumber FROM daily_results WHERE gameId = ? AND date = ?').get(gameId, date);
        if (!result || !result.winningNumber || result.winningNumber.endsWith('_')) {
            throw { status: 404, message: `A valid, finalized winning number for ${game.name} on ${date} was not found.` };
        }
        const winningNumber = result.winningNumber;

        const allBetsForGame = db.prepare('SELECT * FROM bets WHERE gameId = ?').all(gameId);
        const betsForMarketDay = allBetsForGame.filter(bet => {
            const marketDate = getMarketDateString(new Date(bet.timestamp));
            return marketDate === date;
        });

        if (betsForMarketDay.length === 0) {
            resultSummary = { processedBets: 0, totalPayout: 0, totalProfit: 0 };
            return;
        }
        
        const allUsers = Object.fromEntries(getAllFromTable('users', true).map(u => [u.id, u]));
        const allDealers = Object.fromEntries(getAllFromTable('dealers', true).map(d => [d.id, d]));
        const admin = findAccountById('Guru', 'admins');

        let totalPayout = 0;
        let totalProfit = 0;

        const getPrizeMultiplier = (rates, subGameType) => {
            if (!rates) return 0;
            if (subGameType === "1 Digit Open") return rates.oneDigitOpen;
            if (subGameType === "1 Digit Close") return rates.oneDigitClose;
            return rates.twoDigit;
        };

        betsForMarketDay.forEach(bet => {
            const betNumbers = JSON.parse(bet.numbers);
            
            const winningNumbersInBet = betNumbers.filter(num => {
                let isWin = false;
                switch (bet.subGameType) {
                    case "1 Digit Open": if (winningNumber.length === 2) isWin = num === winningNumber[0]; break;
                    case "1 Digit Close": if (game.name === 'AKC') isWin = num === winningNumber; else if (winningNumber.length === 2) isWin = num === winningNumber[1]; break;
                    default: isWin = num === winningNumber; break;
                }
                return isWin;
            });

            if (winningNumbersInBet.length > 0) {
                const user = allUsers[bet.userId];
                const dealer = allDealers[bet.dealerId];
                if (!user || !dealer) return;

                const userPrize = winningNumbersInBet.length * bet.amountPerNumber * getPrizeMultiplier(user.prizeRates, bet.subGameType);
                const dealerProfit = winningNumbersInBet.length * bet.amountPerNumber * (getPrizeMultiplier(dealer.prizeRates, bet.subGameType) - getPrizeMultiplier(user.prizeRates, bet.subGameType));
                
                totalPayout += userPrize;
                totalProfit += dealerProfit;
                
                addLedgerEntry(user.id, 'USER', `Prize (re-processed) for ${game.name} on ${date}`, 0, userPrize);
                addLedgerEntry(admin.id, 'ADMIN', `Prize payout (re-processed) to ${user.name}`, userPrize, 0);
                addLedgerEntry(dealer.id, 'DEALER', `Profit (re-processed) for ${game.name} on ${date}`, 0, dealerProfit);
                addLedgerEntry(admin.id, 'ADMIN', `Dealer profit (re-processed) to ${dealer.name}`, dealerProfit, 0);
            }
        });

        resultSummary = { processedBets: betsForMarketDay.length, totalPayout, totalProfit };
    });
    return resultSummary;
};


module.exports = {
    connect,
    verifySchema,
    findAccountById,
    findAccountForLogin,
    updatePassword,
    getAllFromTable,
    runInTransaction,
    addLedgerEntry,
    createDealer,
    updateDealer,
    findUsersByDealerId,
    findUserByDealer,
    createUser,
    updateUser,
    toggleAccountRestrictionByAdmin,
    toggleUserRestrictionByDealer,
    declareWinnerForGame,
    updateWinningNumber,
    approvePayoutsForGame,
    reprocessPayoutsForMarketDay,
    createBet,
    getFinancialSummary,
    getWinnersReport,
    getUserStakesForGame,
    getAllNumberLimits,
    saveNumberLimit,
    deleteNumberLimit,
    getNumberLimit,
    getCurrentStakeForNumber,
    findBetsByDealerId,
    findBetsByGameId,
    getNumberStakeSummary,
    searchBetsByNumber,
    placeBulkBets,
    updateGameDrawTime,
    resetAllGames,
};
