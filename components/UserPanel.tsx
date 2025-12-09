import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, Game, SubGameType, LedgerEntry, Bet, DailyResult, LedgerEntryType } from '../types';
import { Icons, GAME_LOGOS } from '../constants';
import { useCountdown } from '../hooks/useCountdown';
import { useAuth } from '../hooks/useAuth';
import './UserPanel.css';

// --- STABLE, TOP-LEVEL COMPONENT DEFINITIONS ---
const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: 'md' | 'lg' | 'xl'; themeColor?: string }> = ({ isOpen, onClose, title, children, size = 'md', themeColor = 'sky' }) => {
    if (!isOpen) return null;
    const sizeClasses: Record<string, string> = { md: 'max-w-md', lg: 'max-w-3xl', xl: 'max-w-5xl' };
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className={`bg-slate-900/80 rounded-lg shadow-2xl w-full border border-${themeColor}-500/30 ${sizeClasses[size]} flex flex-col max-h-[90vh]`}>
                <div className="flex justify-between items-center p-5 border-b border-slate-700 flex-shrink-0">
                    <h3 className={`text-lg font-bold text-${themeColor}-400 uppercase tracking-widest`}>{title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">{Icons.close}</button>
                </div>
                <div className="p-6 overflow-auto">{children}</div>
            </div>
        </div>
    );
};

const SuccessModal: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => (
    <Modal isOpen={true} onClose={onClose} title="Success" size="md">
        <div className="text-center p-4">
            <div className="mx-auto mb-4">
                <svg className="animated-check" viewBox="0 0 52 52">
                    <circle className="animated-check__circle" cx="26" cy="26" r="25" fill="none" />
                    <path className="animated-check__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
                </svg>
            </div>
            <p className="text-lg text-white font-semibold">{message}</p>
            <button onClick={onClose} className="mt-6 bg-sky-600 hover:bg-sky-500 text-white font-bold py-2 px-6 rounded-md transition-colors">
                OK
            </button>
        </div>
    </Modal>
);

