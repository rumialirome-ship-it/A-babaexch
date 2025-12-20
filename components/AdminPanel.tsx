
import React, { useState, useMemo, useEffect } from 'react';
import { Dealer, User, Game, PrizeRates, LedgerEntry, Bet, Admin, SubGameType } from '../types';
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

const LiveMarketView: React.FC<{ games: Game[] }> = ({ games }) => {
    const { fetchWithAuth } = useAuth();
    const [selectedGameId, setSelectedGameId] = useState(games[0]?.id || '');
    const [exposure, setExposure] = useState<Record<string, number>>({});
    const [isLoading, setIsLoading] = useState(false);

    const fetchExposure = async () => {
        if (!selectedGameId) return;
        setIsLoading(true);
        try {
            const res = await fetchWithAuth(`/api/admin/games/${selectedGameId}/exposure`);
            const data = await res.json();
            setExposure(data.exposure);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchExposure(); }, [selectedGameId]);

    const maxStake = Math.max(...Object.values(exposure), 1);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    {Icons.sparkles} Live Market Exposure
                </h3>
                <div className="flex gap-2">
                    <select 
                        value={selectedGameId} 
                        onChange={(e) => setSelectedGameId(e.target.value)}
                        className="bg-slate-800 border border-slate-700 text-white p-2 rounded focus:ring-2 focus:ring-cyan-500"
                    >
                        {games.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                    <button onClick={fetchExposure} className="p-2 bg-slate-700 rounded hover:bg-slate-600 transition-colors">
                        Refresh
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                {Object.entries(exposure).sort(([a], [b]) => a.localeCompare(b)).map(([num, stake]) => {
                    const intensity = (stake / maxStake) * 100;
                    return (
                        <div 
                            key={num} 
                            className="group relative flex flex-col items-center justify-center p-2 rounded border border-slate-700 transition-all hover:scale-110 z-10 hover:z-20"
                            style={{ backgroundColor: stake > 0 ? `rgba(6, 182, 212, ${Math.max(0.1, intensity/100)})` : 'transparent' }}
                        >
                            <span className="text-lg font-bold text-white">{num}</span>
                            <span className="text-[10px] font-mono text-cyan-200">Rs.{stake.toFixed(0)}</span>
                            {/* Tooltip */}
                            <div className="absolute bottom-full mb-2 hidden group-hover:block bg-slate-950 p-2 rounded shadow-xl text-xs whitespace-nowrap border border-cyan-500">
                                <p>Number: <span className="font-bold">{num}</span></p>
                                <p>Total Played: <span className="font-bold text-cyan-400">Rs.{stake.toLocaleString()}</span></p>
                                <p>Potential Loss: <span className="font-bold text-red-400">Rs.{(stake * 900).toLocaleString()}</span></p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const WinnersReportView: React.FC<{ bets: Bet[], games: Game[], users: User[] }> = ({ bets, games, users }) => {
    const winners = useMemo(() => {
        return bets.filter(bet => {
            const game = games.find(g => g.id === bet.gameId);
            if (!game || !game.winningNumber) return false;
            // Fix: bet.numbers is already a string array in the Bet interface, no parsing needed
            const nums = bet.numbers;
            return nums.includes(game.winningNumber);
        }).map(bet => {
            const game = games.find(g => g.id === bet.gameId)!;
            const user = users.find(u => u.id === bet.userId);
            const prizeRate = 900; // Simplified for report
            // Fix: amountPerNumber uses camelCase in frontend types
            const winAmount = (bet.amountPerNumber || 0) * prizeRate;
            return {
                id: bet.id,
                userName: user?.name || bet.userId,
                gameName: game.name,
                winningNumber: game.winningNumber,
                // Fix: amountPerNumber uses camelCase in frontend types
                stake: bet.amountPerNumber,
                prize: winAmount,
                timestamp: bet.timestamp
            };
        });
    }, [bets, games, users]);

    return (
        <div className="space-y-4">
            <h3 className="text-xl font-bold text-white">Winners Detailed Report</h3>
            <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                <div className="max-h-[500px] overflow-y-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-900 sticky top-0">
                            <tr className="text-xs text-slate-400 uppercase">
                                <th className="p-4">Time</th>
                                <th className="p-4">User</th>
                                <th className="p-4">Game</th>
                                <th className="p-4">Number</th>
                                <th className="p-4 text-right">Stake</th>
                                <th className="p-4 text-right">Prize Won</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {winners.map(w => (
                                <tr key={w.id} className="hover:bg-emerald-500/10">
                                    <td className="p-4 text-xs text-slate-500">{new Date(w.timestamp).toLocaleString()}</td>
                                    <td className="p-4 font-bold text-white">{w.userName}</td>
                                    <td className="p-4 text-slate-300">{w.gameName}</td>
                                    <td className="p-4 font-mono text-emerald-400 font-bold">{w.winningNumber}</td>
                                    <td className="p-4 text-right font-mono">Rs.{parseFloat(w.stake as any).toFixed(0)}</td>
                                    <td className="p-4 text-right font-mono text-emerald-400 font-bold">Rs.{w.prize.toLocaleString()}</td>
                                </tr>
                            ))}
                            {winners.length === 0 && (
                                <tr><td colSpan={6} className="p-10 text-center text-slate-500">No winners calculated for current data set.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
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
            const res = await fetchWithAuth('/api/admin/ai-insights', {
                method: 'POST',
                body: JSON.stringify({ summaryData: summary })
            });
            const data = await res.json();
            setAiInsights(data.insights);
        } catch (e) {
            setAiInsights("AI Analysis currently unavailable.");
        } finally {
            setIsAiLoading(false);
        }
    };

    if (!summary) return <div className="text-center p-8 text-slate-400 animate-pulse">Scanning financial data...</div>;

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-white">Executive Overview</h3>
                <button 
                    onClick={getAiInsights}
                    disabled={isAiLoading}
                    className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-bold py-2 px-4 rounded transition-all"
                >
                    {isAiLoading ? "Analyzing..." : "✨ AI Risk Scan"}
                </button>
            </div>

            {aiInsights && (
                <div className="bg-purple-900/20 border border-purple-500/30 p-4 rounded-lg animate-in fade-in slide-in-from-top-4 duration-500">
                    <p className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-1">Risk Intelligence Report</p>
                    <p className="text-slate-200 leading-relaxed italic">"{aiInsights}"</p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                    <p className="text-xs text-slate-500 uppercase font-bold">System Wallet</p>
                    <p className="text-3xl font-bold font-mono text-cyan-400">Rs.{admin.wallet.toLocaleString()}</p>
                </div>
                <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                    <p className="text-xs text-slate-500 uppercase font-bold">Total Stake</p>
                    <p className="text-3xl font-bold font-mono text-white">Rs.{summary.totals.totalStake.toLocaleString()}</p>
                </div>
                <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                    <p className="text-xs text-slate-500 uppercase font-bold">Net System P/L</p>
                    <p className={`text-3xl font-bold font-mono ${summary.totals.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        Rs.{summary.totals.netProfit.toLocaleString()}
                    </p>
                </div>
                <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                    <p className="text-xs text-slate-500 uppercase font-bold">Active Bets</p>
                    <p className="text-3xl font-bold font-mono text-amber-400">{summary.totalBets}</p>
                </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                <table className="w-full text-left">
                    <thead className="bg-slate-800">
                        <tr className="text-xs text-slate-400 uppercase">
                            <th className="p-4">Game</th>
                            <th className="p-4 text-right">Stake</th>
                            <th className="p-4 text-right">Net Profit</th>
                            <th className="p-4 text-center">Market Result</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {summary.games.map(game => (
                            <tr key={game.gameName} className="hover:bg-cyan-500/5 transition-colors">
                                <td className="p-4 font-bold text-white">{game.gameName}</td>
                                <td className="p-4 text-right font-mono">Rs.{game.totalStake.toLocaleString()}</td>
                                <td className={`p-4 text-right font-mono font-bold ${game.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    Rs.{game.netProfit.toLocaleString()}
                                </td>
                                <td className="p-4 text-center">
                                    <span className="px-3 py-1 bg-slate-900 border border-slate-700 rounded font-mono text-cyan-400 font-bold">
                                        {game.winningNumber}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const AdminPanel: React.FC<any> = ({ admin, dealers, users, games, bets, declareWinner, toggleAccountRestriction }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [summaryData, setSummaryData] = useState<FinancialSummary | null>(null);
  const [gameWinnerModal, setGameWinnerModal] = useState<Game | null>(null);
  const [winningNumberInput, setWinningNumberInput] = useState('');
  const { fetchWithAuth } = useAuth();

  const fetchSummary = async () => {
    try {
      const response = await fetchWithAuth('/api/admin/summary');
      const data = await response.json();
      setSummaryData(data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchSummary(); }, [activeTab, fetchWithAuth]);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: Icons.chartBar },
    { id: 'live', label: 'Live Market', icon: Icons.eye },
    { id: 'dealers', label: 'Dealers', icon: Icons.userGroup }, 
    { id: 'users', label: 'Users', icon: Icons.user },
    { id: 'games', label: 'Games', icon: Icons.gamepad },
    { id: 'winners', label: 'Winners Detailed', icon: Icons.star },
    { id: 'history', label: 'All Ledgers', icon: Icons.bookOpen },
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-end">
          <h2 className="text-3xl font-bold text-red-500 uppercase tracking-widest glitch-text" data-text="ADMIN CONSOLE">ADMIN CONSOLE</h2>
          <p className="text-xs text-slate-500 font-mono">System Integrity: 100% | Latency: 4ms</p>
      </div>
      
      <div className="bg-slate-800/50 p-1.5 rounded-lg flex items-center space-x-2 self-start flex-wrap border border-slate-700 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center space-x-2 py-2 px-4 text-xs font-bold rounded transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-red-600 text-white' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
            {tab.icon} <span>{tab.label.toUpperCase()}</span>
          </button>
        ))}
      </div>
      
      {activeTab === 'dashboard' && <DashboardView summary={summaryData} admin={admin} />}
      {activeTab === 'live' && <LiveMarketView games={games} />}
      {activeTab === 'winners' && <WinnersReportView bets={bets} games={games} users={users} />}

      {activeTab === 'dealers' && (
          <div className="space-y-6">
              <h3 className="text-xl font-bold text-white">Network Dealers</h3>
              <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                  <table className="w-full text-left">
                      <thead className="bg-slate-800">
                          <tr className="text-xs uppercase text-slate-400">
                              <th className="p-4">Dealer Identity</th>
                              <th className="p-4">Contact</th>
                              <th className="p-4 text-right">Float (PKR)</th>
                              <th className="p-4">Status</th>
                              <th className="p-4 text-center">Control</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700">
                          {dealers.map((d: any) => (
                              <tr key={d.id} className="hover:bg-cyan-500/5">
                                  <td className="p-4">
                                      <p className="font-bold text-white">{d.name}</p>
                                      <p className="text-xs text-slate-500 font-mono">{d.id}</p>
                                  </td>
                                  <td className="p-4 text-slate-300">{d.contact}</td>
                                  <td className="p-4 text-right font-mono text-cyan-400">{parseFloat(d.wallet).toLocaleString()}</td>
                                  <td className="p-4">
                                      <span className={`px-2 py-1 rounded text-[10px] font-bold ${d.isRestricted ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                                          {d.isRestricted ? 'RESTRICTED' : 'ACTIVE'}
                                      </span>
                                  </td>
                                  <td className="p-4">
                                      <div className="flex justify-center gap-2">
                                          <button onClick={() => toggleAccountRestriction(d.id, 'dealer')} className="p-2 bg-slate-700 rounded text-amber-400 hover:bg-amber-600 hover:text-white">🔒</button>
                                      </div>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      )}

      {activeTab === 'games' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {games.map((game: any) => (
                  <div key={game.id} className="bg-slate-800/50 p-6 rounded-lg border border-slate-700 flex flex-col justify-between group hover:border-cyan-500/50 transition-all">
                      <div>
                          <div className="flex justify-between items-start mb-4">
                              <h4 className="text-xl font-bold text-white uppercase">{game.name}</h4>
                              <p className="text-xs text-slate-400 font-mono">{game.drawTime}</p>
                          </div>
                          <div className="text-center p-6 bg-black/40 rounded mb-4 border border-slate-700 group-hover:bg-cyan-500/10">
                              <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Current Result</p>
                              <p className="text-4xl font-bold text-cyan-400 font-mono tracking-tighter">{game.winningNumber || '--'}</p>
                          </div>
                      </div>
                      <button onClick={() => { setGameWinnerModal(game); setWinningNumberInput(''); }} className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded font-bold uppercase text-xs tracking-widest">Declare Result</button>
                  </div>
              ))}
          </div>
      )}

      {activeTab === 'history' && (
          <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
              <div className="max-h-[600px] overflow-y-auto">
                  <table className="w-full text-left">
                      <thead className="bg-slate-900 sticky top-0">
                          <tr className="text-xs text-slate-400 uppercase">
                              <th className="p-4">Timestamp</th>
                              <th className="p-4">Account ID</th>
                              <th className="p-4">Description</th>
                              <th className="p-4 text-right">Debit</th>
                              <th className="p-4 text-right">Credit</th>
                              <th className="p-4 text-right">Balance</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-xs">
                          {/* Fix: Use camelCase property names mapped from backend in the Bet interface */}
                          {bets.map((b: Bet) => (
                              <tr key={b.id} className="hover:bg-slate-700/30">
                                  <td className="p-4 text-slate-500">{new Date(b.timestamp).toLocaleString()}</td>
                                  <td className="p-4 font-mono text-cyan-400">{b.userId}</td>
                                  <td className="p-4 text-white italic">{b.subGameType} - {b.numbers.join(', ')}</td>
                                  <td className="p-4 text-right text-red-400">{b.totalAmount.toFixed(0)}</td>
                                  <td className="p-4 text-right">-</td>
                                  <td className="p-4 text-right text-slate-400">FLOAT</td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      )}

      {/* WINNER DECLARATION MODAL */}
      <Modal isOpen={!!gameWinnerModal} onClose={() => setGameWinnerModal(null)} title={`DECLARE WINNER: ${gameWinnerModal?.name}`}>
          <div className="space-y-6">
              <p className="text-slate-400 text-center">Submit official result for the draw. This action is critical and will update exposure calculations.</p>
              <div className="flex flex-col items-center">
                  <label className="text-[10px] font-bold text-slate-500 uppercase mb-2">Final Winning Number</label>
                  <input 
                    maxLength={2} 
                    type="text" 
                    autoFocus
                    value={winningNumberInput} 
                    onChange={e => setWinningNumberInput(e.target.value.replace(/\D/g, ''))} 
                    className="w-32 bg-slate-950 p-4 text-6xl text-center font-bold text-red-500 border-2 border-red-500/50 rounded shadow-[0_0_20px_rgba(239,68,68,0.2)] focus:outline-none focus:border-red-500" 
                  />
              </div>
              <button 
                onClick={() => { if (gameWinnerModal && winningNumberInput) declareWinner(gameWinnerModal.id, winningNumberInput); setGameWinnerModal(null); }} 
                className="w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded font-bold shadow-lg shadow-red-500/20"
              >
                  CONFIRM & BROADCAST
              </button>
          </div>
      </Modal>

    </div>
  );
};

export default AdminPanel;
