
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

const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
    <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
        <table className="w-full">
            <tbody className="divide-y divide-slate-700">
                {Array.from({ length: rows }).map((_, i) => (
                    <tr key={i}>
                        <td className="p-4"><div className="h-4 w-32 skeleton rounded"></div></td>
                        <td className="p-4"><div className="h-4 w-24 skeleton rounded"></div></td>
                        <td className="p-4"><div className="h-4 w-20 skeleton rounded ml-auto"></div></td>
                        <td className="p-4"><div className="h-4 w-16 skeleton rounded mx-auto"></div></td>
                        <td className="p-4"><div className="h-4 w-24 skeleton rounded ml-auto"></div></td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const DashboardSkeleton = () => (
    <div className="space-y-8">
        <div className="flex justify-between items-center">
            <div className="h-6 w-32 skeleton rounded"></div>
            <div className="h-6 w-24 skeleton rounded"></div>
        </div>
        <div className="grid grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-slate-800/50 p-6 rounded border border-slate-700">
                    <div className="h-3 w-12 skeleton rounded mb-2"></div>
                    <div className="h-6 w-24 skeleton rounded"></div>
                </div>
            ))}
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
            const res = await fetchWithAuth('/api/admin/ai-insights', { method: 'POST', body: JSON.stringify({ summaryData: summary }) });
            const data = await res.json();
            setAiInsights(data.insights);
        } catch (e) { setAiInsights("Analysis unavailable."); } finally { setIsAiLoading(false); }
    };
    
    if (!summary) return <DashboardSkeleton />;

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-white">Overview</h3>
                <button onClick={getAiInsights} disabled={isAiLoading} className="text-xs bg-purple-600 px-3 py-1 rounded text-white font-bold transition-all enabled:hover:scale-105 active:scale-95 disabled:opacity-50">
                    {isAiLoading ? "SCANNING..." : "✨ AI SCAN"}
                </button>
            </div>
            {aiInsights && <div className="bg-purple-900/20 border border-purple-500/30 p-4 rounded text-slate-200 text-sm italic">"{aiInsights}"</div>}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                <div className="bg-slate-800/50 p-4 rounded border border-slate-700 shadow-lg"><p className="text-[10px] md:text-xs text-slate-500 font-bold uppercase">SYSTEM WALLET</p><p className="text-lg md:text-xl font-bold font-mono text-cyan-400">Rs.{admin.wallet.toLocaleString()}</p></div>
                <div className="bg-slate-800/50 p-4 rounded border border-slate-700 shadow-lg"><p className="text-[10px] md:text-xs text-slate-500 font-bold uppercase">TOTAL STAKE</p><p className="text-lg md:text-xl font-bold font-mono text-white">Rs.{summary.totals.totalStake.toLocaleString()}</p></div>
                <div className="bg-slate-800/50 p-4 rounded border border-slate-700 shadow-lg"><p className="text-[10px] md:text-xs text-slate-500 font-bold uppercase">NET P/L</p><p className={`text-lg md:text-xl font-bold font-mono ${summary.totals.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>Rs.{summary.totals.netProfit.toLocaleString()}</p></div>
                <div className="bg-slate-800/50 p-4 rounded border border-slate-700 shadow-lg"><p className="text-[10px] md:text-xs text-slate-500 font-bold uppercase">BETS COUNT</p><p className="text-lg md:text-xl font-bold font-mono text-amber-400">{summary.totalBets}</p></div>
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
                    <button onClick={fetchExposure} disabled={isLoading} className="px-4 py-2 bg-slate-700 rounded hover:bg-slate-600 transition-all font-bold text-xs disabled:opacity-50">
                        {isLoading ? "REFRESHING..." : "RELOAD"}
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="space-y-12">
                    <div className="h-48 skeleton rounded-lg"></div>
                    <div className="grid grid-cols-2 gap-8">
                        <div className="h-32 skeleton rounded-lg"></div>
                        <div className="h-32 skeleton rounded-lg"></div>
                    </div>
                </div>
            ) : exposure && selectedGame ? (
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
  const [isSyncing, setIsSyncing] = useState(true);
  const [gameWinnerModal, setGameWinnerModal] = useState<Game | null>(null);
  const [gameTimeModal, setGameTimeModal] = useState<Game | null>(null);
  const [winningNumberInput, setWinningNumberInput] = useState('');
  const [drawTimeInput, setDrawTimeInput] = useState('');
  const [isUpdatingWinner, setIsUpdatingWinner] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [viewingLedgerFor, setViewingLedgerFor] = useState<User | Dealer | null>(null);
  const { fetchWithAuth } = useAuth();

  const fetchSummary = async (showLoader = false) => {
    if (showLoader) setIsSyncing(true);
    try {
      const response = await fetchWithAuth('/api/admin/summary');
      const data = await response.json();
      setSummaryData(data);
    } catch (e) { console.error(e); } finally { setIsSyncing(false); }
  };

  useEffect(() => { fetchSummary(true); }, [activeTab]);

  const tabs = [
    { id: 'dashboard', label: 'Home', icon: Icons.chartBar },
    { id: 'live', label: 'Market', icon: Icons.eye },
    { id: 'dealers', label: 'Dealers', icon: Icons.userGroup }, 
    { id: 'users', label: 'Users', icon: Icons.user },
    { id: 'games', label: 'Games', icon: Icons.gamepad },
  ];

  const handleWinningNumberSubmit = async () => {
      if (!gameWinnerModal) return;
      setIsProcessing(true);
      try {
          if (isUpdatingWinner) {
              await updateWinner(gameWinnerModal.id, winningNumberInput);
          } else {
              await declareWinner(gameWinnerModal.id, winningNumberInput);
          }
          setGameWinnerModal(null);
          setWinningNumberInput('');
          await fetchSummary(false);
      } catch (e) {
          alert("Declaration failed: " + e);
      } finally {
          setIsProcessing(false);
      }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-end border-b border-slate-800 pb-4">
          <h2 className="text-xl md:text-2xl font-bold text-red-500 uppercase tracking-widest">ADMIN CONSOLE</h2>
          <p className="text-[10px] md:text-xs text-slate-500 font-mono hidden sm:block">SYNCED: {new Date().toLocaleTimeString()}</p>
      </div>
      
      <div className="bg-slate-800/50 p-1 rounded-lg flex space-x-2 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center space-x-2 py-2 px-4 text-[10px] md:text-xs font-bold rounded transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-red-600 text-white' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
            {tab.icon} <span>{tab.label.toUpperCase()}</span>
          </button>
        ))}
      </div>
      
      {activeTab === 'dashboard' && <DashboardView summary={summaryData} admin={admin} />}
      {activeTab === 'live' && <LiveMarketView games={games} />}

      {(activeTab === 'dealers' || activeTab === 'users') && isSyncing ? <TableSkeleton /> : (
          <>
            {activeTab === 'dealers' && (
                <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                    <div className="overflow-x-auto mobile-scroll-x">
                        <table className="w-full text-left min-w-[700px]">
                            <thead className="bg-slate-800 text-[10px] md:text-xs text-slate-400 uppercase"><tr><th className="p-4">Dealer</th><th className="p-4">Contact</th><th className="p-4 text-right">Wallet</th><th className="p-4">Status</th><th className="p-4 text-center">Actions</th></tr></thead>
                            <tbody className="divide-y divide-slate-700">
                                {dealers.map((d: Dealer) => (
                                    <tr key={d.id} className="hover:bg-cyan-500/5 text-xs md:text-sm">
                                        <td className="p-4"><p className="font-bold text-white">{d.name}</p><p className="text-[10px] text-slate-500 font-mono">{d.id}</p></td>
                                        <td className="p-4 text-slate-400">{d.contact}</td>
                                        <td className="p-4 text-right font-mono text-cyan-400">Rs.{d.wallet.toLocaleString()}</td>
                                        <td className="p-4"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${d.isRestricted ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>{d.isRestricted ? 'OFF' : 'ON'}</span></td>
                                        <td className="p-4 text-center">
                                            <button onClick={() => setViewingLedgerFor(d)} className="p-1.5 bg-slate-700 rounded text-cyan-400 hover:bg-slate-600">📖</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'users' && (
                <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                    <div className="overflow-x-auto mobile-scroll-x">
                        <table className="w-full text-left min-w-[700px]">
                            <thead className="bg-slate-800 text-[10px] md:text-xs text-slate-400 uppercase"><tr><th className="p-4">User</th><th className="p-4">Parent</th><th className="p-4 text-right">Wallet</th><th className="p-4">Status</th><th className="p-4 text-center">Actions</th></tr></thead>
                            <tbody className="divide-y divide-slate-800">
                                {users.map((u: User) => (
                                    <tr key={u.id} className="hover:bg-cyan-500/5 text-xs md:text-sm">
                                        <td className="p-4"><p className="font-bold text-white">{u.name}</p><p className="text-[10px] text-slate-500 font-mono">{u.id}</p></td>
                                        <td className="p-4 text-slate-500 text-[10px] font-mono">{u.dealerId}</td>
                                        <td className="p-4 text-right font-mono text-cyan-400">Rs.{u.wallet.toLocaleString()}</td>
                                        <td className="p-4"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${u.isRestricted ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>{u.isRestricted ? 'OFF' : 'ON'}</span></td>
                                        <td className="p-4 text-center">
                                            <button onClick={() => setViewingLedgerFor(u)} className="p-1.5 bg-slate-700 rounded text-cyan-400 hover:bg-slate-600">📖</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
          </>
      )}

      {activeTab === 'games' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {games.map((game: Game) => (
                  <div key={game.id} className="bg-slate-800/50 p-6 rounded border border-slate-700 flex flex-col justify-between transition-all hover:border-slate-500">
                      <div className="flex justify-between mb-4">
                        <div>
                          <h4 className="font-bold text-white text-lg">{game.name}</h4>
                          <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">{game.id}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-cyan-400 font-bold font-mono">{formatTime12h(game.drawTime)}</p>
                          <p className="text-[10px] text-slate-500 uppercase">Draw Time</p>
                        </div>
                      </div>

                      <div className={`text-center p-4 bg-black/40 rounded-lg mb-6 border ${game.winningNumber ? 'border-emerald-500/50 shadow-lg shadow-emerald-500/10' : 'border-slate-700'}`}>
                          <p className={`text-3xl font-bold font-mono tracking-tighter ${game.winningNumber ? 'text-emerald-400' : 'text-slate-600'}`}>{game.winningNumber || '--'}</p>
                          <p className="text-[10px] text-slate-500 uppercase mt-1">{game.winningNumber ? 'Winning Number Set' : 'Result Pending'}</p>
                      </div>

                      <div className="flex gap-2">
                          <button 
                            onClick={() => { setGameWinnerModal(game); setWinningNumberInput(game.winningNumber || ''); setIsUpdatingWinner(!!game.winningNumber); }} 
                            className={`flex-1 py-2 ${game.winningNumber ? 'bg-amber-600 hover:bg-amber-500' : 'bg-red-600 hover:bg-red-500'} text-white rounded font-bold text-[10px] uppercase transition-all shadow-lg active:scale-95`}
                          >
                            {game.winningNumber ? 'Edit Result' : 'Declare Result'}
                          </button>
                          <button 
                            onClick={() => { setGameTimeModal(game); setDrawTimeInput(game.drawTime); }} 
                            className="p-2 bg-slate-700 hover:bg-slate-600 text-cyan-400 rounded transition-colors shadow-lg active:scale-95"
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
      <Modal isOpen={!!gameWinnerModal} onClose={() => setGameWinnerModal(null)} title="Market Result Declaration" themeColor="red">
          <div className="space-y-6">
              <div className="text-center bg-slate-800/50 p-4 rounded border border-slate-700">
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">Target Game</p>
                  <p className="text-xl md:text-2xl font-bold text-white uppercase">{gameWinnerModal?.name}</p>
                  <p className="text-xs md:text-sm text-red-400 font-mono mt-1">ID: {gameWinnerModal?.id} | DRAW: {formatTime12h(gameWinnerModal?.drawTime || '')}</p>
              </div>
              <input maxLength={2} type="text" autoFocus value={winningNumberInput} onChange={e => setWinningNumberInput(e.target.value.replace(/\D/g, ''))} className="w-full bg-slate-950 p-4 text-5xl md:text-6xl text-center font-bold text-red-500 border-2 border-slate-700 rounded focus:ring-4 focus:ring-red-600/20 outline-none" placeholder="--" />
              <button 
                onClick={handleWinningNumberSubmit}
                disabled={isProcessing}
                className="w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded font-bold uppercase transition-all shadow-lg shadow-red-600/20 disabled:bg-slate-700 disabled:opacity-50"
              >
                {isProcessing ? 'BROADCASTING...' : 'Confirm & Broadcast Winner'}
              </button>
          </div>
      </Modal>

    </div>
  );
};

export default AdminPanel;
