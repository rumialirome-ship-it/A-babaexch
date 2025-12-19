

const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'database.sqlite');
let db;

// --- CENTRALIZED GAME TIMING LOGIC (TIMEZONE-AWARE) ---
const PKT_OFFSET_HOURS = 5;
const OPEN_HOUR_PKT = 16; // 4:00 PM in Pakistan

/**
 * Calculates the current or next valid betting window (open time to close time) for a game,
 * with all calculations done in UTC to ensure timezone correctness.
 * @param {string} drawTime - The game's draw time in "HH:MM" format, assumed to be in PKT.
 * @returns {{openTime: Date, closeTime: Date}} Date objects representing absolute UTC time.
 */
function getGameCycle(drawTime) {
    const now = new Date(); // Current server time is UTC
    const [drawHoursPKT, drawMinutesPKT] = drawTime.split(':').map(Number);

    // Get "today's" date parts in UTC
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate();
    
    // Calculate the market opening hour in UTC (16:00 PKT is 11:00 UTC)
    const openHourUTC = OPEN_HOUR_PKT - PKT_OFFSET_HOURS;

    // Define the opening time for the cycle that could have started "today" or "yesterday" in UTC
    const todayOpen = new Date(Date.UTC(year, month, day, openHourUTC, 0, 0));
    const yesterdayOpen = new Date(todayOpen.getTime() - (24 * 60 * 60 * 1000));

    // A helper function to calculate the closing time based on a given opening time
    const calculateCloseTime = (openDate) => {
        const closeDate = new Date(openDate.getTime());
        
        // Calculate draw hour in UTC. setUTCHours handles negative values correctly (e.g., 2 - 5 = -3 -> 21:00 on prev day).
        const drawHourUTC = drawHoursPKT - PKT_OFFSET_HOURS;
        closeDate.setUTCHours(drawHourUTC, drawMinutesPKT, 0, 0);

        // If a game's draw time in PKT (e.g., 02:10) is earlier than the market open time (16:00),
        // it means its draw happens on the next calendar day relative to when it opened.
        if (drawHoursPKT < OPEN_HOUR_PKT) {
            closeDate.setUTCDate(closeDate.getUTCDate() + 1);
        }
        return closeDate;
    };

    // Calculate the closing time for the cycle that would have started yesterday
    const yesterdayCycleClose = calculateCloseTime(yesterdayOpen);
    
    // Check if the current time falls inside the cycle that started yesterday
    if (now >= yesterdayOpen && now < yesterdayCycleClose) {
        return { openTime: yesterdayOpen, closeTime: yesterdayCycleClose };
    }

    // If not, we must be in (or waiting for) the cycle that starts today.
    const todayCycleClose = calculateCloseTime(todayOpen);
    return { openTime: todayOpen, closeTime: todayCycleClose };
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
        if (table !== 'games') {
            const ledgerStmt = db.prepare('SELECT * FROM ledgers WHERE accountId = ? ORDER BY timestamp ASC');
            account.ledger = ledgerStmt.all(id);
        } else {
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

const declareWinnerForGame = (gameId, winningNumber) => {
    let finalGame;
    runInTransaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
        if (!game) throw { status: 404, message: 'Game not found.' };
        if (game.winningNumber) throw { status: 400, message: 'Winner has already been declared for this game.' };

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
            // Update AKC itself
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(winningNumber, gameId);

            // Now, find the AK game and update it if it's pending
            const akGame = db.prepare("SELECT * FROM games WHERE name = 'AK'").get();
            if (akGame && akGame.winningNumber && akGame.winningNumber.endsWith('_')) {
                const openDigit = akGame.winningNumber.slice(0, 1);
                const fullNumber = openDigit + winningNumber;
                db.prepare("UPDATE games SET winningNumber = ? WHERE name = 'AK'").run(fullNumber);
            }
        } else {
            if (!/^\d{2}$/.test(winningNumber)) {
                throw { status: 400, message: 'Winning number must be a 2-digit number.' };
            }
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
        if (!game || !game.winningNumber) {
            throw { status: 400, message: 'Cannot update: Game not found or winner not declared.' };
        }
        if (game.payoutsApproved) {
            throw { status: 400, message: 'Cannot update: Payouts have already been approved.' };
        }

        if (game.name === 'AK') {
            if (!/^\d$/.test(newWinningNumber)) {
                throw { status: 400, message: 'New AK open winner must be a single digit.' };
            }
            const closeDigit = game.winningNumber.endsWith('_') ? '_' : game.winningNumber.slice(1, 2);
            const updatedNumber = newWinningNumber + closeDigit;
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(updatedNumber, gameId);
        
        } else if (game.name === 'AKC') {
            if (!/^\d$/.test(newWinningNumber)) {
                throw { status: 400, message: 'New AKC winner must be a single digit.' };
            }
            // Update AKC
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(newWinningNumber, gameId);
            
            // Re-trigger AK update
            const akGame = db.prepare("SELECT * FROM games WHERE name = 'AK'").get();
            if (akGame && akGame.winningNumber && !akGame.winningNumber.endsWith('_')) {
                const openDigit = akGame.winningNumber.slice(0, 1);
                const fullNumber = openDigit + newWinningNumber;
                db.prepare("UPDATE games SET winningNumber = ? WHERE name = 'AK'").run(fullNumber);
            }
        } else {
            if (!/^\d{2}$/.test(newWinningNumber)) {
                throw { status: 400, message: 'New winning number must be a 2-digit number.' };
            }
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
        if (!game || !game.winningNumber) {
            throw { status: 400, message: "Winner must be declared before approving payouts." };
        }
        if (game.payoutsApproved) {
            throw { status: 400, message: "Payouts have already been approved for this game." };
        }
        if (game.name === 'AK' && game.winningNumber.endsWith('_')) {
            throw { status: 400, message: "Cannot approve payouts for AK until the close number from AKC is declared." };
        }

        const winningBets = db.prepare('SELECT * FROM bets WHERE gameId = ?').all(gameId).map(b => ({
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


const getFinancialSummary = () => {
    const games = db.prepare('SELECT * FROM games WHERE winningNumber IS NOT NULL').all();
    const allBets = db.prepare('SELECT * FROM bets').all().map(b => ({...b, numbers: JSON.parse(b.numbers)}));
    const allUsers = Object.fromEntries(getAllFromTable('users').map(u => [u.id, u]));
    const allDealers = Object.fromEntries(getAllFromTable('dealers').map(d => [d.id, d]));

    const getPrizeMultiplier = (rates, subGameType) => {
        if (subGameType === "1 Digit Open") return rates.oneDigitOpen;
        if (subGameType === "1 Digit Close") return rates.oneDigitClose;
        return rates.twoDigit;
    };

    const summaryByGame = games.map(game => {
        const gameBets = allBets.filter(b => b.gameId === game.id);
        const totalStake = gameBets.reduce((sum, b) => sum + b.totalAmount, 0);

        let totalPayouts = 0;
        let totalDealerProfit = 0;

        if (!game.winningNumber.endsWith('_')) { // Only calculate payouts for finalized games
            gameBets.forEach(bet => {
                const winningNumbersInBet = bet.numbers.filter(num => {
                    let isWin = false;
                    switch (bet.subGameType) {
                        case "1 Digit Open":
                            if (game.winningNumber.length === 2) { isWin = num === game.winningNumber[0]; }
                            break;
                        case "1 Digit Close":
                            if (game.name === 'AKC') { isWin = num === game.winningNumber; } 
                            else if (game.winningNumber.length === 2) { isWin = num === game.winningNumber[1]; }
                            break;
                        default: // 2 Digit, Bulk Game, Combo Game
                            isWin = num === game.winningNumber;
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
                    
                    totalPayouts += userPrize;
                    totalDealerProfit += dealerProfit;
                }
            });
        }
        
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
            winningNumber: game.winningNumber,
            totalStake,
            totalPayouts,
            totalDealerProfit,
            totalCommissions,
            netProfit,
        };
    });

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
        totalBets: allBets.length,
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
    const stmt = db.prepare('SELECT * FROM bets WHERE gameId = ?');
    const bets = stmt.all(gameId);
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
    db.prepare('INSERT INTO bets (id, userId, dealerId, gameId, subGameType, numbers, amountPerNumber, totalAmount, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
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
        
        // 2. Centralized Game Open/Close Check
        if (game.name === 'AKC') {
            const invalidGroup = betGroups.find(g => g.subGameType !== '1 Digit Close');
            if (invalidGroup) {
                throw { status: 400, message: 'Only 1 Digit Close bets are allowed for the AKC game.' };
            }
        }
        if (!game.isMarketOpen) {
            throw { status: 400, message: `Betting is currently closed for ${game.name}.` };
        }

        // 3. Calculate total cost and aggregate numbers for checks
        let totalTransactionAmount = 0;
        const allNumbersInTx = new Map(); // For global limits check. Key: 'gameType-number', Value: total stake
        const incomingStakes = new Map(); // For user limits check. Key: 'typeKey-num', Value: total stake

        betGroups.forEach(group => {
            if (!Array.isArray(group.numbers) || typeof group.amountPerNumber !== 'number' || group.amountPerNumber <= 0) {
                throw { status: 400, message: 'Invalid bet data within a bet group.' };
            }
            totalTransactionAmount += group.numbers.length * group.amountPerNumber;

            const isOneDigit = group.subGameType === '1 Digit Open' || group.subGameType === '1 Digit Close';
            const userLimitTypeKey = isOneDigit ? 'oneDigit' : 'twoDigit';
            const globalLimitGameType = group.subGameType === '1 Digit Open' ? '1-open' : group.subGameType === '1 Digit Close' ? '1-close' : '2-digit';
            
            group.numbers.forEach(num => {
                const userKey = `${userLimitTypeKey}-${num}`;
                incomingStakes.set(userKey, (incomingStakes.get(userKey) || 0) + group.amountPerNumber);
                const globalKey = `${globalLimitGameType}-${num}`;
                allNumbersInTx.set(globalKey, (allNumbersInTx.get(globalKey) || 0) + group.amountPerNumber);
            });
        });

        // 4. Wallet Check
        if (user.wallet < totalTransactionAmount) {
            throw { status: 400, message: `Insufficient funds for user ${user.name}. Required: ${totalTransactionAmount.toFixed(2)}, Available: ${user.wallet.toFixed(2)}` };
        }

        // 5. User Bet Limits Check
        const oneDigitLimit = user.betLimits?.oneDigit || 0;
        const twoDigitLimit = user.betLimits?.twoDigit || 0;

        if (oneDigitLimit > 0 || twoDigitLimit > 0) {
            const existingStakesForGame = getUserStakesForGame(userId, gameId);
            for (const [key, incomingAmount] of incomingStakes.entries()) {
                const [type, number] = key.split('-');
                const limit = (type === 'oneDigit') ? oneDigitLimit : twoDigitLimit;

                if (limit > 0) {
                    const existingAmount = existingStakesForGame.get(key) || 0;
                    if ((existingAmount + incomingAmount) > limit) {
                        throw {
                            status: 400,
                            message: `User's bet limit of Rs ${limit.toFixed(2)} for number '${number}' has been exceeded. They have already staked Rs ${existingAmount.toFixed(2)} on this number.`
                        };
                    }
                }
            }
        }
        
        // 6. Global Number Limits Check
        for (const [key, incomingStake] of allNumbersInTx.entries()) {
            const [type, numberValue] = key.split('-');
            const limit = getNumberLimit(type, numberValue);
            if (!limit || limit.limitAmount <= 0) continue;

            const currentStake = getCurrentStakeForNumber(type, numberValue);
            
            if ((currentStake + incomingStake) > limit.limitAmount) {
                throw {
                    status: 400,
                    message: `Bet on number '${numberValue}' rejected. The global betting limit of PKR ${limit.limitAmount.toFixed(2)} has been reached or would be exceeded. Current stake is PKR ${currentStake.toFixed(2)}.`
                };
            }
        }

        // 7. Process Ledger Entries
        const totalUserCommission = totalTransactionAmount * (user.commissionRate / 100);
        const totalDealerCommission = totalTransactionAmount * ((dealer.commissionRate - user.commissionRate) / 100);
        
        let betDescription = `Bet placed on ${game.name}`;
        if (placedBy === 'DEALER') {
            betDescription = `Bet placed by Dealer on ${game.name}`;
        } else if (placedBy === 'ADMIN') {
            betDescription = `Bet placed by Admin on ${game.name}`;
        }

        // User Ledger: Debit full stake, then credit their commission back for clarity.
        addLedgerEntry(user.id, 'USER', betDescription, totalTransactionAmount, 0);
        if (totalUserCommission > 0) {
            addLedgerEntry(user.id, 'USER', `Commission earned for ${game.name} bet`, 0, totalUserCommission);
        }

        // Admin Ledger: Receives full stake, then pays out commissions to user and dealer.
        addLedgerEntry(admin.id, 'ADMIN', `Stake from ${user.name} on ${game.name}`, 0, totalTransactionAmount);
        if (totalUserCommission > 0) {
            addLedgerEntry(admin.id, 'ADMIN', `Commission payout to user ${user.name}`, totalUserCommission, 0);
        }
        if (totalDealerCommission > 0) {
            addLedgerEntry(admin.id, 'ADMIN', `Commission payout to dealer ${dealer.name}`, totalDealerCommission, 0);
        }
        
        // Dealer Ledger: Receives their net commission from the system (Admin).
        if (totalDealerCommission > 0) {
            addLedgerEntry(dealer.id, 'DEALER', `Commission from ${user.name}'s bet on ${game.name}`, 0, totalDealerCommission);
        }


        // 8. Create Bet Records
        const createdBets = [];
        betGroups.forEach(group => {
            const { subGameType, numbers, amountPerNumber } = group;
            const totalAmount = numbers.length * amountPerNumber;
            const newBet = {
                id: uuidv4(),
                userId: user.id,
                dealerId: dealer.id,
                gameId,
                subGameType,
                numbers: JSON.stringify(numbers),
                amountPerNumber,
                totalAmount,
                timestamp: new Date().toISOString()
            };
            createBet(newBet);
            createdBets.push({ ...newBet, numbers });
        });
        
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
    // This function is designed to be idempotent. It can be run at any time.
    // It finds all games that have a winner and checks if their market should be open *now*.
    // If a market is open, it means a new cycle has begun, so the old winner is cleared.
    const gamesToReset = db.prepare('SELECT id, drawTime, winningNumber FROM games WHERE winningNumber IS NOT NULL').all();
    
    if (gamesToReset.length === 0) {
        console.log('Game Reset Check: No games with winning numbers to check.');
        return;
    }

    let resetCount = 0;
    const resetStmt = db.prepare('UPDATE games SET winningNumber = NULL, payoutsApproved = 0 WHERE id = ?');
    
    runInTransaction(() => {
        for (const game of gamesToReset) {
            if (isGameOpen(game.drawTime)) {
                resetStmt.run(game.id);
                resetCount++;
                console.log(`Resetting stale winner for game ID: ${game.id}`);
            }
        }
    });

    if (resetCount > 0) {
        console.log(`Game Reset: Successfully reset ${resetCount} game(s).`);
    } else {
        console.log('Game Reset Check: No stale games found that required a reset.');
    }
}


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
    createBet,
    getFinancialSummary,
    getUserStakesForGame,
    getAllNumberLimits,
    saveNumberLimit,
    deleteNumberLimit,
    getNumberLimit,
    getCurrentStakeForNumber,
    findBetsByDealerId,
    findBetsByGameId,
    getNumberStakeSummary,
    placeBulkBets,
    updateGameDrawTime,
    resetAllGames,
};
