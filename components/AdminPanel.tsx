
import React, { useState, useMemo, useEffect } from 'react';
import { Dealer, User, Game, PrizeRates, LedgerEntry, Bet, NumberLimit, SubGameType, Admin } from '../types';
// Import GAME_LOGOS to provide fallback icons for games
import { Icons, GAME_LOGOS } from '../constants';
import { useAuth } from '../hooks/useAuth';

// --- TYPE DEFINITIONS FOR DASHBOARD ---
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

// --- INTERNAL COMPONENTS ---
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

// Fixed: Correctly implemented DealerForm and ensured it returns a ReactNode
const DealerForm: React.FC<{ dealer?: Dealer; dealers: Dealer[]; onSave: (dealer: Dealer, originalId?: string) => Promise<void>; onCancel: () => void; adminPrizeRates: PrizeRates }> = ({ dealer, dealers, onSave, onCancel, adminPrizeRates }) => {
    const [formData, setFormData] = useState(() => {
        const defaults = { id: '', name: '', password: '', area: '', contact: '', commissionRate: 0, prizeRates: { ...adminPrizeRates }, avatarUrl: '', wallet: 0 };
        if (dealer) {
            return { ...dealer, password: '' };
        }
        return defaults;
    });
    
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        if (name.includes('.')) {
            const [parent, child] = name.split('.');
            setFormData(prev => ({ ...prev, [parent]: { ...(prev[parent as keyof typeof prev] as object), [child]: type === 'number' ? parseFloat(value) : value } }));
        } else {
            setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : (type === 'number' ? parseFloat(value) : value) }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const newPassword = dealer ? password : formData.password;
        if (newPassword && confirmPassword && newPassword !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        const finalDealer: Dealer = {
            ...formData,
            id: dealer ? dealer.id : formData.id,
            password: newPassword || (dealer?.password ?? ''),
            isRestricted: dealer?.isRestricted ?? false,
            ledger: dealer?.ledger ?? [],
            wallet: dealer ? dealer.wallet : (Number(formData.wallet) || 0)
        };

        try {
            await onSave(finalDealer, dealer?.id);
        } catch (err: any) {
            setError(err.message || "Failed to save dealer.");
        }
    };

    const inputClass = "w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:outline-none text-white mb-4";

    return (
        <form onSubmit={handleSubmit} className="text-slate-200">
            {error && <div className="bg-red-500/20 border border-red-500/30 text-red-400 p-3 rounded mb-4 text-sm">{error}</div>}
            
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Dealer ID</label>
            <input type="text" name="id" value={formData.id} onChange={handleChange} disabled={!!dealer} className={inputClass} required />
            
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Name</label>
            <input type="text" name="name" value={formData.name} onChange={handleChange} className={inputClass} required />
            
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Password</label>
                    <input type={isPasswordVisible ? "text" : "password"} name="password" value={dealer ? password : formData.password} onChange={dealer ? (e) => setPassword(e.target.value) : handleChange} className={inputClass} required={!dealer} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Confirm Password</label>
                    <input type={isPasswordVisible ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} required={!!(dealer ? password : formData.password)} />
                </div>
            </div>

            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Commission Rate (%)</label>
            <input type="number" name="commissionRate" value={formData.commissionRate} onChange={handleChange} className={inputClass} />

            <div className="flex justify-end gap-3 mt-4">
                <button type="button" onClick={onCancel} className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded font-bold">Cancel</button>
                <button type="submit" className="bg-cyan-600 hover:bg-cyan-500 px-4 py-2 rounded font-bold">Save Dealer</button>
            </div>
        </form>
    );
};

interface AdminPanelProps {
  admin: Admin;
  dealers: Dealer[];
  users: User[];
  games: Game[];
  bets: Bet[];
  declareWinner: (gameId: string, winningNumber: string) => void;
  updateWinner: (gameId: string, winningNumber: string) => void;
  approvePayouts: (gameId: string) => void;
  topUpDealerWallet: (dealerId: string, amount: number) => void;
  withdrawFromDealerWallet: (dealerId: string, amount: number) => void;
  toggleAccountRestriction: (accountId: string, accountType: 'user' | 'dealer') => void;
  onPlaceAdminBets: (details: { gameId: string; betGroups: any[] }) => Promise<void>;
  updateGameDrawTime: (gameId: string, drawTime: string) => Promise<void>;
  onSaveDealer: (dealer: Dealer, originalId?: string) => Promise<void>;
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
}