// --- LEDGER COMPONENT (PAGINATED) ---
const SummaryCard: React.FC<{ title: string; value: number; color: string; icon: React.ReactElement<any> }> = ({ title, value, color, icon }) => (
    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 flex items-center gap-4">
        <div className={`p-3 rounded-full bg-${color}-500/20 text-${color}-400`}>
            {React.cloneElement(icon, { className: 'h-6 w-6' })}
        </div>
        <div>
            <p className="text-sm text-slate-400 uppercase tracking-wider">{title}</p>
            <p className={`text-2xl font-bold font-mono text-white`}>{value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
    </div>
);

const ProfessionalLedgerView: React.FC<{ accountId: string, accountType: 'user' | 'dealer' | 'admin', themeColor?: string }> = ({ accountId, accountType, themeColor = 'sky' }) => {
    const [entries, setEntries] = useState<LedgerEntry[]>([]);
    const [totalEntries, setTotalEntries] = useState(0);
    const [summary, setSummary] = useState({ totalDebit: 0, totalCredit: 0, totalBets: 0, totalWinnings: 0, totalCommission: 0 });

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { fetchWithAuth } = useAuth();
    
    const [datePreset, setDatePreset] = useState<'today' | 'week' | 'month' | 'all'>('today');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ENTRIES_PER_PAGE = 25;

    useEffect(() => {
        const fetchLedger = async () => {
            if (!accountId) return;
            setIsLoading(true);
            setError(null);
            
            const params = new URLSearchParams({ page: String(currentPage), limit: String(ENTRIES_PER_PAGE) });
            const now = new Date();
            let finalStartDate: Date | null = null;
            let finalEndDate: Date | null = new Date();
            
            switch(datePreset) {
                case 'today': finalStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break;
                case 'week': finalStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()); break;
                case 'month': finalStartDate = new Date(now.getFullYear(), now.getMonth(), 1); break;
                case 'all': finalStartDate = null; finalEndDate = null; break;
            }

            if (customStartDate) {
                finalStartDate = new Date(customStartDate);
                finalStartDate.setHours(0,0,0,0);
            }
            if (customEndDate) {
                finalEndDate = new Date(customEndDate);
                finalEndDate.setHours(23, 59, 59, 999);
            }

            if (finalStartDate) params.append('startDate', finalStartDate.toISOString().split('T')[0]);
            if (finalEndDate) params.append('endDate', finalEndDate.toISOString().split('T')[0]);
            if (searchQuery) params.append('searchQuery', searchQuery);

            try {
                const response = await fetchWithAuth(`/api/ledger/${accountType}/${accountId}?${params.toString()}`);
                if (!response.ok) throw new Error('Failed to fetch ledger data.');
                const data = await response.json();
                
                setEntries(data.entries.map((e: any) => ({ ...e, timestamp: new Date(e.timestamp) })));
                setTotalEntries(data.totalCount);
                setSummary(data.summary);

            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        
        const debounceFetch = setTimeout(fetchLedger, 300);
        return () => clearTimeout(debounceFetch);

    }, [accountId, accountType, fetchWithAuth, currentPage, datePreset, customStartDate, customEndDate, searchQuery]);
    
    const totalPages = Math.ceil(totalEntries / ENTRIES_PER_PAGE);
    const handlePresetChange = (preset: 'today' | 'week' | 'month' | 'all') => {
        setDatePreset(preset); setCustomStartDate(''); setCustomEndDate(''); setCurrentPage(1);
    }
    
    const entryTypeIcons: Record<LedgerEntryType, React.ReactElement> = {
        [LedgerEntryType.InitialDeposit]: Icons.initialDeposit, [LedgerEntryType.Deposit]: Icons.deposit, [LedgerEntryType.Withdrawal]: Icons.withdrawal, [LedgerEntryType.BetPlaced]: Icons.betPlaced, [LedgerEntryType.WinPayout]: Icons.winPayout, [LedgerEntryType.CommissionPayout]: Icons.commission, [LedgerEntryType.DealerProfit]: Icons.commission, [LedgerEntryType.AdminAdjustment]: Icons.adjustment,
    };
    const inputClass = "w-full bg-slate-800 p-2 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none text-white";
    const displaySummary = isLoading ? { totalCredit: 0, totalDebit: 0, totalBets: 0, totalWinnings: 0, totalCommission: 0 } : summary;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <SummaryCard title="Total Credit" value={displaySummary.totalCredit} color="green" icon={Icons.deposit} />
                <SummaryCard title="Total Debit" value={displaySummary.totalDebit} color="red" icon={Icons.withdrawal} />
                <SummaryCard title="Total Bets" value={displaySummary.totalBets} color="amber" icon={Icons.betPlaced} />
                <SummaryCard title="Total Earnings" value={displaySummary.totalWinnings + displaySummary.totalCommission} color="sky" icon={Icons.winPayout} />
            </div>
            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 flex flex-col md:flex-row gap-4 items-center flex-wrap">
                <div className="flex items-center space-x-2 flex-wrap gap-2">
                    {(['today', 'week', 'month', 'all'] as const).map(p => (
                        <button key={p} onClick={() => handlePresetChange(p)} className={`py-2 px-4 text-sm font-semibold rounded-md transition-all duration-300 capitalize ${datePreset === p && !customStartDate ? `bg-slate-700 text-${themeColor}-400 shadow-lg` : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'}`}>{p}</button>
                    ))}
                </div>
                <div className="flex-grow"></div>
                <div className="flex items-center gap-4 flex-wrap md:justify-end">
                    <div className="relative"><span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">{Icons.search}</span><input type="text" placeholder="Search..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }} className={`${inputClass} pl-10 text-sm w-full sm:w-48`}/></div>
                    <div className="flex items-center gap-2"><input type="date" value={customStartDate} onChange={e => { setCustomStartDate(e.target.value); setDatePreset('all'); setCurrentPage(1); }} className={`${inputClass} text-sm`} /><span className="text-slate-400">to</span><input type="date" value={customEndDate} onChange={e => { setCustomEndDate(e.target.value); setDatePreset('all'); setCurrentPage(1); }} className={`${inputClass} text-sm`} /></div>
                </div>
            </div>
            <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                <div className="overflow-auto min-h-[300px] mobile-scroll-x"><table className="w-full text-left min-w-[700px]"><thead className="bg-slate-800/50 sticky top-0 backdrop-blur-sm"><tr><th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date & Time</th><th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</th><th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Description</th><th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Debit</th><th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Credit</th><th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Balance</th></tr></thead><tbody className="divide-y divide-slate-800">{isLoading ? (<tr><td colSpan={6} className="p-8 text-center text-slate-500">Loading entries...</td></tr>) : error ? (<tr><td colSpan={6} className="p-8 text-center text-red-400">{error}</td></tr>) : entries.length === 0 ? (<tr><td colSpan={6} className="p-8 text-center text-slate-500">No entries found.</td></tr>) : (entries.map(entry => (<tr key={entry.id} className={`hover:bg-${themeColor}-500/10 text-sm transition-colors`}><td className="p-3 text-slate-400 whitespace-nowrap">{entry.timestamp.toLocaleString()}</td><td className="p-3"><div className="flex items-center gap-2" title={entry.type.replace(/_/g, ' ')}><span className={`text-${themeColor}-400`}>{entryTypeIcons[entry.type] || Icons.adjustment}</span><span className="text-slate-300 text-xs hidden sm:inline capitalize">{entry.type.replace(/_/g, ' ').toLowerCase()}</span></div></td><td className="p-3 text-white">{entry.description}</td><td className="p-3 text-right text-red-400 font-mono">{entry.debit > 0 ? entry.debit.toFixed(2) : '-'}</td><td className="p-3 text-right text-green-400 font-mono">{entry.credit > 0 ? entry.credit.toFixed(2) : '-'}</td><td className="p-3 text-right font-semibold text-white font-mono">{entry.balance.toFixed(2)}</td></tr>)))}</tbody></table></div>
                <div className="p-4 bg-slate-800/50 border-t border-slate-700 flex justify-between items-center text-sm"><p className="text-slate-400">Showing <span className="font-semibold text-white">{totalEntries > 0 ? (currentPage - 1) * ENTRIES_PER_PAGE + 1 : 0}-{Math.min(currentPage * ENTRIES_PER_PAGE, totalEntries)}</span> of <span className="font-semibold text-white">{totalEntries}</span> entries</p><div className="flex gap-2"><button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1} className="bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold py-1.5 px-3 rounded-md transition-colors text-xs">Previous</button><button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage >= totalPages} className="bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold py-1.5 px-3 rounded-md transition-colors text-xs">Next</button></div></div>
            </div>
        </div>
    );
};


