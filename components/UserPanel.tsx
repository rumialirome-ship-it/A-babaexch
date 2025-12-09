
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, Game, SubGameType, LedgerEntry, Bet, PrizeRates, BetLimits, DailyResult, LedgerEntryType } from '../types';
import { Icons } from '../constants';
import { useCountdown, getMarketDateForBet } from '../hooks/useCountdown';
import { useAuth } from '../hooks/useAuth';
import './UserPanel.css';

const getTodayDateString = () => new Date().toISOString().split('T')[0];

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

const ProfessionalLedgerView: React.FC<{ accountId: string, accountType: 'user' | 'dealer' | 'admin', themeColor?: string }> = ({ accountId, accountType, themeColor = 'cyan' }) => {
    const [allEntries, setAllEntries] = useState<LedgerEntry[]>([]);
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
            setIsLoading(true);
            setError(null);
            try {
                // For users, the ledger is already part of the main data context.
                // We will use the account object from useAuth to avoid another API call.
                // This is an optimization for the user panel.
                const response = await fetchWithAuth(`/api/auth/verify`);
                if (!response.ok) throw new Error('Failed to fetch user data.');
                const data = await response.json();

                const parsedEntries = (data.account.ledger || []).map((e: any) => ({ ...e, timestamp: new Date(e.timestamp) })).sort((a: LedgerEntry, b: LedgerEntry) => b.timestamp.getTime() - a.timestamp.getTime());
                setAllEntries(parsedEntries);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        fetchLedger();
    }, [accountId, accountType, fetchWithAuth]);
    
    const filteredEntries = useMemo(() => {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        let startDate: Date | null = null;
        let endDate: Date | null = new Date(); // up to now
        
        switch(datePreset) {
            case 'today':
                startDate = startOfToday;
                break;
            case 'week':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'all':
                startDate = null;
                endDate = null;
                break;
        }

        if (customStartDate) {
            startDate = new Date(customStartDate);
            startDate.setHours(0,0,0,0);
        }
        if (customEndDate) {
            endDate = new Date(customEndDate);
            endDate.setHours(23, 59, 59, 999); // Include the whole end day
        }

        const dateFiltered = allEntries.filter(entry => {
            if (startDate && entry.timestamp < startDate) return false;
            if (endDate && entry.timestamp > endDate) return false;
            return true;
        });

        if (!searchQuery.trim()) {
            return dateFiltered;
        }

        const lowercasedQuery = searchQuery.trim().toLowerCase();
        return dateFiltered.filter(entry => 
            entry.description.toLowerCase().includes(lowercasedQuery)
        );
    }, [allEntries, datePreset, customStartDate, customEndDate, searchQuery]);

    const summary = useMemo(() => {
        return filteredEntries.reduce((acc, entry) => {
            acc.totalDebit += entry.debit;
            acc.totalCredit += entry.credit;
            if (entry.type === LedgerEntryType.BetPlaced) acc.totalBets += entry.debit;
            if (entry.type === LedgerEntryType.WinPayout) acc.totalWinnings += entry.credit;
            if ([LedgerEntryType.CommissionPayout, LedgerEntryType.DealerProfit].includes(entry.type)) acc.totalCommission += entry.credit;
            return acc;
        }, { totalDebit: 0, totalCredit: 0, totalBets: 0, totalWinnings: 0, totalCommission: 0 });
    }, [filteredEntries]);
    
    const paginatedEntries = useMemo(() => {
        const startIndex = (currentPage - 1) * ENTRIES_PER_PAGE;
        return filteredEntries.slice(startIndex, startIndex + ENTRIES_PER_PAGE);
    }, [filteredEntries, currentPage]);

    const totalPages = Math.ceil(filteredEntries.length / ENTRIES_PER_PAGE);

    const handlePresetChange = (preset: 'today' | 'week' | 'month' | 'all') => {
        setDatePreset(preset);
        setCustomStartDate('');
        setCustomEndDate('');
        setCurrentPage(1);
    }
    
    const entryTypeIcons: Record<LedgerEntryType, React.ReactElement> = {
        [LedgerEntryType.InitialDeposit]: Icons.initialDeposit,
        [LedgerEntryType.Deposit]: Icons.deposit,
        [LedgerEntryType.Withdrawal]: Icons.withdrawal,
        [LedgerEntryType.BetPlaced]: Icons.betPlaced,
        [LedgerEntryType.WinPayout]: Icons.winPayout,
        [LedgerEntryType.CommissionPayout]: Icons.commission,
        [LedgerEntryType.DealerProfit]: Icons.commission,
        [LedgerEntryType.AdminAdjustment]: Icons.adjustment,
    };

    const inputClass = "w-full bg-slate-800 p-2 rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:outline-none text-white";

    if (isLoading) return <div className="text-center p-8 text-slate-400">Loading ledger...</div>;
    if (error) return <div className="text-center p-8 text-red-400">{error}</div>;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <SummaryCard title="Total Credit" value={summary.totalCredit} color="green" icon={Icons.deposit} />
                <SummaryCard title="Total Debit" value={summary.totalDebit} color="red" icon={Icons.withdrawal} />
                <SummaryCard title="Total Bets" value={summary.totalBets} color="amber" icon={Icons.betPlaced} />
                <SummaryCard title="Total Earnings" value={summary.totalWinnings + summary.totalCommission} color="cyan" icon={Icons.winPayout} />
            </div>

            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 flex flex-col md:flex-row gap-4 items-center flex-wrap">
                <div className="flex items-center space-x-2 flex-wrap gap-2">
                    { (['today', 'week', 'month', 'all'] as const).map(p => (
                        <button key={p} onClick={() => handlePresetChange(p)} className={`py-2 px-4 text-sm font-semibold rounded-md transition-all duration-300 capitalize ${datePreset === p && !customStartDate ? `bg-slate-700 text-${themeColor}-400 shadow-lg` : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'}`}>
                            {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : p}
                        </button>
                    ))}
                </div>
                <div className="flex-grow"></div> {/* Spacer */}
                <div className="flex items-center gap-4 flex-wrap md:justify-end">
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">{Icons.search}</span>
                        <input
                            type="text"
                            placeholder="Search description..."
                            value={searchQuery}
                            onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            className={`${inputClass} pl-10 text-sm w-full sm:w-48`}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <input type="date" value={customStartDate} onChange={e => { setCustomStartDate(e.target.value); setDatePreset('all'); setCurrentPage(1); }} className={`${inputClass} text-sm`} />
                        <span className="text-slate-400">to</span>
                        <input type="date" value={customEndDate} onChange={e => { setCustomEndDate(e.target.value); setDatePreset('all'); setCurrentPage(1); }} className={`${inputClass} text-sm`} />
                    </div>
                </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                <div className="overflow-auto max-h-[60vh] mobile-scroll-x">
                    <table className="w-full text-left min-w-[700px]">
                        <thead className="bg-slate-800/50 sticky top-0 backdrop-blur-sm">
                            <tr>
                                <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date & Time</th>
                                <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</th>
                                <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Description</th>
                                <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Debit</th>
                                <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Credit</th>
                                <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Balance</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {paginatedEntries.map(entry => (
                                <tr key={entry.id} className={`hover:bg-${themeColor}-500/10 text-sm transition-colors`}>
                                    <td className="p-3 text-slate-400 whitespace-nowrap">{entry.timestamp.toLocaleString()}</td>
                                    <td className="p-3">
                                        <div className="flex items-center gap-2" title={entry.type.replace(/_/g, ' ')}>
                                            <span className={`text-${themeColor}-400`}>{entryTypeIcons[entry.type] || Icons.adjustment}</span>
                                            <span className="text-slate-300 text-xs hidden sm:inline capitalize">{entry.type.replace(/_/g, ' ').toLowerCase()}</span>
                                        </div>
                                    </td>
                                    <td className="p-3 text-white">{entry.description}</td>
                                    <td className="p-3 text-right text-red-400 font-mono">{entry.debit > 0 ? entry.debit.toFixed(2) : '-'}</td>
                                    <td className="p-3 text-right text-green-400 font-mono">{entry.credit > 0 ? entry.credit.toFixed(2) : '-'}</td>
                                    <td className="p-3 text-right font-semibold text-white font-mono">{entry.balance.toFixed(2)}</td>
                                </tr>
                            ))}
                            {filteredEntries.length === 0 && (
                                <tr><td colSpan={6} className="p-8 text-center text-slate-500">No ledger entries found for the selected period.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                 <div className="p-4 bg-slate-800/50 border-t border-slate-700 flex justify-between items-center text-sm">
                    <p className="text-slate-400">Showing <span className="font-semibold text-white">{(currentPage - 1) * ENTRIES_PER_PAGE + 1}-{Math.min(currentPage * ENTRIES_PER_PAGE, filteredEntries.length)}</span> of <span className="font-semibold text-white">{filteredEntries.length}</span> entries</p>
                    <div className="flex gap-2">
                        <button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1} className="bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold py-1.5 px-3 rounded-md transition-colors text-xs">Previous</button>
                        <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage >= totalPages} className="bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold py-1.5 px-3 rounded-md transition-colors text-xs">Next</button>
                    </div>
                </div>
            </div>
        </div>
    );
};


