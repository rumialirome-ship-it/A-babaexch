
import React, { useState, useMemo, useEffect } from 'react';
import { Dealer, User, Game, PrizeRates, LedgerEntry, Bet, NumberLimit, SubGameType, Admin } from '../types';
import { Icons } from '../constants';
import { useAuth } from '../hooks/useAuth';

interface GameSummary {
  gameName: string;
  winningNumber: string;
  totalStake: number;
  totalPayouts: number;
  totalDealerProfit: number;
  totalCommissions: number;
  netProfit: number;
}

interface FinancialSummary {
  games: GameSummary[];
  totals: {
    totalStake: number;
    totalPayouts: number;
    totalDealerProfit: number;
    totalCommissions: number;
    netProfit: number;
  };
  totalBets: number;
}

type SortKey = 'name' | 'wallet' | 'status';
type SortDirection = 'asc' | 'desc';

const getTodayDateString = () => new Date().toISOString().split('T')[0];

const SortableHeader: React.FC<{
    label: string;
    sortKey: SortKey;
    currentSortKey: SortKey;
    sortDirection: SortDirection;
    onSort: (key: SortKey) => void;
    className?: string;
}> = ({ label, sortKey, currentSortKey, sortDirection, onSort, className }) => {
    const isActive = sortKey === currentSortKey;
    const icon = isActive ? (sortDirection === 'asc' ? '▲' : '▼') : '';
    return (
        <th className={`p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors ${className}`} onClick={() => onSort(sortKey)}>
            <div className="flex items-center gap-2">
                <span>{label}</span>
                <span className="text-cyan-400">{icon}</span>
            </div>
        </th>
    );
};

const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: 'md' | 'lg' | 'xl'; themeColor?: string }> = ({ isOpen, onClose, title, children, size = 'md', themeColor = 'cyan' }) => {
    if (!isOpen) return null;
    const sizeClasses: Record<string, string> = { md: 'max-w-md', lg: 'max-w-3xl', xl: 'max-w-5xl' };
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className={`bg-slate-900/80 rounded-lg shadow-2xl w-full border border-${themeColor}-500/30 ${sizeClasses[size]} flex flex-col max-h-[90vh]`}>
                <div className="flex justify-between items-center p-5 border-b border-slate-700 flex-shrink-0">
                    <h3 className={`text-lg font-bold text-${themeColor}-400 uppercase tracking-widest`}>{title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">{Icons.close}</button>
                </div>
                <div className="p-6 overflow-y-auto">{children}</div>
            </div>
        </div>
    );
};

