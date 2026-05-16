
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Dealer, User, PrizeRates, LedgerEntry, BetLimits, Bet, Game, SubGameType } from '../types';
import { Icons } from '../constants';
import { useCountdown } from '../hooks/useCountdown';

const getTodayDateString = () => new Date().toISOString().split('T')[0];

const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: 'md' | 'lg' | 'xl'; themeColor?: string }> = ({ isOpen, onClose, title, children, size = 'md', themeColor = 'emerald' }) => {
    const sizeClasses: Record<string, string> = { md: 'max-w-md', lg: 'max-w-3xl', xl: 'max-w-6xl' };
    
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className={`relative w-full ${sizeClasses[size]} glass-morphism rounded-3xl overflow-hidden shadow-2xl border-emerald-500/10 flex flex-col max-h-[90vh]`}
                    >
                        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-50" />
                        
                        <div className="flex justify-between items-center p-6 border-b border-white/5 relative z-10 bg-white/[0.02]">
                            <div>
                                <h3 className="text-xl font-black text-white uppercase tracking-tighter">{title}</h3>
                                <div className="h-1 w-12 bg-emerald-500 rounded-full mt-1" />
                            </div>
                            <button 
                                onClick={onClose} 
                                className="p-2 hover:bg-white/5 rounded-full transition-colors text-slate-400 hover:text-white"
                            >
                                <Icons.close className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto custom-scrollbar relative z-10">
                            {children}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

const Toast: React.FC<{ message: string; type: 'success' | 'error'; onClose: () => void }> = ({ message, type, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 4000);
        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <motion.div 
            initial={{ opacity: 0, x: 20, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.9 }}
            className={`fixed top-4 right-4 z-[2000] p-4 rounded-2xl shadow-2xl border backdrop-blur-xl flex items-center gap-4 max-w-[90vw] sm:max-w-md ${
                type === 'success' ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-50' : 'bg-red-950/90 border-red-500/30 text-red-50'
            }`}
        >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${type === 'success' ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
                {type === 'success' ? <Icons.checkCircle className="w-6 h-6 text-emerald-400" /> : <Icons.sparkles className="w-6 h-6 text-red-400" />}
            </div>
            <div className="flex flex-col">
                <span className="text-[10px] uppercase font-black tracking-widest opacity-50 mb-0.5">{type === 'success' ? 'Success' : 'Attention'}</span>
                <span className="font-bold text-xs tracking-tight">{message}</span>
            </div>
            <button onClick={onClose} className="ml-auto p-1.5 hover:bg-white/5 rounded-full transition-colors opacity-50 hover:opacity-100">
                <Icons.close className="w-4 h-4" />
            </button>
        </motion.div>
    );
};

const LedgerTable: React.FC<{ entries: LedgerEntry[] }> = ({ entries }) => (
    <div className="space-y-4">
        {/* Mobile View */}
        <div className="sm:hidden space-y-3">
            {Array.isArray(entries) && [...entries].reverse().map((entry, idx) => (
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    key={entry.id} 
                    className="glass-card p-4 rounded-2xl border border-white/5 shadow-xl relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 blur-3xl rounded-full -mr-12 -mt-12" />
                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-3">
                            <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5">
                                <Icons.clock className="w-3 h-3" />
                                {entry.timestamp?.toLocaleString() || 'N/A'}
                            </div>
                            <div className="text-right">
                                <div className="text-[8px] text-slate-500 uppercase font-black tracking-tighter opacity-70">Running Balance</div>
                                <div className="font-mono text-white font-bold text-xs">Rs {entry.balance.toFixed(2)}</div>
                            </div>
                        </div>
                        <div className="text-sm text-slate-200 mb-4 font-bold tracking-tight leading-tight">{entry.description}</div>
                        <div className="flex gap-6 border-t border-white/5 pt-3">
                            {entry.debit > 0 && (
                                <div>
                                    <div className="text-[8px] text-red-400 uppercase font-black tracking-tight mb-0.5">Debit (-)</div>
                                    <div className="text-red-400 font-mono font-black text-sm">Rs {entry.debit.toFixed(2)}</div>
                                </div>
                            )}
                            {entry.credit > 0 && (
                                <div>
                                    <div className="text-[8px] text-emerald-400 uppercase font-black tracking-tight mb-0.5">Credit (+)</div>
                                    <div className="text-emerald-400 font-mono font-black text-sm">Rs {entry.credit.toFixed(2)}</div>
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            ))}
            {(!Array.isArray(entries) || entries.length === 0) && (
                <div className="p-12 text-center text-slate-600 text-xs font-black uppercase tracking-widest bg-black/20 rounded-2xl border border-white/5">Empty records.</div>
            )}
        </div>

        {/* Desktop View */}
        <div className="hidden sm:block glass-morphism rounded-2xl overflow-hidden border border-white/5 shadow-2xl">
            <div className="overflow-y-auto max-h-[60vh] custom-scrollbar">
                <table className="w-full text-left min-w-[600px]">
                    <thead className="bg-slate-950/50 sticky top-0 backdrop-blur-xl border-b border-white/5 z-20">
                        <tr>
                            <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Timestamp</th>
                            <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Transaction Description</th>
                            <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Debit (-)</th>
                            <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Credit (+)</th>
                            <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">New Balance</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {Array.isArray(entries) && [...entries].reverse().map(entry => (
                            <tr key={entry.id} className="hover:bg-white/[0.02] text-sm transition-colors group">
                                <td className="p-4 text-slate-500 font-mono text-xs whitespace-nowrap group-hover:text-slate-300 transition-colors">{entry.timestamp?.toLocaleString() || 'N/A'}</td>
                                <td className="p-4 text-white font-bold tracking-tight">{entry.description}</td>
                                <td className="p-4 text-right text-red-400/80 font-mono font-bold">{entry.debit > 0 ? `Rs ${entry.debit.toFixed(2)}` : '-'}</td>
                                <td className="p-4 text-right text-emerald-400 font-mono font-bold">{entry.credit > 0 ? `Rs ${entry.credit.toFixed(2)}` : '-'}</td>
                                <td className="p-4 text-right font-mono font-black text-white group-hover:text-emerald-400 transition-colors">Rs {entry.balance.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
);

export const UserForm: React.FC<{ 
    user?: User; 
    users: User[]; 
    onSave: (user: User, originalId?: string, initialDeposit?: number) => Promise<void>; 
    onCancel: () => void; 
    dealerPrizeRates: PrizeRates, 
    dealerId: string;
    showToast: (msg: string, type: 'success' | 'error') => void 
}> = ({ user, users, onSave, onCancel, dealerId, showToast }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [formData, setFormData] = useState(() => {
        if (user) {
            return {
                id: user.id,
                name: user.name,
                contact: user.contact || '',
                area: user.area || '',
                password: '',
                wallet: user.wallet.toString(),
                commissionRate: (user.commissionRate ?? 0).toString(),
                betLimits: {
                    oneDigit: (user.betLimits?.oneDigit ?? 1000).toString(),
                    twoDigit: (user.betLimits?.twoDigit ?? 5000).toString(),
                    perDraw: (user.betLimits?.perDraw ?? 20000).toString(),
                },
                prizeRates: {
                    oneDigitOpen: (user.prizeRates?.oneDigitOpen ?? 9.50).toString(),
                    oneDigitClose: (user.prizeRates?.oneDigitClose ?? 9.50).toString(),
                    twoDigit: (user.prizeRates?.twoDigit ?? 85.00).toString()
                },
                avatarUrl: user.avatarUrl || ''
            };
        }
        return {
            id: '', name: '', area: '', contact: '', 
            commissionRate: '0', 
            prizeRates: { oneDigitOpen: '9.50', oneDigitClose: '9.50', twoDigit: '85.00' }, 
            avatarUrl: '', wallet: '0',
            betLimits: { oneDigit: '1000', twoDigit: '5000', perDraw: '20000' }
        };
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        if (name.includes('.')) {
            const [parent, child] = name.split('.');
            setFormData(prev => ({ 
                ...prev, 
                [parent]: { 
                    ...(prev[parent as keyof typeof prev] as object), 
                    [child]: value 
                } 
            }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const activePass = user ? (password || user.password) : password;
        
        if (!user && !password) { showToast("⚠️ Password is required.", "error"); return; }
        if (password && password !== confirmPassword) { showToast("⚠️ Passwords do not match.", "error"); return; }
        
        const isIdTaken = !user && users.some(u => u.id.toLowerCase() === formData.id.toLowerCase());
        if (isIdTaken) { showToast("⚠️ Username already exists.", "error"); return; }

        setIsLoading(true);
        try {
            const userPayload: User = {
                id: formData.id,
                name: formData.name,
                contact: formData.contact,
                area: formData.area,
                password: activePass,
                dealerId,
                wallet: Number(formData.wallet) || 0,
                commissionRate: Number(formData.commissionRate) || 0,
                isRestricted: user?.isRestricted ?? false,
                ledger: [], 
                avatarUrl: formData.avatarUrl,
                betLimits: {
                    oneDigit: Number(formData.betLimits.oneDigit) || 0,
                    twoDigit: Number(formData.betLimits.twoDigit) || 0,
                    perDraw: Number(formData.betLimits.perDraw) || 0
                },
                prizeRates: {
                    oneDigitOpen: Number(formData.prizeRates.oneDigitOpen) || 0,
                    oneDigitClose: Number(formData.prizeRates.oneDigitClose) || 0,
                    twoDigit: Number(formData.prizeRates.twoDigit) || 0
                }
            };

            await onSave(userPayload, user?.id, user ? undefined : Number(formData.wallet));
            showToast(user ? "✅ User updated successfully!" : "✅ User added successfully!", "success");
            onCancel();
        } catch (err: any) {
            showToast(`⚠️ ${err.message || 'Error processing user'}`, 'error');
        } finally {
            setIsLoading(false); 
        }
    };

    const inputClass = "w-full bg-slate-950/50 p-3.5 rounded-xl border border-white/10 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 text-white text-sm transition-all font-medium placeholder:text-slate-600";
    const labelClass = "block text-[10px] font-black text-slate-500 mb-1.5 uppercase tracking-widest ml-1";

    return (
        <form onSubmit={handleSubmit} className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                    <label className={labelClass}>Account Username</label>
                    <input type="text" name="id" value={formData.id} onChange={handleChange} className={inputClass} required disabled={!!user} placeholder="e.g. player_xyz" />
                </div>
                <div>
                    <label className={labelClass}>Customer Full Name</label>
                    <input type="text" name="name" value={formData.name} onChange={handleChange} className={inputClass} required placeholder="e.g. Muhammad Khan" />
                </div>
                <div>
                    <label className={labelClass}>Registered Contact</label>
                    <input type="tel" name="contact" value={formData.contact} onChange={handleChange} className={inputClass} required placeholder="03XXXXXXXXX" />
                </div>
                <div>
                    <label className={labelClass}>Region / Sector</label>
                    <input type="text" name="area" value={formData.area} onChange={handleChange} className={inputClass} required placeholder="e.g. Lahore / Cantt" />
                </div>
                
                <div className="relative">
                    <label className={labelClass}>{user ? "Change Secret Password" : "Account Password"}</label>
                    <input type={isPasswordVisible ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className={inputClass + " pr-12"} required={!user} />
                    <button type="button" onClick={() => setIsPasswordVisible(!isPasswordVisible)} className="absolute right-4 top-9 text-slate-500 hover:text-slate-300 transition-colors">{isPasswordVisible ? <Icons.eyeOff className="w-5 h-5" /> : <Icons.eye className="w-5 h-5" />}</button>
                </div>
                <div>
                    <label className={labelClass}>Validate Password</label>
                    <input type={isPasswordVisible ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputClass} required={!!password} />
                </div>

                {!user && (
                    <div>
                        <label className={labelClass}>Initial Deposit (PKR)</label>
                        <input type="text" name="wallet" value={formData.wallet} onChange={handleChange} className={inputClass} placeholder="5000" />
                    </div>
                )}
                <div>
                    <label className={labelClass}>Network Commission (%)</label>
                    <input type="text" name="commissionRate" value={formData.commissionRate} onChange={handleChange} className={inputClass} placeholder="0.00" />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 p-6 rounded-3xl bg-white/[0.02] border border-white/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full" />
                <div className="sm:col-span-3">
                    <h4 className="text-xs font-black text-emerald-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                        <Icons.star className="w-3 h-3" />
                        Payout Multipliers
                    </h4>
                    <p className="text-[10px] text-slate-500 font-medium">Define profit ratios for won bets</p>
                </div>
                <div>
                    <label className={labelClass}>2 Digit Payout</label>
                    <input type="text" name="prizeRates.twoDigit" value={formData.prizeRates.twoDigit} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                    <label className={labelClass}>Open/Harf</label>
                    <input type="text" name="prizeRates.oneDigitOpen" value={formData.prizeRates.oneDigitOpen} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                    <label className={labelClass}>Close/Harf</label>
                    <input type="text" name="prizeRates.oneDigitClose" value={formData.prizeRates.oneDigitClose} onChange={handleChange} className={inputClass} />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 p-6 rounded-3xl bg-white/[0.02] border border-white/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-3xl rounded-full" />
                <div className="sm:col-span-3">
                    <h4 className="text-xs font-black text-cyan-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                        <Icons.sparkles className="w-3 h-3" />
                        Stake Thresholds
                    </h4>
                    <p className="text-[10px] text-slate-500 font-medium">Maximum allowed stake amounts</p>
                </div>
                <div>
                    <label className={labelClass}>Max (2 Digit)</label>
                    <input type="text" name="betLimits.twoDigit" value={formData.betLimits.twoDigit} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                    <label className={labelClass}>Max (1 Digit)</label>
                    <input type="text" name="betLimits.oneDigit" value={formData.betLimits.oneDigit} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                    <label className={labelClass}>Market CAP</label>
                    <input type="text" name="betLimits.perDraw" value={formData.betLimits.perDraw} onChange={handleChange} className={inputClass} />
                </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 border-t border-white/5">
                <button type="button" onClick={onCancel} className="px-8 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-sm transition-all border border-white/10">Discard</button>
                <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit" 
                    disabled={isLoading} 
                    className="px-12 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm transition-all flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/20 disabled:opacity-50"
                >
                    {isLoading ? <div className="w-5 h-5 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin"></div> : user ? "Update Account" : "Activate User Account"}
                </motion.button>
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
        const clickOut = (e: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false); };
        document.addEventListener('mousedown', clickOut);
        return () => document.removeEventListener('mousedown', clickOut);
    }, []);

    const btnClass = "w-full text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-colors flex items-center gap-3";

    return (
        <div className="relative inline-block" ref={dropdownRef}>
            <button onClick={() => setIsOpen(!isOpen)} className="p-2 hover:bg-white/5 rounded-xl transition-all text-slate-500 hover:text-white border border-transparent hover:border-white/10 shadow-inner">
                <Icons.search className="h-5 w-5" />
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className="absolute right-0 mt-3 w-56 glass-morphism rounded-2xl shadow-2xl z-[60] overflow-hidden border border-white/10 divide-y divide-white/5"
                    >
                        <div className="px-4 py-2 bg-white/5">
                            <div className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em]">Management</div>
                        </div>
                        <button onClick={() => { onEdit(); setIsOpen(false); }} className={`${btnClass} text-sky-400`}><Icons.user className="w-3.5 h-3.5 text-sky-400" /> Edit Account</button>
                        <button onClick={() => { onLedger(); setIsOpen(false); }} className={`${btnClass} text-emerald-400`}><Icons.bookOpen className="w-3.5 h-3.5 text-emerald-400" /> Transaction Ledger</button>
                        <button onClick={() => { onToggleStatus(); setIsOpen(false); }} className={`${btnClass} ${user.isRestricted ? 'text-green-400' : 'text-amber-400'}`}>
                            {user.isRestricted ? <Icons.checkCircle className="w-3.5 h-3.5" /> : <Icons.alertTriangle className="w-3.5 h-3.5" />}
                            {user.isRestricted ? 'Enable Access' : 'Restrict Access'}
                        </button>
                        <button onClick={() => { if(window.confirm(`Permanently delete ${user.name}? This cannot be undone.`)) onDelete(); setIsOpen(false); }} className={`${btnClass} text-red-500 hover:bg-red-500/10`}><Icons.close className="w-3.5 h-3.5" /> Terminate Account</button>
                    </motion.div>
                )}
            </AnimatePresence>
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
  const safeDealer = dealer || { id: '', name: '', prizeRates: {}, ledger: [], commissionRate: 0 };

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
    { id: 'users', label: 'Users', icon: <Icons.userGroup className="w-4 h-4" /> },
    { id: 'terminal', label: 'Terminal', icon: <Icons.clipboardList className="w-4 h-4" /> },
    { id: 'wallet', label: 'Wallet', icon: <Icons.wallet className="w-4 h-4" /> },
    { id: 'history', label: 'History', icon: <Icons.bookOpen className="w-4 h-4" /> },
  ];

  if (!dealer) return <div className="p-8 text-center text-slate-400">Loading dealer profile...</div>;

  return (
    <div className="p-4 sm:p-8 lg:p-12 max-w-7xl mx-auto min-h-screen">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-12 gap-8 relative z-10">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col"
          >
            <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                    <Icons.userGroup className="w-6 h-6 text-slate-950" />
                </div>
                <h2 className="text-3xl sm:text-4xl font-black text-white uppercase tracking-tighter">Dealer <span className="text-emerald-500">Panel</span></h2>
            </div>
            <div className="flex items-center gap-2">
                <span className="glass px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-emerald-400 border border-emerald-500/20 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Network Commission: {safeDealer.commissionRate}%
                </span>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-950/40 p-1.5 rounded-2xl flex items-center gap-1 border border-white/5 w-full xl:w-auto overflow-x-auto no-scrollbar glass-morphism shadow-2xl"
          >
            {tabs.map(tab => {
                const isActive = activeTab === tab.id;
                return (
                    <button 
                        key={tab.id} 
                        onClick={() => setActiveTab(tab.id)} 
                        className={`relative shrink-0 flex items-center gap-2.5 py-3 px-5 sm:px-6 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-xl transition-all duration-500 ${isActive ? 'text-slate-950' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        {isActive && (
                            <motion.div 
                                layoutId="activeTabDealer"
                                className="absolute inset-0 bg-emerald-500 rounded-xl shadow-lg shadow-emerald-500/20"
                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                            />
                        )}
                        <span className="relative z-10 opacity-70">{tab.icon}</span>
                        <span className="relative z-10">{tab.label}</span>
                    </button>
                );
            })}
          </motion.div>
      </div>
      
      <AnimatePresence mode="wait">
        <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
        >
            {activeTab === 'users' && (
                <div className="space-y-8">
                   <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-6">
                    <div className="flex items-center gap-4">
                        <h3 className="text-xl font-black text-white uppercase tracking-tighter">Account Management</h3>
                        <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black font-mono">
                            {dealerUsers.length} TOTAL
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative group sm:w-80">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500 group-focus-within:text-emerald-500 transition-colors"><Icons.search className="w-4 h-4" /></span>
                            <input 
                                type="text" 
                                placeholder="Filter by ID, name or area..." 
                                value={searchQuery} 
                                onChange={(e) => setSearchQuery(e.target.value)} 
                                className="w-full bg-slate-950/50 p-3.5 pl-12 rounded-2xl border border-white/5 text-white text-xs font-medium focus:ring-2 focus:ring-emerald-500/50 shadow-inner transition-all placeholder:text-slate-600" 
                            />
                        </div>
                        <motion.button 
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => { setSelectedUser(undefined); setIsUserModalOpen(true); }} 
                            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 p-3.5 rounded-2xl font-black px-8 transition-all shadow-xl shadow-emerald-500/20 text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                        >
                            <Icons.plus className="w-4 h-4" />
                            Onboard User
                        </motion.button>
                    </div>
                  </div>

                  <div className="glass-morphism rounded-3xl overflow-hidden border border-white/5 shadow-2xl relative">
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left min-w-[900px]">
                            <thead className="bg-slate-950/50 border-b border-white/5">
                                <tr>
                                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Identity Profile</th>
                                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Regional Data</th>
                                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Available Balance</th>
                                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Comm Ratio</th>
                                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Auth Status</th>
                                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {!isLoaded ? (
                                    <tr><td colSpan={6} className="p-24 text-center">
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="w-10 h-10 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                                            <p className="text-slate-500 font-black text-[10px] uppercase tracking-widest">Decrypting User Nodes...</p>
                                        </div>
                                    </td></tr>
                                ) : dealerUsers.length === 0 ? (
                                    <tr><td colSpan={6} className="p-24 text-center">
                                        <div className="flex flex-col items-center gap-4 opacity-40">
                                            <Icons.search className="w-12 h-12 text-slate-500" />
                                            <p className="text-slate-500 font-black text-[10px] uppercase tracking-widest">No matching agents discovered.</p>
                                        </div>
                                    </td></tr>
                                ) : dealerUsers.map((user, idx) => (
                                    <motion.tr 
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.03 }}
                                        key={user.id} 
                                        className="hover:bg-white/[0.02] transition-all group"
                                    >
                                        <td className="p-6">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-white shadow-inner bg-gradient-to-br ${user.isRestricted ? 'from-slate-700 to-slate-800' : 'from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30'}`}>
                                                    {user.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-white text-base tracking-tight">{user.name}</div>
                                                    <div className="text-[10px] text-slate-500 font-mono tracking-widest uppercase flex items-center gap-1.5">
                                                        <div className={`w-1.5 h-1.5 rounded-full ${user.isRestricted ? 'bg-red-500' : 'bg-emerald-500'}`} />
                                                        {user.id}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <div className="text-xs text-slate-300 font-bold tracking-tight mb-1">{user.area || 'UNDEFINED'}</div>
                                            <div className="text-[10px] text-slate-500 font-mono">{user.contact || 'NO CONTACT'}</div>
                                        </td>
                                        <td className="p-6 text-right">
                                            <div className="font-mono text-emerald-400 font-black text-lg">Rs {user.wallet.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                            <div className="text-[9px] text-slate-500 uppercase tracking-widest font-black opacity-50">Liquid Holdings</div>
                                        </td>
                                        <td className="p-6 text-center">
                                            <div className="font-black text-white text-sm bg-white/5 py-1 px-3 rounded-lg inline-block">{user.commissionRate}%</div>
                                        </td>
                                        <td className="p-6 text-center">
                                            {user.isRestricted ? 
                                                <div className="inline-flex items-center gap-1.5 bg-red-500/10 text-red-500 text-[9px] px-3 py-1 rounded-full border border-red-500/20 font-black uppercase tracking-widest">
                                                    Restricted
                                                </div> : 
                                                <div className="inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-500 text-[9px] px-3 py-1 rounded-full border border-emerald-500/20 font-black uppercase tracking-widest">
                                                    Authorized
                                                </div>
                                            }
                                        </td>
                                        <td className="p-6 text-right">
                                            <MoreOptionsDropdown 
                                                user={user} 
                                                onEdit={() => { setSelectedUser(user); setIsUserModalOpen(true); }} 
                                                onLedger={() => setViewingUserLedgerFor(user)} 
                                                onToggleStatus={() => { toggleAccountRestriction(user.id, 'user'); showToast(`Account ${user.isRestricted ? 'Enabled' : 'Restricted'} successfully.`, "success"); }} 
                                                onDelete={async () => { try { await onDeleteUser(user.id); showToast("Account purged from database.", "success"); } catch(e) { showToast("Critical failure during account deletion.", "error"); } }}
                                            />
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row justify-end gap-4">
                        <motion.button 
                            whileHover={{ y: -2, scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setIsTopUpModalOpen(true)} 
                            className="flex-1 sm:flex-none glass-morphism hover:bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 p-4 px-10 rounded-2xl font-black transition-all flex items-center justify-center gap-3 text-xs uppercase tracking-[0.2em] shadow-xl"
                        >
                            <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                <Icons.plus className="w-3.5 h-3.5" />
                            </div>
                            Credit Injected
                        </motion.button>
                        <motion.button 
                            whileHover={{ y: -2, scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setIsWithdrawalModalOpen(true)} 
                            className="flex-1 sm:flex-none glass-morphism hover:bg-amber-500/10 text-amber-400 border border-amber-500/20 p-4 px-10 rounded-2xl font-black transition-all flex items-center justify-center gap-3 text-xs uppercase tracking-[0.2em] shadow-xl"
                        >
                            <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center">
                                <Icons.minus className="w-3.5 h-3.5" />
                            </div>
                            Debit Extracted
                        </motion.button>
                  </div>
                </div>
            )}

            {activeTab === 'terminal' && <BettingTerminalView users={safeUsers} games={games} placeBetAsDealer={placeBetAsDealer} />}
            {activeTab === 'wallet' && <WalletView dealer={safeDealer as Dealer} />}
            {activeTab === 'history' && <BetHistoryView bets={bets} games={games} users={safeUsers} />}
        </motion.div>
      </AnimatePresence>

      <Modal isOpen={isUserModalOpen} onClose={() => setIsUserModalOpen(false)} title={selectedUser ? "Modify Asset Identity" : "Onboard New Node"}>
          <UserForm user={selectedUser} users={safeUsers} onSave={onSaveUser} onCancel={() => setIsUserModalOpen(false)} dealerPrizeRates={safeDealer.prizeRates as PrizeRates} dealerId={safeDealer.id} showToast={showToast} />
      </Modal>

      <Modal isOpen={isTopUpModalOpen} onClose={() => setIsTopUpModalOpen(false)} title="Inject Liquidity Credential">
          <UserTransactionForm type="Top-Up" users={dealerUsers} onTransaction={async (userId, amount) => { await topUpUserWallet(userId, amount); showToast("Success: Liquidity verified.", "success"); setIsTopUpModalOpen(false); }} onCancel={() => setIsTopUpModalOpen(false)} />
      </Modal>

      <Modal isOpen={isWithdrawalModalOpen} onClose={() => setIsWithdrawalModalOpen(false)} title="Extract Asset Reserves">
          <UserTransactionForm type="Withdrawal" users={dealerUsers} onTransaction={async (userId, amount) => { await withdrawFromUserWallet(userId, amount); showToast("Success: Asset extracted.", "success"); setIsWithdrawalModalOpen(false); }} onCancel={() => setIsWithdrawalModalOpen(false)} />
      </Modal>

      {viewingUserLedgerFor && (
        <Modal isOpen={!!viewingUserLedgerFor} onClose={() => setViewingUserLedgerFor(null)} title={`Ledger: ${viewingUserLedgerFor.name}`} size="xl">
            <LedgerTable entries={viewingUserLedgerFor.ledger} />
        </Modal>
      )}
    </div>
  );
};

const WalletView: React.FC<{ dealer: Dealer }> = ({ dealer }) => {
    if (!dealer) return null;
    return (
        <div className="space-y-8 max-w-5xl mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="glass-morphism p-8 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center relative overflow-hidden group shadow-2xl"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full" />
                    <Icons.wallet className="w-8 h-8 text-emerald-500/50 mb-4 group-hover:scale-110 transition-transform" />
                    <p className="text-slate-500 uppercase text-[10px] font-black tracking-[0.2em] mb-2">Available Reserves</p>
                    <p className="text-4xl font-black text-emerald-400 font-mono tracking-tighter">Rs {dealer.wallet.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                </motion.div>
                <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="glass-morphism p-8 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center relative overflow-hidden group shadow-2xl"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-3xl rounded-full" />
                    <Icons.bookOpen className="w-8 h-8 text-cyan-500/50 mb-4 group-hover:scale-110 transition-transform" />
                    <p className="text-slate-500 uppercase text-[10px] font-black tracking-[0.2em] mb-2">Operation Logs</p>
                    <p className="text-4xl font-black text-white font-mono tracking-tighter">{dealer.ledger?.length || 0}</p>
                </motion.div>
            </div>
            <div className="space-y-4">
                <div className="flex items-center gap-3 ml-2">
                    <h4 className="text-sm font-black text-white uppercase tracking-widest">Recent Activity</h4>
                    <div className="h-px flex-grow bg-white/5" />
                </div>
                <LedgerTable entries={dealer.ledger} />
            </div>
        </div>
    );
};

const OpenGameOption: React.FC<{ game: Game }> = ({ game }) => {
    const { status, text } = useCountdown(game.drawTime);
    if (!game.isMarketOpen) return null;
    return <option value={game.id}>{game.name} (Draw: {game.drawTime})</option>;
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
                const stakeMatch = line.match(/(?:rs|r)?\s*(\d+\.?\d*)$/i);
                const stake = stakeMatch ? parseFloat(stakeMatch[1]) : 0;
                if (stake <= 0) return;
                const numbersPart = line.substring(0, stakeMatch!.index).trim();
                const numbers = numbersPart.split(/[-.,\s]+/).filter(n => n.length > 0);
                if (numbers.length > 0) {
                    betGroups.push({ subGameType: SubGameType.TwoDigit, numbers, amountPerNumber: stake });
                }
            });
            if (betGroups.length === 0) { alert("Invalid Format: use '14, 25 100'"); setIsLoading(false); return; }
            await placeBetAsDealer({ userId: selectedUserId, gameId: selectedGameId, betGroups });
            setBulkInput('');
            alert("Bets successfully committed to ledger.");
        } catch (error: any) {
            alert(error.message || "Terminal processing conflict.");
        } finally {
            setIsLoading(false);
        }
    };

    const selClass = "bg-slate-950/50 text-white p-4 rounded-2xl border border-white/5 text-xs font-black uppercase tracking-widest focus:ring-2 focus:ring-emerald-500/50 appearance-none";

    return (
        <div className="glass-morphism p-8 rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden group max-w-4xl mx-auto">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-3xl rounded-full" />
            <div className="relative z-10">
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-emerald-500">
                        <Icons.clipboardList className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-white uppercase tracking-tighter">Bulk Entry Terminal</h3>
                        <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">Rapid Input System</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Target Account</label>
                        <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} className={selClass}>
                            <option value="">-- Discovered Nodes --</option>
                            {Array.isArray(users) && users.filter(u => !u.isRestricted).map(u => <option key={u.id} value={u.id}>{u.name} ({u.id})</option>)}
                        </select>
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Active Market</label>
                        <select value={selectedGameId} onChange={e => setSelectedGameId(e.target.value)} className={selClass}>
                            <option value="">-- LIVE Feeds --</option>
                            {Array.isArray(games) && games.map(g => <OpenGameOption key={g.id} game={g} />)}
                        </select>
                    </div>
                </div>

                <div className="flex flex-col gap-2 mb-8">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Command Input</label>
                    <textarea 
                        rows={6} 
                        value={bulkInput} 
                        onChange={e => setBulkInput(e.target.value)} 
                        placeholder="Format: NUMBERS [SPACE] STAKE&#10;Example: 14, 25 100" 
                        className="w-full bg-slate-950/50 text-emerald-400 p-6 rounded-2xl border border-white/5 font-mono text-sm focus:ring-2 focus:ring-emerald-500/50 shadow-inner placeholder:text-slate-700 custom-scrollbar" 
                    />
                </div>

                <div className="flex justify-end">
                    <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleProcessBets} 
                        disabled={!selectedUserId || !selectedGameId || !bulkInput || isLoading} 
                        className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-4 px-12 rounded-2xl disabled:opacity-50 transition-all uppercase tracking-widest text-xs shadow-xl shadow-emerald-500/20"
                    >
                        {isLoading ? 'EXECUTING...' : 'COMMIT ENTRIES'}
                    </motion.button>
                </div>
            </div>
        </div>
    );
};

const UserTransactionForm: React.FC<{ users: User[]; onTransaction: (userId: string, amount: number) => Promise<void>; onCancel: () => void; type: 'Top-Up' | 'Withdrawal' }> = ({ users, onTransaction, onCancel, type }) => {
    const [selectedUserId, setSelectedUserId] = useState('');
    const [amount, setAmount] = useState<number | ''>('');
    const [isLoading, setIsLoading] = useState(false);
    
    const themeColor = type === 'Top-Up' ? 'emerald' : 'amber';
    const inputClass = `w-full bg-slate-950/50 p-4 rounded-2xl border border-white/10 focus:ring-2 focus:ring-${themeColor}-500/50 text-white text-sm font-bold shadow-inner transition-all appearance-none`;
    const labelClass = "block text-[10px] uppercase font-black text-slate-500 mb-1.5 tracking-widest ml-1";

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedUserId && amount && Number(amount) > 0) {
            setIsLoading(true);
            try {
                await onTransaction(selectedUserId, Number(amount));
            } finally {
                setIsLoading(false);
            }
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <label className={labelClass}>Target Account Identifier</label>
                <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className={inputClass} required>
                    <option value="">-- Discovered User Nodes --</option>
                    {Array.isArray(users) && users.map(u => (
                        <option key={u.id} value={u.id}>
                            {u.name} ({u.id}) — Funds: Rs {u.wallet.toLocaleString()}
                        </option>
                    ))}
                </select>
            </div>
            <div>
                <label className={labelClass}>Liquidity Amount (PKR)</label>
                <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-black text-xs">RS</span>
                    <input type="number" value={amount} onChange={(e) => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value))} placeholder="0.00" className={inputClass + " pl-10"} min="0.01" required step="0.01" />
                </div>
            </div>
            <div className="flex gap-3 pt-6 border-t border-white/5">
                <button type="button" onClick={onCancel} className="flex-1 bg-white/5 hover:bg-white/10 text-white font-bold py-3.5 rounded-xl text-xs transition-all uppercase tracking-widest border border-white/5">Abort</button>
                <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit" 
                    disabled={isLoading}
                    className={`flex-1 font-black py-3.5 rounded-xl text-slate-950 text-xs shadow-lg shadow-${themeColor}-500/20 bg-${themeColor}-500 hover:bg-${themeColor}-400 transition-all uppercase tracking-[0.2em]`}
                >
                    {isLoading ? 'Syncing...' : type}
                </motion.button>
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
            const dateObj = new Date(bet.timestamp);
            if (isNaN(dateObj.getTime())) return false;
            const dateStr = dateObj.toISOString().split('T')[0];
            if (startDate && dateStr < startDate) return false;
            if (endDate && dateStr > endDate) return false;
            if (searchTerm.trim()) {
                const user = users.find(u => u.id === bet.userId);
                const game = games.find(g => g.id === bet.gameId);
                return user?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                       game?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                       user?.id.toLowerCase().includes(searchTerm.toLowerCase());
            }
            return true;
        }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [bets, games, users, startDate, endDate, searchTerm]);

    const inputClass = "bg-slate-950/50 text-white p-3 rounded-2xl text-[10px] border border-white/5 font-black uppercase tracking-widest w-full focus:ring-2 focus:ring-emerald-500/50 appearance-none transition-all";

    return (
        <div className="space-y-6">
            <div className="glass-morphism p-6 rounded-3xl border border-white/5 flex flex-col lg:flex-row gap-4 items-center">
                <div className="w-full lg:w-48 relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 z-10 pointer-events-none text-[8px] font-black uppercase">From</div>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputClass + " pl-12"} />
                </div>
                <div className="w-full lg:w-48 relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 z-10 pointer-events-none text-[8px] font-black uppercase">To</div>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputClass + " pl-8"} />
                </div>
                <div className="w-full flex-grow relative group">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500 group-focus-within:text-emerald-500 transition-colors"><Icons.search className="w-4 h-4" /></span>
                    <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Filter history node..." className={inputClass + " pl-12 py-3.5"} />
                </div>
                <button onClick={() => {setStartDate(''); setEndDate(''); setSearchTerm('');}} className="w-full lg:w-auto px-6 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-black text-[10px] uppercase tracking-widest transition-all border border-white/10">Purge Filter</button>
            </div>

            {/* Mobile Card View */}
            <div className="sm:hidden space-y-4">
                {filteredBets.map((bet, idx) => (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.05 }}
                        key={bet.id} 
                        className="glass-card p-5 rounded-2xl border border-white/5 shadow-xl relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 blur-3xl rounded-full -mr-12 -mt-12" />
                        <div className="relative z-10">
                            <div className="flex justify-between items-start mb-4">
                                <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5 uppercase">
                                    <Icons.clock className="w-3 h-3" />
                                    {new Date(bet.timestamp).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                                </div>
                                <div className="text-right font-mono text-emerald-400 font-black text-base tracking-tighter">Rs {bet.totalAmount.toLocaleString()}</div>
                            </div>
                            <div className="flex justify-between items-center mb-4 pb-4 border-b border-white/5">
                                <div className="flex flex-col">
                                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Player Entity</span>
                                    <div className="text-sm font-black text-white tracking-tight">{users.find(u => u.id === bet.userId)?.name || 'Unknown Node'}</div>
                                </div>
                                <div className="flex flex-col items-end text-right">
                                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Market Feed</span>
                                    <div className="text-xs font-black text-cyan-400 uppercase tracking-tighter">{games.find(g => g.id === bet.gameId)?.name || 'N/A'}</div>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">{bet.subGameType} Array</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {bet.numbers.map((n, i) => (
                                        <span key={i} className="text-[10px] text-white font-mono bg-white/5 px-2 py-0.5 rounded border border-white/5">{n}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                ))}
                {filteredBets.length === 0 && <div className="p-24 text-center glass rounded-2xl border border-white/5 opacity-40 flex flex-col items-center gap-4">
                    <Icons.bookOpen className="w-10 h-10 text-slate-600" />
                    <p className="text-slate-600 font-black text-[10px] uppercase tracking-widest leading-relaxed">System history log empty for selected params.</p>
                </div>}
            </div>

            {/* Desktop Table View */}
            <div className="hidden sm:block glass-morphism rounded-3xl overflow-hidden border border-white/5 shadow-2xl relative">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left min-w-[800px]">
                        <thead className="bg-slate-950/50 border-b border-white/5">
                            <tr>
                                <th className="p-5 text-[10px] text-slate-500 font-black uppercase tracking-widest">Entry Time</th>
                                <th className="p-5 text-[10px] text-slate-500 font-black uppercase tracking-widest">Player Target</th>
                                <th className="p-5 text-[10px] text-slate-500 font-black uppercase tracking-widest">Market Node</th>
                                <th className="p-5 text-[10px] text-slate-500 font-black uppercase tracking-widest">Stake Details</th>
                                <th className="p-5 text-[10px] text-slate-500 font-black uppercase tracking-widest text-right">Commit Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredBets.map((bet, idx) => (
                                <motion.tr 
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.02 }}
                                    key={bet.id} 
                                    className="hover:bg-white/[0.02] transition-colors group"
                                >
                                    <td className="p-5 text-[10px] text-slate-500 whitespace-nowrap font-mono group-hover:text-slate-300 transition-colors uppercase">{new Date(bet.timestamp).toLocaleString()}</td>
                                    <td className="p-5">
                                        <div className="text-xs font-black text-white tracking-tight">{users.find(u => u.id === bet.userId)?.name || 'Unknown'}</div>
                                        <div className="text-[10px] text-slate-500 font-mono uppercase">{bet.userId}</div>
                                    </td>
                                    <td className="p-5 text-xs font-black text-sky-400 uppercase tracking-tighter">{games.find(g => g.id === bet.gameId)?.name || 'DELETED_FEED'}</td>
                                    <td className="p-5">
                                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{bet.subGameType}</div>
                                        <div className="text-[10px] text-white/70 font-mono bg-white/[0.03] p-2 rounded-lg border border-white/5 max-w-[200px] truncate">{bet.numbers.join(', ')}</div>
                                    </td>
                                    <td className="p-5 text-right font-mono text-emerald-400 text-sm font-black group-hover:scale-105 transition-transform origin-right">Rs {bet.totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default DealerPanel;
