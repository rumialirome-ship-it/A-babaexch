import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, Game, SubGameType, LedgerEntry, Bet, PrizeRates } from '../types';
import { Icons } from '../constants';
import { useCountdown } from '../hooks/useCountdown';
import { useAuth } from '../hooks/useAuth';

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
    onPlaceBet: (subGameType: SubGameType, numbers: string[], amount: number) => void;
    initialData?: { number: string; subGameType: SubGameType } | null;
}

const BettingModal: React.FC<BettingModalProps> = ({ game, user, onClose, onPlaceBet, initialData }) => {
    const [subGameType, setSubGameType] = useState<SubGameType>(SubGameType.TwoDigit);
    const [manualNumbersInput, setManualNumbersInput] = useState('');
    const [manualAmountInput, setManualAmountInput] = useState('');
    const [bulkInput, setBulkInput] = useState('');
    const [comboInput, setComboInput] = useState('');
    const [error, setError] = useState<string | null>(null);

    const availableSubGameTabs = useMemo(() => {
        if (!game) return [];
        if (game.name === 'AK' || game.name === 'LS2') return [SubGameType.OneDigitOpen];
        if (game.name === 'AKC' || game.name === 'LS3') return [SubGameType.OneDigitClose];
        // Allow Bulk game for all 2-digit compatible games
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
        if (availableSubGameTabs.length > 0) {
            setSubGameType(initialData?.subGameType || availableSubGameTabs[0]); 
        }
         if (initialData) {
            const fakeEvent = { target: { value: initialData.number } } as React.ChangeEvent<HTMLTextAreaElement>;
            handleManualNumberChange(fakeEvent);
        }
    }, [availableSubGameTabs, initialData]);

    if (!game) return null;

    const parsedBulkBet = useMemo(() => {
        const result = {
            validNumbers: [] as string[],
            invalidEntries: [] as string[],
            stake: 0,
            totalCost: 0,
            error: null as string | null,
            displayParts: [] as { value: string; isValid: boolean }[],
        };

        const input = bulkInput.trim().toLowerCase();
        if (!input) return result;

        const rIndex = input.lastIndexOf('r');
        if (rIndex === -1) {
            result.error = "Stake not found. Use 'r' to specify amount (e.g., '12 34 r10').";
            result.displayParts.push({ value: input, isValid: false });
            return result;
        }

        const numbersPart = input.substring(0, rIndex).trim();
        const stakePart = input.substring(rIndex + 1).trim();
        const stake = parseFloat(stakePart);

        if (isNaN(stake) || stake <= 0) {
            result.error = "Invalid stake amount. Must be a positive number.";
        } else {
            result.stake = stake;
        }

        if (!numbersPart) {
            result.error = "No numbers entered.";
            return result;
        }

        const entries = numbersPart.split(/[ ,./-]+/).filter(Boolean);
        for (const entry of entries) {
            const isTwoDigitNumber = /^\d{2}$/.test(entry);
            result.displayParts.push({ value: entry, isValid: isTwoDigitNumber });
            if (isTwoDigitNumber) {
                result.validNumbers.push(entry);
            } else {
                result.invalidEntries.push(entry);
            }
        }

        if (result.invalidEntries.length > 0 && !result.error) {
            result.error = `Invalid entries found: ${result.invalidEntries.join(', ')}. Only 2-digit numbers are allowed.`;
        }
        
        result.totalCost = result.validNumbers.length * result.stake;
        return result;
    }, [bulkInput]);

    const parsedComboBet = useMemo(() => {
        const result = {
            generatedNumbers: [] as string[],
            stake: 0,
            totalCost: 0,
            numberOfCombinations: 0,
            error: null as string | null,
            uniqueDigits: [] as string[],
        };

        const input = comboInput.trim().toLowerCase();
        if (!input) return result;

        const rIndex = input.lastIndexOf('r');
        if (rIndex === -1) {
            result.error = "Stake not found. Use 'r' to specify amount (e.g., '147 r10').";
            return result;
        }

        const digitsPartRaw = input.substring(0, rIndex).trim();
        const digitsPart = digitsPartRaw.replace(/\D/g, ''); // Sanitize to allow separators
        const stakePart = input.substring(rIndex + 1).trim();
        const stake = parseFloat(stakePart);

        if (isNaN(stake) || stake <= 0) {
            result.error = "Invalid stake amount. Must be a positive number.";
        } else {
            result.stake = stake;
        }

        if (!digitsPart) {
            result.error = "No digits entered.";
            return result;
        }

        const uniqueDigits = [...new Set(digitsPart.split(''))];
        result.uniqueDigits = uniqueDigits;

        if (uniqueDigits.length < 2) {
            result.error = "Please enter at least two unique digits to form combinations.";
            return result;
        }

        const combinations: string[] = [];
        for (let i = 0; i < uniqueDigits.length; i++) {
            for (let j = 0; j < uniqueDigits.length; j++) {
                if (i !== j) {
                    combinations.push(uniqueDigits[i] + uniqueDigits[j]);
                }
            }
        }

        result.generatedNumbers = combinations;
        result.numberOfCombinations = combinations.length;
        result.totalCost = result.numberOfCombinations * result.stake;
        
        return result;
    }, [comboInput]);
    
    const parsedManualBet = useMemo(() => {
        const result = {
            numbers: [] as string[],
            totalCost: 0,
            error: null as string | null,
            numberCount: 0,
            stake: 0,
        };
        
        const amount = parseFloat(manualAmountInput);
        if (!isNaN(amount) && amount > 0) {
            result.stake = amount;
        }

        const digitsOnly = manualNumbersInput.replace(/\D/g, '');
        let numbers: string[] = [];

        if (digitsOnly.length > 0) {
            switch (subGameType) {
                case SubGameType.OneDigitOpen:
                case SubGameType.OneDigitClose:
                    numbers = digitsOnly.split('');
                    break;
                case SubGameType.TwoDigit:
                    if (digitsOnly.length % 2 !== 0) {
                        result.error = "For 2-digit games, the total number of digits must be even.";
                    } else {
                        numbers = digitsOnly.match(/.{2}/g) || [];
                    }
                    break;
            }
        }

        result.numbers = numbers;
        result.numberCount = numbers.length;
        if (result.stake > 0) {
            result.totalCost = result.numberCount * result.stake;
        }

        return result;
    }, [manualNumbersInput, manualAmountInput, subGameType]);


    const handleBet = () => {
        setError(null);

        if (subGameType === SubGameType.Combo) {
            if (parsedComboBet.error) { setError(parsedComboBet.error); return; }
            if (parsedComboBet.generatedNumbers.length === 0) { setError("No combinations generated."); return; }
            if (parsedComboBet.stake <= 0) { setError("Invalid stake amount."); return; }
            
            const totalCost = parsedComboBet.totalCost;
            if (user.betLimit && totalCost > user.betLimit) { setError(`Bet amount (PKR ${totalCost.toFixed(2)}) exceeds your transaction limit of PKR ${user.betLimit.toFixed(2)}.`); return; }
            if (totalCost > user.wallet) { setError(`Insufficient balance. Required: ${totalCost.toFixed(2)}, Available: ${user.wallet.toFixed(2)}`); return; }
    
            onPlaceBet(subGameType, parsedComboBet.generatedNumbers, parsedComboBet.stake);
            setComboInput('');
            return;
        }

        if (subGameType === SubGameType.Bulk) {
            if (parsedBulkBet.error && parsedBulkBet.validNumbers.length === 0) { setError(parsedBulkBet.error); return; }
            if (parsedBulkBet.invalidEntries.length > 0) { setError(`Please fix invalid entries before placing a bet.`); return; }
            if (parsedBulkBet.validNumbers.length === 0) { setError("No valid numbers to bet on."); return; }
            if (parsedBulkBet.stake <= 0) { setError("Invalid stake amount."); return; }
            
            const totalCost = parsedBulkBet.totalCost;
            if (user.betLimit && totalCost > user.betLimit) { setError(`Bet amount (PKR ${totalCost.toFixed(2)}) exceeds your transaction limit of PKR ${user.betLimit.toFixed(2)}.`); return; }
            if (totalCost > user.wallet) { setError(`Insufficient balance. Required: ${totalCost.toFixed(2)}, Available: ${user.wallet.toFixed(2)}`); return; }

            onPlaceBet(subGameType, parsedBulkBet.validNumbers, parsedBulkBet.stake);
            setBulkInput('');
            return;
        }

        // Manual Bet Logic
        const { numbers, totalCost, error: parseError, stake } = parsedManualBet;
        
        if (stake <= 0) { setError("Please enter a valid amount."); return; }
        if (parseError) { setError(parseError); return; }
        if (numbers.length === 0) { setError("Please enter at least one number."); return; }

        if (user.betLimit && totalCost > user.betLimit) { setError(`Bet amount (PKR ${totalCost.toFixed(2)}) exceeds your transaction limit of PKR ${user.betLimit.toFixed(2)}.`); return; }
        if (totalCost > user.wallet) { setError(`Insufficient balance. Required: ${totalCost.toFixed(2)}, Available: ${user.wallet.toFixed(2)}`); return; }

        onPlaceBet(subGameType, numbers, stake);
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

    const inputClass = "w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none text-white";

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-slate-900/80 rounded-lg shadow-2xl w-full max-w-lg border border-sky-500/30">
                <div className="flex justify-between items-center p-5 border-b border-slate-700">
                    <h3 className="text-xl font-bold text-white uppercase tracking-wider">Play: {game.name}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">{Icons.close}</button>
                </div>
                <div className="p-6">
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
                                <textarea value={bulkInput} onChange={e => setBulkInput(e.target.value)} rows={4} placeholder="e.g., 14, 25, 85, 74, 96 r10" className={inputClass} />
                                <p className="text-xs text-slate-500 mt-1">Enter 2-digit numbers separated by any symbol, followed by 'r' and the stake per number.</p>
                            </div>
                            
                            {parsedBulkBet.displayParts.length > 0 && (
                                <div className="mb-4">
                                    <div className="bg-slate-800 p-3 rounded-md border border-slate-700 min-h-[4rem] flex flex-wrap gap-2">
                                        {parsedBulkBet.displayParts.map((part, index) => (
                                            <span key={index} className={`px-2 py-1 rounded font-mono ${part.isValid ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300 line-through'}`}>
                                                {part.value}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            <div className="text-sm bg-slate-800/50 p-3 rounded-md mb-4 grid grid-cols-3 gap-2 text-center border border-slate-700">
                                <div><p className="text-slate-400 text-xs uppercase">Valid Numbers</p><p className="font-bold text-white text-lg">{parsedBulkBet.validNumbers.length}</p></div>
                                <div><p className="text-slate-400 text-xs uppercase">Stake/Number</p><p className="font-bold text-white text-lg font-mono">{parsedBulkBet.stake.toFixed(2)}</p></div>
                                <div><p className="text-slate-400 text-xs uppercase">Total Cost</p><p className="font-bold text-red-400 text-lg font-mono">{parsedBulkBet.totalCost.toFixed(2)}</p></div>
                            </div>
                        </>
                    ) : subGameType === SubGameType.Combo ? (
                        <>
                             <div className="mb-2">
                                <label className="block text-slate-400 mb-1 text-sm font-medium">Enter Digits for Combo</label>
                                <input 
                                    type="text" 
                                    value={comboInput} 
                                    onChange={e => setComboInput(e.target.value)} 
                                    placeholder="e.g., 1478 r10" 
                                    className={inputClass} 
                                />
                                <p className="text-xs text-slate-500 mt-1">Enter unique digits (separators allowed), followed by 'r' and the stake per combination.</p>
                            </div>
                            
                            {parsedComboBet.generatedNumbers.length > 0 && (
                                <div className="mb-4">
                                    <label className="block text-slate-400 mb-1 text-sm font-medium">Generated Numbers ({parsedComboBet.numberOfCombinations})</label>
                                    <div className="bg-slate-800 p-3 rounded-md border border-slate-700 max-h-32 overflow-y-auto flex flex-wrap gap-2">
                                        {parsedComboBet.generatedNumbers.map((num) => (
                                            <span key={num} className={`px-2 py-1 rounded font-mono text-sm bg-cyan-500/20 text-cyan-300`}>
                                                {num}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            <div className="text-sm bg-slate-800/50 p-3 rounded-md mb-4 grid grid-cols-3 gap-2 text-center border border-slate-700">
                                <div><p className="text-slate-400 text-xs uppercase">Combinations</p><p className="font-bold text-white text-lg">{parsedComboBet.numberOfCombinations}</p></div>
                                <div><p className="text-slate-400 text-xs uppercase">Stake/Combo</p><p className="font-bold text-white text-lg font-mono">{parsedComboBet.stake.toFixed(2)}</p></div>
                                <div><p className="text-slate-400 text-xs uppercase">Total Cost</p><p className="font-bold text-red-400 text-lg font-mono">{parsedComboBet.totalCost.toFixed(2)}</p></div>
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

interface BetConfirmationDetails { gameId: string; gameName: string; subGameType: SubGameType; numbers: string[]; amountPerNumber: number; totalAmount: number; potentialWinnings: number; }

const BetConfirmationPromptModal: React.FC<{ details: BetConfirmationDetails; onConfirm: () => void; onClose: () => void; }> = ({ details, onConfirm, onClose }) => {
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-slate-900/80 rounded-lg shadow-2xl w-full max-w-md border border-sky-500/30">
                <div className="p-6 text-center">
                    <h3 className="text-2xl font-bold text-white mb-4 uppercase tracking-wider">Confirm Bet</h3>
                    <p className="text-slate-400 mb-6">Review details before confirming.</p>

                    <div className="text-left bg-slate-900/50 border border-slate-700 p-4 rounded-lg my-6 space-y-3 text-sm">
                        <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Game:</span><span className="font-bold text-white">{details.gameName} ({details.subGameType})</span></div>
                        <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Numbers:</span><span className="font-mono text-cyan-300 text-right max-w-[60%] truncate" title={details.numbers.join(', ')}>{details.numbers.join(', ')}</span></div>
                         <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Amount/Number:</span><span className="font-mono text-white">{details.amountPerNumber.toFixed(2)} PKR</span></div>
                        <div className="flex justify-between items-center border-t border-slate-700 pt-3 mt-3"><span className="font-medium text-slate-400">Total Cost:</span><span className="font-bold text-lg font-mono text-red-400">{details.totalAmount.toFixed(2)} PKR</span></div>
                        <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Potential Win:</span><span className="font-mono text-emerald-400">{details.potentialWinnings.toFixed(2)} PKR</span></div>
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
                        <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Your Numbers:</span><span className="font-mono text-cyan-300 text-right max-w-[60%] truncate">{details.numbers.join(', ')}</span></div>
                        <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Total Cost:</span><span className="font-mono text-red-400">{details.totalAmount.toFixed(2)} PKR</span></div>
                        <div className="flex justify-between items-center"><span className="font-medium text-slate-400">Potential Win:</span><span className="font-mono text-emerald-400">{details.potentialWinnings.toFixed(2)} PKR</span></div>
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

type AiNumberType = '1 Digit Open' | '1 Digit Close' | '2 Digit';

const AiLuckyPickModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    games: Game[];
    onGetNumber: (prompt: string, gameId: string, numberType: AiNumberType) => void;
    onPlayNumber: (gameId: string, number: string, subGameType: SubGameType) => void;
    isLoading: boolean;
    response: { suggestedNumber: string; explanation: string } | null;
}> = ({ isOpen, onClose, games, onGetNumber, onPlayNumber, isLoading, response }) => {
    const [prompt, setPrompt] = useState('');
    const [gameId, setGameId] = useState<string>(games[0]?.id || '');
    const [numberType, setNumberType] = useState<AiNumberType>('2 Digit');

    useEffect(() => {
        if (!isOpen) {
            setPrompt('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onGetNumber(prompt, gameId, numberType);
    };

    const handlePlay = () => {
        if (response) {
            onPlayNumber(gameId, response.suggestedNumber, numberType as SubGameType);
        }
    };
    
    const inputClass = "w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none text-white";

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-slate-900/80 rounded-lg shadow-2xl w-full max-w-lg border border-sky-500/30">
                <div className="flex justify-between items-center p-5 border-b border-slate-700">
                    <h3 className="text-xl font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        {React.cloneElement(Icons.sparkles, {className: 'w-6 h-6 text-cyan-400'})}
                        AI Lucky Pick
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">{Icons.close}</button>
                </div>
                <div className="p-6">
                    {response ? (
                        <div className="text-center">
                            <p className="text-slate-400 mb-2">The Oracle has spoken...</p>
                            <div className="bg-slate-900/50 border border-cyan-500/20 p-6 rounded-lg my-4">
                                <p className="text-7xl font-mono font-bold text-cyan-300 tracking-wider">{response.suggestedNumber}</p>
                                <p className="text-slate-300 mt-4 italic">"{response.explanation}"</p>
                            </div>
                            <div className="flex justify-end space-x-4 pt-2">
                                <button onClick={onClose} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2.5 px-6 rounded-md transition-colors">Close</button>
                                <button onClick={handlePlay} className="bg-sky-600 hover:bg-sky-500 text-white font-bold py-2.5 px-6 rounded-md transition-colors">Play this Number</button>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                             <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">What's on your mind?</label>
                                <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} placeholder="e.g., I dreamed of a white horse" className={inputClass} required />
                            </div>
                             <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">For Game</label>
                                    <select value={gameId} onChange={e => setGameId(e.target.value)} className={inputClass}>
                                        {games.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">Number Type</label>
                                     <select value={numberType} onChange={e => setNumberType(e.target.value as AiNumberType)} className={inputClass}>
                                        <option value="2 Digit">2 Digit</option>
                                        <option value="1 Digit Open">1 Digit Open</option>
                                        <option value="1 Digit Close">1 Digit Close</option>
                                    </select>
                                </div>
                            </div>
                             <div className="flex justify-end pt-2">
                                <button type="submit" disabled={isLoading} className="bg-sky-600 hover:bg-sky-500 text-white font-bold py-2.5 px-6 rounded-md transition-colors disabled:bg-slate-600 disabled:cursor-wait">
                                    {isLoading ? 'Consulting the Oracle...' : 'Get Lucky Number'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};


interface UserPanelProps {
  user: User; games: Game[]; bets: Bet[];
  placeBet: (userId: string, gameId: string, subGameType: SubGameType, numbers: string[], amountPerNumber: number) => void;
}

const getPrizeRateForBet = (subGameType: SubGameType, prizeRates: PrizeRates) => {
    switch(subGameType) {
        case SubGameType.OneDigitOpen: return prizeRates.oneDigitOpen;
        case SubGameType.OneDigitClose: return prizeRates.oneDigitClose;
        default: return prizeRates.twoDigit;
    }
};

const UserPanel: React.FC<UserPanelProps> = ({ user, games, bets, placeBet }) => {
  const { fetchWithAuth } = useAuth();
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [betConfirmation, setBetConfirmation] = useState<BetConfirmationDetails | null>(null);
  const [betToConfirm, setBetToConfirm] = useState<BetConfirmationDetails | null>(null);

  // AI Lucky Pick State
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiIsLoading, setAiIsLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<{ suggestedNumber: string; explanation: string } | null>(null);
  const [initialBetData, setInitialBetData] = useState<{ number: string; subGameType: SubGameType } | null>(null);
  
  const userBets = bets.filter(b => b.userId === user.id);

  const handleReviewBet = (subGameType: SubGameType, numbers: string[], amountPerNumber: number) => {
    if (selectedGame) {
      const totalAmount = numbers.length * amountPerNumber;
      const prizeRate = getPrizeRateForBet(subGameType, user.prizeRates);
      setBetToConfirm({ gameId: selectedGame.id, gameName: selectedGame.name, subGameType, numbers, amountPerNumber, totalAmount, potentialWinnings: amountPerNumber * prizeRate });
      setSelectedGame(null);
    }
  };
  
  const handleConfirmBet = () => {
    if (betToConfirm) {
        placeBet(user.id, betToConfirm.gameId, betToConfirm.subGameType, betToConfirm.numbers, betToConfirm.amountPerNumber);
        setBetConfirmation(betToConfirm);
        setBetToConfirm(null);
    }
  };

  const handleGetLuckyNumber = async (userPrompt: string, gameId: string, numberType: AiNumberType) => {
    setAiIsLoading(true);
    setAiResponse(null);
    try {
        const game = games.find(g => g.id === gameId);
        const response = await fetchWithAuth('/api/ai/lucky-number', {
            method: 'POST',
            body: JSON.stringify({ userPrompt, gameName: game?.name, numberType }),
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || 'Failed to get lucky number');
        }
        const data = await response.json();
        setAiResponse(data);
    } catch (error: any) {
        alert(`Oracle Error: ${error.message}`);
    } finally {
        setAiIsLoading(false);
    }
  };

  const handlePlayLuckyNumber = (gameId: string, number: string, subGameType: SubGameType) => {
    const gameToPlay = games.find(g => g.id === gameId);
    if (!gameToPlay) return;

    setInitialBetData({ number, subGameType });
    setSelectedGame(gameToPlay);
    setIsAiModalOpen(false);
    setAiResponse(null);
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
            <div className="bg-slate-900/50 p-3 rounded-md text-center flex-1 border border-slate-700 flex flex-col justify-center">
                <p className="text-xs text-slate-400 uppercase">Bet Limit</p>
                <p className="font-mono font-bold text-lg text-cyan-400">{user.betLimit ? `PKR ${user.betLimit.toLocaleString()}` : 'No Limit'}</p>
            </div>
        </div>
      </div>
       {user.isRestricted && (
          <div className="bg-red-500/20 border border-red-500/30 text-red-300 p-4 rounded-lg mb-8 text-center" role="alert">
              <p className="font-bold text-lg">Your account is restricted.</p>
              <p>You cannot place bets at this time. Please contact your dealer for assistance.</p>
          </div>
      )}

      <div className="relative p-6 rounded-lg mb-8 bg-slate-800/50 border border-slate-700 text-center overflow-hidden">
          <div className="absolute -inset-1 bg-gradient-to-r from-sky-600 via-purple-500 to-cyan-500 rounded-lg blur opacity-25"></div>
          <div className="relative z-10">
              <h3 className="text-2xl font-bold text-white uppercase tracking-widest mb-2 flex items-center justify-center gap-3">
                {React.cloneElement(Icons.sparkles, {className: "w-6 h-6 text-cyan-300"})}
                AI Lucky Pick Assistant
              </h3>
              <p className="text-slate-400 mb-4 max-w-2xl mx-auto">Need inspiration? Ask our Gemini-powered oracle for a lucky number based on your dreams or feelings!</p>
              <button onClick={() => setIsAiModalOpen(true)} className="bg-sky-600 hover:bg-sky-500 text-white font-bold py-2.5 px-6 rounded-md transition-all duration-300 transform hover:scale-105 shadow-lg shadow-sky-500/30">
                  Ask Gemini
              </button>
          </div>
      </div>


      <h2 className="text-3xl font-bold text-sky-400 mb-6 uppercase tracking-widest">Available Games</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {games.map(game => (
          <GameCard key={game.id} game={game} onPlay={setSelectedGame} isRestricted={user.isRestricted} />
        ))}
      </div>
      
      <PrizeRatesView rates={user.prizeRates} />
      <BetHistoryView bets={userBets} games={games} user={user} />
      <LedgerView entries={user.ledger} />
      
      {selectedGame && <BettingModal game={selectedGame} user={user} onClose={() => { setSelectedGame(null); setInitialBetData(null); }} onPlaceBet={handleReviewBet} initialData={initialBetData} />}
      {betToConfirm && <BetConfirmationPromptModal details={betToConfirm} onConfirm={handleConfirmBet} onClose={() => setBetToConfirm(null)} />}
      {betConfirmation && <BetConfirmationModal details={betConfirmation} onClose={() => setBetConfirmation(null)} />}
      <AiLuckyPickModal isOpen={isAiModalOpen} onClose={() => {setIsAiModalOpen(false); setAiResponse(null);}} games={games} onGetNumber={handleGetLuckyNumber} onPlayNumber={handlePlayLuckyNumber} isLoading={aiIsLoading} response={aiResponse} />
    </div>
  );
};

export default UserPanel;