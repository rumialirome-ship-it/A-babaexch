import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Dealer, User, PrizeRates, LedgerEntry, Bet, Game, SubGameType } from '../types';
import { Icons, GAME_LOGOS } from '../constants';
import { useCountdown } from '../hooks/useCountdown';

const getTodayDateString = () => new Date().toISOString().split('T')[0];

const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: 'md' | 'lg' | 'xl'; themeColor?: string }> = ({ isOpen, onClose, title, children, size = 'md', themeColor = 'emerald' }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/90 backdrop-blur-md flex justify-center items-center z-[100] p-6"
                    onClick={(e) => e.target === e.currentTarget && onClose()}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        className={`elite-card rounded-3xl w-full flex flex-col max-h-[90vh] overflow-hidden ${size === 'xl' ? 'max-w-5xl' : size === 'lg' ? 'max-w-3xl' : 'max-w-md'} border-${themeColor}-500/20`}
                    >
                        <div className="flex justify-between items-center p-8 border-b border-white/5 bg-white/[0.02]">
                            <h3 className={`text-xs font-black uppercase tracking-[0.3em] text-${themeColor}-400`}>{title}</h3>
                            <button onClick={onClose} className="p-2 rounded-xl bg-white/5 text-slate-500 hover:text-white transition-all">{Icons.close}</button>
                        </div>
                        <div className="p-10 overflow-y-auto no-scrollbar">
                            {children}
                        </div>
                    </motion.div>
                </motion.div>
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
            initial={{ opacity: 0, y: -20, x: 20 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={`fixed top-6 right-6 z-[2000] p-5 rounded-2xl shadow-2xl border flex items-center gap-4 backdrop-blur-xl max-w-sm w-full ${
                type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}
        >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${type === 'success' ? 'bg-emerald-500/20' : 'bg-rose-500/20'}`}>
                {type === 'success' ? Icons.check : Icons.alertTriangle}
            </div>
            <div className="flex-1">
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-0.5">Dealer Operations</p>
                <p className="font-bold text-sm leading-tight text-white">{message}</p>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/5 opacity-40 hover:opacity-100 transition-all">{Icons.close}</button>
        </motion.div>
    );
};

const LedgerTable: React.FC<{ entries: LedgerEntry[] }> = ({ entries }) => (
    <div className="elite-card rounded-2xl overflow-hidden glass-panel">
        <div className="overflow-x-auto max-h-[30rem] no-scrollbar">
            <table className="w-full text-left">
                <thead className="sticky top-0 bg-[#0a0c10] z-20 shadow-xl border-b border-white/5">
                    <tr>
                        <th className="p-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Entry Timestamp</th>
                        <th className="p-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Descriptor</th>
                        <th className="p-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Debit</th>
                        <th className="p-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Credit</th>
                        <th className="p-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Balance</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {[...entries].reverse().map(entry => (
                        <tr key={entry.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="p-6 text-[10px] font-mono text-slate-500">{entry.timestamp?.toLocaleString()}</td>
                            <td className="p-6 text-white font-bold text-sm tracking-tight">{entry.description}</td>
                            <td className="p-6 text-right text-rose-500 font-mono font-black">{entry.debit > 0 ? `-${entry.debit.toFixed(0)}` : '---'}</td>
                            <td className="p-6 text-right text-emerald-500 font-mono font-black">{entry.credit > 0 ? `+${entry.credit.toFixed(0)}` : '---'}</td>
                            <td className="p-6 text-right font-black text-white font-mono italic">Rs {entry.balance.toLocaleString()}</td>
                        </tr>
                    ))}
                    {entries.length === 0 && (
                        <tr><td colSpan={5} className="p-10 text-center text-slate-500 text-[10px] font-bold uppercase tracking-widest">Zero Transaction History</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
);

const UserForm: React.FC<{ 
    user?: User; 
    users: User[]; 
    onSave: (user: User, originalId?: string, initialDeposit?: number) => Promise<void>; 
    onCancel: () => void; 
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
                id: user.id, name: user.name, contact: user.contact || '', area: user.area || '', password: '', 
                wallet: user.wallet.toString(), commissionRate: (user.commissionRate || 0).toString(),
                betLimits: { oneDigit: (user.betLimits?.oneDigit || 1000).toString(), twoDigit: (user.betLimits?.twoDigit || 5000).toString(), perDraw: (user.betLimits?.perDraw || 20000).toString() },
                prizeRates: { oneDigitOpen: (user.prizeRates?.oneDigitOpen || 9.50).toString(), oneDigitClose: (user.prizeRates?.oneDigitClose || 9.50).toString(), twoDigit: (user.prizeRates?.twoDigit || 85.00).toString() },
                avatarUrl: user.avatarUrl || ''
            };
        }
        return {
            id: '', name: '', area: '', contact: '', commissionRate: '0', 
            prizeRates: { oneDigitOpen: '9.50', oneDigitClose: '9.50', twoDigit: '85.00' }, 
            avatarUrl: '', wallet: '0', betLimits: { oneDigit: '1000', twoDigit: '5000', perDraw: '20000' }
        };
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        if (name.includes('.')) {
            const [p, c] = name.split('.');
            setFormData(prev => ({ ...prev, [p]: { ...(prev[p as keyof typeof prev] as object), [c]: value } }));
        } else setFormData(prev => ({ ...prev, [name]: value }));
    };
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user && !password) { showToast("Master key required.", "error"); return; }
        if (password && password !== confirmPassword) { showToast("Keys mismatch.", "error"); return; }
        if (!user && users.some(u => u.id.toLowerCase() === formData.id.toLowerCase())) { showToast("ID already deployed.", "error"); return; }

        setIsLoading(true);
        try {
            const payload: User = {
                id: formData.id, name: formData.name, contact: formData.contact, area: formData.area,
                password: password || user!.password, dealerId,
                wallet: Number(formData.wallet) || 0, commissionRate: Number(formData.commissionRate) || 0,
                isRestricted: user?.isRestricted || false, ledger: [], avatarUrl: formData.avatarUrl,
                betLimits: { oneDigit: Number(formData.betLimits.oneDigit), twoDigit: Number(formData.betLimits.twoDigit), perDraw: Number(formData.betLimits.perDraw) },
                prizeRates: { oneDigitOpen: Number(formData.prizeRates.oneDigitOpen), oneDigitClose: Number(formData.prizeRates.oneDigitClose), twoDigit: Number(formData.prizeRates.twoDigit) }
            };
            await onSave(payload, user?.id, user ? undefined : Number(formData.wallet));
            showToast("Terminal configuration synchronized.", "success");
            onCancel();
        } catch (err: any) { showToast(err.message, 'error'); } finally { setIsLoading(false); }
    };

    const inputClass = "w-full bg-black/40 border border-white/10 p-4 rounded-xl text-white text-sm focus:border-emerald-500/50 outline-none transition-all";
    const labelClass = "block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-widest ml-1";

    return (
        <form onSubmit={handleSubmit} className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div><label className={labelClass}>Terminal ID</label><input type="text" name="id" value={formData.id} onChange={handleChange} className={inputClass} required disabled={!!user} placeholder="A-00000" /></div>
                <div><label className={labelClass}>Identity Name</label><input type="text" name="name" value={formData.name} onChange={handleChange} className={inputClass} required placeholder="Full Name" /></div>
                <div><label className={labelClass}>Contact Link</label><input type="tel" name="contact" value={formData.contact} onChange={handleChange} className={inputClass} required placeholder="Phone" /></div>
                <div><label className={labelClass}>Sector / Area</label><input type="text" name="area" value={formData.area} onChange={handleChange} className={inputClass} required placeholder="City" /></div>
                <div className="relative"><label className={labelClass}>Security Key</label><input type={isPasswordVisible ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className={inputClass} required={!user} /><button type="button" onClick={() => setIsPasswordVisible(!isPasswordVisible)} className="absolute right-4 top-10 text-slate-500">{isPasswordVisible ? Icons.eyeOff : Icons.eye}</button></div>
                <div><label className={labelClass}>Verify Key</label><input type={isPasswordVisible ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputClass} required={!!password} /></div>
                <div><label className={labelClass}>Initial Liquidity</label><input type="text" name="wallet" value={formData.wallet} onChange={handleChange} className={inputClass} disabled={!!user} /></div>
                <div><label className={labelClass}>Commission Node (%)</label><input type="text" name="commissionRate" value={formData.commissionRate} onChange={handleChange} className={inputClass} /></div>
            </div>

            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 space-y-6">
                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-4">Payout Multipliers</p>
                <div className="grid grid-cols-3 gap-6">
                    <div><label className={labelClass}>2-Digit Rate</label><input type="text" name="prizeRates.twoDigit" value={formData.prizeRates.twoDigit} onChange={handleChange} className={inputClass} /></div>
                    <div><label className={labelClass}>Open Rate</label><input type="text" name="prizeRates.oneDigitOpen" value={formData.prizeRates.oneDigitOpen} onChange={handleChange} className={inputClass} /></div>
                    <div><label className={labelClass}>Close Rate</label><input type="text" name="prizeRates.oneDigitClose" value={formData.prizeRates.oneDigitClose} onChange={handleChange} className={inputClass} /></div>
                </div>
            </div>

            <div className="flex gap-4">
                <button type="button" onClick={onCancel} className="flex-1 py-4 bg-white/5 text-white font-bold rounded-xl uppercase tracking-widest text-[10px] hover:bg-white/10 active:scale-95 transition-all">Abort</button>
                <button type="submit" disabled={isLoading} className="flex-[2] py-4 bg-emerald-600 text-white font-black rounded-xl tracking-[0.3em] uppercase text-[11px] hover:bg-emerald-500 shadow-xl shadow-emerald-500/10 flex items-center justify-center gap-3 active:scale-95 transition-all">
                    {isLoading ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : (user ? "Update Terminal" : "Deploy Terminal")}
                </button>
            </div>
        </form>
    );
};

