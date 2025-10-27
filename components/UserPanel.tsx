import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, Game, SubGameType, LedgerEntry, Bet, PrizeRates, BetLimits } from '../types';
import { Icons } from '../constants';
import { useCountdown } from '../hooks/useCountdown';

const LedgerView: React.FC<{ entries: LedgerEntry[] }> = ({ entries }) => (
    <div className="mt-12">
        <h3 className="text-2xl font-bold mb-4 text-sky-400 uppercase tracking-widest">My Ledger</h3>
        <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
            <div className="overflow-x-auto max-h-[30rem]">
                <table className="w-full text-left">
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

    const getBetOutcome = (bet: Bet) => {
        const game = games.find(g => g.id === bet.gameId);
        if (!game || !game.winningNumber) return { status: 'Pending', payout: 0, color: 'text-amber-400' };
        
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

    return (
        <div className="mt-12">
            <h3 className="text-2xl font-bold mb-4 text-sky-400 uppercase tracking-widest">My Bet History</h3>
            <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                <div className="overflow-x-auto max-h-[30rem]">
                    <table className="w-full text-left">
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
                           {[...bets].reverse().map(bet => {
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
                        </tbody>
                     {bets.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-500">No bets placed yet.</td></tr>}
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
    const isPlayable = status === 'OPEN' && !isRestricted;
    
    const getCountdownLabel = () => {
        switch(status) {
            case 'SOON': return 'OPENS AT'; case 'OPEN': return 'TIME LEFT';
            case 'CLOSED': return 'GAME CLOSED'; default: return 'LOADING...';
        }
    };
    
    const getCountdownStyle = () => {
         switch(status) {
            case 'SOON': return 'text-amber-300'; case 'OPEN': return 'text-cyan-300';
            case 'CLOSED': return 'text-red-400'; default: return 'text-slate-400';
        }
    };

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
                    <div className="text-xs uppercase tracking-wider text-slate-400">{getCountdownLabel()}</div>
                    <div className={`text-3xl font-mono font-bold ${getCountdownStyle()}`}>{countdownText}</div>
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
    onPlaceBet: (details: { subGameType: SubGameType; numbers?: string[]; amountPerNumber?: number; betGroups?: Map<number, string[]>}) => void;
}

const BettingModal: React.FC<BettingModalProps> = ({ game, user, onClose, onPlaceBet }) => {
    const [subGameType, setSubGameType] = useState<SubGameType>(SubGameType.TwoDigit);
    const [manualNumbersInput, setManualNumbersInput] = useState('');
    const [manualAmountInput, setManualAmountInput] = useState('');
    const [bulkInput, setBulkInput] = useState('');
    const [comboInput, setComboInput] = useState('');
    const [selectedComboNumbers, setSelectedComboNumbers] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);

    const availableSubGameTabs = useMemo(() => {
        if (!game) return [];
        if (game.name === 'AK') return [SubGameType.TwoDigit, SubGameType.OneDigitOpen];
        if (game.name === 'AKC') return [SubGameType.OneDigitClose];
        if (game.name === 'LS3') return [SubGameType.TwoDigit, SubGameType.OneDigitOpen, SubGameType.OneDigitClose, SubGameType.Bulk, SubGameType.Combo];
        return [SubGameType.TwoDigit, SubGameType.OneDigitOpen, SubGameType.OneDigitClose, SubGameType.Bulk, SubGameType.Combo];
    }, [game]);
    
    const handleComboNumberToggle = useCallback((number: string) => {
        setSelectedComboNumbers(prev => {
            const newSet = new Set(prev);
            if (newSet.has(number)) {
                newSet.delete(number);
            } else {
                newSet.add(number);
            }
            return newSet;
        });
    }, []);

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

    if (!game) return null;

    const parsedBulkBet = useMemo(() => {
        interface ParsedLine { originalText: string; type: 'NUMBERS' | 'OPEN' | 'CLOSE' | 'COMBO' | 'INVALID'; numbers: string[]; stake: number; cost: number; error?: string; }
        const result = { lines: [] as ParsedLine[], totalCost: 0, totalNumbers: 0, error: null as string | null, betGroups: new Map<number, string[]>() };
        const input = bulkInput.trim();
        if (!input) return result;
    
        for (const lineText of input.split('\n')) {
            if (!lineText.trim()) continue;
            const parsedLine: ParsedLine = { originalText: lineText, type: 'INVALID', numbers: [], stake: 0, cost: 0 };
    
            const stakeRegex = /\s+(?:r|rs)\s*(\d*\.?\d+)\s*$/i;
            const match = lineText.match(stakeRegex);
    
            if (!match) { parsedLine.error = "Stake not found (e.g., '... r10')."; result.lines.push(parsedLine); continue; }
            const stake = parseFloat(match[1]);
            if (isNaN(stake) || stake <= 0) { parsedLine.error = "Invalid stake amount."; result.lines.push(parsedLine); continue; }
            parsedLine.stake = stake;
    
            const commandPart = lineText.substring(0, match.index).trim().toLowerCase();
    
            if (/\b(k|combo)\b/i.test(commandPart)) {
                const digitsPart = commandPart.replace(/\b(k|combo)\b/ig, '').replace(/\D/g, '');
                const uniqueDigits = [...new Set(digitsPart.split(''))].sort();
                if (uniqueDigits.length < 2) { 
                    parsedLine.error = "Combo needs at least 2 unique digits."; 
                } else {
                    parsedLine.type = 'COMBO';
                    const combinations = [];
                    for (let i = 0; i < uniqueDigits.length; i++) {
                        for (let j = i + 1; j < uniqueDigits.length; j++) {
                            combinations.push(uniqueDigits[i] + uniqueDigits[j]);
                        }
                    }
                    parsedLine.numbers = combinations;
                }
            } else if (/^\d\s*x$/i.test(commandPart) || /^\dx$/i.test(commandPart)) {
                 const digit = commandPart.replace(/\D/g, '');
                 parsedLine.type = 'OPEN';
                 parsedLine.numbers = Array.from({ length: 10 }, (_, i) => digit + i);
            } else if (/^x\s*\d$/i.test(commandPart) || /^x\d$/i.test(commandPart)) {
                const digit = commandPart.replace(/\D/g, '');
                parsedLine.type = 'CLOSE';
                parsedLine.numbers = Array.from({ length: 10 }, (_, i) => String(i) + digit);
            } else {
                const potentialNumbers = commandPart.split(/\D+/).filter(Boolean);
                if (potentialNumbers.length > 0) {
                    const invalid = potentialNumbers.filter(n => !/^\d{2}$/.test(n));
                    if (invalid.length > 0) {
                        parsedLine.error = `Invalid: ${invalid.join(', ')}. All must be 2 digits.`;
                    } else {
                        parsedLine.type = 'NUMBERS';
                        parsedLine.numbers = potentialNumbers;
                    }
                } else if (commandPart) {
                     parsedLine.error = "No valid numbers found.";
                }
            }
    
            if (parsedLine.type !== 'INVALID' && !parsedLine.error) {
                parsedLine.cost = parsedLine.numbers.length * parsedLine.stake;
                result.totalCost += parsedLine.cost;
                result.totalNumbers += parsedLine.numbers.length;
                const existing = result.betGroups.get(parsedLine.stake) || [];
                result.betGroups.set(parsedLine.stake, [...new Set([...existing, ...parsedLine.numbers])]);
            }
            result.lines.push(parsedLine);
        }
        if (result.lines.some(l => l.error || (l.type === 'INVALID' && l.originalText))) result.error = "Please review invalid lines.";
        return result;
    }, [bulkInput]);

    const parsedComboBet = useMemo(() => {
        const result = { generatedNumbers: [] as string[], stake: 0, numberOfCombinations: 0, error: null as string | null };
        const input = comboInput.trim().toLowerCase();
        if (!input) return result;

        const rIndex = input.lastIndexOf('r');
        if (rIndex === -1) {
            result.error = "Stake not found. Use 'r' to specify amount (e.g., '147 r10')."; return result;
        }
        const digitsPartRaw = input.substring(0, rIndex).trim();
        const digitsPart = digitsPartRaw.replace(/\D/g, '');
        const stakePart = input.substring(rIndex + 1).trim();
        const stake = parseFloat(stakePart);

        if (isNaN(stake) || stake <= 0) { result.error = "Invalid stake amount."; } else { result.stake = stake; }
        if (!digitsPart) { result.error = "No digits entered."; return result; }
        
        const uniqueDigits = [...new Set(digitsPart.split(''))];
        if (uniqueDigits.length > 0 && (uniqueDigits.length < 3 || uniqueDigits.length > 6)) {
            result.error = "Please enter between 3 and 6 unique digits to form combinations."; return result;
        }
        if (uniqueDigits.length < 2) {
            if (digitsPart) result.error = "Please enter at least two unique digits."; return result;
        }

        const combinations: string[] = [];
        for (let i = 0; i < uniqueDigits.length; i++) {
            for (let j = 0; j < uniqueDigits.length; j++) {
                if (i !== j) { combinations.push(uniqueDigits[i] + uniqueDigits[j]); }
            }
        }
        result.generatedNumbers = combinations;
        result.numberOfCombinations = combinations.length;
        return result;
    }, [comboInput]);
    
    const finalComboBetDetails = useMemo(() => {
        const stake = parsedComboBet.stake;
        const count = selectedComboNumbers.size;
        const totalCost = count * stake;
        return { numbers: Array.from(selectedComboNumbers), stake, count, totalCost };
    }, [selectedComboNumbers, parsedComboBet.stake]);

    useEffect(() => {
        if (subGameType === SubGameType.Combo) {
            setSelectedComboNumbers(new Set(parsedComboBet.generatedNumbers));
        } else {
            setSelectedComboNumbers(new Set());
        }
    }, [parsedComboBet.generatedNumbers, subGameType]);

    const handleSelectAllCombo = useCallback(() => { setSelectedComboNumbers(new Set(parsedComboBet.generatedNumbers)); }, [parsedComboBet.generatedNumbers]);
    const handleClearComboSelection = useCallback(() => { setSelectedComboNumbers(new Set()); }, []);
    
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

        const checkBetLimit = (totalCost: number) => {
            if (user.betLimits) {
                let limit = 0;
                if (subGameType === SubGameType.OneDigitOpen) {
                    limit = user.betLimits.oneDigitOpen;
                } else if (subGameType === SubGameType.OneDigitClose) {
                    limit = user.betLimits.oneDigitClose;
                } else { // TwoDigit, Bulk, Combo
                    limit = user.betLimits.twoDigit;
                }

                if (limit > 0 && totalCost > limit) {
                    setError(`Bet amount (PKR ${totalCost.toFixed(2)}) exceeds your limit of PKR ${limit.toFixed(2)} for this game type.`);
                    return false;
                }
            }
            return true;
        };

        if (subGameType === SubGameType.Combo) {
            if (parsedComboBet.error) { setError(parsedComboBet.error); return; }
            const { numbers, stake, totalCost } = finalComboBetDetails;
            if (numbers.length === 0) { setError("Please select at least one combination to bet on."); return; }
            if (stake <= 0) { setError("Invalid stake amount."); return; }
            if (!checkBetLimit(totalCost)) return;
            if (totalCost > user.wallet) { setError(`Insufficient balance. Required: ${totalCost.toFixed(2)}, Available: ${user.wallet.toFixed(2)}`); return; }
            onPlaceBet({ subGameType, numbers, amountPerNumber: stake });
            setComboInput('');
            return;
        }

        if (subGameType === SubGameType.Bulk) {
            const { totalCost, betGroups, error: parseError } = parsedBulkBet;
            if (parseError) { setError(parseError); return; }
            if (betGroups.size === 0) { setError("No valid bets entered."); return; }
            if (!checkBetLimit(totalCost)) return;
            if (totalCost > user.wallet) { setError(`Insufficient balance. Required: ${totalCost.toFixed(2)}, Available: ${user.wallet.toFixed(2)}`); return; }
            onPlaceBet({ subGameType, betGroups });
            setBulkInput('');
            return;
        }
        
        const { numbers, totalCost, error: parseError, stake } = parsedManualBet;
        if (stake <= 0) { setError("Please enter a valid amount."); return; }
        if (parseError) { setError(parseError); return; }
        if (numbers.length === 0) { setError("Please enter at least one number."); return; }
        if (!checkBetLimit(totalCost)) return;
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
    
    const getPrizeRate = () => {
        switch(subGameType) {
            case SubGameType.OneDigitOpen: return user.prizeRates.oneDigitOpen;
            case SubGameType.OneDigitClose: return user.prizeRates.oneDigitClose;
            default: return user.prizeRates.twoDigit;
        }
    };

    const inputClass = "w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none text-white font-mono";

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
                                <textarea value={bulkInput} onChange={e => setBulkInput(e.target.value)} rows={6} placeholder={"e.g.,\n12,23-45/67 rs10\n47 49 31 R30\n1x Rs100 (10-19)\nx2 R200 (02,12..92)\nk 123 Rs30 (12,13,23)"} className={inputClass} />
                                <p className="text-xs text-slate-500 mt-1">Enter bets per line. Use any separator for numbers. Formats: '12 34 r10', '1x r20' (open), 'x2 r30' (close), 'k 123 r5' (combo).</p>
                            </div>
                            
                             {parsedBulkBet.lines.length > 0 && (
                                <div className="mb-4 bg-slate-800 p-3 rounded-md border border-slate-700 max-h-40 overflow-y-auto space-y-2">
                                    {parsedBulkBet.lines.map((line, index) => (
                                        <div key={index} className={`p-2 rounded-md text-sm ${line.error || (line.type === 'INVALID' && line.originalText) ? 'bg-red-500/10 border-l-4 border-red-500' : 'bg-green-500/10 border-l-4 border-green-500'}`}>
                                            <div className="flex justify-between items-center font-mono">
                                                <span className="truncate mr-4 text-slate-400" title={line.originalText}>"{line.originalText}"</span>
                                                {line.error || (line.type === 'INVALID' && line.originalText) ? (
                                                    <span className="text-red-400 font-semibold text-right">{line.error || 'Invalid line'}</span>
                                                ) : (
                                                    <div className="flex items-center gap-4 text-xs">
                                                        <span className="text-slate-300">Numbers: <span className="font-bold text-white">{line.numbers.length}</span></span>
                                                        <span className="text-slate-300">Cost: <span className="font-bold text-white">{line.cost.toFixed(2)}</span></span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            
                            <div className="text-sm bg-slate-800/50 p-3 rounded-md mb-4 grid grid-cols-2 gap-2 text-center border border-slate-700">
                                <div><p className="text-slate-400 text-xs uppercase">Total Numbers</p><p className="font-bold text-white text-lg">{parsedBulkBet.totalNumbers}</p></div>
                                <div><p className="text-slate-400 text-xs uppercase">Total Cost</p><p className="font-bold text-red-400 text-lg font-mono">{parsedBulkBet.totalCost.toFixed(2)}</p></div>
                            </div>
                        </>
                    ) : subGameType === SubGameType.Combo ? (
                        <>
                             <div className="mb-2">
                                <label className="block text-slate-400 mb-1 text-sm font-medium">Enter Digits for Combo</label>
                                <input type="text" value={comboInput} onChange={e => setComboInput(e.target.value)} placeholder="e.g., 1478 r10 (3-6 unique digits)" className={inputClass} />
                                <p className="text-xs text-slate-500 mt-1">Enter 3-6 unique digits, followed by 'r' and the stake per combination.</p>
                            </div>
                            
                            {parsedComboBet.generatedNumbers.length > 0 && (
                                <div className="mb-4">
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-slate-400 text-sm font-medium">Generated Combinations ({parsedComboBet.numberOfCombinations})</label>
                                        <div className="flex gap-2">
                                            <button onClick={handleSelectAllCombo} className="text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded transition-colors">Select All</button>
                                            <button onClick={handleClearComboSelection} className="text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded transition-colors">Clear</button>
                                        </div>
                                    </div>
                                    <div className="bg-slate-800 p-3 rounded-md border border-slate-700 max-h-32 overflow-y-auto flex flex-wrap gap-2">
                                        {parsedComboBet.generatedNumbers.map((num) => (
                                            <button key={num} onClick={() => handleComboNumberToggle(num)} className={`px-2.5 py-1.5 rounded font-mono text-sm transition-colors ${selectedComboNumbers.has(num) ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                                                {num}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            <div className="text-sm bg-slate-800/50 p-3 rounded-md mb-4 grid grid-cols-3 gap-2 text-center border border-slate-700">
                                <div><p className="text-slate-400 text-xs uppercase">Selected</p><p className="font-bold text-white text-lg">{finalComboBetDetails.count}</p></div>
                                <div><p className="text-slate-400 text-xs uppercase">Stake/Combo</p><p className="font-bold text-white text-lg font-mono">{finalComboBetDetails.stake.toFixed(2)}</p></div>
                                <div><p className="text-slate-400 text-xs uppercase">Total Cost</p><p className="font-bold text-red-400 text-lg font-mono">{finalComboBetDetails.totalCost.toFixed(2)}</p></div>
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

                    <div className="text-sm bg-slate-800/50 p-3 rounded-md mb-4 flex justify-around border border-slate-700">
                        <p className="text-slate-300">Prize Rate: <span className="font-bold text-emerald-400">{getPrizeRate()}x</span></p>
                        <p className="text-slate-300">Commission: <span className="font-bold text-green-400">{user.commissionRate}%</span></p>
                    </div>

                    {(error || (subGameType === SubGameType.Bulk && parsedBulkBet.error) || (subGameType === SubGameType.Combo && parsedComboBet.error) || parsedManualBet.error) && (
                        <div className="bg-red-500/20 border border-red-500/30 text-red-300 text-sm p-3 rounded-md mb-4" role="alert">
                            {error || parsedBulkBet.error || parsedComboBet.error || parsedManualBet.error}
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
    subGameType: SubGameType;
    totalAmount: number;
    numbers?: string[];
    amountPerNumber?: number;
    potentialWinnings?: number;
    betGroups?: Map<number, string[]>;
    totalNumbers?: number;
    totalPotentialWinnings?: number;
}


const BetConfirmationPromptModal: React.FC<{ details: BetConfirmationDetails; onConfirm: () => void; onClose: () => void; }> = ({ details, onConfirm, onClose }) => {
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-slate-900/80 rounded-lg shadow-2xl w-full max-w-md border border-sky-500/30">
                <div className="p-6 text-center">
                    <h3 className="text-2xl font-bold text-white mb-4 uppercase tracking-wider">Confirm Bet</h3>
                    <p className="text-slate-400 mb-6">Review details before confirming.</p>

                    <div className="text-left bg-slate-900/50 border border-slate-700 p-4 rounded-lg my-6 space-y-3 text-sm">
                        <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Game:</span><span className="font-bold text-white">{details.gameName} ({details.subGameType})</span></div>
                        
                        {details.betGroups ? (
                            <>
                                <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Total Numbers:</span><span className="font-mono text-cyan-300">{details.totalNumbers}</span></div>
                                <div className="border-t border-slate-800 my-2"></div>
                                {[...details.betGroups.entries()].map(([amount, numbers]) => (
                                    <div key={amount} className="flex justify-between items-center text-xs">
                                        <span className="text-slate-400">{numbers.length} numbers @</span>
                                        <span className="font-mono text-white">{amount.toFixed(2)} PKR each</span>
                                    </div>
                                ))}
                                <div className="flex justify-between items-center border-t border-slate-700 pt-3 mt-3"><span className="font-medium text-slate-400">Total Cost:</span><span className="font-bold text-lg font-mono text-red-400">{details.totalAmount.toFixed(2)} PKR</span></div>
                                <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Total Potential Win:</span><span className="font-mono text-emerald-400">{details.totalPotentialWinnings?.toFixed(2)} PKR</span></div>
                            </>
                        ) : (
                            <>
                                <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Numbers:</span><span className="font-mono text-cyan-300 text-right max-w-[60%] truncate" title={details.numbers?.join(', ')}>{details.numbers?.join(', ')}</span></div>
                                <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Amount/Number:</span><span className="font-mono text-white">{details.amountPerNumber?.toFixed(2)} PKR</span></div>
                                <div className="flex justify-between items-center border-t border-slate-700 pt-3 mt-3"><span className="font-medium text-slate-400">Total Cost:</span><span className="font-bold text-lg font-mono text-red-400">{details.totalAmount.toFixed(2)} PKR</span></div>
                                <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Potential Win:</span><span className="font-mono text-emerald-400">{details.potentialWinnings?.toFixed(2)} PKR</span></div>
                            </>
                        )}
                    </div>

                    <div className="flex justify-end space-x-4 pt-2">
                        <button onClick={onClose} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2.5 px-6 rounded-md transition-colors">Cancel</button>
                        <button onClick={onConfirm} className="bg-sky-600 hover:bg-sky-500 text-white font-bold py-2.5 px-6 rounded-md transition-colors">Confirm</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const BetConfirmationModal: React.FC<{ details: BetConfirmationDetails; onClose: () => void; }> = ({ details, onClose }) => {
    const [isShowing, setIsShowing] = useState(false);
    useEffect(() => { const timer = setTimeout(() => setIsShowing(true), 50); return () => clearTimeout(timer); }, []);
    const handleClose = () => { setIsShowing(false); setTimeout(onClose, 300); };

    return (
        <div className={`fixed inset-0 bg-black flex justify-center items-center z-50 p-4 transition-opacity duration-300 ease-out ${isShowing ? 'bg-opacity-80' : 'bg-opacity-0'}`}>
            <div className={`bg-slate-900/80 rounded-2xl shadow-2xl w-full max-w-md border border-green-500/30 transition-all duration-300 ease-out transform ${isShowing ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
                <div className="p-8 text-center">
                    <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-green-500/20 mb-5 shadow-[0_0_20px_rgba(74,222,128,0.3)]">
                       {React.cloneElement(Icons.checkCircle, { className: "h-12 w-12 text-green-400" })}
                    </div>
                    <h3 className="text-3xl font-bold text-white mb-2 uppercase tracking-wider">Bet Placed!</h3>
                    <p className="text-slate-300 mb-8">Your bet has been recorded. Good luck!</p>
                     <div className="text-left bg-slate-900/50 border border-slate-700 p-4 rounded-lg my-6 space-y-3 text-sm">
                        <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Game:</span><span className="font-bold text-white">{details.gameName} ({details.subGameType})</span></div>
                        
                        {details.betGroups ? (
                            <>
                                <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Total Numbers:</span><span className="font-mono text-cyan-300">{details.totalNumbers}</span></div>
                                <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Total Cost:</span><span className="font-mono text-red-400">{details.totalAmount.toFixed(2)} PKR</span></div>
                                <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Total Potential Win:</span><span className="font-mono text-emerald-400">{details.totalPotentialWinnings?.toFixed(2)} PKR</span></div>
                            </>
                        ) : (
                             <>
                                <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Your Numbers:</span><span className="font-mono text-cyan-300 text-right max-w-[60%] truncate">{details.numbers?.join(', ')}</span></div>
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

const PrizeRatesView: React.FC<{ rates: PrizeRates }> = ({ rates }) => (
    <div className="mt-12">
        <h3 className="text-2xl font-bold mb-4 text-sky-400 uppercase tracking-widest">My Prize Rates</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                <p className="text-sm text-slate-400 uppercase tracking-wider">1 Digit Open</p>
                <p className="text-4xl font-bold text-white mt-1">{rates.oneDigitOpen}x</p>
            </div>
            <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                <p className="text-sm text-slate-400 uppercase tracking-wider">1 Digit Close</p>
                <p className="text-4xl font-bold text-white mt-1">{rates.oneDigitClose}x</p>
            </div>
            <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                <p className="text-sm text-slate-400 uppercase tracking-wider">2 Digit</p>
                <p className="text-4xl font-bold text-white mt-1">{rates.twoDigit}x</p>
            </div>
        </div>
    </div>
);

const BetLimitsView: React.FC<{ limits?: BetLimits }> = ({ limits }) => (
    <div className="mt-12">
        <h3 className="text-2xl font-bold mb-4 text-sky-400 uppercase tracking-widest">My Bet Limits</h3>
        {!limits || (limits.oneDigitOpen === 0 && limits.oneDigitClose === 0 && limits.twoDigit === 0) ? (
            <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700 text-center text-slate-400">
                You have no betting limits set.
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
                <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                    <p className="text-sm text-slate-400 uppercase tracking-wider">1 Digit Open</p>
                    <p className="text-4xl font-bold text-white mt-1">{limits.oneDigitOpen > 0 ? `PKR ${limits.oneDigitOpen.toLocaleString()}` : 'No Limit'}</p>
                </div>
                <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                    <p className="text-sm text-slate-400 uppercase tracking-wider">1 Digit Close</p>
                    <p className="text-4xl font-bold text-white mt-1">{limits.oneDigitClose > 0 ? `PKR ${limits.oneDigitClose.toLocaleString()}` : 'No Limit'}</p>
                </div>
                <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                    <p className="text-sm text-slate-400 uppercase tracking-wider">2 Digit / Bulk / Combo</p>
                    <p className="text-4xl font-bold text-white mt-1">{limits.twoDigit > 0 ? `PKR ${limits.twoDigit.toLocaleString()}` : 'No Limit'}</p>
                </div>
            </div>
        )}
    </div>
);


interface UserPanelProps {
  user: User;
  games: Game[];
  bets: Bet[];
  placeBet: (details: {
    userId: string;
    gameId: string;
    subGameType: SubGameType;
    bets: { numbers: string[]; amountPerNumber: number }[];
  }) => void;
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
  
  const userBets = bets.filter(b => b.userId === user.id);

  const handleReviewBet = (details: { subGameType: SubGameType; numbers?: string[]; amountPerNumber?: number; betGroups?: Map<number, string[]>}) => {
    if (selectedGame) {
      const prizeRate = getPrizeRateForBet(details.subGameType, user.prizeRates);
      let confirmationDetails: BetConfirmationDetails;

      if (details.betGroups) { // Bulk bet
          let totalAmount = 0;
          let totalNumbers = 0;
          let totalPotentialWinnings = 0;
          details.betGroups.forEach((numbers, amount) => {
              totalAmount += numbers.length * amount;
              totalNumbers += numbers.length;
              totalPotentialWinnings += numbers.length * amount * prizeRate;
          });
          confirmationDetails = {
              gameId: selectedGame.id, gameName: selectedGame.name, subGameType: details.subGameType,
              betGroups: details.betGroups, totalAmount, totalNumbers, totalPotentialWinnings
          };
      } else { // Single bet (Manual or Combo)
          const { numbers, amountPerNumber } = details;
          if(!numbers || amountPerNumber === undefined) return;
          const totalAmount = numbers.length * amountPerNumber;
          confirmationDetails = {
              gameId: selectedGame.id, gameName: selectedGame.name, subGameType: details.subGameType,
              numbers, amountPerNumber, totalAmount, potentialWinnings: amountPerNumber * prizeRate * numbers.length
          };
      }
      setBetToConfirm(confirmationDetails);
      setSelectedGame(null);
    }
  };
  
  const handleConfirmBet = () => {
    if (betToConfirm) {
        let betsArray: { numbers: string[]; amountPerNumber: number }[] = [];

        if (betToConfirm.betGroups) { // Bulk bet
            betsArray = Array.from(betToConfirm.betGroups.entries()).map(([amount, numbers]) => ({
                amountPerNumber: amount,
                numbers: numbers,
            }));
        } else if (betToConfirm.numbers && betToConfirm.amountPerNumber !== undefined) { // Manual/Combo
            betsArray = [{
                numbers: betToConfirm.numbers,
                amountPerNumber: betToConfirm.amountPerNumber,
            }];
        }

        if (betsArray.length > 0) {
            placeBet({
                userId: user.id,
                gameId: betToConfirm.gameId,
                subGameType: betToConfirm.subGameType,
                bets: betsArray,
            });
        }
        
        setBetConfirmation(betToConfirm);
        setBetToConfirm(null);
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
      
      <PrizeRatesView rates={user.prizeRates} />
      <BetLimitsView limits={user.betLimits} />
      <BetHistoryView bets={userBets} games={games} user={user} />
      <LedgerView entries={user.ledger} />
      
      {selectedGame && <BettingModal game={selectedGame} user={user} onClose={() => setSelectedGame(null)} onPlaceBet={handleReviewBet} />}
      {betToConfirm && <BetConfirmationPromptModal details={betToConfirm} onConfirm={handleConfirmBet} onClose={() => setBetToConfirm(null)} />}
      {betConfirmation && <BetConfirmationModal details={betConfirmation} onClose={() => setBetConfirmation(null)} />}
    </div>
  );
};

export default UserPanel;