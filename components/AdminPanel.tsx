
import React, { useState, useMemo, useEffect } from 'react';
import { Dealer, User, Game, PrizeRates, LedgerEntry, Bet, Admin, SubGameType, BetLimits } from '../types';
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

interface ExposureData {
    twoDigit: Record<string, number>;
    oneDigitOpen: Record<string, number>;
    oneDigitClose: Record<string, number>;
}

const getTodayDateString = () => new Date().toISOString().split('T')[0];

const formatTime12h = (time24: string) => {
    if (!time24 || !time24.includes(':')) return '--:--';
    const [hours, minutes] = time24.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
};

const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: 'md' | 'lg' | 'xl'; themeColor?: string }> = ({ isOpen, onClose, title, children, size = 'md', themeColor = 'cyan' }) => {
    if (!isOpen) return null;
    const sizeClasses: Record<string, string> = { md: 'max-w-md', lg: 'max-w-3xl', xl: 'max-w-6xl' };
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className={`bg-slate-900 rounded-lg shadow-2xl w-full border border-${themeColor}-500/30 ${sizeClasses[size]} flex flex-col max-h-[90vh]`}>
                <div className="flex justify-between items-center p-5 border-b border-slate-700 flex-shrink-0">
                    <h3 className={`text-lg font-bold text-${themeColor}-400 uppercase tracking-widest`}>{title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">{Icons.close}</button>
                </div>
                <div className="p-6 overflow-y-auto">{children}</div>
            </div>
        </div>
    );
};

const AccountEditForm: React.FC<{
    account: Dealer | User;
    type: 'dealer' | 'user';
    onSave: (id: string, updates: any) => Promise<void>;
    onCancel: () => void;
}> = ({ account, type, onSave, onCancel }) => {
    const [formData, setFormData] = useState({
        name: account.name,
        area: account.area,
        contact: account.contact,
        commissionRate: account.commissionRate,
        prizeRates: { ...account.prizeRates },
        betLimits: account.betLimits || { oneDigit: 0, twoDigit: 0 }
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        try {
            await onSave(account.id, formData);
            onCancel();
        } catch (err: any) {
            setError(err.message || 'Update failed');
        } finally {
            setIsLoading(false);
        }
    };

    const inputClass = "w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:outline-none text-white text-sm";

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                    <label className="block text-xs text-slate-400 mb-1 uppercase font-bold">Display Name</label>
                    <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className={inputClass} />
                </div>
                <div>
                    <label className="block text-xs text-slate-400 mb-1 uppercase font-bold">Area</label>
                    <input type="text" value={formData.area} onChange={e => setFormData({ ...formData, area: e.target.value })} className={inputClass} />
                </div>
                <div>
                    <label className="block text-xs text-slate-400 mb-1 uppercase font-bold">Contact</label>
                    <input type="text" value={formData.contact} onChange={e => setFormData({ ...formData, contact: e.target.value })} className={inputClass} />
                </div>
                <div className="col-span-2">
                    <label className="block text-xs text-slate-400 mb-1 uppercase font-bold">Commission Rate (%)</label>
                    <input type="number" value={formData.commissionRate} onChange={e => setFormData({ ...formData, commissionRate: parseFloat(e.target.value) })} className={inputClass} />
                </div>
            </div>

            <fieldset className="border border-slate-700 p-4 rounded-lg space-y-4">
                <legend className="px-2 text-xs font-bold text-cyan-400 uppercase">Bet Limits (Staking Ceiling)</legend>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs text-slate-500 mb-1 uppercase">1-Digit Limit</label>
                        <input type="number" value={formData.betLimits.oneDigit} onChange={e => setFormData({ ...formData, betLimits: { ...formData.betLimits, oneDigit: parseFloat(e.target.value) } })} className={inputClass} />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 mb-1 uppercase">2-Digit Limit</label>
                        <input type="number" value={formData.betLimits.twoDigit} onChange={e => setFormData({ ...formData, betLimits: { ...formData.betLimits, twoDigit: parseFloat(e.target.value) } })} className={inputClass} />
                    </div>
                </div>
                <p className="text-[10px] text-slate-500">Set maximum allowed stake per number. Use 0 for unlimited.</p>
            </fieldset>

            <fieldset className="border border-slate-700 p-4 rounded-lg space-y-4">
                <legend className="px-2 text-xs font-bold text-cyan-400 uppercase">Prize Rates (Multiplier)</legend>
                <div className="grid grid-cols-3 gap-2">
                    <div>
                        <label className="block text-[10px] text-slate-500 mb-1 uppercase">Open</label>
                        <input type="number" value={formData.prizeRates.oneDigitOpen} onChange={e => setFormData({ ...formData, prizeRates: { ...formData.prizeRates, oneDigitOpen: parseFloat(e.target.value) } })} className={inputClass} />
                    </div>
                    <div>
                        <label className="block text-[10px] text-slate-500 mb-1 uppercase">Close</label>
                        <input type="number" value={formData.prizeRates.oneDigitClose} onChange={e => setFormData({ ...formData, prizeRates: { ...formData.prizeRates, oneDigitClose: parseFloat(e.target.value) } })} className={inputClass} />
                    </div>
                    <div>
                        <label className="block text-[10px] text-slate-500 mb-1 uppercase">2-Digit</label>
                        <input type="number" value={formData.prizeRates.twoDigit} onChange={e => setFormData({ ...formData, prizeRates: { ...formData.prizeRates, twoDigit: parseFloat(e.target.value) } })} className={inputClass} />
                    </div>
                </div>
            </fieldset>

            {error && <p className="text-red-400 text-xs text-center">{error}</p>}

            <div className="flex gap-2">
                <button type="button" onClick={onCancel} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded">Cancel</button>
                <button type="submit" disabled={isLoading} className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded">
                    {isLoading ? 'Saving...' : 'Update Account'}
                </button>
            </div>
        </form>
    );
};