const MoreOptionsDropdown: React.FC<{ user: User, onEdit: () => void, onLedger: () => void, onToggleStatus: () => void, onDelete: () => void }> = ({ user, onEdit, onLedger, onToggleStatus, onDelete }) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => { const out = (e: any) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false); }; document.addEventListener('mousedown', out); return () => document.removeEventListener('mousedown', out); }, []);

    return (
        <div className="relative" ref={ref}>
            <button onClick={() => setIsOpen(!isOpen)} className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-slate-500 hover:text-white hover:border-white/10 transition-all active:scale-90">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" /></svg>
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div initial={{ opacity: 0, scale: 0.95, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -10 }} className="absolute right-0 mt-3 w-48 elite-card glass-panel rounded-2xl border border-white/10 z-50 overflow-hidden shadow-2xl">
                        <div className="flex flex-col text-[10px] font-black uppercase tracking-widest">
                            <button onClick={() => { onEdit(); setIsOpen(false); }} className="w-full text-left p-4 hover:bg-sky-500/10 text-sky-400 border-b border-white/5 transition-all">Config Terminal</button>
                            <button onClick={() => { onLedger(); setIsOpen(false); }} className="w-full text-left p-4 hover:bg-emerald-500/10 text-emerald-400 border-b border-white/5 transition-all">Audit Ledger</button>
                            <button onClick={() => { onToggleStatus(); setIsOpen(false); }} className="w-full text-left p-4 hover:bg-amber-500/10 text-amber-500 border-b border-white/5 transition-all">
                                {user.isRestricted ? 'Authorize Access' : 'Restrict Access'}
                            </button>
                            <button onClick={() => { if(window.confirm(`Wipe ${user.name}? This is irreversible.`)) onDelete(); setIsOpen(false); }} className="w-full text-left p-4 hover:bg-rose-500/10 text-rose-500 transition-all">Purge Node</button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const DealerPanel: React.FC<DealerPanelProps> = ({ dealer, users, onSaveUser, onDeleteUser, topUpUserWallet, withdrawFromUserWallet, toggleAccountRestriction, bets, games, placeBetAsDealer, isLoaded = false }) => {
    const [activeTab, setActiveTab] = useState('users');
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | undefined>(undefined);
    const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
    const [isWithdrawalModalOpen, setIsWithdrawalModalOpen] = useState(false);
    const [viewingUserLedgerFor, setViewingUserLedgerFor] = useState<User | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const filteredUsers = useMemo(() => {
        return (users || []).filter(u => {
            const q = searchQuery.toLowerCase();
            return u.name.toLowerCase().includes(q) || u.id.toLowerCase().includes(q) || u.area?.toLowerCase().includes(q);
        });
    }, [users, searchQuery]);

    const showT = (msg: string, type: 'success' | 'error') => setToast({ msg, type });

    return (
        <div className="max-w-7xl mx-auto px-6 py-12 md:py-20 relative z-10">
            <AnimatePresence>{toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>

            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row justify-between items-end mb-20 gap-8">
                <div className="border-l-4 border-emerald-500 pl-8">
                    <h2 className="text-5xl md:text-7xl font-black text-white tracking-widest uppercase mb-4">Command Center</h2>
                    <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[10px]">Dealer Authority: <span className="text-emerald-500">{dealer.name}</span></p>
                </div>
                <div className="bg-black/40 p-2 rounded-2xl border border-white/5 flex gap-2 overflow-x-auto no-scrollbar">
                    {['users', 'terminal', 'wallet', 'history'].map(t => (
                        <button key={t} onClick={() => setActiveTab(t)} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === t ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-500/10' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}>
                            {t}
                        </button>
                    ))}
                </div>
            </motion.div>

            {activeTab === 'users' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="relative flex-1 w-full">
                            <input type="text" placeholder="FILTER NETWORK NODES..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white font-bold text-[11px] uppercase tracking-[0.2em] focus:border-emerald-500/50 outline-none transition-all" />
                        </div>
                        <button onClick={() => { setSelectedUser(undefined); setIsUserModalOpen(true); }} className="w-full md:w-auto px-10 py-4 bg-emerald-600 shadow-xl shadow-emerald-500/10 text-white font-black rounded-2xl tracking-[0.3em] uppercase text-[11px] hover:bg-emerald-500 active:scale-95 transition-all">New Deployment</button>
                    </div>

                    <div className="elite-card rounded-3xl overflow-hidden glass-panel">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-white/[0.02] border-b border-white/5">
                                    <tr>
                                        <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Identity Hub</th>
                                        <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Sector</th>
                                        <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-right">Liquidity</th>
                                        <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-center">Node Rate</th>
                                        <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-center">Status</th>
                                        <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-right">Ops</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {!isLoaded ? (
                                        <tr><td colSpan={6} className="p-20 text-center text-slate-600 font-black text-[10px] uppercase tracking-[0.4em] animate-pulse">Scanning Secure Network...</td></tr>
                                    ) : filteredUsers.length === 0 ? (
                                        <tr><td colSpan={6} className="p-20 text-center text-slate-600 font-black text-[10px] uppercase tracking-[0.4em]">Zero Active Nodes Detected</td></tr>
                                    ) : filteredUsers.map(u => (
                                        <tr key={u.id} className="group hover:bg-emerald-500/[0.02] transition-all">
                                            <td className="p-8">
                                                <div className="text-white font-bold text-base tracking-tight">{u.name}</div>
                                                <div className="text-[10px] text-slate-500 font-mono tracking-widest mt-1 uppercase">{u.id}</div>
                                            </td>
                                            <td className="p-8">
                                                <div className="text-slate-300 font-bold text-sm tracking-tight">{u.area || '-'}</div>
                                                <div className="text-[10px] text-slate-500 font-mono tracking-widest uppercase mt-1">{u.contact || '-'}</div>
                                            </td>
                                            <td className="p-8 text-right font-mono">
                                                <div className="text-emerald-400 font-black text-lg">Rs {u.wallet.toLocaleString()}</div>
                                                <div className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">Available Funds</div>
                                            </td>
                                            <td className="p-8 text-center"><span className="text-white font-black text-xs font-mono">{u.commissionRate}%</span></td>
                                            <td className="p-8 text-center">
                                                <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${u.isRestricted ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'}`}>
                                                    {u.isRestricted ? 'Restricted' : 'Operational'}
                                                </span>
                                            </td>
                                            <td className="p-8 text-right"><MoreOptionsDropdown user={u} onEdit={() => { setSelectedUser(u); setIsUserModalOpen(true); }} onLedger={() => setViewingUserLedgerFor(u)} onToggleStatus={() => { toggleAccountRestriction(u.id, 'user'); showT("Node status updated.", "success"); }} onDelete={async () => { await onDeleteUser(u.id); showT("Node purged from database.", "success"); }} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div className="flex justify-center gap-6 pt-10">
                        <button onClick={() => setIsTopUpModalOpen(true)} className="px-10 py-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black rounded-2xl tracking-[0.3em] uppercase text-[11px] hover:bg-emerald-500/20 active:scale-95 transition-all">Deposit Asset</button>
                        <button onClick={() => setIsWithdrawalModalOpen(true)} className="px-10 py-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 font-black rounded-2xl tracking-[0.3em] uppercase text-[11px] hover:bg-amber-500/20 active:scale-95 transition-all">Withdraw Asset</button>
                    </div>
                </motion.div>
            )}

            {activeTab === 'terminal' && (
                <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
                    <BettingTerminalView users={users || []} games={games} placeBetAsDealer={placeBetAsDealer} />
                </motion.div>
            )}
            {activeTab === 'wallet' && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-12"><div className="grid grid-cols-1 md:grid-cols-2 gap-8"><div className="elite-card p-10 rounded-3xl glass-panel text-center"><p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2">My Total Yield</p><p className="text-5xl font-black text-emerald-400 font-mono tracking-tighter">Rs {dealer.wallet.toLocaleString()}</p></div><div className="elite-card p-10 rounded-3xl glass-panel text-center"><p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2">Audit Trails</p><p className="text-5xl font-black text-white font-mono tracking-tighter">{dealer.ledger?.length || 0}</p></div></div><LedgerTable entries={dealer.ledger || []} /></motion.div>}
            {activeTab === 'history' && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}><BetHistoryView bets={bets} games={games} users={users || []} /></motion.div>}

            <Modal isOpen={isUserModalOpen} onClose={() => setIsUserModalOpen(false)} title={selectedUser ? "Node Configuration" : "Deploy Network Node"} themeColor="emerald">
                <UserForm user={selectedUser} users={users || []} onSave={onSaveUser} onCancel={() => setIsUserModalOpen(false)} dealerId={dealer.id} showToast={showT} />
            </Modal>
            <Modal isOpen={isTopUpModalOpen} onClose={() => setIsTopUpModalOpen(false)} title="Asset Deposit" themeColor="emerald">
                <UserTransactionForm type="Top-Up" users={filteredUsers} onTransaction={async (u, a) => { await topUpUserWallet(u, a); showT("Liquidity injection successful.", "success"); setIsTopUpModalOpen(false); }} onCancel={() => setIsTopUpModalOpen(false)} />
            </Modal>
            <Modal isOpen={isWithdrawalModalOpen} onClose={() => setIsWithdrawalModalOpen(false)} title="Asset Withdrawal" themeColor="amber">
                <UserTransactionForm type="Withdrawal" users={filteredUsers} onTransaction={async (u, a) => { await withdrawFromUserWallet(u, a); showT("Asset withdrawal cleared.", "success"); setIsWithdrawalModalOpen(false); }} onCancel={() => setIsWithdrawalModalOpen(false)} />
            </Modal>
            {viewingUserLedgerFor && (
                <Modal isOpen={!!viewingUserLedgerFor} onClose={() => setViewingUserLedgerFor(null)} title={`Ledger Trace: ${viewingUserLedgerFor.id}`} size="xl" themeColor="sky">
                    <LedgerTable entries={viewingUserLedgerFor.ledger} />
                </Modal>
            )}
        </div>
    );
};

const BettingTerminalView: React.FC<{ users: User[], games: Game[], placeBetAsDealer: (details: any) => Promise<void> }> = ({ users, games, placeBetAsDealer }) => {
    const [uId, setUId] = useState('');
    const [gId, setGId] = useState('');
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);

    const handle = async () => {
        if (!uId || !gId || !input) return; setLoading(true);
        try {
            const groups: any[] = [];
            input.split('\n').filter(l => l.trim()).forEach(l => {
                const sMatch = l.match(/(?:rs|r)?\s*(\d+\.?\d*)$/i);
                const stake = sMatch ? parseFloat(sMatch[1]) : 0; if (stake <= 0) return;
                const nums = l.substring(0, sMatch!.index).trim().split(/[-.,\s]+/).filter(n => n.length > 0);
                if (nums.length > 0) groups.push({ subGameType: SubGameType.TwoDigit, numbers: nums, amountPerNumber: stake });
            });
            if (groups.length === 0) throw new Error("Invalid Syntax");
            await placeBetAsDealer({ userId: uId, gameId: gId, betGroups: groups });
            setInput(''); alert("Batch deployment complete.");
        } catch (e: any) { alert(e.message); } finally { setLoading(false); }
    };

    return (
        <div className="elite-card glass-panel rounded-3xl p-10 border border-white/10 space-y-8">
            <div className="flex items-center gap-4">
                <div className="h-6 w-1 bg-emerald-500 rounded-full" />
                <h3 className="text-xl font-bold text-white uppercase tracking-tighter">Encrypted Entry Terminal</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <select value={uId} onChange={e => setUId(e.target.value)} className="bg-black/40 border border-white/10 p-4 rounded-xl text-white font-bold text-[10px] uppercase tracking-widest outline-none focus:border-emerald-500/50">
                    <option value="">SELECT TARGET NODE</option>
                    {(users || []).filter(u => !u.isRestricted).map(u => <option key={u.id} value={u.id}>{u.name} ({u.id})</option>)}
                </select>
                <select value={gId} onChange={e => setGId(e.target.value)} className="bg-black/40 border border-white/10 p-4 rounded-xl text-white font-bold text-[10px] uppercase tracking-widest outline-none focus:border-emerald-500/50">
                    <option value="">SELECT MARKET GATE</option>
                    {games.filter(g => g.isMarketOpen).map(g => <option key={g.id} value={g.id}>{g.name} (DRAW @ {g.drawTime})</option>)}
                </select>
            </div>
            <textarea rows={10} value={input} onChange={e => setInput(e.target.value)} placeholder={"BATCH ENTRY PROTOCOL:\n14, 25 100\n88, 91 500"} className="w-full bg-black/40 border border-white/10 rounded-2xl p-8 text-white font-mono text-base focus:border-emerald-500/50 outline-none resize-none" />
            <div className="flex justify-end"><button onClick={handle} disabled={!uId || !gId || !input || loading} className="w-full md:w-auto px-12 py-5 bg-emerald-600 shadow-2xl shadow-emerald-500/20 text-white font-black rounded-2xl tracking-[0.3em] uppercase text-[11px] hover:bg-emerald-500 active:scale-95 transition-all disabled:opacity-50">{loading ? 'PROCESSING...' : 'INITIALIZE BATCH'}</button></div>
        </div>
    );
};

const UserTransactionForm: React.FC<{ users: User[], onTransaction: (u: string, a: number) => Promise<void>, onCancel: () => void, type: 'Top-Up' | 'Withdrawal' }> = ({ users, onTransaction, onCancel, type }) => {
    const [uId, setUId] = useState('');
    const [amt, setAmt] = useState<number | ''>('');
    const theme = type === 'Top-Up' ? 'emerald' : 'amber';
    const cls = `w-full bg-black/40 border border-white/10 p-5 rounded-2xl text-white font-bold outline-none focus:border-${theme}-500/50 mb-6`;
    return (
        <form onSubmit={async (e) => { e.preventDefault(); if (uId && amt) await onTransaction(uId, Number(amt)); }} className="space-y-2">
            <select value={uId} onChange={e => setUId(e.target.value)} className={cls} required>
                <option value="">SELECT TARGET ACCOUNT</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name} (PKR {u.wallet.toLocaleString()})</option>)}
            </select>
            <input type="number" value={amt} onChange={e => setAmt(e.target.value === '' ? '' : parseFloat(e.target.value))} placeholder="TRANSACTION AMOUNT (RS)" className={cls} required step="1" />
            <div className="flex gap-4">
                <button type="button" onClick={onCancel} className="flex-1 py-4 bg-white/5 text-white font-bold rounded-xl text-[10px] uppercase tracking-widest hover:bg-white/10">Abort</button>
                <button type="submit" className={`flex-1 py-4 bg-${theme}-600 text-white font-black rounded-xl text-[10px] uppercase tracking-[0.2em] hover:bg-${theme}-500 transition-all shadow-xl shadow-${theme}-500/10`}>{type}</button>
            </div>
        </form>
    );
};

