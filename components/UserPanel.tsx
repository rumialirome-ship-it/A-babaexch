
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, Game, SubGameType, LedgerEntry, Bet, PrizeRates, BetLimits } from '../types';
import { Icons } from '../constants';
import { useCountdown } from '../hooks/useCountdown';
import { useAuth } from '../hooks/useAuth';

const getTodayDateString = () => new Date().toISOString().split('T')[0];

const formatTime12h = (time24: string) => {
    const [hours, minutes] = time24.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
};

const SummaryCard: React.FC<{ title: string; value: number; color: string }> = ({ title, value, color }) => (
    <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
        <p className="text-sm text-slate-400 uppercase tracking-wider">{title}</p>
        <p className={`text-3xl font-bold font-mono mt-1 ${color}`}>{value.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
    </div>
);

// Defined the missing interface to fix the error on line 24
interface BettingModalProps {
    game: Game | null;
    games: Game[];
    user: User;
    onClose: () => void;
    onPlaceBet: (details: { gameId: string; betGroups: { subGameType: SubGameType; numbers: string[]; amountPerNumber: number }[] }) => void;
    apiError: string | null;
    clearApiError: () => void;
}

const BettingModal: React.FC<BettingModalProps> = ({ game, games, user, onClose, onPlaceBet, apiError, clearApiError }) => {
    const { fetchWithAuth } = useAuth();
    const [subGameType, setSubGameType] = useState<SubGameType>(SubGameType.TwoDigit);
    const [manualNumbersInput, setManualNumbersInput] = useState('');
    const [manualAmountInput, setManualAmountInput] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [aiLoading, setAiLoading] = useState(false);

    // --- AI Lucky Pick Logic ---
    const handleAiLuckyPick = async () => {
        setAiLoading(true);
        setError(null);
        try {
            const typeParam = (subGameType === SubGameType.OneDigitOpen || subGameType === SubGameType.OneDigitClose) ? '1-digit' : '2-digit';
            const response = await fetchWithAuth(`/api/user/ai-lucky-pick?type=${typeParam}&gameName=${encodeURIComponent(game!.name)}`);
            const data = await response.json();
            if (data.numbers) {
                setManualNumbersInput(data.numbers.join(', '));
            } else {
                throw new Error("AI could not find lucky numbers.");
            }
        } catch (err) {
            setError("AI Numerology failed. Try again in a moment.");
        } finally {
            setAiLoading(false);
        }
    };

    const availableSubGameTabs = useMemo(() => {
        if (!game) return [];
        if (game.name === 'AK') return [SubGameType.TwoDigit, SubGameType.OneDigitOpen, SubGameType.Bulk, SubGameType.Combo];
        if (game.name === 'AKC') return [SubGameType.OneDigitClose];
        return [SubGameType.TwoDigit, SubGameType.OneDigitOpen, SubGameType.OneDigitClose, SubGameType.Bulk, SubGameType.Combo];
    }, [game]);

    const handleManualNumberChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const rawValue = e.target.value;
        const digitsOnly = rawValue.replace(/\D/g, '');
        if (digitsOnly === '') { setManualNumbersInput(''); return; }
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

    const parsedManualBet = useMemo(() => {
        const result = { numbers: [] as string[], totalCost: 0, error: null as string | null, numberCount: 0, stake: 0 };
        const amount = parseFloat(manualAmountInput);
        if (!isNaN(amount) && amount > 0) result.stake = amount;
        const digitsOnly = manualNumbersInput.replace(/\D/g, '');
        let numbers: string[] = [];
        if (digitsOnly.length > 0) {
            switch (subGameType) {
                case SubGameType.OneDigitOpen: case SubGameType.OneDigitClose: numbers = digitsOnly.split(''); break;
                case SubGameType.TwoDigit:
                    if (digitsOnly.length % 2 !== 0) result.error = "Total digits must be even."; 
                    else numbers = digitsOnly.match(/.{2}/g) || [];
                    break;
            }
        }
        result.numbers = [...new Set(numbers)];
        result.numberCount = result.numbers.length;
        if (result.stake > 0) result.totalCost = result.numberCount * result.stake;
        return result;
    }, [manualNumbersInput, manualAmountInput, subGameType]);

    const handleBet = () => {
        setError(null);
        const { numbers, totalCost, error: parseError, stake } = parsedManualBet;
        if (stake <= 0) { setError("Please enter a valid amount."); return; }
        if (parseError) { setError(parseError); return; }
        if (numbers.length === 0) { setError("Please enter at least one number."); return; }
        if (totalCost > user.wallet) { setError(`Insufficient balance. Required: ${totalCost.toFixed(2)}, Available: ${user.wallet.toFixed(2)}`); return; }
        onPlaceBet({ gameId: game!.id, betGroups: [{ subGameType, numbers, amountPerNumber: stake }] });
    };

    const inputClass = "w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none text-white font-mono";

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-slate-900/80 rounded-lg shadow-2xl w-full max-w-lg border border-sky-500/30 flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-5 border-b border-slate-700 flex-shrink-0">
                    <h3 className="text-xl font-bold text-white uppercase tracking-wider">Play: {game!.name}</h3>
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
                    
                    <div className="mb-4">
                        <div className="flex justify-between items-end mb-1">
                            <label className="block text-slate-400 text-sm font-medium">Enter Number(s)</label>
                            {subGameType !== SubGameType.Bulk && subGameType !== SubGameType.Combo && (
                                <button 
                                    onClick={handleAiLuckyPick}
                                    disabled={aiLoading}
                                    className="text-xs bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 px-2 py-1 rounded border border-sky-500/20 transition-all flex items-center gap-1 disabled:opacity-50"
                                >
                                    {aiLoading ? 'Magic in progress...' : '✨ AI Lucky Pick'}
                                </button>
                            )}
                        </div>
                        <textarea value={manualNumbersInput} onChange={handleManualNumberChange} rows={3} placeholder="e.g. 14, 05, 78" className={inputClass} />
                    </div>
                    <div className="mb-4">
                        <label className="block text-slate-400 mb-1 text-sm font-medium">Amount per Number</label>
                        <input type="number" value={manualAmountInput} onChange={e => setManualAmountInput(e.target.value)} placeholder="e.g. 10" className={inputClass} />
                    </div>

                    <div className="text-sm bg-slate-800/50 p-3 rounded-md my-4 flex justify-around border border-slate-700">
                        <p className="text-slate-300">Numbers: <span className="font-bold text-white">{parsedManualBet.numberCount}</span></p>
                        <p className="text-slate-300">Cost: <span className="font-bold text-red-400">{parsedManualBet.totalCost.toFixed(2)}</span></p>
                    </div>

                    {(apiError || error) && (
                        <div className="bg-red-500/20 border border-red-500/30 text-red-300 text-sm p-3 rounded-md mb-4">
                            {apiError || error}
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

interface UserPanelProps {
    user: User;
    games: Game[];
    bets: Bet[];
    placeBet: (details: { userId: string; gameId: string; betGroups: any[] }) => Promise<void>;
}

const UserPanel: React.FC<UserPanelProps> = ({ user, games, bets, placeBet }) => {
    const [activeTab, setActiveTab] = useState('games');
    const [selectedGame, setSelectedGame] = useState<Game | null>(null);
    const [apiError, setApiError] = useState<string | null>(null);

    const handlePlaceBet = async (details: any) => {
        setApiError(null);
        try {
            await placeBet({ ...details, userId: user.id });
            setSelectedGame(null);
        } catch (err: any) {
            setApiError(err.message);
        }
    };

    return (
        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
            <h2 className="text-3xl font-bold text-sky-400 mb-6 uppercase tracking-widest">User Dashboard</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                <SummaryCard title="Wallet Balance" value={user.wallet} color="text-sky-400" />
                <SummaryCard title="Total Bets" value={bets.length} color="text-white" />
                <SummaryCard title="Recent Payout" value={0} color="text-emerald-400" />
            </div>

            <div className="bg-slate-800/50 p-1.5 rounded-lg flex items-center space-x-2 mb-6 self-start flex-wrap border border-slate-700">
                <button 
                    onClick={() => setActiveTab('games')} 
                    className={`py-2 px-4 text-sm font-semibold rounded-md transition-all duration-300 ${activeTab === 'games' ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}
                >
                    Games
                </button>
                <button 
                    onClick={() => setActiveTab('ledger')} 
                    className={`py-2 px-4 text-sm font-semibold rounded-md transition-all duration-300 ${activeTab === 'ledger' ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}
                >
                    Ledger
                </button>
            </div>

            {activeTab === 'games' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {games.map(game => (
                        <div key={game.id} className="bg-slate-800/50 p-6 rounded-lg border border-slate-700 flex flex-col items-center text-center">
                            <h3 className="text-xl font-bold text-white mb-2">{game.name}</h3>
                            <p className="text-slate-400 text-sm mb-4">Draw @ {formatTime12h(game.drawTime)}</p>
                            <button 
                                onClick={() => setSelectedGame(game)}
                                disabled={!!game.winningNumber}
                                className={`w-full py-2 px-4 rounded-md font-bold transition-all ${game.winningNumber ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-sky-600 hover:bg-sky-500 text-white'}`}
                            >
                                {game.winningNumber ? 'MARKET CLOSED' : 'PLAY NOW'}
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {activeTab === 'ledger' && (
                <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left min-w-[600px]">
                            <thead className="bg-slate-800/50">
                                <tr>
                                    <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                                    <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Description</th>
                                    <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Debit</th>
                                    <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Credit</th>
                                    <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Balance</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {user.ledger.slice().reverse().map(entry => (
                                    <tr key={entry.id} className="hover:bg-sky-500/10 transition-colors">
                                        <td className="p-4 text-sm text-slate-400 whitespace-nowrap">{entry.timestamp.toLocaleString()}</td>
                                        <td className="p-4 text-white">{entry.description}</td>
                                        <td className="p-4 text-right text-red-400 font-mono">{entry.debit > 0 ? entry.debit.toFixed(2) : '-'}</td>
                                        <td className="p-4 text-right text-green-400 font-mono">{entry.credit > 0 ? entry.credit.toFixed(2) : '-'}</td>
                                        <td className="p-4 text-right font-semibold text-white font-mono">{entry.balance.toFixed(2)}</td>
                                    </tr>
                                ))}
                                {user.ledger.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-slate-500">No ledger entries found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {selectedGame && (
                <BettingModal 
                    game={selectedGame} 
                    games={games} 
                    user={user} 
                    onClose={() => setSelectedGame(null)} 
                    onPlaceBet={handlePlaceBet}
                    apiError={apiError}
                    clearApiError={() => setApiError(null)}
                />
            )}
        </div>
    );
};

// Fixed error in App.tsx by adding default export
export default UserPanel;