// --- GAME SELECTION & BETTING COMPONENTS ---

const GameCard: React.FC<{ game: Game; onClick: () => void }> = ({ game, onClick }) => {
    const { text: countdownText } = useCountdown(game.drawTime);
    const hasWinner = !!game.winningNumber;
    const isMarketClosedForDisplay = !game.isMarketOpen;
    const themeColor = hasWinner && isMarketClosedForDisplay ? 'emerald' : 'cyan';
    const logo = GAME_LOGOS[game.name] || '';

    return (
        <button
            onClick={onClick}
            disabled={!game.isMarketOpen}
            className={`relative group bg-slate-800/50 p-6 flex flex-col items-center justify-between text-center transition-all duration-300 ease-in-out border border-slate-700 w-full overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-${themeColor}-500`}
            style={{ clipPath: 'polygon(0 15px, 15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%)' }}
        >
            <div className="relative z-10 w-full flex flex-col h-full">
                <div className="flex-grow"><img src={logo} alt={`${game.name} logo`} className="w-24 h-24 rounded-full mx-auto mb-4 border-4 border-slate-700 group-hover:border-sky-400 transition-colors" /><h3 className="text-2xl text-white mb-1 uppercase tracking-wider">{game.name}</h3></div>
                <div className={`text-center w-full p-2 mt-4 bg-black/30 border-t border-${themeColor}-400/20`}>
                    {hasWinner && isMarketClosedForDisplay ? (<><div className="text-xs uppercase tracking-widest text-slate-400">WINNER</div><div className="text-4xl font-mono font-bold text-emerald-300">{game.winningNumber}</div></>)
                    : !game.isMarketOpen ? (<><div className="text-xs uppercase tracking-widest text-slate-400">STATUS</div><div className="text-2xl font-mono font-bold text-red-400">MARKET CLOSED</div></>)
                    : (<><div className="text-xs uppercase tracking-widest text-slate-400">CLOSES IN</div><div className="text-3xl font-mono font-bold text-sky-300">{countdownText}</div></>)}
                </div>
            </div>
        </button>
    );
};

const GameSelectionView: React.FC<{ games: Game[]; onSelect: (game: Game) => void }> = ({ games, onSelect }) => (
    <div>
        <h3 className="text-xl font-semibold text-white mb-4">Select a Game to Play</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8">
            {games.map(game => (<GameCard key={game.id} game={game} onClick={() => onSelect(game)} />))}
        </div>
    </div>
);