const BetHistoryView: React.FC<{ bets: Bet[], games: Game[], users: User[] }> = ({ bets, games, users }) => {
    const [start, setStart] = useState(getTodayDateString());
    const [end, setEnd] = useState(getTodayDateString());
    const [search, setSearch] = useState('');
    const filtered = (bets || []).filter(b => {
        const d = b.timestamp.toISOString().split('T')[0];
        if (start && d < start) return false; if (end && d > end) return false;
        if (search) {
            const u = users.find(x => x.id === b.userId); const g = games.find(x => x.id === b.gameId);
            const q = search.toLowerCase(); return u?.name.toLowerCase().includes(q) || g?.name.toLowerCase().includes(q) || u?.id.includes(q);
        }
        return true;
    }).sort((a,b) => b.timestamp.getTime() - a.timestamp.getTime());

    return (
        <div className="space-y-10">
            <div className="flex items-center gap-4">
                <div className="h-8 w-1 bg-sky-500 rounded-full" />
                <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Unified Activity Audit</h3>
                <span className="text-[10px] font-bold text-sky-500 bg-sky-500/10 border border-sky-500/20 px-3 py-1 rounded-full uppercase tracking-widest ml-auto">System History</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-black/40 p-3 rounded-2xl border border-white/5">
                <input type="date" value={start} onChange={e => setStart(e.target.value)} className="bg-transparent text-white p-3 rounded-xl border border-transparent focus:border-white/10 outline-none font-mono text-sm" />
                <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="bg-transparent text-white p-3 rounded-xl border border-transparent focus:border-white/10 outline-none font-mono text-sm" />
                <input type="text" placeholder="FILTER BY ID / GAME..." value={search} onChange={e => setSearch(e.target.value)} className="bg-transparent text-white p-3 rounded-xl border border-transparent focus:border-white/10 outline-none font-black text-[10px] uppercase tracking-widest" />
            </div>
            <div className="elite-card rounded-3xl overflow-hidden glass-panel">
                <div className="overflow-x-auto max-h-[40rem] no-scrollbar">
                    <table className="w-full text-left">
                        <thead className="sticky top-0 bg-[#0a0c10] z-20 border-b border-white/5 shadow-xl">
                            <tr>
                                <th className="p-8 text-[10px] text-slate-500 font-bold uppercase tracking-widest">Mark</th>
                                <th className="p-8 text-[10px] text-slate-500 font-bold uppercase tracking-widest">Account Node</th>
                                <th className="p-8 text-[10px] text-slate-500 font-bold uppercase tracking-widest">Manifest</th>
                                <th className="p-8 text-[10px] text-slate-500 font-bold uppercase tracking-widest text-right">Stake Pack</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filtered.map(b => (
                                <tr key={b.id} className="hover:bg-white/[0.02]">
                                    <td className="p-8 text-[10px] font-mono text-slate-600">{b.timestamp.toLocaleString()}</td>
                                    <td className="p-8">
                                        <div className="text-white font-bold text-sm tracking-tight">{users.find(u => u.id === b.userId)?.name || 'ERR'}</div>
                                        <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">{b.userId}</div>
                                    </td>
                                    <td className="p-8">
                                        <div className="text-sky-400 font-black text-xs uppercase tracking-tighter mb-1">{games.find(g => g.id === b.gameId)?.name || 'N/A'}</div>
                                        <div className="text-[10px] text-slate-500 font-mono italic">{b.subGameType} / {b.numbers.join(', ')}</div>
                                    </td>
                                    <td className="p-8 text-right font-mono font-black text-white text-base">Rs {b.totalAmount.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default DealerPanel;

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