interface UserPanelProps {
    user: User;
    games: Game[];
    dailyResults: DailyResult[];
    placeBet: (details: any) => Promise<void>;
}

const UserPanel: React.FC<UserPanelProps> = (props) => {
    const [activeTab, setActiveTab] = useState('games');

    const tabs = [
        { id: 'games', label: 'Play Games', icon: Icons.gamepad },
        { id: 'ledger', label: 'My Ledger', icon: Icons.bookOpen },
        { id: 'history', label: 'Bet History', icon: Icons.clipboardList },
    ];
    
    // This is a dummy implementation to satisfy the component structure.
    // The actual functionality for playing games, viewing history, etc., would be built out here.
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
                 <div className="text-center p-8 bg-slate-800/50 rounded-lg border border-slate-700">
                    <p className="text-slate-400">Game playing functionality coming soon!</p>
                </div>
            )}
            {activeTab === 'ledger' && (
                 <div>
                     <h3 className="text-xl font-semibold text-white mb-4">My Wallet & Ledger</h3>
                     <ProfessionalLedgerView accountId={props.user.id} accountType="user" themeColor="sky" />
                </div>
            )}
            {activeTab === 'history' && (
                 <div className="text-center p-8 bg-slate-800/50 rounded-lg border border-slate-700">
                    <p className="text-slate-400">Bet history coming soon!</p>
                </div>
            )}
        </div>
    );
};

export default UserPanel;