const BettingInterface: React.FC<{ game: Game; user: User; placeBet: (details: any) => Promise<void>; onClose: () => void }> = ({ game, user, placeBet, onClose }) => {
    const betTypes = [SubGameType.TwoDigit, SubGameType.OneDigitOpen, SubGameType.OneDigitClose];
    const [activeBetType, setActiveBetType] = useState<SubGameType>(betTypes[0]);
    const [betInputs, setBetInputs] = useState<Record<SubGameType, { numbers: string, amount: string }>>({
        [SubGameType.TwoDigit]: { numbers: '', amount: '' }, [SubGameType.OneDigitOpen]: { numbers: '', amount: '' }, [SubGameType.OneDigitClose]: { numbers: '', amount: '' },
        [SubGameType.Bulk]: { numbers: '', amount: '' }, [SubGameType.Combo]: { numbers: '', amount: '' }
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const { fetchWithAuth } = useAuth();
    
    const handleInputChange = (subGameType: SubGameType, field: 'numbers' | 'amount', value: string) => {
        if (field === 'amount') {
            const sanitizedValue = value.replace(/[^0-9.]/g, '');
            setBetInputs(prev => ({ ...prev, [subGameType]: { ...prev[subGameType], [field]: sanitizedValue } }));
            return;
        }
    
        if (field === 'numbers') {
            const isTwoDigit = subGameType === SubGameType.TwoDigit;
            const chunkSize = isTwoDigit ? 2 : 1;
            const digitsOnly = value.replace(/\D/g, '');
    
            if (digitsOnly.length > 0) {
                const chunks = [];
                for (let i = 0; i < digitsOnly.length; i += chunkSize) {
                    chunks.push(digitsOnly.substring(i, i + chunkSize));
                }
                const formattedValue = chunks.join(',');
                setBetInputs(prev => ({ ...prev, [subGameType]: { ...prev[subGameType], [field]: formattedValue } }));
            } else {
                setBetInputs(prev => ({ ...prev, [subGameType]: { ...prev[subGameType], [field]: '' } }));
            }
        }
    };

    const getLuckyPicks = async () => {
        setIsLoading(true);
        try {
            const response = await fetchWithAuth('/api/ai/lucky-pick', { method: 'POST', body: JSON.stringify({ gameName: game.name, count: 5 }) });
            if (!response.ok) throw new Error("Failed to get lucky picks.");
            const { luckyNumbers } = await response.json();
            handleInputChange(activeBetType, 'numbers', luckyNumbers.join(''));
        } catch (err: any) { setError(err.message); } 
        finally { setIsLoading(false); }
    };

    const betSummary = useMemo(() => {
        let totalCost = 0; let totalNumbers = 0;
        for (const type of betTypes) {
            const { numbers, amount } = betInputs[type];
            if (amount && Number(amount) > 0) {
                const numberList = numbers.trim().split(/[\s,]+/).filter(Boolean);
                totalNumbers += numberList.length;
                totalCost += numberList.length * Number(amount);
            }
        }
        return { totalCost, totalNumbers };
    }, [betInputs, betTypes]);
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (betSummary.totalCost <= 0) { setError("Please enter numbers and an amount to bet."); return; }
        if (betSummary.totalCost > user.wallet) { setError("Insufficient wallet balance."); return; }

        const betGroups = betTypes.map(type => {
            const { numbers, amount } = betInputs[type];
            const numberList = numbers.trim().split(/[\s,]+/).filter(Boolean);
            return { subGameType: type, numbers: numberList, amountPerNumber: Number(amount) };
        }).filter(group => group.numbers.length > 0 && group.amountPerNumber > 0);

        if (betGroups.length === 0) { setError("No valid bets to place."); return; }
        
        setIsLoading(true);
        try {
            await placeBet({ userId: user.id, gameId: game.id, betGroups });
            setSuccess(`Your bet for ${game.name} has been placed successfully!`);
        } catch (err: any) { setError(err.message); } 
        finally { setIsLoading(false); }
    };

    if (success) { return <SuccessModal message={success} onClose={() => { setSuccess(null); onClose(); }} />; }

    const inputClass = "w-full bg-slate-900/50 p-3 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none text-white";

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-white">Place Bet for <span className="text-sky-400">{game.name}</span></h3>
                <button onClick={onClose} className="text-slate-400 hover:text-white">&larr; Back to Games</button>
            </div>
            <form onSubmit={handleSubmit} className="bg-slate-800/50 rounded-lg border border-slate-700 p-6 space-y-6">
                <div className="flex items-center space-x-2 bg-slate-800 p-1 rounded-lg">
                    {betTypes.map(type => <button key={type} type="button" onClick={() => setActiveBetType(type)} className={`flex-1 py-2 px-4 text-sm font-semibold rounded-md transition-all duration-300 ${activeBetType === type ? 'bg-slate-700 text-sky-400' : 'text-slate-400 hover:bg-slate-600'}`}>{type}</button>)}
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Numbers</label>
                    <textarea value={betInputs[activeBetType].numbers} onChange={e => handleInputChange(activeBetType, 'numbers', e.target.value)} rows={3} className={inputClass} placeholder={`Enter ${activeBetType === SubGameType.TwoDigit ? '2-digit' : '1-digit'} numbers (e.g. 12,34,56)`} />
                    <div className="flex justify-end mt-2">
                        <button type="button" onClick={getLuckyPicks} disabled={isLoading} className="flex items-center text-sm bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 font-semibold py-1 px-3 rounded-md transition-colors disabled:opacity-50">
                            {Icons.sparkles} AI Lucky Pick
                        </button>
                    </div>
                </div>
                <div><label className="block text-sm font-medium text-slate-400 mb-1">Amount Per Number (PKR)</label><input type="number" value={betInputs[activeBetType].amount} onChange={e => handleInputChange(activeBetType, 'amount', e.target.value)} className={inputClass} placeholder="e.g., 10" /></div>
                
                <div className="border-t border-slate-700 pt-4 space-y-2 text-white">
                    <div className="flex justify-between"><span className="text-slate-400">Total Numbers:</span><span className="font-mono">{betSummary.totalNumbers}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Total Cost:</span><span className="font-mono font-bold text-lg">{betSummary.totalCost.toFixed(2)} PKR</span></div>
                    <div className="flex justify-between text-sm"><span className="text-slate-400">Your Wallet:</span><span className="font-mono">{user.wallet.toFixed(2)} PKR</span></div>
                </div>
                {error && <div className="bg-red-500/20 text-red-300 p-3 rounded-md text-sm">{error}</div>}
                <button type="submit" disabled={isLoading || betSummary.totalCost <= 0 || betSummary.totalCost > user.wallet} className="w-full bg-sky-600 hover:bg-sky-500 text-white font-bold py-3 px-4 rounded-md transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed">
                    {isLoading ? 'Placing Bet...' : `Place Bet (PKR ${betSummary.totalCost.toFixed(2)})`}
                </button>
            </form>
        </div>
    );
};