// Added implementation of AdminPanel
const AdminPanel: React.FC<AdminPanelProps> = ({ admin, dealers, users, games, bets, onSaveDealer, toggleAccountRestriction }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isDealerModalOpen, setIsDealerModalOpen] = useState(false);
  const [selectedDealer, setSelectedDealer] = useState<Dealer | undefined>(undefined);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: Icons.chartBar },
    { id: 'dealers', label: 'Dealers', icon: Icons.userGroup },
    { id: 'games', label: 'Games', icon: Icons.gamepad },
    { id: 'ledger', label: 'Ledger', icon: Icons.bookOpen },
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
            <h2 className="text-3xl font-black text-cyan-500 tracking-tighter uppercase">Admin Terminal</h2>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-4">
                <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Master Wallet</p>
                    <p className="text-xl font-mono font-bold text-cyan-400">{admin.wallet.toLocaleString()} PKR</p>
                </div>
            </div>
        </div>

        <div className="flex gap-2 mb-8 bg-slate-900/50 p-1.5 rounded-xl border border-slate-800 self-start">
            {tabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === tab.id ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/20' : 'text-slate-500 hover:text-white'}`}>
                    {tab.icon} {tab.label}
                </button>
            ))}
        </div>

        {activeTab === 'dealers' && (
            <div>
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-white">Manage Dealers</h3>
                    <button onClick={() => { setSelectedDealer(undefined); setIsDealerModalOpen(true); }} className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-all">
                        {Icons.plus} Add Dealer
                    </button>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-slate-800/50 border-b border-slate-800">
                            <tr>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Dealer</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Wallet</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Comm %</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Status</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {dealers.map(dealer => (
                                <tr key={dealer.id} className="hover:bg-slate-800/30 transition-colors">
                                    <td className="p-4">
                                        <div className="font-bold text-white">{dealer.name}</div>
                                        <div className="text-[10px] text-slate-500 font-mono">{dealer.id}</div>
                                    </td>
                                    <td className="p-4 font-mono text-cyan-400">{dealer.wallet.toLocaleString()}</td>
                                    <td className="p-4 text-slate-400">{dealer.commissionRate}%</td>
                                    <td className="p-4">
                                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-widest ${dealer.isRestricted ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                            {dealer.isRestricted ? 'Restricted' : 'Active'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => { setSelectedDealer(dealer); setIsDealerModalOpen(true); }} className="p-2 hover:bg-slate-700 rounded text-cyan-400 transition-all">{Icons.user}</button>
                                            <button onClick={() => toggleAccountRestriction(dealer.id, 'dealer')} className={`p-2 rounded transition-all ${dealer.isRestricted ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>{Icons.close}</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {activeTab === 'ledger' && (
            <div>
                <h3 className="text-xl font-bold text-white mb-6">System Ledger</h3>
                <LedgerTable entries={admin.ledger} />
            </div>
        )}

        {activeTab === 'dashboard' && (
            <div className="text-slate-500 italic text-center py-20 bg-slate-900 border border-slate-800 rounded-xl">
                Select a tab to begin managing the system.
            </div>
        )}

        <Modal isOpen={isDealerModalOpen} onClose={() => setIsDealerModalOpen(false)} title={selectedDealer ? "Edit Dealer" : "Add New Dealer"}>
            <DealerForm 
                dealer={selectedDealer} 
                dealers={dealers} 
                onSave={async (d, id) => { await onSaveDealer(d, id); setIsDealerModalOpen(false); }} 
                onCancel={() => setIsDealerModalOpen(false)} 
                adminPrizeRates={admin.prizeRates} 
            />
        </Modal>
    </div>
  );
};

// Fixed: Added default export for AdminPanel
export default AdminPanel;