const LedgerTable: React.FC<{ entries: LedgerEntry[] }> = ({ entries }) => {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const filteredEntries = useMemo(() => {
        return (entries || []).filter(entry => {
            const entryDateStr = new Date(entry.timestamp).toISOString().split('T')[0];
            if (startDate && entryDateStr < startDate) return false;
            if (endDate && entryDateStr > endDate) return false;
            return true;
        });
    }, [entries, startDate, endDate]);
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                <div>
                    <label className="block text-xs text-slate-400 mb-1 uppercase">From Date</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" />
                </div>
                <div>
                    <label className="block text-xs text-slate-400 mb-1 uppercase">To Date</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" />
                </div>
            </div>
            <div className="bg-slate-900/50 rounded-lg overflow-hidden border border-slate-700">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-800 sticky top-0"><tr className="text-xs text-slate-400 uppercase"><th className="p-3">Time</th><th className="p-3">Description</th><th className="p-3 text-right">Debit</th><th className="p-3 text-right">Credit</th><th className="p-3 text-right">Balance</th></tr></thead>
                    <tbody className="divide-y divide-slate-800">
                        {filteredEntries.map(l => (
                            <tr key={l.id} className="hover:bg-cyan-500/5">
                                <td className="p-3 text-slate-500 whitespace-nowrap">{new Date(l.timestamp).toLocaleString()}</td>
                                <td className="p-3 text-white">{l.description}</td>
                                <td className="p-3 text-right text-red-400 font-mono">{l.debit > 0 ? l.debit.toFixed(2) : '-'}</td>
                                <td className="p-3 text-right text-green-400 font-mono">{l.credit > 0 ? l.credit.toFixed(2) : '-'}</td>
                                <td className="p-3 text-right font-bold text-white font-mono">{l.balance.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const WalletTransactionForm: React.FC<{
    account: Dealer | User;
    type: 'Top-Up' | 'Withdrawal';
    onTransaction: (id: string, amount: number) => Promise<void>;
    onCancel: () => void;
}> = ({ account, type, onTransaction, onCancel }) => {
    const [amount, setAmount] = useState<number | ''>('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!amount || amount <= 0) { setError("Enter a valid amount."); return; }
        setIsLoading(true);
        try { await onTransaction(account.id, Number(amount)); onCancel(); } catch (err: any) { setError(err.message || 'Failed'); } finally { setIsLoading(false); }
    };
    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-slate-800/50 p-4 rounded border border-slate-700 text-center">
                <p className="text-white font-bold">{account.name}</p>
                <p className="text-cyan-400 text-sm">Balance: PKR {account.wallet.toLocaleString()}</p>
            </div>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value))} className="w-full bg-slate-950 p-4 text-3xl text-center font-bold text-white border-2 border-slate-700 rounded" placeholder="0.00" autoFocus />
            <button type="submit" disabled={isLoading} className={`w-full py-3 ${type === 'Top-Up' ? 'bg-emerald-600' : 'bg-amber-600'} text-white font-bold rounded`}>
                {isLoading ? '...' : `CONFIRM ${type.toUpperCase()}`}
            </button>
        </form>
    );
};

const DashboardView: React.FC<{ summary: FinancialSummary | null; admin: Admin }> = ({ summary, admin }) => {
    const { fetchWithAuth } = useAuth();
    const [aiInsights, setAiInsights] = useState<string | null>(null);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const getAiInsights = async () => {
        if (!summary) return;
        setIsAiLoading(true);
        try {
            const res = await fetchWithAuth('/api/admin/ai-insights', { method: 'POST', body: JSON.stringify({ summaryData: summary }) });
            const data = await res.json();
            setAiInsights(data.insights);
        } catch (e) { setAiInsights("Analysis unavailable."); } finally { setIsAiLoading(false); }
    };
    if (!summary) return <div className="text-center p-8 animate-pulse">Syncing...</div>;
    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-white">Overview</h3>
                <button onClick={getAiInsights} disabled={isAiLoading} className="text-xs bg-purple-600 px-3 py-1 rounded text-white">{isAiLoading ? "..." : "✨ AI Scan"}</button>
            </div>
            {aiInsights && <div className="bg-purple-900/20 border border-purple-500/30 p-4 rounded text-slate-200 text-sm italic">"{aiInsights}"</div>}
            <div className="grid grid-cols-4 gap-6">
                <div className="bg-slate-800/50 p-4 rounded border border-slate-700"><p className="text-xs text-slate-500">WALLET</p><p className="text-xl font-bold font-mono text-cyan-400">Rs.{admin.wallet.toLocaleString()}</p></div>
                <div className="bg-slate-800/50 p-4 rounded border border-slate-700"><p className="text-xs text-slate-500">STAKE</p><p className="text-xl font-bold font-mono text-white">Rs.{summary.totals.totalStake.toLocaleString()}</p></div>
                <div className="bg-slate-800/50 p-4 rounded border border-slate-700"><p className="text-xs text-slate-500">P/L</p><p className={`text-xl font-bold font-mono ${summary.totals.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>Rs.{summary.totals.netProfit.toLocaleString()}</p></div>
                <div className="bg-slate-800/50 p-4 rounded border border-slate-700"><p className="text-xs text-slate-500">BETS</p><p className="text-xl font-bold font-mono text-amber-400">{summary.totalBets}</p></div>
            </div>
        </div>
    );
};

const ExposureSection: React.FC<{ title: string; data: Record<string, number>; gameName: string; cols?: number }> = ({ title, data, gameName, cols = 10 }) => {
    const [copied, setCopied] = useState(false);
    const maxStake = Math.max(...Object.values(data), 1);
    
    const copyToClipboard = () => {
        const activeStakes = Object.entries(data)
            .filter(([_, stake]) => stake > 0)
            .sort(([a], [b]) => a.localeCompare(b));

        const totalForSection = activeStakes.reduce((sum, [_, stake]) => sum + stake, 0);

        const header = `--- ${gameName.toUpperCase()} | ${title.toUpperCase()} ---`;
        const body = activeStakes.map(([num, stake]) => `${num}: Rs.${stake.toFixed(0)}`).join('\n');
        const footer = `\nTOTAL STAKE: Rs.${totalForSection.toLocaleString()}`;

        const finalOutput = `${header}\n${body || 'No Stakes Found'}\n${footer}`;
            
        navigator.clipboard.writeText(finalOutput).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest">{title}</h4>
                <button 
                    onClick={copyToClipboard}
                    className={`flex items-center gap-2 px-3 py-1 rounded text-[10px] font-bold transition-all shadow-lg ${copied ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-cyan-400 hover:bg-slate-600 active:scale-95'}`}
                >
                    {copied ? 'COPIED!' : 'COPY STAKES'}
                </button>
            </div>
            <div className={`grid grid-cols-5 sm:grid-cols-${cols} gap-2`}>
                {Object.entries(data).sort(([a], [b]) => a.localeCompare(b)).map(([num, stake]) => {
                    const intensity = (stake / maxStake) * 100;
                    return (
                        <div key={num} className="group relative flex flex-col items-center justify-center p-2 rounded border border-slate-700 transition-all hover:scale-110 z-10 hover:z-20 shadow-md" style={{ backgroundColor: stake > 0 ? `rgba(6, 182, 212, ${Math.max(0.1, intensity/100)})` : 'transparent' }}>
                            <span className="text-lg font-bold text-white">{num}</span>
                            <span className="text-[10px] font-mono text-cyan-200">Rs.{stake.toFixed(0)}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const LiveMarketView: React.FC<{ games: Game[] }> = ({ games }) => {
    const { fetchWithAuth } = useAuth();
    const [selectedGameId, setSelectedGameId] = useState(games[0]?.id || '');
    const [exposure, setExposure] = useState<ExposureData | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const selectedGame = useMemo(() => games.find(g => g.id === selectedGameId), [games, selectedGameId]);

    const fetchExposure = async () => {
        if (!selectedGameId) return;
        setIsLoading(true);
        try {
            const res = await fetchWithAuth(`/api/admin/games/${selectedGameId}/exposure`);
            const data = await res.json();
            setExposure(data.exposure);
        } catch (e) { console.error(e); } finally { setIsLoading(false); }
    };

    useEffect(() => { fetchExposure(); }, [selectedGameId]);

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">{Icons.sparkles} Live Market Exposure</h3>
                <div className="flex gap-2">
                    <select value={selectedGameId} onChange={(e) => setSelectedGameId(e.target.value)} className="bg-slate-800 border border-slate-700 text-white p-2 rounded focus:ring-2 focus:ring-cyan-500 text-sm font-bold">
                        {games.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                    <button onClick={fetchExposure} className="p-2 bg-slate-700 rounded hover:bg-slate-600 transition-colors" title="Reload Market State">Refresh</button>
                </div>
            </div>

            {exposure && selectedGame ? (
                <div className="space-y-12">
                    <ExposureSection title="Two Digit Summary" data={exposure.twoDigit} gameName={selectedGame.name} />
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                        <ExposureSection title="1 Digit Open" data={exposure.oneDigitOpen} gameName={selectedGame.name} cols={5} />
                        <ExposureSection title="1 Digit Close" data={exposure.oneDigitClose} gameName={selectedGame.name} cols={5} />
                    </div>
                </div>
            ) : (
                <div className="text-center p-12 text-slate-500 italic bg-slate-800/30 rounded-lg border border-dashed border-slate-700">Select a game to view market exposure.</div>
            )}
        </div>
    );
};

const AdminPanel: React.FC<any> = ({ admin, dealers, users, games, bets, declareWinner, updateWinner, updateGameDrawTime, toggleAccountRestriction, topUpDealerWallet, withdrawFromDealerWallet }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [summaryData, setSummaryData] = useState<FinancialSummary | null>(null);
  const [gameWinnerModal, setGameWinnerModal] = useState<Game | null>(null);
  const [gameTimeModal, setGameTimeModal] = useState<Game | null>(null);
  const [winningNumberInput, setWinningNumberInput] = useState('');
  const [drawTimeInput, setDrawTimeInput] = useState('');
  const [isUpdatingWinner, setIsUpdatingWinner] = useState(false);
  const [viewingLedgerFor, setViewingLedgerFor] = useState<User | Dealer | null>(null);
  const [transactionModal, setTransactionModal] = useState<{ account: Dealer | User, type: 'Top-Up' | 'Withdrawal' } | null>(null);
  const [editingAccount, setEditingAccount] = useState<{ account: Dealer | User, type: 'dealer' | 'user' } | null>(null);
  const { fetchWithAuth } = useAuth();

  const fetchSummary = async () => {
    try {
      const response = await fetchWithAuth('/api/admin/summary');
      const data = await response.json();
      setSummaryData(data);
    } catch (e) { console.error(e); }
  };

  const handleUpdateAccount = async (id: string, updates: any) => {
      const type = editingAccount?.type;
      const response = await fetchWithAuth(`/api/admin/${type}s/${id}`, {
          method: 'PUT',
          body: JSON.stringify(updates)
      });
      if (!response.ok) {
          const err = await response.json();
          throw new Error(err.message);
      }
      fetchSummary();
  };

  useEffect(() => { fetchSummary(); }, [activeTab, fetchWithAuth]);

  const tabs = [
    { id: 'dashboard', label: 'Home', icon: Icons.chartBar },
    { id: 'live', label: 'Market', icon: Icons.eye },
    { id: 'dealers', label: 'Dealers', icon: Icons.userGroup }, 
    { id: 'users', label: 'Users', icon: Icons.user },
    { id: 'games', label: 'Games', icon: Icons.gamepad },
    { id: 'history', label: 'System Bets', icon: Icons.bookOpen },
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-end border-b border-slate-800 pb-4">
          <h2 className="text-2xl font-bold text-red-500 uppercase tracking-widest">ADMIN CONSOLE</h2>
          <p className="text-xs text-slate-500 font-mono">STAKE: {summaryData?.totals.totalStake.toLocaleString()} PKR</p>
      </div>
      
      <div className="bg-slate-800/50 p-1 rounded-lg flex space-x-2 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center space-x-2 py-2 px-4 text-xs font-bold rounded transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-red-600 text-white' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
            {tab.icon} <span>{tab.label.toUpperCase()}</span>
          </button>
        ))}
      </div>
      
      {activeTab === 'dashboard' && <DashboardView summary={summaryData} admin={admin} />}
      {activeTab === 'live' && <LiveMarketView games={games} />}

      {activeTab === 'dealers' && (
          <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
              <table className="w-full text-left">
                  <thead className="bg-slate-800 text-xs text-slate-400 uppercase"><tr><th className="p-4">Dealer</th><th className="p-4">Contact</th><th className="p-4 text-right">Wallet</th><th className="p-4 text-center">Limits (1D/2D)</th><th className="p-4">Status</th><th className="p-4 text-center">Actions</th></tr></thead>
                  <tbody className="divide-y divide-slate-700">
                      {dealers.map((d: Dealer) => (
                          <tr key={d.id} className="hover:bg-cyan-500/5 text-sm">
                              <td className="p-4"><p className="font-bold text-white">{d.name}</p><p className="text-xs text-slate-500 font-mono">{d.id}</p></td>
                              <td className="p-4 text-slate-400">{d.contact}</td>
                              <td className="p-4 text-right font-mono text-cyan-400">Rs.{parseFloat(d.wallet as any).toLocaleString()}</td>
                              <td className="p-4 text-center text-xs text-slate-400 font-mono">
                                  {d.betLimits?.oneDigit || 0} / {d.betLimits?.twoDigit || 0}
                              </td>
                              <td className="p-4"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${d.isRestricted ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>{d.isRestricted ? 'OFF' : 'ON'}</span></td>
                              <td className="p-4">
                                  <div className="flex justify-center gap-1">
                                      <button onClick={() => setEditingAccount({ account: d, type: 'dealer' })} className="p-1.5 bg-slate-700 rounded text-sky-400 hover:bg-sky-600 hover:text-white" title="Edit Profile">✏️</button>
                                      <button onClick={() => setTransactionModal({ account: d, type: 'Top-Up' })} className="p-1.5 bg-emerald-900/40 text-emerald-400 rounded hover:bg-emerald-600 hover:text-white">💰</button>
                                      <button onClick={() => setViewingLedgerFor(d)} className="p-1.5 bg-slate-700 rounded text-cyan-400">📖</button>
                                      <button onClick={() => toggleAccountRestriction(d.id, 'dealer')} className="p-1.5 bg-slate-700 rounded">{d.isRestricted ? '🔓' : '🔒'}</button>
                                  </div>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      )}

      {activeTab === 'users' && (
          <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
              <table className="w-full text-left">
                  <thead className="bg-slate-800 text-xs text-slate-400 uppercase"><tr><th className="p-4">User</th><th className="p-4">Parent</th><th className="p-4 text-right">Wallet</th><th className="p-4 text-center">Limits (1D/2D)</th><th className="p-4">Status</th><th className="p-4 text-center">Actions</th></tr></thead>
                  <tbody className="divide-y divide-slate-800">
                      {users.map((u: User) => (
                          <tr key={u.id} className="hover:bg-cyan-500/5 text-sm">
                              <td className="p-4"><p className="font-bold text-white">{u.name}</p><p className="text-xs text-slate-500 font-mono">{u.id}</p></td>
                              <td className="p-4 text-slate-500 text-xs font-mono">{u.dealerId}</td>
                              <td className="p-4 text-right font-mono text-cyan-400">Rs.{parseFloat(u.wallet as any).toLocaleString()}</td>
                              <td className="p-4 text-center text-xs text-slate-400 font-mono">
                                  {u.betLimits?.oneDigit || 0} / {u.betLimits?.twoDigit || 0}
                              </td>
                              <td className="p-4"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${u.isRestricted ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>{u.isRestricted ? 'OFF' : 'ON'}</span></td>
                              <td className="p-4 text-center">
                                  <div className="flex justify-center gap-1">
                                      <button onClick={() => setEditingAccount({ account: u, type: 'user' })} className="p-1.5 bg-slate-700 rounded text-sky-400 hover:bg-sky-600 hover:text-white" title="Edit Profile">✏️</button>
                                      <button onClick={() => setViewingLedgerFor(u)} className="p-1.5 bg-slate-700 rounded text-cyan-400">📖</button>
                                      <button onClick={() => toggleAccountRestriction(u.id, 'user')} className="p-1.5 bg-slate-700 rounded">{u.isRestricted ? '🔓' : '🔒'}</button>
                                  </div>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      )}

      {/* GAMES GRID */}
      {activeTab === 'games' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {games.map((game: Game) => (
                  <div key={game.id} className="bg-slate-800/50 p-6 rounded border border-slate-700 flex flex-col justify-between">
                      <div className="flex justify-between mb-4">
                        <div>
                          <h4 className="font-bold text-white text-lg">{game.name}</h4>
                          <p className="text-xs text-slate-500 font-mono uppercase tracking-widest">{game.id}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-cyan-400 font-bold font-mono">{formatTime12h(game.drawTime)}</p>
                          <p className="text-[10px] text-slate-500 uppercase">Draw Time</p>
                        </div>
                      </div>

                      <div className="text-center p-4 bg-black/40 rounded-lg mb-6 border border-slate-700">
                          <p className="text-3xl font-bold font-mono text-emerald-400 tracking-tighter">{game.winningNumber || '--'}</p>
                          <p className="text-[10px] text-slate-500 uppercase mt-1">Winning Number</p>
                      </div>

                      <div className="flex gap-2">
                          <button 
                            onClick={() => { setGameWinnerModal(game); setWinningNumberInput(game.winningNumber || ''); setIsUpdatingWinner(!!game.winningNumber); }} 
                            className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white rounded font-bold text-xs uppercase transition-colors"
                          >
                            {game.winningNumber ? 'Update Result' : 'Declare Result'}
                          </button>
                          <button 
                            onClick={() => { setGameTimeModal(game); setDrawTimeInput(game.drawTime); }} 
                            className="p-2 bg-slate-700 hover:bg-slate-600 text-cyan-400 rounded transition-colors"
                            title="Adjust Draw Time"
                          >
                            {Icons.clock}
                          </button>
                      </div>
                  </div>
              ))}
          </div>
      )}

      {/* MODALS */}
      <Modal isOpen={!!viewingLedgerFor} onClose={() => setViewingLedgerFor(null)} title={`Ledger: ${viewingLedgerFor?.name}`} size="xl">
          {viewingLedgerFor && <LedgerTable entries={viewingLedgerFor.ledger} />}
      </Modal>

      <Modal isOpen={!!transactionModal} onClose={() => setTransactionModal(null)} title={`${transactionModal?.type}: ${transactionModal?.account.name}`}>
          {transactionModal && <WalletTransactionForm account={transactionModal.account} type={transactionModal.type} onTransaction={transactionModal.type === 'Top-Up' ? topUpDealerWallet : withdrawFromDealerWallet} onCancel={() => setTransactionModal(null)} />}
      </Modal>

      <Modal isOpen={!!editingAccount} onClose={() => setEditingAccount(null)} title={`Manage ${editingAccount?.type === 'dealer' ? 'Dealer' : 'User'}: ${editingAccount?.account.name}`}>
          {editingAccount && <AccountEditForm account={editingAccount.account} type={editingAccount.type} onSave={handleUpdateAccount} onCancel={() => setEditingAccount(null)} />}
      </Modal>

      <Modal isOpen={!!gameWinnerModal} onClose={() => setGameWinnerModal(null)} title="Market Result" themeColor="red">
          <div className="space-y-6">
              <input maxLength={2} type="text" autoFocus value={winningNumberInput} onChange={e => setWinningNumberInput(e.target.value.replace(/\D/g, ''))} className="w-full bg-slate-950 p-4 text-6xl text-center font-bold text-red-500 border-2 border-slate-700 rounded" />
              <button onClick={async () => { if (isUpdatingWinner) await updateWinner(gameWinnerModal!.id, winningNumberInput); else await declareWinner(gameWinnerModal!.id, winningNumberInput); setGameWinnerModal(null); fetchSummary(); }} className="w-full py-4 bg-red-600 text-white rounded font-bold uppercase">Confirm Broadcast</button>
          </div>
      </Modal>

      <Modal isOpen={!!gameTimeModal} onClose={() => setGameTimeModal(null)} title={`Adjust Draw Time: ${gameTimeModal?.name}`} themeColor="cyan">
          <div className="space-y-6">
              <div>
                <label className="block text-xs text-slate-400 mb-2 uppercase tracking-widest font-bold">New Draw Time (24h format)</label>
                <input 
                  type="time" 
                  autoFocus 
                  value={drawTimeInput} 
                  onChange={e => setDrawTimeInput(e.target.value)} 
                  className="w-full bg-slate-950 p-6 text-5xl text-center font-bold text-cyan-400 border-2 border-slate-700 rounded font-mono" 
                />
                <div className="mt-4 text-center">
                  <p className="text-slate-500 text-xs uppercase mb-1">Preview</p>
                  <p className="text-white text-xl font-bold font-mono">{formatTime12h(drawTimeInput)}</p>
                </div>
              </div>
              <button 
                onClick={async () => { 
                  if (gameTimeModal) {
                    await updateGameDrawTime(gameTimeModal.id, drawTimeInput);
                    setGameTimeModal(null);
                    fetchSummary();
                  }
                }} 
                className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-bold uppercase transition-all shadow-lg shadow-cyan-500/20"
              >
                Save New Time
              </button>
          </div>
      </Modal>

    </div>
  );
};

export default AdminPanel;
