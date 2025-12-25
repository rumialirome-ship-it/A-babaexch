
import React, { useState, useMemo } from 'react';
import { Dealer, User, PrizeRates, LedgerEntry, BetLimits, Bet, Game, SubGameType } from '../types';
import { Icons } from '../constants';
import { useCountdown } from '../hooks/useCountdown';

const getTodayDateString = () => new Date().toISOString().split('T')[0];

const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: 'md' | 'lg' | 'xl'; themeColor?: string }> = ({ isOpen, onClose, title, children, size = 'md', themeColor = 'emerald' }) => {
    if (!isOpen) return null;
     const sizeClasses: Record<string, string> = { md: 'max-w-md', lg: 'max-w-3xl', xl: 'max-w-5xl' };
    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
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
                    {Array.isArray(entries) && [...entries].reverse().map(entry => (
                        <tr key={entry.id} className="hover:bg-emerald-500/10 text-sm transition-colors">
                            <td className="p-3 text-slate-400 whitespace-nowrap">{entry.timestamp?.toLocaleString() || 'N/A'}</td>
                            <td className="p-3 text-white">{entry.description}</td>
                            <td className="p-3 text-right text-red-400 font-mono">{entry.debit > 0 ? entry.debit.toFixed(2) : '-'}</td>
                            <td className="p-3 text-right text-green-400 font-mono">{entry.credit > 0 ? entry.credit.toFixed(2) : '-'}</td>
                            <td className="p-3 text-right font-semibold text-white font-mono">{entry.balance.toFixed(2)}</td>
                        </tr>
                    ))}
                    {(!Array.isArray(entries) || entries.length === 0) && (
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

const UserForm: React.FC<{ user?: User; users: User[]; onSave: (user: User, originalId?: string, initialDeposit?: number) => Promise<void>; onCancel: () => void; dealerPrizeRates: PrizeRates, dealerId: string }> = ({ user, users, onSave, onCancel, dealerPrizeRates, dealerId }) => {
    const [formData, setFormData] = useState(() => {
        const defaults = {
            id: '', name: '', password: '', area: '', contact: '', commissionRate: 0, 
            prizeRates: { ...dealerPrizeRates }, avatarUrl: '', wallet: '',
            betLimits: { oneDigit: '', twoDigit: '' }
        };
        if (user) {
            return {
                ...user,
                password: '',
                betLimits: {
                    oneDigit: user.betLimits?.oneDigit ?? (user.betLimits as any)?.oneDigitOpen ?? '',
                    twoDigit: user.betLimits?.twoDigit || '',
                }
            };
        }
        return defaults;
    });

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        if (name.includes('.')) {
            const [parent, child] = name.split('.');
            setFormData(prev => ({ ...prev, [parent]: { ...(prev[parent as keyof typeof prev] as object), [child]: type === 'number' ? parseFloat(value) : value } }));
        } else {
            if(!user && name === 'password') { setFormData(prev => ({ ...prev, password: value })); return; }
            setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? (checked as any) : (type === 'number' ? (value ? parseFloat(value) : '') : value) }));
        }
    };
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        const newPassword = user ? password : formData.password!;
        if (newPassword && newPassword !== confirmPassword) { setError("New passwords do not match."); return; }
        if (!user && !newPassword) { setError("Password is required for new users."); return; }
        const formId = (formData.id as string).toLowerCase();
        if (!user && Array.isArray(users) && users.some(u => u.id.toLowerCase() === formId)) {
            setError("This User Login ID is already taken.");
            return;
        }
        let finalData: User;
        const initialDeposit = Number(formData.wallet) || 0;
        const betLimitsValue: BetLimits = {
            oneDigit: Number((formData.betLimits as any).oneDigit) || 0,
            twoDigit: Number((formData.betLimits as any).twoDigit) || 0,
        };
        if (user) {
            finalData = { ...user, name: formData.name, password: newPassword ? newPassword : user.password, area: formData.area, contact: formData.contact, avatarUrl: formData.avatarUrl, betLimits: betLimitsValue, commissionRate: Number(formData.commissionRate) || 0, prizeRates: { oneDigitOpen: Number(formData.prizeRates.oneDigitOpen) || 0, oneDigitClose: Number(formData.prizeRates.oneDigitClose) || 0, twoDigit: Number(formData.prizeRates.twoDigit) || 0 } };
        } else {
            finalData = { id: formData.id as string, dealerId, name: formData.name, password: newPassword, area: formData.area, contact: formData.contact, wallet: 0, commissionRate: Number(formData.commissionRate) || 0, betLimits: betLimitsValue, isRestricted: false, prizeRates: { oneDigitOpen: Number(formData.prizeRates.oneDigitOpen) || 0, oneDigitClose: Number(formData.prizeRates.oneDigitClose) || 0, twoDigit: Number(formData.prizeRates.twoDigit) || 0 }, ledger: [], avatarUrl: formData.avatarUrl };
        }
        setIsLoading(true);
        try { await onSave(finalData, user?.id, initialDeposit); } catch (err: any) { setError(err.message || 'An unknown error occurred.'); } finally { setIsLoading(false); }
    };

    const inputClass = "w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-emerald-500 focus:outline-none text-white";

    return (
        <form onSubmit={handleSubmit} className="space-y-4 text-slate-200">
            <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">User Login ID</label>
                <input type="text" name="id" value={formData.id as string} onChange={handleChange} placeholder="User Login ID" className={inputClass} required disabled={!!user}/>
            </div>
            <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="User Display Name" className={inputClass} required />
            <div className="relative">
                 <input type={isPasswordVisible ? 'text' : 'password'} name="password" value={user ? password : formData.password!} onChange={user ? (e) => setPassword(e.target.value) : handleChange} placeholder={user ? "New Password (optional)" : "Password"} className={inputClass + " pr-10"} required={!user} />
                <button type="button" onClick={() => setIsPasswordVisible(!isPasswordVisible)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white">{isPasswordVisible ? Icons.eyeOff : Icons.eye}</button>
            </div>
            {(user ? password : formData.password!) && (
                 <div className="relative">
                    <input type={isConfirmPasswordVisible ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm New Password" className={inputClass + " pr-10"} required />
                    <button type="button" onClick={() => setIsConfirmPasswordVisible(!isConfirmPasswordVisible)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white">{isConfirmPasswordVisible ? Icons.eyeOff : Icons.eye}</button>
                </div>
            )}
            <input type="url" name="avatarUrl" value={formData.avatarUrl || ''} onChange={handleChange} placeholder="Avatar Image URL" className={inputClass} />
            <input type="text" name="area" value={formData.area} onChange={handleChange} placeholder="Area / Contact" className={inputClass} />
            {!user && <input type="number" name="wallet" value={formData.wallet as string} onChange={handleChange} placeholder="Initial Deposit (PKR)" className={inputClass} />}
            <input type="number" name="commissionRate" value={formData.commissionRate} onChange={handleChange} placeholder="Commission Rate (%)" className={inputClass} />
            <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={onCancel} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-md">Cancel</button>
                <button type="submit" disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-md">{isLoading ? 'Saving...' : 'Save User'}</button>
            </div>
        </form>
    );
};

const UserTransactionForm: React.FC<{ users: User[]; onTransaction: (userId: string, amount: number) => Promise<void>; onCancel: () => void; type: 'Top-Up' | 'Withdrawal' }> = ({ users, onTransaction, onCancel, type }) => {
    const [selectedUserId, setSelectedUserId] = useState('');
    const [amount, setAmount] = useState<number | ''>('');
    const themeColor = type === 'Top-Up' ? 'emerald' : 'amber';
    const inputClass = `w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-${themeColor}-500 text-white`;
    return (
        <form onSubmit={async (e) => { e.preventDefault(); if (selectedUserId && amount && amount > 0) { await onTransaction(selectedUserId, Number(amount)); } }} className="space-y-4">
            <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className={inputClass} required>
                <option value="">-- Select User --</option>
                {Array.isArray(users) && users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.id})</option>)}
            </select>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value))} placeholder="Amount (PKR)" className={inputClass} min="1" required />
            <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={onCancel} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-md">Cancel</button>
                <button type="submit" className={`font-bold py-2 px-4 rounded-md text-white bg-${themeColor}-600`}>{type}</button>
            </div>
        </form>
    );
};

