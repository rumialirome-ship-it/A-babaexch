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
            // Date range filter using YYYY-MM-DD strings to avoid timezone issues
            const betDateStr = bet.timestamp.toISOString().split('T')[0];
            if (startDate && betDateStr < startDate) {
                return false;
            }
            if (endDate && betDateStr > endDate) {
                return false;
            }

            // Search term filter
            if (searchTerm.trim()) {
                const game = games.find(g => g.id === bet.gameId);
                const lowerSearchTerm = searchTerm.trim().toLowerCase();

                const gameNameMatch = game?.name.toLowerCase().includes(lowerSearchTerm);
                const subGameTypeMatch = bet.subGameType.toLowerCase().includes(lowerSearchTerm);

                // Allow generic searches like "1 digit" to match "1 Digit Open" and "1 Digit Close"
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
                                        <div className="text-xs text-slate-400 break-words" title={bet.numbers.join(', ')}>{bet.numbers.join(', ')}</div>
                                    </td>
                                    <td className="p-4 text-right text-red-400 font-mono">{bet.totalAmount.toFixed(2)}</td>
                                    <td className="p-4 text-right text-green-400 font-mono">{outcome.payout > 0 ? outcome.payout.toFixed(2) : '-'}</td>
                                    <td className="p-4 text-right font-semibold"><span className={outcome.color}>{outcome.status}</span></td>
                                </tr>);
                           })}
                           {filteredBets.length === 0 && (
                               <tr>
                                   <td colSpan={6} className="p-8 text-center text-slate-500">
                                       {bets.length === 0 ? "No bets placed yet." : "No bets found matching your filters."}
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

const formatTime12h = (time24: string) => {
    const [hours, minutes] = time24.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
};

const GameCard: React.FC<{ game: Game; onPlay: (game: Game) => void; isRestricted: boolean; }> = ({ game, onPlay, isRestricted }) => {
    const { status, text: countdownText } = useCountdown(game.drawTime);
    const isPlayable = !!game.isMarketOpen && !isRestricted && status === 'OPEN';
    const isMarketClosedForDisplay = !game.isMarketOpen || status === 'CLOSED';

    return (
        <div className={`bg-slate-800/50 rounded-lg shadow-lg p-4 flex flex-col justify-between transition-all duration-300 border border-slate-700 ${!isPlayable ? 'opacity-60' : 'hover:shadow-cyan-500/20 hover:-translate-y-1 hover:border-cyan-500/50'}`}>
            <div>
                <div className="flex items-center mb-3">
                    <img src={game.logo} alt={game.name} className="w-12 h-12 rounded-full mr-4 border-2 border-slate-600" />
                    <div>
                        <h3 className="text-xl text-white uppercase tracking-wider">{game.name}</h3>
                        <p className="text-sm text-slate-400">Draw at {formatTime12h(game.drawTime)}</p>
                    </div>
                </div>
                <div className={`text-center my-4 p-2 rounded-lg bg-slate-900/50 border-t border-slate-700`}>
                    {isMarketClosedForDisplay ? (
                        <>
                            <div className="text-xs uppercase tracking-wider text-slate-400">STATUS</div>
                            <div className="text-2xl font-mono font-bold text-red-400">MARKET CLOSED</div>
                        </>
                    ) : status === 'OPEN' ? (
                        <>
                            <div className="text-xs uppercase tracking-wider text-slate-400">TIME LEFT</div>
                            <div className="text-3xl font-mono font-bold text-cyan-300">{countdownText}</div>
                        </>
                    ) : (
                         <>
                            <div className="text-xs uppercase tracking-wider text-slate-400">MARKET OPENS</div>
                            <div className="text-xl font-mono font-bold text-slate-400">{countdownText}</div>
                        </>
                    )}
                </div>
            </div>
             {game.winningNumber && <div className="text-center font-bold text-lg text-emerald-400 mt-2">Winner: {game.winningNumber}</div>}
            <button onClick={() => onPlay(game)} disabled={!isPlayable} className="w-full mt-2 bg-sky-600 text-white font-bold py-2.5 px-4 rounded-md transition-all duration-300 enabled:hover:bg-sky-500 enabled:hover:shadow-lg enabled:hover:shadow-sky-500/30 disabled:bg-slate-700 disabled:cursor-not-allowed">
                PLAY NOW
            </button>
        </div>
    );
};

interface BettingModalProps {
    game: Game | null;
    user: User;
    onClose: () => void;
    onPlaceBet: (details: { subGameType: SubGameType; numbers?: string[]; amountPerNumber?: number; betGroups?: { subGameType: SubGameType; numbers: string[]; amountPerNumber: number }[] }) => void;
    apiError: string | null;
    clearApiError: () => void;
}

// Type for the new Combo Game UI state
interface ComboLine {
    number: string;
    stake: string; // Keep as string for input field control
    selected: boolean;
}

const BettingModal: React.FC<BettingModalProps> = ({ game, user, onClose, onPlaceBet, apiError, clearApiError }) => {
    const [subGameType, setSubGameType] = useState<SubGameType>(SubGameType.TwoDigit);
    const [manualNumbersInput, setManualNumbersInput] = useState('');
    const [manualAmountInput, setManualAmountInput] = useState('');
    const [bulkInput, setBulkInput] = useState('');
    const [error, setError] = useState<string | null>(null);

    // --- New State for Combo Game ---
    const [comboDigitsInput, setComboDigitsInput] = useState('');
    const [generatedCombos, setGeneratedCombos] = useState<ComboLine[]>([]);
    const [comboGlobalStake, setComboGlobalStake] = useState('');


    const availableSubGameTabs = useMemo(() => {
        if (!game) return [];
        if (game.name === 'AK') return [SubGameType.TwoDigit, SubGameType.OneDigitOpen];
        if (game.name === 'AKC') return [SubGameType.OneDigitClose];
        // For other games, enable all types including the new Combo Game
        return [SubGameType.TwoDigit, SubGameType.OneDigitOpen, SubGameType.OneDigitClose, SubGameType.Bulk, SubGameType.Combo];
    }, [game]);

    const handleManualNumberChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const rawValue = e.target.value;
        const digitsOnly = rawValue.replace(/\D/g, '');

        if (digitsOnly === '') {
            setManualNumbersInput('');
            return;
        }

        let formattedValue = '';
        switch (subGameType) {
            case SubGameType.OneDigitOpen:
            case SubGameType.OneDigitClose:
                formattedValue = digitsOnly.split('').join(', ');
                break;
            case SubGameType.TwoDigit:
                formattedValue = (digitsOnly.match(/.{1,2}/g) || []).join(', ');
                break;
            default:
                formattedValue = digitsOnly;
                break;
        }
        setManualNumbersInput(formattedValue);
    };
    
    useEffect(() => { 
        if (availableSubGameTabs.length > 0 && !availableSubGameTabs.includes(subGameType)) {
            setSubGameType(availableSubGameTabs[0]); 
        }
    }, [availableSubGameTabs, subGameType]);

    // This effect clears the parent's API error when the user starts a new interaction.
    useEffect(() => {
        if (apiError) {
            clearApiError();
        }
    }, [manualNumbersInput, manualAmountInput, bulkInput, comboDigitsInput, comboGlobalStake, subGameType, clearApiError]);


    if (!game) return null;

     const parsedBulkBet = useMemo(() => {
        interface ParsedLine { originalText: string; numbers: string[]; stake: number; cost: number; subGameType: string; error?: string; }
        const result = { lines: [] as ParsedLine[], totalCost: 0, totalNumbers: 0, error: null as string | null, betGroups: [] as { subGameType: SubGameType; numbers: string[]; amountPerNumber: number }[] };
        
        const input = bulkInput.trim();
        if (!input) return result;

        const allLines = input.split('\n').filter(line => line.trim() !== '');
        if (allLines.length === 0) return result;
        
        const stakeRegex = /\s+(?:r|rs)\s*(\d*\.?\d+)\s*(combo|k)?\s*$/i;
        const linesWithStakes = allLines.map(line => line.match(stakeRegex)).filter(Boolean);
        let globalStake: number | null = null;
        if (linesWithStakes.length === 1) {
            const match = linesWithStakes[0];
            const parsedStake = parseFloat(match[1]);
            if (!isNaN(parsedStake) && parsedStake > 0) { globalStake = parsedStake; }
        }

        const determineType = (token: string): SubGameType | null => {
            if (/^\d{1,2}$/.test(token)) return SubGameType.TwoDigit;
            if (/^\d[xX]$/i.test(token)) return SubGameType.OneDigitOpen;
            if (/^[xX]\d$/i.test(token)) return SubGameType.OneDigitClose;
            return null;
        };
        const aggregatedGroups: Map<string, { subGameType: SubGameType; numbers: Set<string>; amountPerNumber: number }> = new Map();
        
        for (const lineText of allLines) {
            const parsedLine: ParsedLine = { originalText: lineText, numbers: [], stake: 0, cost: 0, subGameType: SubGameType.TwoDigit, error: undefined };
            let betPart = lineText.trim();
            let lineStake: number | null = null;
            let isComboLine = false;
            const localStakeMatch = lineText.match(stakeRegex);

            if (globalStake) {
                lineStake = globalStake;
                if (localStakeMatch) { betPart = betPart.substring(0, localStakeMatch.index).trim(); }
            } else if (localStakeMatch) {
                const parsedStake = parseFloat(localStakeMatch[1]);
                if (!isNaN(parsedStake) && parsedStake > 0) { lineStake = parsedStake; }
                betPart = betPart.substring(0, localStakeMatch.index).trim();
            }

            isComboLine = !!localStakeMatch?.[2];
            const effectiveStake = lineStake;
            betPart = betPart.replace(/\b(k|combo)\b/i, '').trim();
            const tokens = betPart.replace(/,{1,2}|\.{2,}/g, ' ').split(/\s+/).filter(Boolean);
            if (tokens.length === 0) { if (betPart !== '') { parsedLine.error = "No numbers found."; result.lines.push(parsedLine); } continue; }
            if (!effectiveStake || effectiveStake <= 0) { parsedLine.error = "Stake not found (e.g., '... r10')"; result.lines.push(parsedLine); continue; }
            parsedLine.stake = effectiveStake;
            const lineItems: { type: SubGameType, value: string }[] = [];
            let lineHasError = false;
            if (isComboLine) {
                const digits = tokens.join('').replace(/[^0-9]/g, '');
                const uniqueDigits = [...new Set(digits.split(''))].sort();
                if (uniqueDigits.length < 2) { parsedLine.error = `Combo needs at least 2 unique digits.`; lineHasError = true; } 
                else {
                    for (let i = 0; i < uniqueDigits.length; i++) {
                        for (let j = i + 1; j < uniqueDigits.length; j++) { lineItems.push({ type: SubGameType.TwoDigit, value: uniqueDigits[i] + uniqueDigits[j] }); }
                    }
                }
            } else {
                for (const token of tokens) {
                    const tokenType = determineType(token);
                    if (!tokenType) { parsedLine.error = `Invalid token: '${token}'`; lineHasError = true; break; }
                    let numberValue = '';
                    if (tokenType === SubGameType.TwoDigit) numberValue = token.padStart(2, '0');
                    else if (tokenType === SubGameType.OneDigitOpen) numberValue = token[0];
                    else if (tokenType === SubGameType.OneDigitClose) numberValue = token[1];
                    lineItems.push({ type: tokenType, value: numberValue });
                }
            }
            if (lineHasError) { result.lines.push(parsedLine); continue; }
            const typesOnLine = new Set<SubGameType>();
            lineItems.forEach(item => {
                typesOnLine.add(item.type);
                const groupKey = `${item.type}-${effectiveStake}`;
                if (!aggregatedGroups.has(groupKey)) { aggregatedGroups.set(groupKey, { subGameType: item.type, numbers: new Set(), amountPerNumber: effectiveStake }); }
                aggregatedGroups.get(groupKey)!.numbers.add(item.value);
            });
            parsedLine.numbers = lineItems.map(item => item.value);
            parsedLine.cost = lineItems.length * effectiveStake;
            parsedLine.subGameType = isComboLine ? 'Combo' : (typesOnLine.size > 1 ? 'Mixed' : typesOnLine.values().next().value);
            result.lines.push(parsedLine);
        }
        result.betGroups = Array.from(aggregatedGroups.values()).map(g => ({ ...g, numbers: Array.from(g.numbers) }));
        result.totalNumbers = result.betGroups.reduce((sum, group) => sum + group.numbers.length, 0);
        result.totalCost = result.betGroups.reduce((sum, group) => sum + (group.numbers.length * group.amountPerNumber), 0);
        if (result.lines.some(l => l.error)) result.error = 'Please review invalid lines.';
        return result;
    }, [bulkInput]);

    // --- New Combo Game Logic ---
    const handleGenerateCombos = () => {
        setError(null);
        const digits = comboDigitsInput.replace(/\D/g, '');
        const uniqueDigits = [...new Set(digits.split(''))];

        if (uniqueDigits.length < 3 || uniqueDigits.length > 6) {
            setError("Please enter between 3 and 6 unique digits.");
            setGeneratedCombos([]);
            return;
        }

        const permutations: string[] = [];
        for (let i = 0; i < uniqueDigits.length; i++) {
            for (let j = 0; j < uniqueDigits.length; j++) {
                if (i !== j) {
                    permutations.push(uniqueDigits[i] + uniqueDigits[j]);
                }
            }
        }
        setGeneratedCombos(permutations.map(p => ({ number: p, stake: '', selected: true })));
    };

    const handleComboSelectionChange = (index: number, selected: boolean) => {
        setGeneratedCombos(prev => prev.map((c, i) => i === index ? { ...c, selected } : c));
    };

    const handleComboStakeChange = (index: number, stake: string) => {
        setGeneratedCombos(prev => prev.map((c, i) => i === index ? { ...c, stake } : c));
    };
    
    const handleSelectAllCombos = (selected: boolean) => {
        setGeneratedCombos(prev => prev.map(c => ({...c, selected})));
    };
    
    const handleApplyGlobalStake = () => {
        if (parseFloat(comboGlobalStake) > 0) {
            setGeneratedCombos(prev => prev.map(c => ({...c, stake: comboGlobalStake})));
        }
    };
    
    const comboSummary = useMemo(() => {
        return generatedCombos.reduce((summary, combo) => {
            if (combo.selected) {
                summary.count++;
                const stake = parseFloat(combo.stake);
                if (!isNaN(stake) && stake > 0) {
                    summary.totalCost += stake;
                }
            }
            return summary;
        }, { count: 0, totalCost: 0 });
    }, [generatedCombos]);

    const allCombosSelected = useMemo(() => {
        if (generatedCombos.length === 0) return false;
        return generatedCombos.every(c => c.selected);
    }, [generatedCombos]);

    // --- End New Combo Game Logic ---

    const parsedManualBet = useMemo(() => {
        const result = { numbers: [] as string[], totalCost: 0, error: null as string | null, numberCount: 0, stake: 0 };
        const amount = parseFloat(manualAmountInput);
        if (!isNaN(amount) && amount > 0) { result.stake = amount; }

        const digitsOnly = manualNumbersInput.replace(/\D/g, '');
        let numbers: string[] = [];
        if (digitsOnly.length > 0) {
            switch (subGameType) {
                case SubGameType.OneDigitOpen: case SubGameType.OneDigitClose: numbers = digitsOnly.split(''); break;
                case SubGameType.TwoDigit:
                    if (digitsOnly.length % 2 !== 0) { result.error = "For 2-digit games, the total number of digits must be even."; } else { numbers = digitsOnly.match(/.{2}/g) || []; }
                    break;
            }
        }
        result.numbers = numbers;
        result.numberCount = numbers.length;
        if (result.stake > 0) { result.totalCost = result.numberCount * result.stake; }
        return result;
    }, [manualNumbersInput, manualAmountInput, subGameType]);

    const handleBet = () => {
        setError(null);

        if (subGameType === SubGameType.Combo) {
            const validBets = generatedCombos.filter(c => c.selected && parseFloat(c.stake) > 0);
            if (validBets.length === 0) { setError("Please select at least one combination and enter a valid stake."); return; }

            const totalCost = validBets.reduce((sum, c) => sum + parseFloat(c.stake), 0);
            if (totalCost > user.wallet) { setError(`Insufficient balance. Required: ${totalCost.toFixed(2)}, Available: ${user.wallet.toFixed(2)}`); return; }

            // Group by stake amount to create efficient bet groups
            const groups = new Map<number, string[]>();
            validBets.forEach(bet => {
                const stake = parseFloat(bet.stake);
                if (!groups.has(stake)) {
                    groups.set(stake, []);
                }
                groups.get(stake)!.push(bet.number);
            });
            const betGroups = Array.from(groups.entries()).map(([amount, numbers]) => ({
                subGameType: SubGameType.TwoDigit, // All combo permutations are 2-digit bets
                numbers,
                amountPerNumber: amount,
            }));
            
            onPlaceBet({ subGameType: SubGameType.Bulk, betGroups }); // Submit as a bulk bet for backend processing
            setComboDigitsInput(''); setGeneratedCombos([]); setComboGlobalStake('');
            return;
        }

        if (subGameType === SubGameType.Bulk) {
            const { totalCost, betGroups, error: parseError } = parsedBulkBet;
            if (parseError) { setError(parseError); return; }
            if (betGroups.length === 0) { setError("No valid bets entered."); return; }
            if (totalCost > user.wallet) { setError(`Insufficient balance. Required: ${totalCost.toFixed(2)}, Available: ${user.wallet.toFixed(2)}`); return; }
            onPlaceBet({ subGameType: SubGameType.Bulk, betGroups });
            setBulkInput('');
            return;
        }
        
        const { numbers, totalCost, error: parseError, stake } = parsedManualBet;
        if (stake <= 0) { setError("Please enter a valid amount."); return; }
        if (parseError) { setError(parseError); return; }
        if (numbers.length === 0) { setError("Please enter at least one number."); return; }
        if (totalCost > user.wallet) { setError(`Insufficient balance. Required: ${totalCost.toFixed(2)}, Available: ${user.wallet.toFixed(2)}`); return; }
        onPlaceBet({ subGameType, numbers, amountPerNumber: stake });
        setManualNumbersInput(''); setManualAmountInput('');
    };

    const getPlaceholder = () => {
        switch(subGameType) {
            case SubGameType.OneDigitOpen: case SubGameType.OneDigitClose: return "e.g. 1, 2, 9";
            default: return "e.g. 14, 05, 78";
        }
    };
    
    const getPrizeRate = (type: SubGameType) => {
        switch(type) {
            case SubGameType.OneDigitOpen: return user.prizeRates.oneDigitOpen;
            case SubGameType.OneDigitClose: return user.prizeRates.oneDigitClose;
            default: return user.prizeRates.twoDigit;
        }
    };

    const inputClass = "w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none text-white font-mono";
    const displayedError = apiError || error || parsedBulkBet.error || parsedManualBet.error;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-slate-900/80 rounded-lg shadow-2xl w-full max-w-lg border border-sky-500/30 flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-5 border-b border-slate-700 flex-shrink-0">
                    <h3 className="text-xl font-bold text-white uppercase tracking-wider">Play: {game.name}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">{Icons.close}</button>
                </div>
                <div className="p-6 overflow-y-auto">
                    <div className="bg-slate-800/50 p-1.5 rounded-lg flex items-center space-x-2 mb-4 self-start flex-wrap border border-slate-700">
                        {availableSubGameTabs.map(tab => (
                            <button key={tab} onClick={() => setSubGameType(tab)} className={`flex-auto py-2 px-3 text-sm font-semibold rounded-md transition-all duration-300 ${subGameType === tab ? 'bg-slate-700 text-sky-400 shadow-lg' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
                                {tab}
                            </button>
                        ))}
                    </div>
                    
                    {subGameType === SubGameType.Bulk ? (
                        <>
                           <div className="mb-2">
                                <label className="block text-slate-400 mb-1 text-sm font-medium">Bulk Entry</label>
                                <textarea value={bulkInput} onChange={e => setBulkInput(e.target.value)} rows={6} placeholder={"45..75,96 65\n4x..x4,x7,5x\n75,,85,x8,,x9 r50"} className={inputClass} />
                                <p className="text-xs text-slate-500 mt-1">Use spaces, `,`, `,,`, or `..`. A single stake (e.g., 'r50') applies to all numbers in the box.</p>
                            </div>
                            
                             {parsedBulkBet.lines.length > 0 && (
                                <div className="mb-4 bg-slate-800 p-3 rounded-md border border-slate-700 max-h-40 overflow-y-auto space-y-2">
                                    {parsedBulkBet.lines.map((line, index) => (
                                        <div key={index} className={`p-2 rounded-md text-sm ${line.error ? 'bg-red-500/10 border-l-4 border-red-500' : 'bg-green-500/10 border-l-4 border-green-500'}`}>
                                            <div className="flex justify-between items-center font-mono">
                                                <span className="truncate mr-4 text-slate-400" title={line.originalText}>"{line.originalText}"</span>
                                                {line.error ? (
                                                    <span className="text-red-400 font-semibold text-right">{line.error}</span>
                                                ) : (
                                                    <div className="flex items-center gap-4 text-xs">
                                                        <span className="text-slate-300">{line.subGameType}: <span className="font-bold text-white">{line.numbers.length}</span></span>
                                                        <span className="text-slate-300">Cost: <span className="font-bold text-white">{line.cost.toFixed(2)}</span></span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            
                            <div className="text-sm bg-slate-800/50 p-3 rounded-md mb-4 grid grid-cols-2 gap-2 text-center border border-slate-700">
                                <div><p className="text-slate-400 text-xs uppercase">Total Bets</p><p className="font-bold text-white text-lg">{parsedBulkBet.totalNumbers}</p></div>
                                <div><p className="text-slate-400 text-xs uppercase">Total Cost</p><p className="font-bold text-red-400 text-lg font-mono">{parsedBulkBet.totalCost.toFixed(2)}</p></div>
                            </div>
                        </>
                    ) : subGameType === SubGameType.Combo ? (
                        <>
                            <div className="mb-4">
                                <label className="block text-slate-400 mb-1 text-sm font-medium">Enter Digits (3-6)</label>
                                <div className="flex gap-2">
                                    <input type="text" value={comboDigitsInput} onChange={e => setComboDigitsInput(e.target.value)} placeholder="e.g., 324" className={inputClass} maxLength={10}/>
                                    <button onClick={handleGenerateCombos} className="bg-sky-600 hover:bg-sky-500 text-white font-bold py-2 px-4 rounded-md whitespace-nowrap">Generate</button>
                                </div>
                            </div>

                            {generatedCombos.length > 0 && (
                                <>
                                <div className="mb-4">
                                     <label className="block text-slate-400 mb-1 text-sm font-medium">Apply Stake to All</label>
                                    <div className="flex gap-2">
                                        <input type="number" value={comboGlobalStake} onChange={e => setComboGlobalStake(e.target.value)} placeholder="e.g. 10" className={inputClass} />
                                        <button onClick={handleApplyGlobalStake} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-md">Apply</button>
                                    </div>
                                </div>

                                <div className="bg-slate-800 p-3 rounded-md border border-slate-700 max-h-48 overflow-y-auto space-y-2">
                                    <div className="flex items-center px-2 py-1 text-xs text-slate-400 border-b border-slate-700">
                                        <input type="checkbox" checked={allCombosSelected} onChange={e => handleSelectAllCombos(e.target.checked)} className="mr-3 h-4 w-4 rounded bg-slate-900 border-slate-600 text-sky-600 focus:ring-sky-500" />
                                        <span className="w-1/3 font-semibold">Combination</span>
                                        <span className="w-2/3 font-semibold text-right">Stake Amount (PKR)</span>
                                    </div>
                                    {generatedCombos.map((combo, index) => (
                                        <div key={index} className="flex items-center p-2 rounded-md hover:bg-slate-700/50">
                                            <input type="checkbox" checked={combo.selected} onChange={(e) => handleComboSelectionChange(index, e.target.checked)} className="mr-3 h-4 w-4 rounded bg-slate-900 border-slate-600 text-sky-600 focus:ring-sky-500" />
                                            <label className="w-1/3 font-mono text-lg text-white">{combo.number}</label>
                                            <div className="w-2/3">
                                                <input type="number" value={combo.stake} onChange={e => handleComboStakeChange(index, e.target.value)} placeholder="0" className="w-full bg-slate-900 p-1.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none text-white font-mono text-right" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                </>
                            )}
                            
                            <div className="text-sm bg-slate-800/50 p-3 rounded-md mt-4 grid grid-cols-2 gap-2 text-center border border-slate-700">
                                <div><p className="text-slate-400 text-xs uppercase">Selected Bets</p><p className="font-bold text-white text-lg">{comboSummary.count}</p></div>
                                <div><p className="text-slate-400 text-xs uppercase">Total Cost</p><p className="font-bold text-red-400 text-lg font-mono">{comboSummary.totalCost.toFixed(2)}</p></div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="mb-4">
                                <label className="block text-slate-400 mb-1 text-sm font-medium">Enter Number(s)</label>
                                <textarea value={manualNumbersInput} onChange={handleManualNumberChange} rows={3} placeholder={getPlaceholder()} className={inputClass} />
                            </div>
                            <div className="mb-4">
                                <label className="block text-slate-400 mb-1 text-sm font-medium">Amount per Number</label>
                                <input type="number" value={manualAmountInput} onChange={e => setManualAmountInput(e.target.value)} placeholder="e.g. 10" className={inputClass} />
                            </div>
                            <div className="text-sm bg-slate-800/50 p-3 rounded-md mb-4 grid grid-cols-3 gap-2 text-center border border-slate-700">
                                <div><p className="text-slate-400 text-xs uppercase">Numbers</p><p className="font-bold text-white text-lg">{parsedManualBet.numberCount}</p></div>
                                <div><p className="text-slate-400 text-xs uppercase">Stake/Number</p><p className="font-bold text-white text-lg font-mono">{parsedManualBet.stake.toFixed(2)}</p></div>
                                <div><p className="text-slate-400 text-xs uppercase">Total Cost</p><p className="font-bold text-red-400 text-lg font-mono">{parsedManualBet.totalCost.toFixed(2)}</p></div>
                            </div>
                        </>
                    )}

                    <div className="text-sm bg-slate-800/50 p-3 rounded-md my-4 flex justify-around border border-slate-700">
                        <p className="text-slate-300">Prize Rate: <span className="font-bold text-emerald-400">{getPrizeRate(subGameType)}x</span></p>
                        <p className="text-slate-300">Commission: <span className="font-bold text-green-400">{user.commissionRate}%</span></p>
                    </div>

                    {displayedError && (
                        <div className="bg-red-500/20 border border-red-500/30 text-red-300 text-sm p-3 rounded-md mb-4" role="alert">
                            {displayedError}
                        </div>
                    )}

                    <div className="flex justify-end pt-2">
                         <button onClick={handleBet} className="bg-sky-600 hover:bg-sky-500 text-white font-bold py-2.5 px-6 rounded-md transition-colors">PLACE BET</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

interface BetConfirmationDetails {
    gameId: string;
    gameName: string;
    subGameType: SubGameType; // 'Bulk Game' for bulk bets
    totalAmount: number;
    totalNumbers: number;
    // For single type bets (manual, combo)
    numbers?: string[];
    amountPerNumber?: number;
    potentialWinnings?: number;
    // For bulk bets
    betGroups?: { subGameType: SubGameType; numbers: string[]; amountPerNumber: number }[];
    totalPotentialWinnings?: number;
}


const BetConfirmationPromptModal: React.FC<{ details: BetConfirmationDetails; onConfirm: () => void; onClose: () => void; isLoading: boolean; }> = ({ details, onConfirm, onClose, isLoading }) => {
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-slate-900/80 rounded-lg shadow-2xl w-full max-w-md border border-sky-500/30">
                <div className="p-6 text-center">
                    <h3 className="text-2xl font-bold text-white mb-4 uppercase tracking-wider">Confirm Bet</h3>
                    <p className="text-slate-400 mb-6">Review details before confirming.</p>

                    <div className="text-left bg-slate-900/50 border border-slate-700 p-4 rounded-lg my-6 space-y-3 text-sm">
                        <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Game:</span><span className="font-bold text-white">{details.gameName}</span></div>
                        
                        {details.subGameType === SubGameType.Bulk ? (
                             <>
                                <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-2">
                                  <span className="font-medium text-slate-400">Total Bets:</span>
                                  <span className="font-mono text-cyan-300">{details.totalNumbers}</span>
                                </div>
                                {details.betGroups?.map((group, index) => (
                                    <div key={index} className="text-xs">
                                        <div className="flex justify-between items-center">
                                            <span className="text-slate-400">{group.subGameType}:</span>
                                            <span className="font-mono text-white">{group.numbers.length} numbers @ {group.amountPerNumber.toFixed(2)} PKR</span>
                                        </div>
                                    </div>
                                ))}
                                <div className="flex justify-between items-center border-t border-slate-700 pt-3 mt-3"><span className="font-medium text-slate-400">Total Cost:</span><span className="font-bold text-lg font-mono text-red-400">{details.totalAmount.toFixed(2)} PKR</span></div>
                                <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Max Potential Win:</span><span className="font-mono text-emerald-400">{details.totalPotentialWinnings?.toFixed(2)} PKR</span></div>
                            </>
                        ) : (
                            <>
                                <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Type:</span><span className="font-bold text-white">{details.subGameType}</span></div>
                                <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Numbers:</span><span className="font-mono text-cyan-300 w-full sm:max-w-[60%] truncate text-right" title={details.numbers?.join(', ')}>{details.numbers?.join(', ')}</span></div>
                                <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Amount/Number:</span><span className="font-mono text-white">{details.amountPerNumber?.toFixed(2)} PKR</span></div>
                                <div className="flex justify-between items-center border-t border-slate-700 pt-3 mt-3"><span className="font-medium text-slate-400">Total Cost:</span><span className="font-bold text-lg font-mono text-red-400">{details.totalAmount.toFixed(2)} PKR</span></div>
                                <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Potential Win:</span><span className="font-mono text-emerald-400">{details.potentialWinnings?.toFixed(2)} PKR</span></div>
                            </>
                        )}
                    </div>

                    <div className="flex justify-end space-x-4 pt-2">
                        <button onClick={onClose} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2.5 px-6 rounded-md transition-colors">Cancel</button>
                        <button onClick={onConfirm} disabled={isLoading} className="bg-sky-600 hover:bg-sky-500 text-white font-bold py-2.5 px-6 rounded-md transition-colors disabled:bg-slate-600 disabled:cursor-wait">
                            {isLoading ? 'Processing...' : 'Confirm'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const AnimatedCheckIcon = () => (
  <svg className="animated-check" viewBox="0 0 52 52">
    <circle className="animated-check__circle" cx="26" cy="26" r="25" fill="none"/>
    <path className="animated-check__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
  </svg>
);

const BetConfirmationModal: React.FC<{ details: BetConfirmationDetails; onClose: () => void; }> = ({ details, onClose }) => {
    const [isShowing, setIsShowing] = useState(false);
    useEffect(() => { const timer = setTimeout(() => setIsShowing(true), 50); return () => clearTimeout(timer); }, []);
    const handleClose = () => { setIsShowing(false); setTimeout(onClose, 300); };

    return (
        <div className={`fixed inset-0 bg-black flex justify-center items-center z-50 p-4 transition-opacity duration-300 ease-out ${isShowing ? 'bg-opacity-80' : 'bg-opacity-0'}`}>
            <div className={`bg-slate-900/80 rounded-2xl shadow-2xl w-full max-w-md border border-green-500/30 transition-all duration-300 ease-out transform ${isShowing ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
                <div className="p-8 text-center">
                    <div className="mx-auto flex items-center justify-center h-24 w-24 rounded-full bg-green-500/20 mb-5 shadow-[0_0_20px_rgba(74,222,128,0.3)]">
                       <AnimatedCheckIcon />
                    </div>
                    <h3 className="text-3xl font-bold text-white mb-2 uppercase tracking-wider">Bet Placed!</h3>
                    <p className="text-slate-300 mb-8">Your bet has been recorded. Good luck!</p>
                     <div className="text-left bg-slate-900/50 border border-slate-700 p-4 rounded-lg my-6 space-y-3 text-sm">
                        <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Game:</span><span className="font-bold text-white">{details.gameName}</span></div>
                        
                        {details.subGameType === SubGameType.Bulk ? (
                            <>
                                <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Total Bets:</span><span className="font-mono text-cyan-300">{details.totalNumbers}</span></div>
                                <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Total Cost:</span><span className="font-mono text-red-400">{details.totalAmount.toFixed(2)} PKR</span></div>
                                <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Max Potential Win:</span><span className="font-mono text-emerald-400">{details.totalPotentialWinnings?.toFixed(2)} PKR</span></div>
                            </>
                        ) : (
                             <>
                                <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Your Numbers:</span><span className="font-mono text-cyan-300 text-right w-full sm:max-w-[60%] truncate">{details.numbers?.join(', ')}</span></div>
                                <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Total Cost:</span><span className="font-mono text-red-400">{details.totalAmount.toFixed(2)} PKR</span></div>
                                <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Potential Win:</span><span className="font-mono text-emerald-400">{details.potentialWinnings?.toFixed(2)} PKR</span></div>
                            </>
                        )}
                    </div>
                    <button onClick={handleClose} className="bg-gradient-to-r from-sky-600 to-cyan-500 hover:from-sky-500 hover:to-cyan-400 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 w-full transform hover:scale-105 shadow-lg shadow-sky-500/20">DONE</button>
                </div>
            </div>
        </div>
    );
};

const SummaryCard: React.FC<{ title: string; value: number; color: string }> = ({ title, value, color }) => (
    <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
        <p className="text-sm text-slate-400 uppercase tracking-wider">{title}</p>
        <p className={`text-3xl font-bold font-mono mt-1 ${color}`}>{value.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
    </div>
);

interface WalletSummary {
    deposit: number;
    prize: number;
    commission: number;
    booking: number;
    withdrawal: number;
}

const WalletSummaryView: React.FC<{ entries: LedgerEntry[] }> = ({ entries }) => {
    const summary: WalletSummary = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const dailySummary: WalletSummary = {
            deposit: 0, prize: 0, commission: 0, booking: 0, withdrawal: 0,
        };

        const todayEntries = entries.filter(entry => new Date(entry.timestamp) >= today);
        
        todayEntries.forEach(entry => {
            const description = entry.description.toLowerCase();
            if (entry.credit > 0) {
                if (description.includes('top-up') || description.includes('deposit')) {
                    dailySummary.deposit += entry.credit;
                } else if (description.includes('prize')) {
                    dailySummary.prize += entry.credit;
                } else if (description.includes('commission')) {
                    dailySummary.commission += entry.credit;
                }
            } else if (entry.debit > 0) {
                if (description.includes('bet placed')) {
                    dailySummary.booking += entry.debit;
                } else if (description.includes('withdrawal')) {
                    dailySummary.withdrawal += entry.debit;
                }
            }
        });

        return dailySummary;
    }, [entries]);

    return (
        <div className="mt-12">
            <h3 className="text-2xl font-bold mb-4 text-sky-400 uppercase tracking-widest">Today’s Wallet Summary</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 text-center">
                <SummaryCard title="Deposit" value={summary.deposit} color="text-green-400" />
                <SummaryCard title="Prize" value={summary.prize} color="text-emerald-400" />
                <SummaryCard title="Commission" value={summary.commission} color="text-cyan-400" />
                <SummaryCard title="Booking" value={summary.booking} color="text-red-400" />
                <SummaryCard title="Withdrawal" value={summary.withdrawal} color="text-amber-400" />
            </div>
        </div>
    );
};


interface UserPanelProps {
  user: User;
  games: Game[];
  bets: Bet[];
  placeBet: (details: {
    userId: string;
    gameId: string;
    betGroups: { subGameType: SubGameType; numbers: string[]; amountPerNumber: number }[];
  }) => Promise<void>;
}


const getPrizeRateForBet = (subGameType: SubGameType, prizeRates: PrizeRates) => {
    switch(subGameType) {
        case SubGameType.OneDigitOpen: return prizeRates.oneDigitOpen;
        case SubGameType.OneDigitClose: return prizeRates.oneDigitClose;
        default: return prizeRates.twoDigit;
    }
};

const UserPanel: React.FC<UserPanelProps> = ({ user, games, bets, placeBet }) => {
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [betConfirmation, setBetConfirmation] = useState<BetConfirmationDetails | null>(null);
  const [betToConfirm, setBetToConfirm] = useState<BetConfirmationDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [bettingError, setBettingError] = useState<string | null>(null);
  
  const userBets = bets.filter(b => b.userId === user.id);

  const handleReviewBet = (details: {
    subGameType: SubGameType;
    numbers?: string[];
    amountPerNumber?: number;
    betGroups?: { subGameType: SubGameType; numbers: string[]; amountPerNumber: number }[];
}) => {
    if (!selectedGame) return;

    setBettingError(null);
    let confirmationDetails: BetConfirmationDetails;

    if (details.subGameType === SubGameType.Bulk && details.betGroups) {
        let totalAmount = 0;
        let totalNumbers = 0;
        let maxPotentialWin = 0;
        
        details.betGroups.forEach(group => {
            const groupCost = group.numbers.length * group.amountPerNumber;
            totalAmount += groupCost;
            totalNumbers += group.numbers.length;
            const prizeRate = getPrizeRateForBet(group.subGameType, user.prizeRates);
            const potentialWin = group.amountPerNumber * prizeRate;
            if (potentialWin > maxPotentialWin) {
                maxPotentialWin = potentialWin;
            }
        });

        confirmationDetails = {
            gameId: selectedGame.id,
            gameName: selectedGame.name,
            subGameType: details.subGameType,
            betGroups: details.betGroups,
            totalAmount,
            totalNumbers,
            totalPotentialWinnings: maxPotentialWin
        };
    } else if (details.numbers && typeof details.amountPerNumber === 'number') {
        const { numbers, amountPerNumber, subGameType } = details;
        if(numbers.length === 0 || amountPerNumber <= 0) {
            setBettingError("Invalid bet details provided.");
            return;
        }
        const totalAmount = numbers.length * amountPerNumber;
        const prizeRate = getPrizeRateForBet(subGameType, user.prizeRates);
        
        confirmationDetails = {
            gameId: selectedGame.id,
            gameName: selectedGame.name,
            subGameType,
            numbers,
            amountPerNumber,
            totalAmount,
            totalNumbers: numbers.length, 
            potentialWinnings: amountPerNumber * prizeRate // Prize for a single winning number
        };
    } else {
        console.error("handleReviewBet received invalid details object:", details);
        setBettingError("An internal error occurred while preparing your bet.");
        return;
    }
    
    setBetToConfirm(confirmationDetails);
};
  
  const handleConfirmBet = async () => {
    if (!betToConfirm) return;

    setIsLoading(true);
    setBettingError(null);
    let isSuccess = false;

    try {
        let betGroups: { subGameType: SubGameType; numbers: string[]; amountPerNumber: number }[] = [];

        if (betToConfirm.subGameType === SubGameType.Bulk && betToConfirm.betGroups) {
            betGroups = betToConfirm.betGroups;
        } else if (betToConfirm.numbers && betToConfirm.amountPerNumber !== undefined) {
            betGroups = [{
                subGameType: betToConfirm.subGameType,
                numbers: betToConfirm.numbers,
                amountPerNumber: betToConfirm.amountPerNumber,
            }];
        }
        
        await placeBet({
            userId: user.id,
            gameId: betToConfirm.gameId,
            betGroups: betGroups,
        });
        
        isSuccess = true;
    } catch (error: any) {
        console.error("Bet placement failed:", error);
        setBettingError(error.message);
        isSuccess = false;
    } finally {
        setIsLoading(false);
        // Always close the confirmation prompt
        setBetToConfirm(null);

        if (isSuccess) {
            // Only show success modal and close betting modal on success
            setBetConfirmation(betToConfirm);
            setSelectedGame(null); 
        }
        // If !isSuccess, the betting modal remains open (selectedGame is not cleared)
        // and will display the error message set in the catch block.
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-800/50 p-4 rounded-lg mb-8 border border-slate-700 gap-4">
        <div className="flex items-center">
            {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="w-16 h-16 rounded-full mr-5 border-2 border-sky-400 object-cover"/>
            ) : (
                <div className="w-16 h-16 rounded-full mr-5 border-2 border-sky-400 bg-slate-700 flex items-center justify-center">
                    <span className="text-3xl font-bold">{user.name.charAt(0)}</span>
                </div>
            )}
            <div>
              <h2 className="text-2xl font-bold text-white uppercase tracking-wider">{user.name}</h2>
              <p className="text-slate-400">Welcome back! Ready to play?</p>
            </div>
        </div>
        <div className="flex items-center gap-4 w-full md:w-auto self-stretch">
            <div className="bg-slate-900/50 p-3 rounded-md text-center flex-1 border border-slate-700 flex flex-col justify-center">
                <p className="text-xs text-slate-400 uppercase">Balance</p>
                <p className="font-mono font-bold text-lg text-emerald-400">PKR {user.wallet.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            </div>
        </div>
      </div>
       {user.isRestricted && (
          <div className="bg-red-500/20 border border-red-500/30 text-red-300 p-4 rounded-lg mb-8 text-center" role="alert">
              <p className="font-bold text-lg">Your account is restricted.</p>
              <p>You cannot place bets at this time. Please contact your dealer for assistance.</p>
          </div>
      )}

      <h2 className="text-3xl font-bold text-sky-400 mb-6 uppercase tracking-widest">Available Games</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {games.map(game => (
          <GameCard key={game.id} game={game} onPlay={setSelectedGame} isRestricted={user.isRestricted} />
        ))}
      </div>
      
      <WalletSummaryView entries={user.ledger} />
      <BetHistoryView bets={userBets} games={games} user={user} />
      <LedgerView entries={user.ledger} />
      
      {selectedGame && <BettingModal game={selectedGame} user={user} onClose={() => { setSelectedGame(null); setBettingError(null); }} onPlaceBet={handleReviewBet} apiError={bettingError} clearApiError={() => setBettingError(null)} />}
      {betToConfirm && <BetConfirmationPromptModal details={betToConfirm} onConfirm={handleConfirmBet} onClose={() => setBetToConfirm(null)} isLoading={isLoading} />}
      {betConfirmation && <BetConfirmationModal details={betConfirmation} onClose={() => setBetConfirmation(null)} />}
    </div>
  );
};

export default UserPanel;