// --- BET HISTORY COMPONENT ---
const BetHistoryView: React.FC<{ user: User, games: Game[] }> = ({ user, games }) => {
    const [history, setHistory] = useState<{ bets: Bet[], totalCount: number }>({ bets: [], totalCount: 0 });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { fetchWithAuth } = useAuth();
    const [currentPage, setCurrentPage] = useState(1);
    const [filters, setFilters] = useState({ startDate: '', endDate: '', searchTerm: '' });
    const BETS_PER_PAGE = 15;

    useEffect(() => {
        const fetchHistory = async () => {
            setIsLoading(true);
            setError(null);
            const params = new URLSearchParams({
                limit: String(BETS_PER_PAGE),
                offset: String((currentPage - 1) * BETS_PER_PAGE),
                ...(filters.startDate && { startDate: filters.startDate }),
                ...(filters.endDate && { endDate: filters.endDate }),
                ...(filters.searchTerm && { searchTerm: filters.searchTerm }),
            });
            try {
                const res = await fetchWithAuth(`/api/bet-history?${params.toString()}`);
                if (!res.ok) throw new Error('Failed to fetch bet history.');
                const data = await res.json();
                setHistory({
                    bets: data.bets.map((b: any) => ({ ...b, timestamp: new Date(b.timestamp), numbers: JSON.parse(b.numbers) })),
                    totalCount: data.totalCount,
                });
            } catch (err: any) { setError(err.message); } 
            finally { setIsLoading(false); }
        };
        fetchHistory();
    }, [user, fetchWithAuth, currentPage, filters]);

    const totalPages = Math.ceil(history.totalCount / BETS_PER_PAGE);
    const inputClass = "w-full bg-slate-800 p-2 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none text-white";

    return (
        <div>
            <h3 className="text-xl font-semibold text-white mb-4">My Bet History</h3>
            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 mb-6 flex flex-col md:flex-row gap-4 items-center">
                <input type="text" placeholder="Search by game..." value={filters.searchTerm} onChange={e => setFilters(p => ({...p, searchTerm: e.target.value}))} className={`${inputClass} md:w-48`} />
                <div className="flex-grow"></div>
                <input type="date" value={filters.startDate} onChange={e => setFilters(p => ({...p, startDate: e.target.value}))} className={`${inputClass} text-sm`} />
                <span className="text-slate-400">to</span>
                <input type="date" value={filters.endDate} onChange={e => setFilters(p => ({...p, endDate: e.target.value}))} className={`${inputClass} text-sm`} />
            </div>
            {isLoading ? <p className="text-center p-8">Loading history...</p> : error ? <p className="text-center p-8 text-red-400">{error}</p> : history.bets.length === 0 ? <p className="text-center p-8 text-slate-500">No bets found.</p> : (
                <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                    <div className="overflow-auto mobile-scroll-x"><table className="w-full text-left min-w-[700px]"><thead className="bg-slate-800/50"><tr><th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th><th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Game</th><th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Bet Details</th><th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Total Stake</th></tr></thead><tbody className="divide-y divide-slate-800">{history.bets.map(bet => {
                        const game = games.find(g => g.id === bet.gameId);
                        return <tr key={bet.id} className="hover:bg-sky-500/10"><td className="p-3 text-sm text-slate-400">{bet.timestamp.toLocaleString()}</td><td className="p-3 text-white">{game?.name || 'Unknown'}</td><td className="p-3"><div className="text-sm"><span className="font-semibold text-slate-300">{bet.subGameType}</span><p className="font-mono text-sky-300 text-xs break-all">{bet.numbers.join(', ')}</p><span className="text-slate-400 text-xs">@ {bet.amountPerNumber.toFixed(2)} PKR per number</span></div></td><td className="p-3 text-right font-mono font-semibold text-red-400">{bet.totalAmount.toFixed(2)}</td></tr>
                    })}</tbody></table></div>
                    <div className="p-4 bg-slate-800/50 border-t border-slate-700 flex justify-between items-center text-sm"><p className="text-slate-400">Showing {history.bets.length} of {history.totalCount} bets</p><div className="flex gap-2"><button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1} className="bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold py-1.5 px-3 rounded-md text-xs">Previous</button><button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage >= totalPages} className="bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold py-1.5 px-3 rounded-md text-xs">Next</button></div></div>
                </div>
            )}
        </div>
    );
};

