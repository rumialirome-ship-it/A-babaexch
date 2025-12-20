
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

const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: 'md' | 'lg' | 'xl'; themeColor?: string }> = ({ isOpen, onClose, title, children, size = 'md', themeColor = 'cyan' }) => {
    if (!isOpen) return null;
    const sizeClasses: Record<string, string> = { md: 'max-w-md', lg: 'max-w-3xl', xl: 'max-w-5xl' };
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className={`bg-slate-900/90 rounded-lg shadow-2xl w-full border border-${themeColor}-500/30 ${sizeClasses[size]} flex flex-col max-h-[90vh]`}>
                <div className="flex justify-between items-center p-5 border-b border-slate-700 flex-shrink-0">
                    <h3 className={`text-lg font-bold text-${themeColor}-400 uppercase tracking-widest`}>{title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">{Icons.close}</button>
                </div>
                <div className="p-6 overflow-y-auto">{children}</div>
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
            <p className={`text-3xl font-bold font-mono ${color}`}>{(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
    );
    
    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-white">Financial Dashboard</h3>
                <button 
                    onClick={getAiInsights}
                    disabled={isAiLoading}
                    className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-bold py-2 px-4 rounded-md transition-all disabled:animate-none"
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
                <SummaryCard title="Total Bets Placed" value={summary.totals?.totalStake} color="text-white" />
                <SummaryCard title="Total Prize Payouts" value={summary.totals?.totalPayouts} color="text-amber-400" />
                <SummaryCard title="Net System Profit" value={summary.totals?.netProfit} color={(summary.totals?.netProfit || 0) >= 0 ? "text-green-400" : "text-red-400"} />
            </div>

            <h3 className="text-xl font-semibold text-white mb-4">Game-by-Game Breakdown</h3>
            <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                <div className="overflow-x-auto">
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
                            {summary.games?.map(game => (
                                <tr key={game.gameName} className="hover:bg-cyan-500/10 transition-colors">
                                    <td className="p-4 font-medium text-white">{game.gameName} <span className="text-xs text-slate-400">({game.winningNumber})</span></td>
                                    <td className="p-4 text-right font-mono text-white">{(game.totalStake || 0).toFixed(2)}</td>
                                    <td className="p-4 text-right font-mono text-amber-400">{(game.totalPayouts || 0).toFixed(2)}</td>
                                    <td className={`p-4 text-right font-mono font-bold ${(game.netProfit || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>{(game.netProfit || 0).toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const DealerForm: React.FC<{ dealer?: Dealer; onSave: (dealer: Dealer, originalId?: string) => Promise<void>; onCancel: () => void }> = ({ dealer, onSave, onCancel }) => {
    const [formData, setFormData] = useState<any>(dealer || {
        id: '', name: '', password: '', area: '', contact: '', wallet: 0, commissionRate: 0, 
        isRestricted: false, prizeRates: { oneDigitOpen: 80, oneDigitClose: 80, twoDigit: 800 }
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSave(formData, dealer?.id);
    };

    const inputClass = "w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:outline-none text-white";

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Dealer Login ID</label>
                <input type="text" value={formData.id} onChange={e => setFormData({...formData, id: e.target.value})} className={inputClass} disabled={!!dealer} required />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Dealer Name</label>
                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className={inputClass} required />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Password</label>
                <input type="text" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className={inputClass} required />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Commission Rate (%)</label>
                <input type="number" value={formData.commissionRate} onChange={e => setFormData({...formData, commissionRate: parseFloat(e.target.value)})} className={inputClass} required />
            </div>
            <div className="grid grid-cols-3 gap-2">
                <div>
                    <label className="block text-xs text-slate-500 mb-1">1D Open Rate</label>
                    <input type="number" value={formData.prizeRates.oneDigitOpen} onChange={e => setFormData({...formData, prizeRates: {...formData.prizeRates, oneDigitOpen: parseInt(e.target.value)}})} className={inputClass} />
                </div>
                <div>
                    <label className="block text-xs text-slate-500 mb-1">1D Close Rate</label>
                    <input type="number" value={formData.prizeRates.oneDigitClose} onChange={e => setFormData({...formData, prizeRates: {...formData.prizeRates, oneDigitClose: parseInt(e.target.value)}})} className={inputClass} />
                </div>
                <div>
                    <label className="block text-xs text-slate-500 mb-1">2D Rate</label>
                    <input type="number" value={formData.prizeRates.twoDigit} onChange={e => setFormData({...formData, prizeRates: {...formData.prizeRates, twoDigit: parseInt(e.target.value)}})} className={inputClass} />
                </div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-700 rounded-md">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-cyan-600 rounded-md font-bold">Save Dealer</button>
            </div>
        </form>
    );
};

const TransactionForm: React.FC<{ type: 'topup' | 'withdraw'; accountId: string; onConfirm: (amount: number) => Promise<void>; onCancel: () => void }> = ({ type, accountId, onConfirm, onCancel }) => {
    const [amount, setAmount] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(false);

    return (
        <div className="space-y-4">
            <p className="text-slate-300">Target Account: <span className="text-white font-bold">{accountId}</span></p>
            <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Amount (PKR)</label>
                <input type="number" value={amount} onChange={e => setAmount(parseFloat(e.target.value))} className="w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 text-white" />
            </div>
            <div className="flex justify-end gap-3">
                <button onClick={onCancel} className="px-4 py-2 bg-slate-700 rounded-md">Cancel</button>
                <button 
                    disabled={isLoading || amount <= 0}
                    onClick={async () => { setIsLoading(true); await onConfirm(amount); setIsLoading(false); }} 
                    className={`px-4 py-2 rounded-md font-bold ${type === 'topup' ? 'bg-green-600' : 'bg-red-600'}`}
                >
                    {isLoading ? 'Processing...' : (type === 'topup' ? 'Confirm Topup' : 'Confirm Withdrawal')}
                </button>
            </div>
        </div>
    );
};

interface AdminPanelProps {
  admin: Admin; 
  dealers: Dealer[]; 
  onSaveDealer: (dealer: Dealer, originalId?: string) => Promise<void>;
  users: User[]; 
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  games: Game[]; 
  bets: Bet[]; 
  declareWinner: (gameId: string, winningNumber: string) => Promise<void>;
  updateWinner: (gameId: string, newWinningNumber: string) => Promise<void>;
  approvePayouts: (gameId: string) => Promise<void>;
  topUpDealerWallet: (dealerId: string, amount: number) => Promise<void>;
  withdrawFromDealerWallet: (dealerId: string, amount: number) => Promise<void>;
  toggleAccountRestriction: (accountId: string, accountType: 'user' | 'dealer') => Promise<void>;
  onPlaceAdminBets: (details: { userId: string; gameId: string; betGroups: any[]; }) => Promise<void>;
  updateGameDrawTime: (gameId: string, newDrawTime: string) => Promise<void>;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ admin, dealers, onSaveDealer, users, games, bets, declareWinner, updateWinner, approvePayouts, topUpDealerWallet, withdrawFromDealerWallet, toggleAccountRestriction, updateGameDrawTime }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [summaryData, setSummaryData] = useState<FinancialSummary | null>(null);
  const [selectedDealer, setSelectedDealer] = useState<Dealer | undefined>(undefined);
  const [isDealerModalOpen, setIsDealerModalOpen] = useState(false);
  const [transactionType, setTransactionType] = useState<'topup' | 'withdraw' | null>(null);
  const [activeTransactionDealer, setActiveTransactionDealer] = useState<Dealer | null>(null);
  const [activeLedgerAccount, setActiveLedgerAccount] = useState<Dealer | User | null>(null);
  const [gameWinnerModal, setGameWinnerModal] = useState<Game | null>(null);
  const [winningNumberInput, setWinningNumberInput] = useState('');
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
    { id: 'users', label: 'Users', icon: Icons.user },
    { id: 'games', label: 'Games', icon: Icons.gamepad },
    { id: 'history', label: 'History', icon: Icons.bookOpen },
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

      {activeTab === 'dealers' && (
          <div className="space-y-6">
              <div className="flex justify-between items-center">
                  <h3 className="text-xl font-bold text-white">Dealer Management</h3>
                  <button onClick={() => { setSelectedDealer(undefined); setIsDealerModalOpen(true); }} className="px-4 py-2 bg-cyan-600 rounded-md font-bold flex items-center gap-2">
                      {Icons.plus} Add New Dealer
                  </button>
              </div>
              <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                  <table className="w-full text-left">
                      <thead className="bg-slate-800/50">
                          <tr className="text-xs uppercase text-slate-400">
                              <th className="p-4">ID / Name</th>
                              <th className="p-4">Area</th>
                              <th className="p-4 text-right">Wallet (PKR)</th>
                              <th className="p-4">Status</th>
                              <th className="p-4 text-center">Actions</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700">
                          {dealers.map(d => (
                              <tr key={d.id} className="hover:bg-cyan-500/5 transition-colors">
                                  <td className="p-4">
                                      <p className="font-bold text-white">{d.name}</p>
                                      <p className="text-xs text-slate-500 font-mono">{d.id}</p>
                                  </td>
                                  <td className="p-4 text-slate-300">{d.area || '-'}</td>
                                  <td className="p-4 text-right font-mono text-cyan-400">{d.wallet.toLocaleString()}</td>
                                  <td className="p-4">
                                      <span className={`px-2 py-1 rounded text-[10px] font-bold ${d.isRestricted ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                                          {d.isRestricted ? 'RESTRICTED' : 'ACTIVE'}
                                      </span>
                                  </td>
                                  <td className="p-4">
                                      <div className="flex justify-center gap-2">
                                          <button onClick={() => { setSelectedDealer(d); setIsDealerModalOpen(true); }} className="p-2 bg-slate-700 rounded hover:text-cyan-400 transition-colors" title="Edit Dealer">{Icons.clipboardList}</button>
                                          <button onClick={() => setActiveLedgerAccount(d)} className="p-2 bg-slate-700 rounded hover:text-blue-400 transition-colors" title="View Ledger">{Icons.bookOpen}</button>
                                          <button onClick={() => { setTransactionType('topup'); setActiveTransactionDealer(d); }} className="p-2 bg-slate-700 rounded text-green-400 hover:bg-green-600 hover:text-white transition-colors" title="Topup">{Icons.plus}</button>
                                          <button onClick={() => { setTransactionType('withdraw'); setActiveTransactionDealer(d); }} className="p-2 bg-slate-700 rounded text-red-400 hover:bg-red-600 hover:text-white transition-colors" title="Withdraw">{Icons.minus}</button>
                                          <button onClick={() => toggleAccountRestriction(d.id, 'dealer')} className="p-2 bg-slate-700 rounded text-amber-400 transition-colors" title="Toggle Restriction">🔒</button>
                                      </div>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      )}

      {activeTab === 'users' && (
          <div className="space-y-6">
              <h3 className="text-xl font-bold text-white">System-Wide Users</h3>
              <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                  <table className="w-full text-left">
                      <thead className="bg-slate-800/50">
                          <tr className="text-xs uppercase text-slate-400">
                              <th className="p-4">User ID / Name</th>
                              <th className="p-4">Parent Dealer</th>
                              <th className="p-4 text-right">Wallet</th>
                              <th className="p-4 text-center">Actions</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700">
                          {users.map(u => (
                              <tr key={u.id} className="hover:bg-cyan-500/5 transition-colors">
                                  <td className="p-4">
                                      <p className="font-bold text-white">{u.name}</p>
                                      <p className="text-xs text-slate-500">{u.id}</p>
                                  </td>
                                  <td className="p-4">
                                      <span className="text-xs bg-slate-700 px-2 py-1 rounded text-slate-300">{u.dealerId}</span>
                                  </td>
                                  <td className="p-4 text-right font-mono text-cyan-400">{u.wallet.toLocaleString()}</td>
                                  <td className="p-4">
                                      <div className="flex justify-center gap-2">
                                          <button onClick={() => setActiveLedgerAccount(u)} className="p-2 bg-slate-700 rounded hover:text-cyan-400 transition-colors">{Icons.bookOpen}</button>
                                          <button onClick={() => toggleAccountRestriction(u.id, 'user')} className={`p-2 bg-slate-700 rounded ${u.isRestricted ? 'text-red-400' : 'text-slate-400'}`}>🔒</button>
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
          <div className="space-y-6">
              <h3 className="text-xl font-bold text-white">Game Market Controls</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {games.map(game => (
                      <div key={game.id} className="bg-slate-800/50 p-6 rounded-lg border border-slate-700 flex flex-col justify-between">
                          <div>
                              <div className="flex justify-between items-start mb-4">
                                  <div>
                                      <h4 className="text-xl font-bold text-white">{game.name}</h4>
                                      <p className="text-xs text-slate-400">Draw Time: {game.drawTime}</p>
                                  </div>
                                  <img src={game.logo} alt="" className="w-10 h-10 rounded-full" />
                              </div>
                              <div className="text-center p-4 bg-black/30 rounded mb-4">
                                  <p className="text-[10px] text-slate-500 uppercase">Winning Number</p>
                                  <p className="text-3xl font-bold text-cyan-400 font-mono">{game.winningNumber || '--'}</p>
                              </div>
                          </div>
                          <div className="space-y-2">
                              {!game.winningNumber ? (
                                  <button onClick={() => { setGameWinnerModal(game); setWinningNumberInput(''); }} className="w-full py-2 bg-cyan-600 rounded font-bold text-sm">DECLARE WINNER</button>
                              ) : (
                                  <div className="grid grid-cols-2 gap-2">
                                      <button onClick={() => { setGameWinnerModal(game); setWinningNumberInput(game.winningNumber || ''); }} className="py-2 bg-slate-700 rounded text-sm">EDIT WIN</button>
                                      <button disabled={game.payoutsApproved} onClick={() => approvePayouts(game.id)} className="py-2 bg-emerald-600 disabled:bg-slate-700 rounded font-bold text-sm">
                                          {game.payoutsApproved ? 'PAID OUT' : 'APPROVE'}
                                      </button>
                                  </div>
                              )}
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      )}

      {activeTab === 'history' && (
          <div className="space-y-6">
              <h3 className="text-xl font-bold text-white">System History Logs</h3>
              <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                  <div className="max-h-[600px] overflow-y-auto">
                      <table className="w-full text-left">
                          <thead className="bg-slate-800/50 sticky top-0">
                              <tr className="text-xs text-slate-400">
                                  <th className="p-4">Time</th>
                                  <th className="p-4">Account</th>
                                  <th className="p-4">Type</th>
                                  <th className="p-4">Description</th>
                                  <th className="p-4 text-right">Debit</th>
                                  <th className="p-4 text-right">Credit</th>
                                  <th className="p-4 text-right">Balance</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-700 text-sm">
                              {bets.map(b => (
                                  <tr key={b.id} className="hover:bg-slate-700/30">
                                      <td className="p-4 text-slate-500 text-xs">{new Date(b.timestamp).toLocaleString()}</td>
                                      <td className="p-4 font-mono text-cyan-400">{b.userId}</td>
                                      <td className="p-4 text-xs text-slate-500">BET</td>
                                      <td className="p-4 text-white italic">{b.subGameType} - {b.numbers.length} numbers</td>
                                      <td className="p-4 text-right text-red-400">{b.totalAmount.toFixed(2)}</td>
                                      <td className="p-4 text-right">-</td>
                                      <td className="p-4 text-right text-slate-300">-</td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>
          </div>
      )}

      {/* MODALS */}
      <Modal isOpen={isDealerModalOpen} onClose={() => setIsDealerModalOpen(false)} title={selectedDealer ? "Edit Dealer Account" : "Create New Dealer"}>
          <DealerForm dealer={selectedDealer} onCancel={() => setIsDealerModalOpen(false)} onSave={async (d, oldId) => { await onSaveDealer(d, oldId); setIsDealerModalOpen(false); }} />
      </Modal>

      <Modal isOpen={!!transactionType && !!activeTransactionDealer} onClose={() => { setTransactionType(null); setActiveTransactionDealer(null); }} title={transactionType === 'topup' ? "Topup Dealer Wallet" : "Withdraw from Dealer"}>
          {activeTransactionDealer && transactionType && (
              <TransactionForm 
                type={transactionType} 
                accountId={activeTransactionDealer.id} 
                onCancel={() => { setTransactionType(null); setActiveTransactionDealer(null); }}
                onConfirm={async (amt) => {
                    if (transactionType === 'topup') await topUpDealerWallet(activeTransactionDealer.id, amt);
                    else await withdrawFromDealerWallet(activeTransactionDealer.id, amt);
                    setTransactionType(null);
                    setActiveTransactionDealer(null);
                }}
              />
          )}
      </Modal>

      <Modal isOpen={!!gameWinnerModal} onClose={() => setGameWinnerModal(null)} title={`Declare Winner: ${gameWinnerModal?.name}`}>
          <div className="space-y-4">
              <div>
                  <label className="block text-sm text-slate-400 mb-1">Enter Winning Number (e.g. 42)</label>
                  <input maxLength={2} type="text" value={winningNumberInput} onChange={e => setWinningNumberInput(e.target.value)} className="w-full bg-slate-800 p-4 text-3xl text-center font-bold text-cyan-400 border border-slate-600 rounded" />
              </div>
              <button onClick={() => { if (gameWinnerModal) declareWinner(gameWinnerModal.id, winningNumberInput); setGameWinnerModal(null); }} className="w-full py-4 bg-cyan-600 rounded font-bold">SUBMIT RESULT</button>
          </div>
      </Modal>

      <Modal isOpen={!!activeLedgerAccount} onClose={() => setActiveLedgerAccount(null)} size="lg" title={`Ledger: ${activeLedgerAccount?.name} (${activeLedgerAccount?.id})`}>
          <div className="bg-slate-800/50 rounded overflow-hidden">
              <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900/50">
                      <tr className="text-xs text-slate-400">
                          <th className="p-3">Time</th>
                          <th className="p-3">Desc</th>
                          <th className="p-3 text-right">Debit</th>
                          <th className="p-3 text-right">Credit</th>
                          <th className="p-3 text-right">Balance</th>
                      </tr>
                  </thead>
                  <tbody>
                      {(activeLedgerAccount as any)?.ledger?.map((l: any) => (
                          <tr key={l.id} className="border-t border-slate-700">
                              <td className="p-3 text-slate-500 text-xs">{new Date(l.timestamp).toLocaleString()}</td>
                              <td className="p-3 text-white">{l.description}</td>
                              <td className="p-3 text-right text-red-400">{l.debit > 0 ? l.debit.toFixed(2) : '-'}</td>
                              <td className="p-3 text-right text-green-400">{l.credit > 0 ? l.credit.toFixed(2) : '-'}</td>
                              <td className="p-3 text-right font-bold">{l.balance.toFixed(2)}</td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      </Modal>

    </div>
  );
};

export default AdminPanel;
