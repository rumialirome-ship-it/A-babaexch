


import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Dealer, User, PrizeRates, LedgerEntry, BetLimits, Bet, Game, SubGameType } from '../types';
import { Icons } from '../constants';
import { useCountdown } from '../hooks/useCountdown';

const getTodayDateString = () => new Date().toISOString().split('T')[0];

const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: 'md' | 'lg' | 'xl'; themeColor?: string }> = ({ isOpen, onClose, title, children, size = 'md', themeColor = 'emerald' }) => {
    if (!isOpen) return null;
     const sizeClasses: Record<string, string> = { md: 'max-w-md', lg: 'max-w-3xl', xl: 'max-w-5xl' };
    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
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

const Toast: React.FC<{ message: string; type: 'success' | 'error'; onClose: () => void }> = ({ message, type, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 5000);
        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <div className={`fixed top-5 right-5 z-[100] p-4 rounded-lg shadow-lg border flex items-center gap-3 animate-slide-in ${
            type === 'success' ? 'bg-emerald-900/80 border-emerald-500 text-emerald-100' : 'bg-red-900/80 border-red-500 text-red-100'
        }`}>
            <span className="text-xl">{type === 'success' ? '✅' : '⚠️'}</span>
            <span className="font-semibold">{message}</span>
            <button onClick={onClose} className="ml-4 opacity-50 hover:opacity-100">{Icons.close}</button>
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

const UserForm: React.FC<{ user?: User; users: User[]; onSave: (user: User, originalId?: string, initialDeposit?: number) => Promise<void>; onCancel: () => void; dealerPrizeRates: PrizeRates, dealerId: string; showToast: (msg: string, type: 'success' | 'error') => void }> = ({ user, users, onSave, onCancel, dealerPrizeRates, dealerId, showToast }) => {
    const [formData, setFormData] = useState(() => {
        const defaults = {
            id: '', name: '', password: '', area: '', contact: '', commissionRate: 0, 
            prizeRates: { oneDigitOpen: 95, oneDigitClose: 95, twoDigit: 85 }, 
            avatarUrl: '', wallet: 0,
            betLimits: { oneDigit: 1000, twoDigit: 5000, perDraw: 20000 }
        };
        if (user) {
            return {
                ...user,
                password: '',
                betLimits: {
                    oneDigit: user.betLimits?.oneDigit ?? 1000,
                    twoDigit: user.betLimits?.twoDigit ?? 5000,
                    perDraw: user.betLimits?.perDraw ?? 20000,
                }
            };
        }
        return defaults;
    });

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type } = e.target;
        if (name.includes('.')) {
            const [parent, child] = name.split('.');
            setFormData(prev => ({ ...prev, [parent]: { ...(prev[parent as keyof typeof prev] as object), [child]: type === 'number' ? parseFloat(value) : value } }));
        } else {
            setFormData(prev => ({ ...prev, [name]: type === 'number' ? (value === '' ? '' : parseFloat(value)) : value }));
        }
    };
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const activePass = user ? password : (formData as any).password;
        if (activePass && activePass !== confirmPassword) { showToast("⚠️ Passwords do not match.", "error"); return; }
        if (!user && !activePass) { showToast("⚠️ Password is required.", "error"); return; }
        
        const formId = formData.id.toLowerCase();
        if (!user && Array.isArray(users) && users.some(u => u.id.toLowerCase() === formId)) {
            showToast("⚠️ Username already exists.", "error");
            return;
        }

        setIsLoading(true);
        try {
            // Refined mapping to ensure object literal is strictly compatible with User interface
            const finalData: User = { 
                ...formData, 
                id: formData.id,
                name: formData.name,
                dealerId,
                password: activePass || user?.password || '',
                isRestricted: user?.isRestricted ?? false,
                ledger: user?.ledger ?? [],
                wallet: user ? Number(formData.wallet) : 0,
                prizeRates: {
                    oneDigitOpen: Number(formData.prizeRates.oneDigitOpen),
                    oneDigitClose: Number(formData.prizeRates.oneDigitClose),
                    twoDigit: Number(formData.prizeRates.twoDigit)
                },
                betLimits: {
                    oneDigit: Number(formData.betLimits.oneDigit),
                    twoDigit: Number(formData.betLimits.twoDigit),
                    perDraw: Number(formData.betLimits.perDraw)
                },
                avatarUrl: formData.avatarUrl || ''
            };

            await onSave(finalData, user?.id, user ? undefined : Number(formData.wallet));
            showToast(user ? "✅ User updated successfully!" : "✅ User added successfully!", "success");
            onCancel();
        } catch (err: any) {
            showToast(`⚠️ ${err.message || 'Error saving user'}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const inputClass = "w-full bg-slate-800 p-2.5 rounded-md border border-slate-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none text-white text-sm";
    const labelClass = "block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider";

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className={labelClass}>Username (Login ID)</label>
                    <input type="text" name="id" value={formData.id} onChange={handleChange} className={inputClass} required disabled={!!user}/>
                </div>
                <div>
                    <label className={labelClass}>Display Name</label>
                    <input type="text" name="name" value={formData.name} onChange={handleChange} className={inputClass} required />
                </div>
                <div>
                    <label className={labelClass}>Phone Number</label>
                    <input type="text" name="contact" value={formData.contact} onChange={handleChange} className={inputClass} required />
                </div>
                <div>
                    <label className={labelClass}>City</label>
                    <input type="text" name="area" value={formData.area} onChange={handleChange} className={inputClass} required />
                </div>
                <div>
                    <label className={labelClass}>{user ? "New Password (optional)" : "Password"}</label>
                    <div className="relative">
                        <input type={isPasswordVisible ? 'text' : 'password'} value={user ? password : (formData as any).password} onChange={e => user ? setPassword(e.target.value) : setFormData(prev => ({...prev, password: e.target.value}))} className={inputClass} required={!user} />
                        <button type="button" onClick={() => setIsPasswordVisible(!isPasswordVisible)} className="absolute right-3 top-2.5 text-slate-500">{isPasswordVisible ? Icons.eyeOff : Icons.eye}</button>
                    </div>
                </div>
                <div>
                    <label className={labelClass}>Confirm Password</label>
                    <input type={isPasswordVisible ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputClass} required={!!(user ? password : (formData as any).password)} />
                </div>
                <div>
                    <label className={labelClass}>Wallet Balance (PKR)</label>
                    <input type="number" name="wallet" value={formData.wallet} onChange={handleChange} className={inputClass} disabled={!!user} />
                </div>
                <div>
                    <label className={labelClass}>Commission Rate (%)</label>
                    <input type="number" name="commissionRate" value={formData.commissionRate} onChange={handleChange} className={inputClass} />
                </div>
            </div>

            <fieldset className="border border-slate-700 p-4 rounded-md bg-slate-900/50">
                <legend className="text-xs font-bold text-emerald-400 px-2 uppercase tracking-widest">Prize Rates</legend>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>Prize Rate (2D)</label>
                        <input type="number" step="0.01" name="prizeRates.twoDigit" value={formData.prizeRates.twoDigit} onChange={handleChange} className={inputClass} />
                    </div>
                    <div>
                        <label className={labelClass}>Prize Rate (1D)</label>
                        <input type="number" step="0.01" name="prizeRates.oneDigitOpen" value={formData.prizeRates.oneDigitOpen} onChange={handleChange} className={inputClass} />
                    </div>
                </div>
            </fieldset>

            <fieldset className="border border-slate-700 p-4 rounded-md bg-slate-900/50">
                <legend className="text-xs font-bold text-cyan-400 px-2 uppercase tracking-widest">Bet Limits</legend>
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className={labelClass}>Limit (2D)</label>
                        <input type="number" name="betLimits.twoDigit" value={formData.betLimits.twoDigit} onChange={handleChange} className={inputClass} />
                    </div>
                    <div>
                        <label className={labelClass}>Limit (1D)</label>
                        <input type="number" name="betLimits.oneDigit" value={formData.betLimits.oneDigit} onChange={handleChange} className={inputClass} />
                    </div>
                    <div>
                        <label className={labelClass}>Per Draw</label>
                        <input type="number" name="betLimits.perDraw" value={formData.betLimits.perDraw} onChange={handleChange} className={inputClass} />
                    </div>
                </div>
            </fieldset>

            <div className="flex justify-end space-x-3 pt-4 border-t border-slate-700">
                <button type="button" onClick={onCancel} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-6 rounded-md transition-colors">Cancel</button>
                <button type="submit" disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-8 rounded-md transition-all flex items-center gap-2">
                    {isLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Submitting...</> : user ? "Update User" : "Create User"}
                </button>
            </div>
        </form>
    );
};

const MoreOptionsDropdown: React.FC<{ 
    user: User; 
    onEdit: () => void; 
    onLedger: () => void; 
    onToggleStatus: () => void; 
    onDelete: () => void;
}> = ({ user, onEdit, onLedger, onToggleStatus, onDelete }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const itemClass = "w-full text-left px-4 py-2 text-sm hover:bg-slate-700 flex items-center gap-2 transition-colors";

    return (
        <div className="relative" ref={dropdownRef}>
            <button onClick={() => setIsOpen(!isOpen)} className="p-2 hover:bg-slate-700 rounded-full transition-colors text-slate-400 hover:text-white">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" /></svg>
            </button>
            {isOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden animate-fade-in">
                    <button onClick={() => { onEdit(); setIsOpen(false); }} className={itemClass + " text-emerald-400"}>Edit Profile</button>
                    <button onClick={() => { onLedger(); setIsOpen(false); }} className={itemClass + " text-cyan-400"}>View Ledger</button>
                    <button onClick={() => { onToggleStatus(); setIsOpen(false); }} className={`${itemClass} ${user.isRestricted ? 'text-green-400' : 'text-amber-400'}`}>
                        {user.isRestricted ? 'Unblock Account' : 'Block Account'}
                    </button>
                    <div className="border-t border-slate-700 my-1"></div>
                    <button onClick={() => { if(window.confirm(`Delete ${user.name} permanently?`)) onDelete(); setIsOpen(false); }} className={itemClass + " text-red-400 hover:bg-red-500/10"}>Delete User</button>
                </div>
            )}
        </div>
    );
};

interface DealerPanelProps {
  dealer: Dealer;
  users: User[];
  onSaveUser: (user: User, originalId?: string, initialDeposit?: number) => Promise<void>;
  onDeleteUser: (uId: string) => Promise<void>;
  topUpUserWallet: (userId: string, amount: number) => Promise<void>;
  withdrawFromUserWallet: (userId: string, amount: number) => Promise<void>;
  toggleAccountRestriction: (userId: string, userType: 'user') => void;
  bets: Bet[];
  games: Game[];
  placeBetAsDealer: (details: { userId: string; gameId: string; betGroups: any[] }) => Promise<void>;
  isLoaded?: boolean;
}

const DealerPanel: React.FC<DealerPanelProps> = ({ dealer, users, onSaveUser, onDeleteUser, topUpUserWallet, withdrawFromUserWallet, toggleAccountRestriction, bets, games, placeBetAsDealer, isLoaded = false }) => {
  const [activeTab, setActiveTab] = useState('users');
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | undefined>(undefined);
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [isWithdrawalModalOpen, setIsWithdrawalModalOpen] = useState(false);
  const [viewingUserLedgerFor, setViewingUserLedgerFor] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const safeUsers = useMemo(() => Array.isArray(users) ? users : [], [users]);
  const safeDealer = dealer || { id: '', name: '', prizeRates: {}, ledger: [] };

  const showToast = (msg: string, type: 'success' | 'error') => setToast({ msg, type });

  const dealerUsers = useMemo(() => {
        return safeUsers
            .filter(user => {
                if (!user) return false;
                const query = searchQuery.toLowerCase();
                return (user.name || '').toLowerCase().includes(query) || (user.id || '').toLowerCase().includes(query) || (user.area || '').toLowerCase().includes(query);
            });
  }, [safeUsers, searchQuery]);

  const tabs = [
    { id: 'users', label: 'Users', icon: Icons.userGroup },
    { id: 'terminal', label: 'Terminal', icon: Icons.clipboardList },
    { id: 'wallet', label: 'My Wallet', icon: Icons.wallet },
    { id: 'history', label: 'History', icon: Icons.bookOpen },
  ];

  if (!dealer) return <div className="p-8 text-center text-slate-400">Loading dealer profile...</div>;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto min-h-[80vh]">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <h2 className="text-3xl font-bold text-emerald-400 uppercase tracking-widest">Dealer Hub</h2>
          <div className="bg-slate-800/50 p-1 rounded-lg flex items-center space-x-1 border border-slate-700">
            {tabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center space-x-2 py-2 px-4 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${activeTab === tab.id ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
                    {tab.icon} <span>{tab.label}</span>
                </button>
            ))}
          </div>
      </div>
      
      {activeTab === 'users' && (
        <div>
           <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
            <h3 className="text-xl font-semibold text-white">Managed Users ({dealerUsers.length})</h3>
            <div className="flex gap-2 w-full sm:w-auto">
                <div className="relative flex-grow">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">{Icons.search}</span>
                    <input type="text" placeholder="Filter by name, ID or city..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-slate-800 p-2 pl-10 rounded border border-slate-700 text-white w-full text-sm" />
                </div>
                <button onClick={() => { setSelectedUser(undefined); setIsUserModalOpen(true); }} className="bg-emerald-600 hover:bg-emerald-500 text-white p-2 rounded font-bold px-6 transition-colors shadow-lg shadow-emerald-900/20 whitespace-nowrap">Add User</button>
            </div>
          </div>
          <div className="bg-slate-800/40 rounded-lg overflow-hidden border border-slate-700 backdrop-blur-sm">
            <div className="overflow-x-auto"><table className="w-full text-left min-w-[800px]"><thead className="bg-slate-800/80 border-b border-slate-700"><tr><th className="p-4 text-xs font-bold uppercase text-slate-400">Account</th><th className="p-4 text-xs font-bold uppercase text-slate-400">City / Contact</th><th className="p-4 text-xs font-bold uppercase text-slate-400 text-right">Balance</th><th className="p-4 text-xs font-bold uppercase text-slate-400 text-center">Status</th><th className="p-4 text-xs font-bold uppercase text-slate-400 text-right">Options</th></tr></thead><tbody className="divide-y divide-slate-800">
                {!isLoaded ? (
                    <tr><td colSpan={5} className="p-12 text-center text-slate-500 font-medium animate-pulse">Synchronizing user network...</td></tr>
                ) : dealerUsers.length === 0 ? (
                    <tr><td colSpan={5} className="p-12 text-center text-slate-500 font-medium">No users found under your management.</td></tr>
                ) : dealerUsers.map(user => (
                    <tr key={user.id} className="hover:bg-slate-700/20 transition-colors"><td className="p-4">
                        <div className="font-bold text-white">{user.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono tracking-tighter uppercase">{user.id}</div>
                    </td><td className="p-4">
                        <div className="text-sm text-slate-300">{user.area || '-'}</div>
                        <div className="text-[10px] text-slate-500">{user.contact || '-'}</div>
                    </td><td className="p-4 text-right font-mono text-emerald-400 font-bold">{user.wallet.toLocaleString(undefined, {minimumFractionDigits: 2})}</td><td className="p-4 text-center">
                        {user.isRestricted ? <span className="bg-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded font-bold uppercase">Restricted</span> : <span className="bg-green-500/20 text-green-400 text-[10px] px-2 py-0.5 rounded font-bold uppercase">Active</span>}
                    </td><td className="p-4 text-right">
                        <MoreOptionsDropdown 
                            user={user} 
                            onEdit={() => { setSelectedUser(user); setIsUserModalOpen(true); }} 
                            onLedger={() => setViewingUserLedgerFor(user)} 
                            onToggleStatus={() => toggleAccountRestriction(user.id, 'user')} 
                            onDelete={() => onDeleteUser(user.id)}
                        />
                    </td></tr>
                ))}
            </tbody></table></div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => setIsTopUpModalOpen(true)} className="bg-slate-800 hover:bg-emerald-900/50 text-emerald-400 border border-emerald-500/30 p-2 px-6 rounded font-bold transition-all flex items-center gap-2">
                    {Icons.plus} Cash Deposit
                </button>
                <button onClick={() => setIsWithdrawalModalOpen(true)} className="bg-slate-800 hover:bg-amber-900/50 text-amber-400 border border-amber-500/30 p-2 px-6 rounded font-bold transition-all flex items-center gap-2">
                    {Icons.minus} Cash Withdrawal
                </button>
          </div>
        </div>
      )}

      {activeTab === 'terminal' && (
          <div className="animate-fade-in">
              <BettingTerminalView users={safeUsers} games={games} placeBetAsDealer={placeBetAsDealer} />
          </div>
      )}
      {activeTab === 'wallet' && <div className="animate-fade-in"><WalletView dealer={safeDealer as Dealer} /></div>}
      {activeTab === 'history' && <div className="animate-fade-in"><BetHistoryView bets={bets} games={games} users={safeUsers} /></div>}

      <Modal isOpen={isUserModalOpen} onClose={() => setIsUserModalOpen(false)} title={selectedUser ? "Edit Profile" : "Onboard New User"} themeColor="emerald">
          <UserForm user={selectedUser} users={safeUsers} onSave={onSaveUser} onCancel={() => setIsUserModalOpen(false)} dealerPrizeRates={safeDealer.prizeRates as PrizeRates} dealerId={safeDealer.id} showToast={showToast} />
      </Modal>

      <Modal isOpen={isTopUpModalOpen} onClose={() => setIsTopUpModalOpen(false)} title="Quick Cash Deposit" themeColor="emerald">
          <UserTransactionForm type="Top-Up" dealers={dealerUsers} onTransaction={async (userId, amount) => { await topUpUserWallet(userId, amount); showToast("✅ Deposit processed!", "success"); setIsTopUpModalOpen(false); }} onCancel={() => setIsTopUpModalOpen(false)} />
      </Modal>

      <Modal isOpen={isWithdrawalModalOpen} onClose={() => setIsWithdrawalModalOpen(false)} title="Quick Cash Withdrawal" themeColor="amber">
          <UserTransactionForm type="Withdrawal" dealers={dealerUsers} onTransaction={async (userId, amount) => { await withdrawFromUserWallet(userId, amount); showToast("✅ Withdrawal processed!", "success"); setIsWithdrawalModalOpen(false); }} onCancel={() => setIsWithdrawalModalOpen(false)} />
      </Modal>

      {viewingUserLedgerFor && (
        <Modal isOpen={!!viewingUserLedgerFor} onClose={() => setViewingUserLedgerFor(null)} title={`Ledger for ${viewingUserLedgerFor.name}`} size="xl" themeColor="cyan">
            <LedgerTable entries={viewingUserLedgerFor.ledger} />
        </Modal>
      )}
    </div>
  );
};

const WalletView: React.FC<{ dealer: Dealer }> = ({ dealer }) => {
    if (!dealer) return null;
    return (
        <div className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700 text-center"><p className="text-slate-400 uppercase text-xs font-bold tracking-widest mb-2">Total Wallet Pool</p><p className="text-4xl font-bold text-emerald-400 font-mono">PKR {dealer.wallet.toLocaleString(undefined, {minimumFractionDigits: 2})}</p></div>
                <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700 text-center"><p className="text-slate-400 uppercase text-xs font-bold tracking-widest mb-2">History Records</p><p className="text-4xl font-bold text-white font-mono">{dealer.ledger?.length || 0}</p></div>
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
            const lines = bulkInput.split('\n').filter(l => l.trim());
            const betGroups: any[] = [];
            
            lines.forEach(line => {
                const stakeMatch = line.match(/(?:rs|r)\s*(\d+\.?\d*)/i);
                const stake = stakeMatch ? parseFloat(stakeMatch[1]) : 0;
                if (stake <= 0) return;
                const numbersPart = line.substring(0, stakeMatch!.index).trim();
                const numbers = numbersPart.split(/[-.,\s]+/).filter(n => n.length > 0);
                if (numbers.length > 0) {
                    betGroups.push({ subGameType: SubGameType.TwoDigit, numbers, amountPerNumber: stake });
                }
            });

            if (betGroups.length === 0) {
                alert("Format: '14, 25 rs100'");
                return;
            }

            await placeBetAsDealer({ userId: selectedUserId, gameId: selectedGameId, betGroups });
            setBulkInput('');
            alert("Terminal bets successfully booked!");
        } catch (error: any) {
            alert(error.message || "Terminal error.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
            <h3 className="text-xl font-semibold text-white mb-4">Direct Betting Terminal</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} className="bg-slate-900 text-white p-3 rounded border border-slate-700 text-sm">
                    <option value="">-- Choose Account --</option>
                    {Array.isArray(users) && users.filter(u => !u.isRestricted).map(u => <option key={u.id} value={u.id}>{u.name} ({u.id})</option>)}
                </select>
                <select value={selectedGameId} onChange={e => setSelectedGameId(e.target.value)} className="bg-slate-900 text-white p-3 rounded border border-slate-700 text-sm">
                    <option value="">-- Choose Game --</option>
                    {Array.isArray(games) && games.map(g => <OpenGameOption key={g.id} game={g} />)}
                </select>
            </div>
            <textarea rows={6} value={bulkInput} onChange={e => setBulkInput(e.target.value)} placeholder="Entry Log (e.g. 14, 25 rs100)" className="w-full bg-slate-900 text-white p-4 rounded border border-slate-700 font-mono text-sm" />
            <div className="flex justify-end mt-4">
                <button onClick={handleProcessBets} disabled={!selectedUserId || !selectedGameId || !bulkInput || isLoading} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-8 rounded disabled:opacity-50 transition-colors uppercase tracking-widest text-sm">
                    {isLoading ? 'SYNCING...' : 'BOOK BULK ENTRIES'}
                </button>
            </div>
        </div>
    );
};

const UserTransactionForm: React.FC<{ users: User[]; onTransaction: (userId: string, amount: number) => Promise<void>; onCancel: () => void; type: 'Top-Up' | 'Withdrawal' }> = ({ users, onTransaction, onCancel, type }) => {
    const [selectedUserId, setSelectedUserId] = useState('');
    const [amount, setAmount] = useState<number | ''>('');
    const themeColor = type === 'Top-Up' ? 'emerald' : 'amber';
    const inputClass = `w-full bg-slate-800 p-2.5 rounded-md border border-slate-700 focus:ring-2 focus:ring-${themeColor}-500 text-white text-sm`;
    return (
        <form onSubmit={async (e) => { e.preventDefault(); if (selectedUserId && amount && amount > 0) { await onTransaction(selectedUserId, Number(amount)); } }} className="space-y-4">
            <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className={inputClass} required>
                <option value="">-- Select Managed User --</option>
                {Array.isArray(users) && users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.id})</option>)}
            </select>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value))} placeholder="Amount in PKR" className={inputClass} min="1" required />
            <div className="flex justify-end space-x-3 pt-4 border-t border-slate-700">
                <button type="button" onClick={onCancel} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-6 rounded-md text-sm transition-colors">Cancel</button>
                <button type="submit" className={`font-bold py-2 px-8 rounded-md text-white text-sm shadow-lg bg-${themeColor}-600 hover:bg-${themeColor}-500 transition-colors uppercase tracking-widest`}>{type}</button>
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
                return user?.name.toLowerCase().includes(searchTerm.toLowerCase()) || game?.name.toLowerCase().includes(searchTerm.toLowerCase()) || user?.id.toLowerCase().includes(searchTerm.toLowerCase());
            }
            return true;
        }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [bets, games, users, startDate, endDate, searchTerm]);
    return (
        <div>
            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 mb-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-slate-900 text-white p-2 rounded text-xs border border-slate-700" />
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-slate-900 text-white p-2 rounded text-xs border border-slate-700" />
                <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search by User or Game..." className="bg-slate-900 text-white p-2 rounded text-xs border border-slate-700" />
                <button onClick={() => {setStartDate(''); setEndDate(''); setSearchTerm('');}} className="bg-slate-700 text-white p-2 rounded font-bold text-xs">RESET FILTERS</button>
            </div>
            <div className="bg-slate-800/40 rounded-lg overflow-x-auto border border-slate-700"><table className="w-full text-left min-w-[700px]"><thead className="bg-slate-800/80 border-b border-slate-700"><tr><th className="p-4 text-xs text-slate-400 uppercase">Time</th><th className="p-4 text-xs text-slate-400 uppercase">User</th><th className="p-4 text-xs text-slate-400 uppercase">Game</th><th className="p-4 text-xs text-slate-400 uppercase">Details</th><th className="p-4 text-xs text-slate-400 uppercase text-right">Stake</th></tr></thead><tbody className="divide-y divide-slate-800">
                {filteredBets.map(bet => (
                    <tr key={bet.id} className="hover:bg-slate-700/20"><td className="p-4 text-[10px] text-slate-400 whitespace-nowrap">{new Date(bet.timestamp).toLocaleString()}</td><td className="p-4 text-sm font-semibold text-white">{users.find(u => u.id === bet.userId)?.name || 'Unknown'}</td><td className="p-4 text-sm text-cyan-400">{games.find(g => g.id === bet.gameId)?.name || 'Game'}</td><td className="p-4"><div className="text-[10px] font-bold text-slate-300">{bet.subGameType}</div><div className="text-[10px] text-slate-500 font-mono">{bet.numbers.join(',')}</div></td><td className="p-4 text-right font-mono text-white text-sm font-bold">{bet.totalAmount.toFixed(2)}</td></tr>
                ))}
            </tbody></table></div>
        </div>
    );
};

export default DealerPanel;