const LedgerTable: React.FC<{ entries: LedgerEntry[] }> = ({ entries }) => (
    <div className="bg-slate-900/50 rounded-lg overflow-hidden border border-slate-700">
        <div className="overflow-y-auto max-h-[60vh] mobile-scroll-x">
            <table className="w-full text-left min-w-[600px]">
                <thead className="bg-slate-800/50 sticky top-0 backdrop-blur-sm">
                    <tr>
                        <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                        <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Description</th>
                        <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Debit</th>
                        <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Credit</th>
                        <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Balance</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                    {[...entries].reverse().map(entry => (
                        <tr key={entry.id} className="hover:bg-cyan-500/10 text-sm transition-colors">
                            <td className="p-3 text-slate-400 whitespace-nowrap">{entry.timestamp.toLocaleString()}</td>
                            <td className="p-3 text-white">{entry.description}</td>
                            <td className="p-3 text-right text-red-400 font-mono">{entry.debit > 0 ? entry.debit.toFixed(2) : '-'}</td>
                            <td className="p-3 text-right text-green-400 font-mono">{entry.credit > 0 ? entry.credit.toFixed(2) : '-'}</td>
                            <td className="p-3 text-right font-semibold text-white font-mono">{entry.balance.toFixed(2)}</td>
                        </tr>
                    ))}
                     {entries.length === 0 && (
                        <tr>
                            <td colSpan={5} className="p-8 text-center text-slate-500">
                                No ledger entries found.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
);

const DashboardView: React.FC<{ summary: FinancialSummary | null; admin: Admin }> = ({ summary, admin }) => {
    const { fetchWithAuth } = useAuth();
    const [aiInsights, setAiInsights] = useState<string | null>(null);
    const [isAiLoading, setIsAiLoading] = useState(false);

    const getAiInsights = async () => {
        if (!summary) return;
        setIsAiLoading(true);
        try {
            const res = await fetchWithAuth('/api/admin/ai-insights', {
                method: 'POST',
                body: JSON.stringify({ summaryData: summary })
            });
            const data = await res.json();
            setAiInsights(data.insights);
        } catch (e) {
            console.error(e);
            setAiInsights("AI Analysis currently unavailable.");
        } finally {
            setIsAiLoading(false);
        }
    };

    if (!summary) return <div className="text-center p-8 text-slate-400">Loading financial summary...</div>;

    const SummaryCard: React.FC<{ title: string; value: number; color: string }> = ({ title, value, color }) => (
        <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
            <p className="text-sm text-slate-400 uppercase tracking-wider">{title}</p>
            <p className={`text-3xl font-bold font-mono ${color}`}>{value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
    );
    
    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-white">Financial Dashboard</h3>
                <button 
                    onClick={getAiInsights}
                    disabled={isAiLoading}
                    className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-bold py-2 px-4 rounded-md transition-all animate-pulse disabled:animate-none"
                >
                    {isAiLoading ? "AI Analyzing..." : "✨ Get AI Market Risk Analysis"}
                </button>
            </div>

            {aiInsights && (
                <div className="bg-purple-900/30 border border-purple-500/50 p-4 rounded-lg mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
                    <p className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-1">AI Risk Insights (Gemini)</p>
                    <p className="text-slate-200 leading-relaxed italic">"{aiInsights}"</p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <SummaryCard title="System Wallet" value={admin.wallet} color="text-cyan-400" />
                <SummaryCard title="Total Bets Placed" value={summary.totals.totalStake} color="text-white" />
                <SummaryCard title="Total Prize Payouts" value={summary.totals.totalPayouts} color="text-amber-400" />
                <SummaryCard title="Net System Profit" value={summary.totals.netProfit} color={summary.totals.netProfit >= 0 ? "text-green-400" : "text-red-400"} />
            </div>

            <h3 className="text-xl font-semibold text-white mb-4">Game-by-Game Breakdown</h3>
            <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                <div className="overflow-x-auto mobile-scroll-x">
                    <table className="w-full text-left min-w-[700px]">
                        <thead className="bg-slate-800/50">
                            <tr>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Game</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Stake</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Payouts</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Net Profit</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {summary.games.map(game => (
                                <tr key={game.gameName} className="hover:bg-cyan-500/10 transition-colors">
                                    <td className="p-4 font-medium text-white">{game.gameName} <span className="text-xs text-slate-400">({game.winningNumber})</span></td>
                                    <td className="p-4 text-right font-mono text-white">{game.totalStake.toFixed(2)}</td>
                                    <td className="p-4 text-right font-mono text-amber-400">{game.totalPayouts.toFixed(2)}</td>
                                    <td className={`p-4 text-right font-mono font-bold ${game.netProfit >= 0 ? "text-green-400" : "text-red-400"}`}>{game.netProfit.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// ... [Remainder of AdminPanel.tsx components: DealerForm, TransactionForm, etc.]

interface AdminPanelProps {
  admin: Admin; 
  dealers: Dealer[]; 
  onSaveDealer: (dealer: Dealer, originalId?: string) => Promise<void>;
  users: User[]; 
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  games: Game[]; 
  bets: Bet[]; 
  declareWinner: (gameId: string, winningNumber: string) => void;
  updateWinner: (gameId: string, newWinningNumber: string) => void;
  approvePayouts: (gameId: string) => void;
  topUpDealerWallet: (dealerId: string, amount: number) => void;
  withdrawFromDealerWallet: (dealerId: string, amount: number) => void;
  toggleAccountRestriction: (accountId: string, accountType: 'user' | 'dealer') => void;
  onPlaceAdminBets: (details: { userId: string; gameId: string; betGroups: any[]; }) => Promise<void>;
  updateGameDrawTime: (gameId: string, newDrawTime: string) => Promise<void>;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ admin, dealers, onSaveDealer, users, setUsers, games, bets, declareWinner, updateWinner, approvePayouts, topUpDealerWallet, withdrawFromDealerWallet, toggleAccountRestriction, onPlaceAdminBets, updateGameDrawTime }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDealer, setSelectedDealer] = useState<Dealer | undefined>(undefined);
  const [winningNumbers, setWinningNumbers] = useState<{[key: string]: string}>({});
  const [summaryData, setSummaryData] = useState<FinancialSummary | null>(null);
  const { fetchWithAuth } = useAuth();

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const response = await fetchWithAuth('/api/admin/summary');
        if (!response.ok) throw new Error('Failed to fetch summary');
        const data = await response.json();
        setSummaryData(data);
      } catch (error) {
        console.error("Error fetching financial summary:", error);
      }
    };
    if (activeTab === 'dashboard') fetchSummary();
  }, [activeTab, fetchWithAuth]);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: Icons.chartBar },
    { id: 'dealers', label: 'Dealers', icon: Icons.userGroup }, 
    { id: 'users', label: 'Users', icon: Icons.clipboardList },
    { id: 'games', label: 'Games', icon: Icons.gamepad },
    { id: 'history', label: 'Ledgers', icon: Icons.bookOpen },
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <h2 className="text-3xl font-bold text-red-400 mb-6 uppercase tracking-widest">Admin Console</h2>
      <div className="bg-slate-800/50 p-1.5 rounded-lg flex items-center space-x-2 mb-6 self-start flex-wrap border border-slate-700">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center space-x-2 py-2 px-4 text-sm font-semibold rounded-md transition-all duration-300 ${activeTab === tab.id ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
            {tab.icon} <span>{tab.label}</span>
          </button>
        ))}
      </div>
      
      {activeTab === 'dashboard' && <DashboardView summary={summaryData} admin={admin} />}
      {/* ... [Rest of AdminPanel Tab Logic] ... */}
    </div>
  );
};

export default AdminPanel;
