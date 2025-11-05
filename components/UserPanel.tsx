import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, Game, SubGameType, LedgerEntry, Bet, PrizeRates, BetLimits } from '../types';
import { Icons } from '../constants';
import { useCountdown } from '../hooks/useCountdown';

const LedgerView: React.FC<{ entries: LedgerEntry[] }> = ({ entries }) => (
    <div className="mt-12">
        <h3 className="text-2xl font-bold mb-4 text-sky-400 uppercase tracking-widest">My Ledger</h3>
        <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
            <div className="overflow-x-auto max-h-[30rem] mobile-scroll-x">
                <table className="w-full text-left min-w-[600px]">
                    <thead className="bg-slate-800/50 sticky top-0 backdrop-blur-sm">
                        <tr>
                            <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                            <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Description</th>
                            <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Debit</th>
                            <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Credit</th>
                            <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Balance</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {[...entries].reverse().map(entry => (
                            <tr key={entry.id} className="hover:bg-sky-500/10 transition-colors">
                                <td className="p-4 text-sm text-slate-400 whitespace-nowrap">{entry.timestamp.toLocaleString()}</td>
                                <td className="p-4 text-white">{entry.description}</td>
                                <td className="p-4 text-right text-red-400 font-mono">{entry.debit > 0 ? entry.debit.toFixed(2) : '-'}</td>
                                <td className="p-4 text-right text-green-400 font-mono">{entry.credit > 0 ? entry.credit.toFixed(2) : '-'}</td>
                                <td className="p-4 text-right font-semibold text-white font-mono">{entry.balance.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
);

const BetHistoryView: React.FC<{ bets: Bet[], games: Game[], user: User }> = ({ bets, games, user }) => {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const getBetOutcome = (bet: Bet) => {
        const game = games.find(g => g.id === bet.gameId);
        if (!game || !game.winningNumber || game.winningNumber.includes('_')) return { status: 'Pending', payout: 0, color: 'text-amber-400' };
        
        const winningNumber = game.winningNumber;
        let winningNumbersCount = 0;

        bet.numbers.forEach(num => {
            let isWin = false;
            switch (bet.subGameType) {
                case SubGameType.OneDigitOpen: isWin = num === winningNumber[0]; break;
                case SubGameType.OneDigitClose: isWin = num === winningNumber[1]; break;
                default: isWin = num === winningNumber; break;
            }
            if (isWin) winningNumbersCount++;
        });

        if (winningNumbersCount > 0) {
            const getPrizeMultiplier = (rates: PrizeRates) => {
                switch (bet.subGameType) {
                    case SubGameType.OneDigitOpen: return rates.oneDigitOpen;
                    case SubGameType.OneDigitClose: return rates.oneDigitClose;
                    default: return rates.twoDigit;
                }
            };
            const payout = winningNumbersCount * bet.amountPerNumber * getPrizeMultiplier(user.prizeRates);
            return { status: 'Win', payout, color: 'text-green-400' };
        }
        return { status: 'Lost', payout: 0, color: 'text-red-400' };
    };

    const filteredBets = useMemo(() => {
        return bets.filter(bet => {
            const betDateStr = bet.timestamp.toISOString().split('T')[0];
            if (startDate && betDateStr < startDate) {
                return false;
            }
            if (endDate && betDateStr > endDate) {
                return false;
            }

            if (searchTerm.trim()) {
                const game = games.find(g => g.id === bet.gameId);
                const lowerSearchTerm = searchTerm.trim().toLowerCase();

                const gameNameMatch = game?.name.toLowerCase().includes(lowerSearchTerm);
                const subGameTypeMatch = bet.subGameType.toLowerCase().includes(lowerSearchTerm);

                let genericTypeMatch = false;
                if (('1 digit'.includes(lowerSearchTerm) || '1-digit'.includes(lowerSearchTerm)) && bet.subGameType.includes('1 Digit')) {
                    genericTypeMatch = true;
                }
                if (('2 digit'.includes(lowerSearchTerm) || '2-digit'.includes(lowerSearchTerm)) && (bet.subGameType.includes('2 Digit') || bet.subGameType.includes('Bulk') || bet.subGameType.includes('Combo'))) {
                    genericTypeMatch = true;
                }

                if (!gameNameMatch && !subGameTypeMatch && !genericTypeMatch) {
                    return false;
                }
            }

            return true;
        });
    }, [bets, games, startDate, endDate, searchTerm]);

    const handleClearFilters = () => {
        setStartDate('');
        setEndDate('');
        setSearchTerm('');
    };
    
    const inputClass = "w-full bg-slate-800 p-2 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none text-white";

    return (
        <div className="mt-12">
            <h3 className="text-2xl font-bold mb-4 text-sky-400 uppercase tracking-widest">My Bet History</h3>
            
            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                    <div>
                        <label htmlFor="start-date" className="block text-sm font-medium text-slate-400 mb-1">From Date</label>
                        <input id="start-date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={`${inputClass} font-sans`} />
                    </div>
                    <div>
                        <label htmlFor="end-date" className="block text-sm font-medium text-slate-400 mb-1">To Date</label>
                        <input id="end-date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={`${inputClass} font-sans`} />
                    </div>
                    <div className="md:col-span-2 lg:col-span-1">
                        <label htmlFor="search-term" className="block text-sm font-medium text-slate-400 mb-1">Game / Type</label>
                        <input id="search-term" type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="e.g., AK, 1 digit, LS3" className={inputClass} />
                    </div>
                    <div className="flex items-center">
                        <button onClick={handleClearFilters} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-md transition-colors">Clear Filters</button>
                    </div>
                </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                <div className="overflow-x-auto max-h-[30rem] mobile-scroll-x">
                    <table className="w-full text-left min-w-[700px]">
                        <thead className="bg-slate-800/50 sticky top-0 backdrop-blur-sm">
                            <tr>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Game</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Bet Details</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Stake (PKR)</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Payout (PKR)</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                           {[...filteredBets].reverse().map(bet => {
                                const game = games.find(g => g.id === bet.gameId);
                                const outcome = getBetOutcome(bet);
                                return (
                                <tr key={bet.id} className="hover:bg-sky-500/10 transition-colors">
                                    <td className="p-4 text-sm text-slate-400 whitespace-nowrap">{bet.timestamp.toLocaleString()}</td>
                                    <td className="p-4 text-white font-medium">{game?.name || 'Unknown'}</td>
                                    <td className="p-4 text-slate-300">
                                        <div className="font-semibold">{bet.subGameType}</div>
                                        <div className="text-xs text-slate-400 max-w-[200px] truncate" title={bet.numbers.join(', ')}>{bet.numbers.join(', ')}</div>
                                    </td>
                                    <td className="p-4 text-right text-red-400 font-mono">{bet.totalAmount.toFixed(2)}</td>
                                    <td className="p-4 text-right text-green-400 font-mono">{outcome.payout > 0 ? outcome.payout.toFixed(2) : '-'}</td>
                                    <td className="p-4 text-right font-semibold"><span className={outcome.color}>{outcome.status}</span></td>
                                </tr>);
                           })}
                           {filteredBets.length === 0 && (
                               <tr>
                                   <td colSpan={6} className="p-8 text-center text-slate-500">
                                       {bets.length === 0 ? "You haven't placed any bets yet." : "No bets found matching your filters."}
                                   </td>
                               </tr>
                           )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const BettingModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  game: Game;
  allGames: Game[];
  user: User;
  placeBet: (details: {
    gameId: string;
    betGroups: {
      subGameType: SubGameType;
      numbers: string[];
      amountPerNumber: number;
    }[];
  }) => Promise<void>;
}> = ({ isOpen, onClose, game, allGames, user, placeBet }) => {
    const [activeTab, setActiveTab] = useState<SubGameType>(SubGameType.Bulk);
    const [oneDigitOpenInput, setOneDigitOpenInput] = useState('');
    const [oneDigitCloseInput, setOneDigitCloseInput] = useState('');
    const [twoDigitInput, setTwoDigitInput] = useState('');
    const [stakePerNumber, setStakePerNumber] = useState('');
    const [bulkInput, setBulkInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [aiLuckyPick, setAiLuckyPick] = useState<{ number: string; explanation: string } | null>(null);
    const [isAiLoading, setIsAiLoading] = useState(false);

    // FIX: Correctly destructure status from useCountdown
    const { status, text: countdownText } = useCountdown(game.drawTime);
    // FIX: Combine countdown status with backend market status
    const isMarketOpen = status === 'OPEN' && game.isMarketOpen === true;
    
    // Reset state when modal is closed or game changes
    useEffect(() => {
        if (!isOpen) {
            setTimeout(() => { // Delay reset to allow closing animation
                setOneDigitOpenInput(''); setOneDigitCloseInput(''); setTwoDigitInput('');
                setStakePerNumber(''); setBulkInput('');
                setError(null); setSuccess(null); setIsLoading(false);
                setAiLuckyPick(null);
            }, 300);
        }
    }, [isOpen]);
    
    const parsedBulkData = useMemo(() => {
        const result: {
            betGroups: { subGameType: SubGameType; numbers: string[]; amountPerNumber: number }[];
            totalCost: number;
            totalNumbers: number;
            detectedGame: Game | null;
            error: string | null;
        } = { betGroups: [], totalCost: 0, totalNumbers: 0, detectedGame: null, error: null };
        
        const text = bulkInput.trim();
        if (!text) return result;

        const gameNameRegex = new RegExp(`\\b(${allGames.map(g => g.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')})\\b`, 'i');
        const gameMatch = text.match(gameNameRegex);
        if (gameMatch) {
            result.detectedGame = allGames.find(g => g.name.toLowerCase() === gameMatch[0].toLowerCase()) || null;
        }

        const lines = text.split('\n');
        const betsByAmountAndType = new Map<string, Set<string>>();

        for (const line of lines) {
            let processedLine = line.trim();
            if (!processedLine) continue;

            const stakeMatch = processedLine.match(/(?:rs|r)\s*(\d+\.?\d*)/i);
            if (!stakeMatch) continue;
            const stake = parseFloat(stakeMatch[1]);
            if (isNaN(stake) || stake <= 0) continue;
            
            processedLine = processedLine.replace(stakeMatch[0], '');

            const isCombo = /\b(k|combo)\b/i.test(processedLine);
            processedLine = processedLine.replace(/\b(k|combo)\b/i, '');

            const sanitized = processedLine.replace(/[-.,_*\/+<>=%#;']/g, ' ').replace(/\s+/g, ' ');
            const tokens = sanitized.trim().split(' ');

            if (isCombo) {
                const digits = tokens.join('').split('');
                const uniqueDigits = [...new Set(digits)];
                if (uniqueDigits.length >= 2) {
                    const key = `${SubGameType.TwoDigit}-${stake}`;
                    if (!betsByAmountAndType.has(key)) betsByAmountAndType.set(key, new Set());
                    const numberSet = betsByAmountAndType.get(key)!;
                    for (let i = 0; i < uniqueDigits.length; i++) {
                        for (let j = i + 1; j < uniqueDigits.length; j++) {
                            numberSet.add(uniqueDigits[i] + uniqueDigits[j]);
                            numberSet.add(uniqueDigits[j] + uniqueDigits[i]);
                        }
                    }
                }
            } else {
                tokens.forEach(token => {
                    if (/^\d{2}$/.test(token)) {
                        const key = `${SubGameType.TwoDigit}-${stake}`;
                        if (!betsByAmountAndType.has(key)) betsByAmountAndType.set(key, new Set());
                        betsByAmountAndType.get(key)!.add(token);
                    } else if (/^\d{3,}$/.test(token) && token.length % 2 === 0) {
                        const key = `${SubGameType.TwoDigit}-${stake}`;
                        if (!betsByAmountAndType.has(key)) betsByAmountAndType.set(key, new Set());
                        const numberSet = betsByAmountAndType.get(key)!;
                        for (let i = 0; i < token.length; i += 2) {
                            numberSet.add(token.substring(i, i + 2));
                        }
                    }
                });
            }
        }

        for (const [key, numbersSet] of betsByAmountAndType.entries()) {
            const [typeStr, amountStr] = key.split('-');
            const subGameType = typeStr as SubGameType;
            const amountPerNumber = parseFloat(amountStr);
            if (numbersSet.size > 0) {
                result.betGroups.push({ subGameType, numbers: Array.from(numbersSet), amountPerNumber });
                result.totalNumbers += numbersSet.size;
                result.totalCost += numbersSet.size * amountPerNumber;
            }
        }

        return result;
    }, [bulkInput, allGames]);

    const { totalCost, betGroups } = useMemo(() => {
        if (activeTab === SubGameType.Bulk) {
            return { totalCost: parsedBulkData.totalCost, betGroups: parsedBulkData.betGroups };
        }
        
        const parseInput = (input: string) => input.split(/[\s,]+/).filter(n => n.trim() !== '');
        const groups: { subGameType: SubGameType; numbers: string[]; amountPerNumber: number }[] = [];
        const stake = parseFloat(stakePerNumber) || 0;
        let cost = 0;

        if (stake > 0) {
            const processGroup = (type: SubGameType, input: string) => {
                const numbers = parseInput(input);
                if (numbers.length > 0) {
                    groups.push({ subGameType: type, numbers, amountPerNumber: stake });
                    cost += numbers.length * stake;
                }
            };
            if (activeTab === SubGameType.OneDigitOpen) processGroup(SubGameType.OneDigitOpen, oneDigitOpenInput);
            if (activeTab === SubGameType.OneDigitClose) processGroup(SubGameType.OneDigitClose, oneDigitCloseInput);
            if (activeTab === SubGameType.TwoDigit) processGroup(SubGameType.TwoDigit, twoDigitInput);
        }
        return { totalCost: cost, betGroups: groups };
    }, [activeTab, oneDigitOpenInput, oneDigitCloseInput, twoDigitInput, stakePerNumber, parsedBulkData]);

    const canPlaceBet = useMemo(() => {
        return isMarketOpen && totalCost > 0 && user.wallet >= totalCost && !isLoading;
    }, [isMarketOpen, totalCost, user.wallet, isLoading]);
    
    const handlePlaceBet = async () => {
        setError(null);
        setSuccess(null);
        if (!canPlaceBet) {
            if (user.wallet < totalCost) setError("Insufficient wallet balance.");
            else setError("Invalid bet details or market is closed.");
            return;
        }

        setIsLoading(true);
        try {
            const targetGameId = activeTab === SubGameType.Bulk && parsedBulkData.detectedGame ? parsedBulkData.detectedGame.id : game.id;
            await placeBet({ gameId: targetGameId, betGroups });
            setSuccess(`Bet successfully placed! Total cost: ${totalCost.toFixed(2)} PKR.`);
            setTimeout(onClose, 2000);
        } catch (e: any) {
            setError(e.message || 'An unknown error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAiPick = (number: string) => {
        const inputSetterMap = {
            [SubGameType.OneDigitOpen]: setOneDigitOpenInput,
            [SubGameType.OneDigitClose]: setOneDigitCloseInput,
            [SubGameType.TwoDigit]: setTwoDigitInput,
        };
        const setter = inputSetterMap[activeTab as keyof typeof inputSetterMap];
        if (setter) {
            setter(prev => prev ? `${prev}, ${number}` : number);
        }
        setAiLuckyPick(null);
    };

    if (!isOpen) return null;

    const tabs = [
        { name: SubGameType.Bulk, short: "Bulk" },
        { name: SubGameType.OneDigitOpen, short: "1-Open" },
        { name: SubGameType.OneDigitClose, short: "1-Close" },
        { name: SubGameType.TwoDigit, short: "2-Digit" },
    ];

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4" role="dialog" aria-modal="true">
            <div className="bg-slate-900/80 rounded-lg shadow-2xl w-full max-w-lg border border-sky-500/30 flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-5 border-b border-slate-700 flex-shrink-0">
                    <div>
                        <h3 className="text-lg font-bold text-sky-400 uppercase tracking-widest">{game.name}</h3>
                        <div className={`text-sm font-semibold ${isMarketOpen ? 'text-green-400' : 'text-red-400'}`}>
                            Market: {isMarketOpen ? `Closes in ${countdownText}` : 'Closed'}
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close modal">{Icons.close}</button>
                </div>

                <div className="p-1.5 bg-slate-800/50 flex items-center space-x-1 border-b border-slate-700">
                    {tabs.map(tab => (
                        <button key={tab.name} onClick={() => setActiveTab(tab.name)} className={`flex-1 py-2 px-3 text-xs font-bold rounded-md transition-all duration-300 uppercase tracking-wider ${activeTab === tab.name ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
                            {tab.short}
                        </button>
                    ))}
                </div>
                
                <div className="p-6 overflow-y-auto space-y-4">
                    {success ? (
                        <div className="text-center p-4">
                             <svg className="animated-check mx-auto mb-4" viewBox="0 0 52 52">
                                <circle className="animated-check__circle" cx="26" cy="26" r="25" fill="none"/>
                                <path className="animated-check__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                            </svg>
                            <p className="text-lg font-semibold text-green-300">{success}</p>
                        </div>
                    ) : (
                    <>
                        {activeTab === SubGameType.Bulk ? (
                            <div>
                                <textarea
                                    rows={6}
                                    value={bulkInput}
                                    onChange={(e) => setBulkInput(e.target.value)}
                                    className="w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500 font-mono"
                                    placeholder={`Example:\n43-44-41-42-49 Rs200\nLS2_01_58_93_83_rs50\nK 32807 Rs5`}
                                    disabled={!isMarketOpen}
                                />
                                <p className="text-xs text-slate-500 mt-1">Enter numbers with stake (e.g., 'rs10'). Use 'K' for combos. Game names like 'LS2' will be auto-detected.</p>
                                {parsedBulkData.detectedGame && parsedBulkData.detectedGame.id !== game.id && (
                                    <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm p-3 rounded-md mt-2">
                                        Note: Game <span className="font-bold">{parsedBulkData.detectedGame.name}</span> was detected and will override the current selection.
                                    </div>
                                )}
                            </div>
                        ) : (
                            <>
                                <input
                                    type="text"
                                    value={
                                        activeTab === SubGameType.OneDigitOpen ? oneDigitOpenInput :
                                        activeTab === SubGameType.OneDigitClose ? oneDigitCloseInput :
                                        twoDigitInput
                                    }
                                    onChange={(e) => {
                                        const value = e.target.value.replace(/[^0-9\s,]/g, '');
                                        if (activeTab === SubGameType.OneDigitOpen) setOneDigitOpenInput(value);
                                        else if (activeTab === SubGameType.OneDigitClose) setOneDigitCloseInput(value);
                                        else setTwoDigitInput(value);
                                    }}
                                    className="w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500 font-mono text-center text-xl"
                                    placeholder={activeTab === SubGameType.TwoDigit ? 'e.g., 42, 58, 91' : 'e.g., 1, 5, 8'}
                                    disabled={!isMarketOpen}
                                />
                                <input
                                    type="number"
                                    value={stakePerNumber}
                                    onChange={(e) => setStakePerNumber(e.target.value)}
                                    className="w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500"
                                    placeholder="Amount per number"
                                    disabled={!isMarketOpen}
                                />
                            </>
                        )}

                        {error && <div className="bg-red-500/20 text-red-300 p-3 rounded-md text-sm">{error}</div>}
                    </>
                    )}
                </div>

                {!success && (
                    <div className="p-4 bg-slate-900/50 border-t border-slate-700 flex-shrink-0">
                        <div className="flex justify-between items-center text-sm mb-3">
                            <span className="text-slate-400">Your Wallet:</span>
                            <span className="font-mono font-semibold text-white">{user.wallet.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm mb-3">
                            <span className="text-slate-400">Total Bet Cost:</span>
                            <span className={`font-mono font-semibold ${totalCost > user.wallet ? 'text-red-400' : 'text-white'}`}>{totalCost.toFixed(2)}</span>
                        </div>
                        <button
                            onClick={handlePlaceBet}
                            disabled={!canPlaceBet}
                            className="w-full bg-sky-600 text-white font-bold py-3 px-4 rounded-md transition-all duration-300 enabled:hover:bg-sky-500 enabled:hover:shadow-lg enabled:hover:shadow-sky-500/30 disabled:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isLoading ? 'Placing Bet...' : `Place Bet (Cost: ${totalCost.toFixed(2)})`}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};


const GameCard: React.FC<{ game: Game; onBetClick: () => void; onHistoryClick: () => void }> = ({ game, onBetClick, onHistoryClick }) => {
    const { status, text: countdownText } = useCountdown(game.drawTime);
    const isMarketOpen = status === 'OPEN' && game.isMarketOpen;
    
    return (
        <div className={`relative group bg-slate-800/60 rounded-lg overflow-hidden border transition-colors duration-300 ${isMarketOpen ? 'border-slate-700 hover:border-cyan-500/50' : 'border-slate-800'}`}>
            <div className={`absolute top-0 left-0 h-1 bg-gradient-to-r ${isMarketOpen ? 'from-cyan-500 to-blue-500' : 'from-slate-700 to-slate-800'}`}></div>
            <div className="p-5">
                <div className="flex items-center gap-4">
                    <img src={game.logo} alt={game.name} className="w-16 h-16 rounded-full border-2 border-slate-700 flex-shrink-0" />
                    <div>
                        <h3 className="text-xl font-bold text-white uppercase tracking-wider">{game.name}</h3>
                        <p className="text-sm text-slate-400">Draw Time: {game.drawTime}</p>
                    </div>
                </div>
                 <div className="mt-4 p-3 bg-slate-900/50 rounded-md text-center">
                    {game.winningNumber ? (
                        <>
                            <p className="text-xs text-slate-400 uppercase tracking-wider">Winning Number</p>
                            <p className="text-3xl font-bold font-mono text-emerald-400 flex items-center justify-center gap-2">
                                <span className="text-amber-400">{Icons.star}</span>
                                {game.winningNumber}
                            </p>
                        </>
                    ) : (
                        <>
                            <p className="text-xs text-slate-400 uppercase tracking-wider">{status === 'OPEN' ? 'Market Closes In' : 'Market Status'}</p>
                            <p className={`text-2xl font-bold font-mono ${isMarketOpen ? 'text-cyan-300' : 'text-red-400'}`}>
                                {isMarketOpen ? countdownText : 'CLOSED'}
                            </p>
                        </>
                    )}
                </div>
            </div>
            <div className="bg-black/20 px-5 py-3 flex items-center justify-between">
                <button onClick={onHistoryClick} className="text-sm text-slate-400 hover:text-white transition-colors">View History</button>
                <button onClick={onBetClick} disabled={!isMarketOpen} className="bg-sky-600 text-white font-bold py-2 px-5 rounded-md transition-all duration-300 text-sm enabled:hover:bg-sky-500 enabled:hover:shadow-lg enabled:hover:shadow-sky-500/20 disabled:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60">
                    Place Bet
                </button>
            </div>
        </div>
    );
};


interface UserPanelProps {
  user: User;
  games: Game[];
  bets: Bet[];
  placeBet: (details: {
    gameId: string;
    betGroups: {
      subGameType: SubGameType;
      numbers: string[];
      amountPerNumber: number;
    }[];
  }) => Promise<void>;
}

const UserPanel: React.FC<UserPanelProps> = ({ user, games, bets, placeBet }) => {
    const [activeView, setActiveView] = useState<'games' | 'history' | 'ledger'>('games');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedGame, setSelectedGame] = useState<Game | null>(null);

    const openGames = useMemo(() => games.filter(g => !g.winningNumber), [games]);
    const pastGames = useMemo(() => games.filter(g => g.winningNumber), [games]);

    const handleOpenModal = (game: Game) => {
        setSelectedGame(game);
        setIsModalOpen(true);
    };

    const gameForModal = useMemo(() => {
        if (!selectedGame) return null;
        // Find the latest version of the selected game from the frequently updated games prop
        return games.find(g => g.id === selectedGame.id) || selectedGame;
    }, [games, selectedGame]);

    const tabs = [
        { id: 'games', label: 'Games', icon: Icons.gamepad },
        { id: 'history', label: 'Bet History', icon: Icons.clipboardList },
        { id: 'ledger', label: 'Ledger', icon: Icons.bookOpen },
    ];
    
    return (
        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h2 className="text-3xl font-bold text-sky-400 uppercase tracking-widest">Player Dashboard</h2>
                <div className="bg-slate-800/50 p-1.5 rounded-lg flex items-center space-x-2 self-start md:self-center flex-wrap border border-slate-700">
                    {tabs.map(tab => (
                      <button key={tab.id} onClick={() => setActiveView(tab.id as any)} className={`flex items-center space-x-2 py-2 px-4 text-sm font-semibold rounded-md transition-all duration-300 ${activeView === tab.id ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
                        {tab.icon} <span>{tab.label}</span>
                      </button>
                    ))}
                </div>
            </div>

            {activeView === 'games' && (
                <>
                    <h3 className="text-2xl font-bold mb-4 text-white">Open Markets</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                        {openGames.map(game => (
                            <GameCard key={game.id} game={game} onBetClick={() => handleOpenModal(game)} onHistoryClick={() => setActiveView('history')} />
                        ))}
                         {openGames.length === 0 && <p className="text-slate-400 md:col-span-2 lg:col-span-3">No markets are currently open for betting.</p>}
                    </div>
                    <h3 className="text-2xl font-bold mb-4 text-white">Recent Results</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {pastGames.map(game => (
                            <GameCard key={game.id} game={game} onBetClick={() => handleOpenModal(game)} onHistoryClick={() => setActiveView('history')} />
                        ))}
                    </div>
                </>
            )}

            {activeView === 'history' && <BetHistoryView bets={bets} games={games} user={user} />}
            {activeView === 'ledger' && <LedgerView entries={user.ledger} />}

            {gameForModal && (
                <BettingModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    game={gameForModal}
                    allGames={games}
                    user={user}
                    placeBet={placeBet}
                />
            )}
        </div>
    );
};

export default UserPanel;