// --- MAIN COMPONENT ---
interface UserPanelProps {
    user: User;
    games: Game[];
    dailyResults: DailyResult[];
    placeBet: (details: any) => Promise<void>;
}

const UserPanel: React.FC<UserPanelProps> = ({ user, games, dailyResults, placeBet }) => {
    const [activeTab, setActiveTab] = useState('games');
    const [selectedGame, setSelectedGame] = useState<Game | null>(null);

    useEffect(() => {
        setSelectedGame(null); // Reset game selection when tab changes
    }, [activeTab]);

    const handleGameSelect = (game: Game) => {
        if (game.isMarketOpen) {
            setSelectedGame(game);
        }
    };

    const tabs = [
        { id: 'games', label: 'Play Games', icon: Icons.gamepad },
        { id: 'ledger', label: 'My Ledger', icon: Icons.bookOpen },
        { id: 'history', label: 'Bet History', icon: Icons.clipboardList },
    ];
    
    return (
        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
            <h2 className="text-3xl font-bold text-sky-400 mb-6 uppercase tracking-widest">User Dashboard</h2>
            
            <div className="bg-slate-800/50 p-1.5 rounded-lg flex items-center space-x-2 mb-6 self-start flex-wrap border border-slate-700">
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center space-x-2 py-2 px-4 text-sm font-semibold rounded-md transition-all duration-300 ${activeTab === tab.id ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
                        {tab.icon} <span>{tab.label}</span>
                    </button>
                ))}
            </div>
            
            {activeTab === 'games' && (
                !selectedGame ? (
                    <GameSelectionView games={games} onSelect={handleGameSelect} />
                ) : (
                    <BettingInterface game={selectedGame} user={user} placeBet={placeBet} onClose={() => setSelectedGame(null)} />
                )
            )}
            {activeTab === 'ledger' && (
                <ProfessionalLedgerView accountId={user.id} accountType="user" themeColor="sky" />
            )}
            {activeTab === 'history' && (
                <BetHistoryView user={user} games={games} />
            )}
        </div>
    );
};

export default UserPanel;