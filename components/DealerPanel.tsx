
import React, { useState, useMemo } from 'react';
import { Dealer, User, PrizeRates, LedgerEntry, BetLimits, Bet, Game, SubGameType } from '../types';
import { Icons } from '../constants';
import { useCountdown } from '../hooks/useCountdown';

const getTodayDateString = () => new Date().toISOString().split('T')[0];

const TableSkeleton = () => (
    <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
        <table className="w-full text-left">
            <tbody className="divide-y divide-slate-800">
                {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                            <td key={j} className="p-4"><div className="h-4 w-20 skeleton rounded"></div></td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: 'md' | 'lg' | 'xl'; themeColor?: string }> = ({ isOpen, onClose, title, children, size = 'md', themeColor = 'emerald' }) => {
    if (!isOpen) return null;
     const sizeClasses: Record<string, string> = { md: 'max-w-md', lg: 'max-w-3xl', xl: 'max-w-5xl' };
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
                        <tr key={entry.id} className="hover:bg-emerald-500/10 text-sm transition-colors">
                            <td className="p-3 text-slate-400 whitespace-nowrap">{entry.timestamp.toLocaleString()}</td>
                            <td className="p-3 text-white">{entry.description}</td>
                            <td className="p-3 text-right text-red-400 font-mono">{entry.debit > 0 ? entry.debit.toFixed(2) : '-'}</td>
                            <td className="p-3 text-right text-green-400 font-mono">{entry.credit > 0 ? entry.credit.toFixed(2) : '-'}</td>
                            <td className="p-3 text-right font-semibold text-white font-mono">{entry.balance.toFixed(2)}</td>
                        </tr>
                    ))}
                    {entries.length === 0 && (
                        <tr><td colSpan={5} className="p-8 text-center text-slate-500">No ledger entries found.</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
);

const UserForm: React.FC<{ user?: User; users: User[]; onSave: (user: User, originalId?: string, initialDeposit?: number) => Promise<void>; onCancel: () => void; dealerPrizeRates: PrizeRates; dealerCommRate: number; dealerId: string }> = ({ user, users, onSave, onCancel, dealerPrizeRates, dealerCommRate, dealerId }) => {
    const [formData, setFormData] = useState(() => {
        const defaults = {
            id: '', name: '', password: '', area: '', contact: '', commissionRate: 0, 
            prizeRates: { ...dealerPrizeRates }, avatarUrl: '', wallet: '',
            betLimits: { oneDigit: 5000, twoDigit: 2000 }
        };
        if (user) {
            return {
                ...user,
                password: '',
                betLimits: {
                    oneDigit: user.betLimits?.oneDigit ?? 5000,
                    twoDigit: user.betLimits?.twoDigit ?? 2000,
                }
            };
        }
        return defaults;
    });

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
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
        const newPassword = user ? password : formData.password!;
        if (newPassword && newPassword !== confirmPassword) { alert("New passwords do not match."); return; }
        
        // Margin Validations
        if (formData.commissionRate > dealerCommRate) { alert(`Your maximum allowed commission rate is ${dealerCommRate}%.`); return; }
        if (formData.prizeRates.oneDigitOpen > dealerPrizeRates.oneDigitOpen) { alert(`Max prize for 1D Open is ${dealerPrizeRates.oneDigitOpen}x.`); return; }
        if (formData.prizeRates.oneDigitClose > dealerPrizeRates.oneDigitClose) { alert(`Max prize for 1D Close is ${dealerPrizeRates.oneDigitClose}x.`); return; }
        if (formData.prizeRates.twoDigit > dealerPrizeRates.twoDigit) { alert(`Max prize for 2D is ${dealerPrizeRates.twoDigit}x.`); return; }

        setIsLoading(true);
        try {
            const finalData: User = {
                ...formData,
                id: (user ? user.id : formData.id) as string,
                dealerId,
                name: formData.name,
                password: newPassword ? newPassword : (user ? user.password : ''),
            } as any;
            await onSave(finalData, user?.id, Number(formData.wallet) || 0);
        } finally {
            setIsLoading(false);
        }
    };

    const inputClass = "w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-emerald-500 focus:outline-none text-white";

    return (
        <form onSubmit={handleSubmit} className="space-y-4 text-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">User Login ID</label>
                    <input type="text" name="id" value={formData.id as string} onChange={handleChange} placeholder="User Login ID" className={inputClass} required disabled={!!user}/>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">User Name</label>
                    <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="Display Name" className={inputClass} required />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                    <label className="block text-sm font-medium text-slate-400 mb-1">Password</label>
                    <input type={isPasswordVisible ? 'text' : 'password'} name="password" value={user ? password : formData.password!} onChange={user ? (e) => setPassword(e.target.value) : handleChange} placeholder={user ? "New Password" : "Password"} className={inputClass + " pr-10"} required={!user} />
                    <button type="button" onClick={() => setIsPasswordVisible(!isPasswordVisible)} className="absolute bottom-2.5 right-3 text-slate-400 hover:text-white">{isPasswordVisible ? Icons.eyeOff : Icons.eye}</button>
                </div>
                <div className="relative">
                    <label className="block text-sm font-medium text-slate-400 mb-1">Confirm Password</label>
                    <input type={isConfirmPasswordVisible ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm Password" className={inputClass + " pr-10"} required={!!(user ? password : formData.password)} />
                    <button type="button" onClick={() => setIsConfirmPasswordVisible(!isConfirmPasswordVisible)} className="absolute bottom-2.5 right-3 text-slate-400 hover:text-white">{isConfirmPasswordVisible ? Icons.eyeOff : Icons.eye}</button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Area</label>
                    <input type="text" name="area" value={formData.area} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Contact</label>
                    <input type="text" name="contact" value={formData.contact} onChange={handleChange} className={inputClass} />
                </div>
            </div>

            {!user && (
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1 text-emerald-400 font-bold">Initial Wallet Load (PKR)</label>
                  <input type="number" name="wallet" value={formData.wallet as string} onChange={handleChange} placeholder="0.00" className={inputClass} />
                </div>
            )}

            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                <h4 className="text-sm font-bold text-white mb-3 uppercase tracking-widest border-b border-slate-700 pb-1">Margins & Prizes</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Commission Rate (%)</label>
                        <input type="number" name="commissionRate" value={formData.commissionRate} onChange={handleChange} step="0.1" className={inputClass} />
                        <p className="text-[10px] text-slate-500 mt-1">Your Max: {dealerCommRate}%</p>
                    </div>
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">2-Digit Prize (x)</label>
                        <input type="number" name="prizeRates.twoDigit" value={formData.prizeRates.twoDigit} onChange={handleChange} className={inputClass} />
                        <p className="text-[10px] text-slate-500 mt-1">Your Max: {dealerPrizeRates.twoDigit}x</p>
                    </div>
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">1D Open Prize (x)</label>
                        <input type="number" name="prizeRates.oneDigitOpen" value={formData.prizeRates.oneDigitOpen} onChange={handleChange} className={inputClass} />
                        <p className="text-[10px] text-slate-500 mt-1">Your Max: {dealerPrizeRates.oneDigitOpen}x</p>
                    </div>
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">1D Close Prize (x)</label>
                        <input type="number" name="prizeRates.oneDigitClose" value={formData.prizeRates.oneDigitClose} onChange={handleChange} className={inputClass} />
                        <p className="text-[10px] text-slate-500 mt-1">Your Max: {dealerPrizeRates.oneDigitClose}x</p>
                    </div>
                </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={onCancel} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-md transition-colors uppercase text-sm">Cancel</button>
                <button type="submit" disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-8 rounded-md transition-colors disabled:opacity-50 uppercase text-sm">
                    {isLoading ? 'Saving...' : 'Save User Profile'}
                </button>
            </div>
        </form>
    );
};

const ProfileSettings: React.FC<{ dealer: Dealer; onUpdate: (data: any) => Promise<void> }> = ({ dealer, onUpdate }) => {
    const [name, setName] = useState(dealer.name);
    const [pass, setPass] = useState('');
    const [confirm, setConfirm] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pass && pass !== confirm) { alert("Passwords don't match."); return; }
        setIsLoading(true);
        try {
            await onUpdate({ name, password: pass || dealer.password });
            alert("Profile updated successfully!");
            setPass(''); setConfirm('');
        } finally { setIsLoading(false); }
    };

    const inputClass = "w-full bg-slate-800 p-3 rounded-md border border-slate-700 text-white focus:ring-2 focus:ring-emerald-500 outline-none";

    return (
        <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-6 bg-slate-800/30 p-8 rounded-xl border border-slate-700">
            <h3 className="text-xl font-bold text-white text-center uppercase tracking-widest mb-4">Account Settings</h3>
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Display Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputClass} />
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">New Password (leave blank to keep current)</label>
                <input type="password" value={pass} onChange={e => setPass(e.target.value)} className={inputClass} />
            </div>
            {pass && (
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Confirm New Password</label>
                    <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className={inputClass} />
                </div>
            )}
            <button type="submit" disabled={isLoading} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-md transition-all uppercase tracking-widest">
                {isLoading ? 'Updating...' : 'Save Profile Changes'}
            </button>
        </form>
    );
};