const BetHistoryView: React.FC<{ bets: Bet[], games: Game[], users: User[] }> = ({ bets, games, users }) => {
    const [startDate, setStartDate] = useState(getTodayDateString());
    const [endDate, setEndDate] = useState(getTodayDateString());
    const [searchTerm, setSearchTerm] = useState('');
    const filteredBets = useMemo(() => {
        if (!Array.isArray(bets)) return [];
        return bets.filter(bet => {
            const dateStr = new Date(bet.timestamp).toISOString().split('T')[0];
            if (startDate && dateStr < startDate) return false;
            if (endDate && dateStr > endDate) return false;
            if (searchTerm.trim()) {
                const user = users.find(u => u.id === bet.userId);
                const game = games.find(g => g.id === bet.gameId);
                return user?.name.toLowerCase().includes(searchTerm.toLowerCase()) || game?.name.toLowerCase().includes(searchTerm.toLowerCase());
            }
            return true;
        }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [bets, games, users, startDate, endDate, searchTerm]);
    return (
        <div className="mt-8">
            <h3 className="text-xl font-semibold mb-4 text-white">Bet History</h3>
            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 mb-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-slate-900 text-white p-2 rounded" />
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-slate-900 text-white p-2 rounded" />
                <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="User/Game Search..." className="bg-slate-900 text-white p-2 rounded" />
                <button onClick={() => {setStartDate(''); setEndDate(''); setSearchTerm('');}} className="bg-slate-700 text-white p-2 rounded">Clear</button>
            </div>
            <div className="bg-slate-800 rounded-lg overflow-x-auto"><table className="w-full text-left min-w-[700px]"><thead className="bg-slate-700/50"><tr><th className="p-4">Time</th><th className="p-4">User</th><th className="p-4">Game</th><th className="p-4">Details</th><th className="p-4 text-right">Stake</th></tr></thead><tbody className="divide-y divide-slate-800">
                {filteredBets.map(bet => (
                    <tr key={bet.id}><td className="p-4 text-sm text-slate-400">{new Date(bet.timestamp).toLocaleString()}</td><td className="p-4">{users.find(u => u.id === bet.userId)?.name || 'User'}</td><td className="p-4">{games.find(g => g.id === bet.gameId)?.name || 'Game'}</td><td className="p-4"><div className="font-bold">{bet.subGameType}</div><div className="text-xs">{bet.numbers.join(',')}</div></td><td className="p-4 text-right font-mono">{bet.totalAmount.toFixed(2)}</td></tr>
                ))}
            </tbody></table></div>
        </div>
    );
};

const WalletView: React.FC<{ dealer: Dealer }> = ({ dealer }) => {
    if (!dealer) return null;
    return (
        <div className="mt-8">
            <h3 className="text-xl font-semibold text-white mb-6">Dealer Wallet</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700 text-center"><p className="text-slate-400 uppercase text-xs">Wallet Balance</p><p className="text-4xl font-bold text-emerald-400 font-mono">PKR {dealer.wallet.toLocaleString()}</p></div>
                <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700 text-center"><p className="text-slate-400 uppercase text-xs">Ledger Entries</p><p className="text-4xl font-bold text-white font-mono">{dealer.ledger?.length || 0}</p></div>
            </div>
            <LedgerTable entries={dealer.ledger} />
        </div>
    );
};

const OpenGameOption: React.FC<{ game: Game }> = ({ game }) => {
    const { status, text } = useCountdown(game.drawTime);
    if (status !== 'OPEN') return null;
    return <option value={game.id}>{game.name} (Closes: {text})</option>;
};

const BettingTerminalView: React.FC<{ users: User[]; games: Game[]; placeBetAsDealer: (details: any) => Promise<void> }> = ({ users, games, placeBetAsDealer }) => {
    const [selectedUserId, setSelectedUserId] = useState('');
    const [selectedGameId, setSelectedGameId] = useState('');
    const [bulkInput, setBulkInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleProcessBets = async () => {
        if (!selectedUserId || !selectedGameId || !bulkInput) return;
        setIsLoading(true);
        try {
            // Very basic parser for the terminal - more complex logic is in the User Betting Modal
            // This expects lines like "14, 25 rs100"
            const lines = bulkInput.split('\n').filter(l => l.trim());
            const betGroups: any[] = [];
            
            lines.forEach(line => {
                const stakeMatch = line.match(/(?:rs|r)\s*(\d+\.?\d*)/i);
                const stake = stakeMatch ? parseFloat(stakeMatch[1]) : 0;
                if (stake <= 0) return;

                const numbersPart = line.substring(0, stakeMatch!.index).trim();
                const numbers = numbersPart.split(/[-.,\s]+/).filter(n => n.length > 0);
                
                if (numbers.length > 0) {
                    betGroups.push({
                        subGameType: SubGameType.TwoDigit, // Defaulting to 2-digit for quick entry
                        numbers,
                        amountPerNumber: stake
                    });
                }
            });

            if (betGroups.length === 0) {
                alert("No valid bets found. Please use format: '14, 25 rs100'");
                return;
            }

            await placeBetAsDealer({ userId: selectedUserId, gameId: selectedGameId, betGroups });
            setBulkInput('');
            alert("Bets placed successfully!");
        } catch (error: any) {
            alert(error.message || "Failed to place bets.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700 mt-8">
            <h3 className="text-xl font-semibold text-white mb-4">Direct Betting Terminal</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} className="bg-slate-900 text-white p-3 rounded border border-slate-700">
                    <option value="">-- Choose User --</option>
                    {Array.isArray(users) && users.filter(u => !u.isRestricted).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <select value={selectedGameId} onChange={e => setSelectedGameId(e.target.value)} className="bg-slate-900 text-white p-3 rounded border border-slate-700">
                    <option value="">-- Choose Game --</option>
                    {Array.isArray(games) && games.map(g => <OpenGameOption key={g.id} game={g} />)}
                </select>
            </div>
            <textarea rows={6} value={bulkInput} onChange={e => setBulkInput(e.target.value)} placeholder="Enter bets (e.g. 14, 25 rs100)" className="w-full bg-slate-900 text-white p-4 rounded border border-slate-700 font-mono" />
            <div className="flex justify-end mt-4">
                <button 
                    onClick={handleProcessBets}
                    disabled={!selectedUserId || !selectedGameId || !bulkInput || isLoading} 
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-8 rounded disabled:opacity-50 transition-colors"
                >
                    {isLoading ? 'PROCESSING...' : 'PROCESS BULK BET'}
                </button>
            </div>
        </div>
    );
};

interface DealerPanelProps {
  dealer: Dealer;
  users: User[];
  onSaveUser: (user: User, originalId?: string, initialDeposit?: number) => Promise<void>;
  topUpUserWallet: (userId: string, amount: number) => Promise<void>;
  withdrawFromUserWallet: (userId: string, amount: number) => Promise<void>;
  toggleAccountRestriction: (userId: string, userType: 'user') => void;
  bets: Bet[];
  games: Game[];
  placeBetAsDealer: (details: { userId: string; gameId: string; betGroups: any[] }) => Promise<void>;
  isLoaded?: boolean;
}

const DealerPanel: React.FC<DealerPanelProps> = ({ dealer, users, onSaveUser, topUpUserWallet, withdrawFromUserWallet, toggleAccountRestriction, bets, games, placeBetAsDealer, isLoaded = false }) => {
  const [activeTab, setActiveTab] = useState('users');
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | undefined>(undefined);
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [isWithdrawalModalOpen, setIsWithdrawalModalOpen] = useState(false);
  const [viewingUserLedgerFor, setViewingUserLedgerFor] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const safeUsers = Array.isArray(users) ? users : [];
  const safeDealer = dealer || { id: '', name: '', prizeRates: {}, ledger: [] };

  const dealerUsers = useMemo(() => {
        return safeUsers
            .filter(user => {
                if (!user) return false;
                const query = searchQuery.toLowerCase();
                return (user.name || '').toLowerCase().includes(query) || (user.id || '').toLowerCase().includes(query);
            });
  }, [safeUsers, searchQuery]);

  const tabs = [
    { id: 'users', label: 'My Users', icon: Icons.userGroup },
    { id: 'terminal', label: 'Terminal', icon: Icons.clipboardList },
    { id: 'wallet', label: 'My Wallet', icon: Icons.wallet },
    { id: 'history', label: 'History', icon: Icons.bookOpen },
  ];

  if (!dealer) return <div className="p-8 text-center text-slate-400">Loading dealer profile...</div>;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <h2 className="text-3xl font-bold text-emerald-400 mb-6 uppercase tracking-widest">Dealer Panel</h2>
       <div className="bg-slate-800/50 p-1.5 rounded-lg flex items-center space-x-2 mb-8 self-start flex-wrap border border-slate-700">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center space-x-2 py-2 px-4 text-sm font-semibold rounded-md transition-all ${activeTab === tab.id ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
                {tab.icon} <span className="hidden sm:inline">{tab.label}</span>
            </button>
        ))}
      </div>
      
      {activeTab === 'users' && (
        <div>
           <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
            <h3 className="text-xl font-semibold text-white">Users List ({dealerUsers.length})</h3>
            <div className="flex gap-2 w-full sm:w-auto">
                <input type="text" placeholder="Filter..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-slate-800 p-2 rounded border border-slate-700 text-white flex-grow" />
                <button onClick={() => { setSelectedUser(undefined); setIsUserModalOpen(true); }} className="bg-emerald-600 text-white p-2 rounded font-bold px-4">New User</button>
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
            <div className="overflow-x-auto"><table className="w-full text-left min-w-[700px]"><thead className="bg-slate-800/80"><tr><th className="p-4">User</th><th className="p-4 text-right">Wallet</th><th className="p-4">Status</th><th className="p-4 text-center">Actions</th></tr></thead><tbody className="divide-y divide-slate-800">
                {!isLoaded ? (
                    <tr><td colSpan={4} className="p-12 text-center text-slate-500 font-medium">Synchronizing user data...</td></tr>
                ) : dealerUsers.length === 0 ? (
                    <tr><td colSpan={4} className="p-12 text-center text-slate-500 font-medium">No users found under your dealer account.</td></tr>
                ) : dealerUsers.map(user => (
                    <tr key={user.id} className="hover:bg-slate-700/30"><td className="p-4 font-bold">{user.name} <div className="text-xs text-slate-500">{user.id}</div></td><td className="p-4 text-right font-mono">{user.wallet.toFixed(2)}</td><td className="p-4">{user.isRestricted ? <span className="text-red-400">Restricted</span> : <span className="text-green-400">Active</span>}</td><td className="p-4 text-center space-x-2">
                        <button onClick={() => {setSelectedUser(user); setIsUserModalOpen(true);}} className="text-cyan-400 text-sm font-bold">Edit</button>
                        <button onClick={() => setViewingUserLedgerFor(user)} className="text-emerald-400 text-sm font-bold">Ledger</button>
                        <button onClick={() => toggleAccountRestriction(user.id, 'user')} className="text-amber-400 text-sm font-bold">{user.isRestricted ? 'Unblock' : 'Block'}</button>
                    </td></tr>
                ))}
            </tbody></table></div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
                <button onClick={() => setIsTopUpModalOpen(true)} className="bg-emerald-600 text-white p-2 px-4 rounded font-bold">Top-Up User</button>
                <button onClick={() => setIsWithdrawalModalOpen(true)} className="bg-amber-600 text-white p-2 px-4 rounded font-bold">Withdraw User</button>
          </div>
        </div>
      )}

      {activeTab === 'terminal' && <BettingTerminalView users={safeUsers} games={games} placeBetAsDealer={placeBetAsDealer} />}
      {activeTab === 'wallet' && <WalletView dealer={safeDealer as Dealer} />}
      {activeTab === 'history' && <BetHistoryView bets={bets} games={games} users={safeUsers} />}

      <Modal isOpen={isUserModalOpen} onClose={() => setIsUserModalOpen(false)} title={selectedUser ? "Edit User" : "Create User"}>
          <UserForm user={selectedUser} users={safeUsers} onSave={onSaveUser} onCancel={() => setIsUserModalOpen(false)} dealerPrizeRates={safeDealer.prizeRates as PrizeRates} dealerId={safeDealer.id} />
      </Modal>

      <Modal isOpen={isTopUpModalOpen} onClose={() => setIsTopUpModalOpen(false)} title="Top-Up User Wallet" themeColor="emerald">
          <UserTransactionForm type="Top-Up" users={dealerUsers} onTransaction={(userId, amount) => topUpUserWallet(userId, amount)} onCancel={() => setIsTopUpModalOpen(false)} />
      </Modal>

      <Modal isOpen={isWithdrawalModalOpen} onClose={() => setIsWithdrawalModalOpen(false)} title="Withdraw from User Wallet" themeColor="amber">
          <UserTransactionForm type="Withdrawal" users={dealerUsers} onTransaction={(userId, amount) => withdrawFromUserWallet(userId, amount)} onCancel={() => setIsWithdrawalModalOpen(false)} />
      </Modal>

      {viewingUserLedgerFor && (
        <Modal isOpen={!!viewingUserLedgerFor} onClose={() => setViewingUserLedgerFor(null)} title={`Ledger for ${viewingUserLedgerFor.name}`} size="xl">
            <LedgerTable entries={viewingUserLedgerFor.ledger} />
        </Modal>
      )}
    </div>
  );
};

export default DealerPanel;