interface DealerPanelProps {
  dealer: Dealer;
  users: User[];
  onSaveUser: (userData: User, originalId: string | undefined, initialDeposit?: number) => Promise<void>;
  topUpUserWallet: (userId: string, amount: number) => Promise<void>;
  withdrawFromUserWallet: (userId: string, amount: number) => Promise<void>;
  toggleAccountRestriction: (accountId: string, accountType: 'user' | 'dealer') => Promise<void>;
  onUpdateSelf: (data: any) => Promise<void>;
  bets: Bet[];
  games: Game[];
}

const DealerPanel: React.FC<DealerPanelProps> = ({ dealer, users, onSaveUser, topUpUserWallet, withdrawFromUserWallet, toggleAccountRestriction, onUpdateSelf, bets, games }) => {
  const [activeTab, setActiveTab] = useState('users');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | undefined>(undefined);
  const [viewingLedgerFor, setViewingLedgerFor] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredUsers = useMemo(() => users.filter(u => 
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        u.id.toLowerCase().includes(searchQuery.toLowerCase())
    ), [users, searchQuery]);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
            <h2 className="text-4xl font-black text-emerald-400 uppercase tracking-tighter">DEALER DESK</h2>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Operator ID: {dealer.id}</p>
        </div>
        <div className="hidden md:flex gap-6 items-center">
             <div className="text-right">
                <p className="text-[10px] text-slate-500 uppercase font-bold">Current Margin</p>
                <p className="text-sm font-mono text-white">{dealer.commissionRate}% COMM / {dealer.prizeRates.twoDigit}x PRIZE</p>
            </div>
        </div>
      </div>

      <div className="bg-slate-800/50 p-1.5 rounded-lg flex items-center space-x-2 mb-8 self-start flex-wrap border border-slate-700">
        {[
            {id: 'users', label: 'Network', icon: Icons.userGroup},
            {id: 'history', label: 'My Ledger', icon: Icons.bookOpen},
            {id: 'settings', label: 'Settings', icon: Icons.eye}
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center space-x-2 py-2.5 px-6 text-xs font-bold uppercase tracking-widest rounded-md transition-all duration-300 ${activeTab === tab.id ? 'bg-slate-700 text-emerald-400 shadow-lg border border-emerald-500/20' : 'text-slate-500 hover:text-slate-300'}`}>
             {tab.icon} <span>{tab.label}</span>
          </button>
        ))}
      </div>

       {activeTab === 'users' && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
            <h3 className="text-xl font-bold text-white uppercase tracking-widest">User Network ({users.length})</h3>
            <div className="flex gap-2 w-full md:w-auto">
                <div className="relative flex-grow">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">{Icons.search}</span>
                    <input type="text" placeholder="Search accounts..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-slate-800 p-2.5 pl-10 rounded-md border border-slate-700 focus:ring-2 focus:ring-emerald-500 text-white w-full text-sm font-sans"/>
                </div>
                <button onClick={() => { setSelectedUser(undefined); setIsModalOpen(true); }} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-6 rounded-md whitespace-nowrap transition-all shadow-lg shadow-emerald-600/20 active:scale-95 text-xs uppercase">
                  Add Account
                </button>
            </div>
          </div>
          {users.length === 0 ? <TableSkeleton /> : (
            <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                <div className="overflow-x-auto mobile-scroll-x">
                    <table className="w-full text-left min-w-[900px]">
                        <thead className="bg-slate-800/50">
                            <tr className="text-[10px] text-slate-500 uppercase tracking-widest">
                                <th className="p-4">Identity</th>
                                <th className="p-4">Contact/Area</th>
                                <th className="p-4">Rates (C/P)</th>
                                <th className="p-4">Wallet</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-center">Operations</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {filteredUsers.map(user => (
                                <tr key={user.id} className="hover:bg-emerald-500/5 transition-colors text-sm">
                                    <td className="p-4">
                                        <div className="font-bold text-white uppercase">{user.name}</div>
                                        <div className="text-[10px] text-slate-500 font-mono tracking-tighter">{user.id}</div>
                                    </td>
                                    <td className="p-4 text-slate-400">
                                        <div>{user.contact || '--'}</div>
                                        <div className="text-xs">{user.area || '--'}</div>
                                    </td>
                                    <td className="p-4">
                                        <div className="text-emerald-400 font-bold">{user.commissionRate}%</div>
                                        <div className="text-[10px] text-slate-500 font-mono">{user.prizeRates.twoDigit}x / {user.prizeRates.oneDigitOpen}x</div>
                                    </td>
                                    <td className="p-4 font-mono text-white font-bold">PKR {user.wallet.toLocaleString()}</td>
                                    <td className="p-4"><span className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-full ${user.isRestricted ? 'bg-red-500/20 text-red-400 border border-red-500/20' : 'bg-green-500/20 text-green-400 border border-green-500/20'}`}>{user.isRestricted ? 'LOCKED' : 'ACTIVE'}</span></td>
                                    <td className="p-4">
                                        <div className="flex gap-2 justify-center">
                                            <button onClick={() => { setSelectedUser(user); setIsModalOpen(true); }} className="bg-slate-700 hover:bg-slate-600 text-emerald-400 p-2 rounded-md transition-all" title="Edit Profile">{Icons.plus}</button>
                                            <button onClick={() => setViewingLedgerFor(user)} className="bg-slate-700 hover:bg-slate-600 text-cyan-400 p-2 rounded-md transition-all" title="View Ledger">{Icons.bookOpen}</button>
                                            <button onClick={() => toggleAccountRestriction(user.id, 'user')} className={`p-2 rounded-md transition-all ${user.isRestricted ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`} title={user.isRestricted ? 'Unlock' : 'Lock'}>
                                                {user.isRestricted ? Icons.checkCircle : Icons.close}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <h3 className="text-xl font-bold text-white mb-6 uppercase tracking-widest">Consolidated Dealer Ledger</h3>
            <LedgerTable entries={dealer.ledger} />
        </div>
      )}

      {activeTab === 'settings' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 pt-8">
              <ProfileSettings dealer={dealer} onUpdate={onUpdateSelf} />
          </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={selectedUser ? "Modify User Account" : "Open New Account"}>
        <UserForm user={selectedUser} users={users} onSave={async (u, id, dep) => { await onSaveUser(u, id, dep); setIsModalOpen(false); }} onCancel={() => setIsModalOpen(false)} dealerPrizeRates={dealer.prizeRates} dealerCommRate={dealer.commissionRate} dealerId={dealer.id} />
      </Modal>

      {viewingLedgerFor && (
        <Modal isOpen={!!viewingLedgerFor} onClose={() => setViewingLedgerFor(null)} title={`Ledger for ${viewingLedgerFor.name}`} size="xl">
            <LedgerTable entries={viewingLedgerFor.ledger} />
        </Modal>
      )}
    </div>
  );
};

export default DealerPanel;
