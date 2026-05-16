
import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Dealer, User, Game, PrizeRates, LedgerEntry, Bet, NumberLimit, SubGameType, Admin } from '../types';
import { Icons } from '../constants';
import { useAuth } from '../hooks/useAuth';
import { UserForm } from './DealerPanel'; // Import UserForm to reuse it

// --- TYPE DEFINITIONS ---
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

// --- HELPER COMPONENTS (DEFINED OUTSIDE TO PREVENT REMOUNTING) ---

const StatefulLedgerTableWrapper: React.FC<{ entries: LedgerEntry[] }> = ({ entries }) => {
    const [startDate, setStartDate] = useState(getTodayDateString());
    const [endDate, setEndDate] = useState(getTodayDateString());

    const filteredEntries = useMemo(() => {
        if (!startDate && !endDate) return entries;
        return entries.filter(entry => {
            if (!(entry.timestamp instanceof Date)) return false;
            const entryDateStr = entry.timestamp.toISOString().split('T')[0];
            if (startDate && entryDateStr < startDate) return false;
            if (endDate && entryDateStr > endDate) return false;
            return true;
        });
    }, [entries, startDate, endDate]);

    const inputClass = "bg-slate-950/50 text-white p-3 rounded-2xl text-[10px] border border-white/5 font-black uppercase tracking-widest w-full focus:ring-2 focus:ring-cyan-500/50 appearance-none transition-all";

    return (
        <div className="space-y-6">
            <div className="glass-morphism p-6 rounded-3xl border border-white/5 flex flex-col lg:flex-row gap-4 items-center shadow-2xl">
                <div className="w-full lg:w-48 relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 z-10 pointer-events-none text-[8px] font-black uppercase">From</div>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputClass + " pl-12"} />
                </div>
                <div className="w-full lg:w-48 relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 z-10 pointer-events-none text-[8px] font-black uppercase">To</div>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputClass + " pl-8"} />
                </div>
                <div className="flex-grow" />
                <button onClick={() => { setStartDate(''); setEndDate(''); }} className="w-full lg:w-auto px-6 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-black text-[10px] uppercase tracking-widest transition-all border border-white/10">Archive Filter</button>
            </div>
            <LedgerTable entries={filteredEntries} />
        </div>
    );
};

const SortableHeader: React.FC<{
    label: string;
    sortKey: SortKey;
    currentSortKey: SortKey;
    sortDirection: SortDirection;
    onSort: (key: SortKey) => void;
    className?: string;
}> = ({ label, sortKey, currentSortKey, sortDirection, onSort, className }) => {
    const isActive = sortKey === currentSortKey;
    return (
        <th className={`p-6 text-[10px] font-black uppercase tracking-widest text-slate-500 cursor-pointer hover:text-white transition-colors group ${className}`} onClick={() => onSort(sortKey)}>
            <div className="flex items-center gap-2">
                <span>{label}</span>
                <span className={`transition-all duration-300 ${isActive ? 'text-cyan-400 opacity-100' : 'opacity-0 group-hover:opacity-30'}`}>
                    {sortDirection === 'asc' ? <Icons.trendingUp className="w-3 h-3" /> : <Icons.trendingDown className="w-3 h-3" />}
                </span>
            </div>
        </th>
    );
};

const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: 'md' | 'lg' | 'xl'; themeColor?: string }> = ({ isOpen, onClose, title, children, size = 'md', themeColor = 'cyan' }) => {
    const sizeClasses: Record<string, string> = { md: 'max-w-md', lg: 'max-w-3xl', xl: 'max-w-6xl' };
    
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 flex items-center justify-center z-[100] p-4 lg:p-12">
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl"
                    />
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: "spring", damping: 30, stiffness: 300 }}
                        className={`bg-slate-950/50 rounded-[2.5rem] shadow-2xl w-full border border-white/10 ${sizeClasses[size]} flex flex-col relative overflow-hidden glass-morphism`}
                    >
                        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 blur-3xl rounded-full -mr-32 -mt-32" />
                        
                        <div className="flex justify-between items-center p-8 border-b border-white/5 relative z-10">
                            <div>
                                <h3 className={`text-xl font-black text-${themeColor}-400 uppercase tracking-tighter`}>{title}</h3>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Authorized Admin Command</p>
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl transition-all text-slate-500 hover:text-white">
                                <Icons.close className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-8 overflow-y-auto custom-scrollbar relative z-10 max-h-[75vh]">
                            {children}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

const LedgerTable: React.FC<{ entries: LedgerEntry[] }> = ({ entries }) => (
    <div className="glass-morphism rounded-3xl overflow-hidden border border-white/5 shadow-2xl relative">
        <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left min-w-[700px]">
                <thead className="bg-slate-950/50 border-b border-white/5">
                    <tr>
                        <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Timestamp</th>
                        <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Operation Desc</th>
                        <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Debit Out</th>
                        <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Credit In</th>
                        <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Net Reserve</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {Array.isArray(entries) && [...entries].reverse().map((entry, idx) => (
                        <motion.tr 
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.015 }}
                            key={entry.id} 
                            className="hover:bg-white/[0.02] transition-colors group"
                        >
                            <td className="p-5 text-[10px] text-slate-500 font-mono group-hover:text-slate-300 uppercase">{entry.timestamp.toLocaleString()}</td>
                            <td className="p-5">
                                <div className="text-xs font-bold text-white tracking-tight">{entry.description}</div>
                                <div className="text-[8px] text-slate-600 font-mono truncate max-w-[150px] uppercase">{entry.id}</div>
                            </td>
                            <td className="p-5 text-right text-red-500/80 font-mono text-xs font-bold">{entry.debit > 0 ? `-${entry.debit.toFixed(2)}` : '-'}</td>
                            <td className="p-5 text-right text-emerald-500/80 font-mono text-xs font-bold">{entry.credit > 0 ? `+${entry.credit.toFixed(2)}` : '-'}</td>
                            <td className="p-5 text-right font-black text-white font-mono text-sm tracking-tighter">Rs {entry.balance.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        </motion.tr>
                    ))}
                     {(!Array.isArray(entries) || entries.length === 0) && (
                        <tr>
                            <td colSpan={5} className="p-24 text-center">
                                <div className="flex flex-col items-center gap-4 opacity-30">
                                    <Icons.bookOpen className="w-12 h-12 text-slate-500" />
                                    <p className="text-slate-500 font-black text-[10px] uppercase tracking-[0.2em]">Zero activity discovered in sector.</p>
                                </div>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
);

// --- WINNERS VIEW COMPONENT ---
interface WinnerRecord {
    betId: string;
    timestamp: Date;
    userName: string;
    dealerName: string;
    gameName: string;
    winningNumber: string;
    subGameType: string;
    selectedNumbers: string[];
    winningNumbersInBet: string[];
    stake: number;
    payout: number;
    payoutApproved: boolean;
}

const WinnersView: React.FC<{ bets: Bet[], games: Game[], users: User[], dealers: Dealer[] }> = ({ bets, games, users, dealers }) => {
    const [startDate, setStartDate] = useState(getTodayDateString());
    const [endDate, setEndDate] = useState(getTodayDateString());
    const [searchTerm, setSearchTerm] = useState('');

    const winnerData = useMemo(() => {
        const records: WinnerRecord[] = [];

        // Only look at games that have a winner declared
        const finalizedGames = games.filter(g => g.winningNumber && !g.winningNumber.includes('_'));

        finalizedGames.forEach(game => {
            const gameBets = bets.filter(b => b.gameId === game.id);
            const winningNumber = game.winningNumber!;

            gameBets.forEach(bet => {
                const user = users.find(u => u.id === bet.userId);
                const dealer = dealers.find(d => d.id === bet.dealerId);
                if (!user) return;

                const winningNumbersInBet = bet.numbers.filter(num => {
                    switch (bet.subGameType) {
                        case SubGameType.OneDigitOpen:
                            return winningNumber.length === 2 && num === winningNumber[0];
                        case SubGameType.OneDigitClose:
                            if (game.name === 'AKC') return num === winningNumber;
                            return winningNumber.length === 2 && num === winningNumber[1];
                        default: // 2 Digit, Bulk, Combo
                            return num === winningNumber;
                    }
                });

                if (winningNumbersInBet.length > 0) {
                    const getPrizeMultiplier = (rates: PrizeRates, type: SubGameType) => {
                        if (type === SubGameType.OneDigitOpen) return rates.oneDigitOpen;
                        if (type === SubGameType.OneDigitClose) return rates.oneDigitClose;
                        return rates.twoDigit;
                    };

                    const multiplier = getPrizeMultiplier(user.prizeRates, bet.subGameType);
                    const payout = winningNumbersInBet.length * bet.amountPerNumber * multiplier;

                    records.push({
                        betId: bet.id,
                        timestamp: bet.timestamp,
                        userName: user.name,
                        dealerName: dealer?.name || 'Unknown',
                        gameName: game.name,
                        winningNumber: winningNumber,
                        subGameType: bet.subGameType,
                        selectedNumbers: bet.numbers,
                        winningNumbersInBet,
                        stake: bet.totalAmount,
                        payout,
                        payoutApproved: !!game.payoutsApproved
                    });
                }
            });
        });

        return records.filter(r => {
            if (!(r.timestamp instanceof Date)) return false;
            const dateStr = r.timestamp.toISOString().split('T')[0];
            const matchesDate = (!startDate || dateStr >= startDate) && (!endDate || dateStr <= endDate);
            const matchesSearch = !searchTerm.trim() || 
                r.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                r.gameName.toLowerCase().includes(searchTerm.toLowerCase());
            return matchesDate && matchesSearch;
        }).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }, [bets, games, users, dealers, startDate, endDate, searchTerm]);

    const inputClass = "bg-slate-950/50 text-white p-3 rounded-2xl text-[10px] border border-white/5 font-black uppercase tracking-widest w-full focus:ring-2 focus:ring-emerald-500/50 appearance-none transition-all";

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Winner Resolution Matrix</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Real-time Payout tracking Interface</p>
                </div>
                <div className="px-4 py-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    LIVE FEED ENABLED
                </div>
            </div>

            <div className="glass-morphism p-6 rounded-3xl border border-white/5 flex flex-col lg:flex-row gap-4 items-center shadow-2xl">
                <div className="w-full lg:w-48 relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 z-10 pointer-events-none text-[8px] font-black uppercase">From</div>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputClass + " pl-12"} />
                </div>
                <div className="w-full lg:w-48 relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 z-10 pointer-events-none text-[8px] font-black uppercase">To</div>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputClass + " pl-8"} />
                </div>
                <div className="w-full flex-grow relative group">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500 group-focus-within:text-emerald-500 transition-colors uppercase tracking-widest text-[8px]"><Icons.search className="w-3 h-3" /></span>
                    <input type="text" placeholder="Filter by user or game node..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className={inputClass + " pl-12 py-3.5"} />
                </div>
                <button onClick={() => { setStartDate(getTodayDateString()); setEndDate(getTodayDateString()); setSearchTerm(''); }} className="w-full lg:w-auto px-6 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-black text-[10px] uppercase tracking-widest transition-all border border-white/10">Purge Filter</button>
            </div>

            <div className="glass-morphism rounded-3xl overflow-hidden border border-white/5 shadow-2xl relative">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left min-w-[1200px]">
                        <thead className="bg-slate-950/50 border-b border-white/5">
                            <tr>
                                <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Event Time</th>
                                <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Player Node</th>
                                <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Dealer Origin</th>
                                <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Market</th>
                                <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Result</th>
                                <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Stake</th>
                                <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right text-emerald-500">Total Payout</th>
                                <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Protocol Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {winnerData.length === 0 ? (
                                <tr><td colSpan={8} className="p-24 text-center">
                                    <div className="flex flex-col items-center gap-4 opacity-30">
                                        <Icons.search className="w-12 h-12 text-slate-600" />
                                        <p className="text-slate-600 font-black text-[10px] uppercase tracking-[0.2em]">Zero winners detected in current sector.</p>
                                    </div>
                                </td></tr>
                            ) : winnerData.map((record, i) => (
                                <motion.tr 
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.02 }}
                                    key={i} 
                                    className="hover:bg-white/[0.02] transition-colors group"
                                >
                                    <td className="p-5 text-[10px] text-slate-500 font-mono group-hover:text-slate-300 uppercase">{record.timestamp.toLocaleString()}</td>
                                    <td className="p-5">
                                        <div className="text-sm font-black text-white tracking-tight">{record.userName}</div>
                                        <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{record.subGameType}</div>
                                    </td>
                                    <td className="p-5">
                                        <div className="text-xs font-bold text-slate-400">{record.dealerName}</div>
                                    </td>
                                    <td className="p-5 text-xs font-black text-white uppercase tracking-tighter">{record.gameName}</td>
                                    <td className="p-5 text-center">
                                        <div className="font-mono text-emerald-400 text-lg font-black bg-emerald-500/5 py-1 px-3 rounded-lg inline-block">{record.winningNumber}</div>
                                        <div className="text-[9px] text-white/40 font-mono mt-1 opacity-50">{record.winningNumbersInBet.join(', ')}</div>
                                    </td>
                                    <td className="p-5 text-right font-mono text-slate-500 text-xs font-black">{record.stake.toFixed(0)}</td>
                                    <td className="p-5 text-right font-mono text-emerald-400 font-black text-lg group-hover:scale-105 transition-transform origin-right">Rs {record.payout.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td className="p-5 text-center">
                                        <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.1em] ${record.payoutApproved ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'}`}>
                                            <div className={`w-1 h-1 rounded-full ${record.payoutApproved ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                                            {record.payoutApproved ? 'Liquidated' : 'Pending Verification'}
                                        </span>
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const DealerForm: React.FC<{ dealer?: Dealer; dealers: Dealer[]; onSave: (dealer: Dealer, originalId?: string) => Promise<void>; onCancel: () => void; adminPrizeRates: PrizeRates }> = ({ dealer, dealers, onSave, onCancel, adminPrizeRates }) => {
    // Keep internal state as strings to allow flexible typing (decimals, clearing)
    const [formData, setFormData] = useState(() => {
        if (dealer) {
            return {
                id: dealer.id,
                name: dealer.name,
                password: '',
                area: dealer.area || '',
                contact: dealer.contact || '',
                commissionRate: (dealer.commissionRate ?? 0).toString(),
                prizeRates: {
                    oneDigitOpen: (dealer.prizeRates?.oneDigitOpen ?? 0).toString(),
                    oneDigitClose: (dealer.prizeRates?.oneDigitClose ?? 0).toString(),
                    twoDigit: (dealer.prizeRates?.twoDigit ?? 0).toString(),
                },
                avatarUrl: dealer.avatarUrl || '',
                wallet: dealer.wallet.toString()
            };
        }
        return {
            id: '',
            name: '',
            password: '',
            area: '',
            contact: '',
            commissionRate: '0',
            prizeRates: {
                oneDigitOpen: adminPrizeRates.oneDigitOpen.toString(),
                oneDigitClose: adminPrizeRates.oneDigitClose.toString(),
                twoDigit: adminPrizeRates.twoDigit.toString(),
            },
            avatarUrl: '',
            wallet: '0'
        };
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
            setFormData(prev => ({ 
                ...prev, 
                [parent]: { 
                    ...(prev[parent as keyof typeof prev] as object), 
                    [child]: value 
                } 
            }));
        } else {
            setFormData(prev => ({ 
                ...prev, 
                [name]: type === 'checkbox' ? (checked as any) : value 
            }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const newPassword = dealer ? password : formData.password;
        if (newPassword && newPassword !== confirmPassword) { alert("New passwords do not match."); return; }
        if (!dealer && !newPassword) { alert("Password is required for new dealers."); return; }
        
        const formId = (formData.id as string).toLowerCase();
        if (!dealer && dealers.some(d => d.id.toLowerCase() === formId)) {
            alert("This Dealer Login ID is already taken. Please choose another one.");
            return;
        }

        setIsLoading(true);
        try {
            const finalData: Dealer = {
                id: formData.id,
                name: formData.name,
                password: newPassword ? newPassword : (dealer?.password || ''),
                area: formData.area,
                contact: formData.contact,
                wallet: Number(formData.wallet) || 0,
                commissionRate: Number(formData.commissionRate) || 0,
                isRestricted: dealer?.isRestricted ?? false,
                prizeRates: {
                    oneDigitOpen: Number(formData.prizeRates.oneDigitOpen) || 0,
                    oneDigitClose: Number(formData.prizeRates.oneDigitClose) || 0,
                    twoDigit: Number(formData.prizeRates.twoDigit) || 0,
                },
                ledger: [], 
                avatarUrl: formData.avatarUrl,
            };

            await onSave(finalData, dealer?.id);
        } finally {
            setIsLoading(false);
        }
    };

    const inputClass = "w-full bg-slate-950/50 p-3.5 rounded-2xl border border-white/5 focus:ring-2 focus:ring-cyan-500/50 text-white text-xs font-bold transition-all placeholder:text-slate-700 shadow-inner";
    const labelClass = "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1 block";

    return (
        <form onSubmit={handleSubmit} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                   <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                            <Icons.user className="w-5 h-5" />
                        </div>
                        <h4 className="text-xs font-black text-white uppercase tracking-widest">Network Identity</h4>
                    </div>

                    <div>
                        <label className={labelClass}>Login Identity (Unique ID)</label>
                        <input type="text" name="id" value={formData.id} onChange={handleChange} placeholder="e.g. DEALER_01" className={inputClass} required disabled={!!dealer} />
                    </div>
                    <div>
                        <label className={labelClass}>Operational Name</label>
                        <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="Legal or Alias Name" className={inputClass} required />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="relative">
                            <label className={labelClass}>{dealer ? 'Force Reset Password' : 'Access Key'}</label>
                            <input type={isPasswordVisible ? "text" : "password"} name="password" value={dealer ? password : formData.password} onChange={e => { if(dealer) setPassword(e.target.value); else handleChange(e as any); }} className={inputClass + " pr-10"} placeholder="••••••••" required={!dealer} />
                            <button type="button" onClick={() => setIsPasswordVisible(!isPasswordVisible)} className="absolute right-3 top-9 text-slate-500 hover:text-white transition-colors">
                                {isPasswordVisible ? <Icons.eyeOff className="w-4 h-4" /> : <Icons.eye className="w-4 h-4" />}
                            </button>
                        </div>
                        <div className="relative">
                            <label className={labelClass}>Confirm Key</label>
                            <input type={isConfirmPasswordVisible ? "text" : "password"} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputClass + " pr-10"} placeholder="••••••••" required={(dealer && password.length > 0) || !dealer} />
                             <button type="button" onClick={() => setIsConfirmPasswordVisible(!isConfirmPasswordVisible)} className="absolute right-3 top-9 text-slate-500 hover:text-white transition-colors">
                                {isConfirmPasswordVisible ? <Icons.eyeOff className="w-4 h-4" /> : <Icons.eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className={labelClass}>Avatar Origin (URL)</label>
                        <input type="url" name="avatarUrl" value={formData.avatarUrl || ''} onChange={handleChange} placeholder="https://..." className={inputClass} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>Operational Sector (Area)</label>
                            <input type="text" name="area" value={formData.area} onChange={handleChange} placeholder="Region" className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Contact Uplink</label>
                            <input type="text" name="contact" value={formData.contact} onChange={handleChange} placeholder="Phone" className={inputClass} />
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                            <Icons.trendingUp className="w-5 h-5" />
                        </div>
                        <h4 className="text-xs font-black text-white uppercase tracking-widest">Protocol Rates</h4>
                    </div>

                    <div className="grid grid-cols-1 gap-4 bg-white/5 p-6 rounded-3xl border border-white/5">
                        {!dealer && (
                            <div>
                                <label className={labelClass}>Initial Reserve Load (PKR)</label>
                                <input type="text" name="wallet" value={formData.wallet} onChange={handleChange} placeholder="e.g. 50000" className={inputClass} />
                            </div>
                        )}
                        <div>
                            <label className={labelClass}>Operational Commission (%)</label>
                            <input type="number" name="commissionRate" value={formData.commissionRate} onChange={handleChange} className={inputClass} step="0.1" />
                            <p className="text-[9px] text-slate-500 mt-2 italic font-bold uppercase tracking-widest pl-1">Earnings derived from total stake flow.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                            <div>
                                <label className={labelClass}>1-Digit Prize (X)</label>
                                <input type="number" name="prizeRates.oneDigitOpen" value={formData.prizeRates.oneDigitOpen} onChange={handleChange} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>2-Digit Prize (X)</label>
                                <input type="number" name="prizeRates.twoDigit" value={formData.prizeRates.twoDigit} onChange={handleChange} className={inputClass} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex gap-4 pt-8 border-t border-white/5">
                <button type="button" onClick={onCancel} className="px-8 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-black text-[10px] uppercase tracking-widest transition-all border border-white/10">Abort</button>
                <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit" 
                    disabled={isLoading}
                    className="flex-grow py-4 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-cyan-500/20 transition-all flex items-center justify-center gap-2"
                >
                    {isLoading ? <div className="w-4 h-4 border-2 border-slate-950/20 border-t-slate-950 animate-spin rounded-full" /> : <Icons.checkCircle className="w-4 h-4" />}
                    {dealer ? 'Comit Identity Changes' : 'Initialize Dealer Node'}
                </motion.button>
            </div>
        </form>
    );
};

const SystemSettingsForm: React.FC<{ admin: Admin, onSave: (admin: Admin) => Promise<void> }> = ({ admin, onSave }) => {
    const [formData, setFormData] = useState({
        name: admin.name,
        avatarUrl: admin.avatarUrl || '',
        prizeRates: {
            oneDigitOpen: admin.prizeRates.oneDigitOpen.toString(),
            oneDigitClose: admin.prizeRates.oneDigitClose.toString(),
            twoDigit: admin.prizeRates.twoDigit.toString(),
        },
        marqueeText: admin.marqueeText || '',
        gameDurations: {
            AKC: (admin.gameDurations?.AKC || 0).toString(),
            FDS: (admin.gameDurations?.FDS || 0).toString(),
            GDS: (admin.gameDurations?.GDS || 0).toString(),
            RDS: (admin.gameDurations?.RDS || 0).toString(),
        },
        maxNumbers: (admin.maxNumbers || 10).toString(),
    });
    const [isLoading, setIsLoading] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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
        setIsLoading(true);
        try {
            await onSave({
                ...admin,
                name: formData.name,
                avatarUrl: formData.avatarUrl,
                ledger: [], 
                marqueeText: formData.marqueeText,
                maxNumbers: parseInt(formData.maxNumbers),
                gameDurations: {
                    AKC: parseInt(formData.gameDurations.AKC),
                    FDS: parseInt(formData.gameDurations.FDS),
                    GDS: parseInt(formData.gameDurations.GDS),
                    RDS: parseInt(formData.gameDurations.RDS),
                },
                prizeRates: {
                    oneDigitOpen: Number(formData.prizeRates.oneDigitOpen) || 0,
                    oneDigitClose: Number(formData.prizeRates.oneDigitClose) || 0,
                    twoDigit: Number(formData.prizeRates.twoDigit) || 0,
                }
            });
            alert("System Global Parameters Updated & Synchronized.");
        } finally {
            setIsLoading(false);
        }
    };

    const inputClass = "w-full bg-slate-950/50 p-4 rounded-2xl border border-white/10 focus:ring-2 focus:ring-cyan-500/50 text-white text-xs font-bold transition-all shadow-inner";
    const labelClass = "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1 block";

    return (
        <div className="glass-morphism p-8 rounded-[2.5rem] border border-white/5 max-w-4xl mx-auto shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 blur-3xl rounded-full -mr-32 -mt-32" />
            
            <h3 className="text-2xl font-black text-white mb-8 uppercase tracking-tighter flex items-center gap-3">
                <Icons.settings className="w-8 h-8 text-cyan-400" />
                Global Architecture
            </h3>

            <form onSubmit={handleSubmit} className="space-y-10 relative z-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                        <label className={labelClass}>Operational Identity (Name)</label>
                        <input type="text" name="name" value={formData.name} onChange={handleChange} className={inputClass} />
                    </div>
                    <div className="space-y-4">
                        <label className={labelClass}>Platform Visual Root (Avatar URL)</label>
                        <input type="url" name="avatarUrl" value={formData.avatarUrl} onChange={handleChange} className={inputClass} />
                    </div>
                </div>

                <div className="p-8 rounded-3xl bg-white/5 border border-white/5 space-y-8">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                            <Icons.trendingUp className="w-5 h-5" />
                        </div>
                        <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Prize Distribution Logic</h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <div>
                            <label className={labelClass}>2-Digit X</label>
                            <input type="text" name="prizeRates.twoDigit" value={formData.prizeRates.twoDigit} onChange={handleChange} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>1D Open X</label>
                            <input type="text" name="prizeRates.oneDigitOpen" value={formData.prizeRates.oneDigitOpen} onChange={handleChange} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>1D Close X</label>
                            <input type="text" name="prizeRates.oneDigitClose" value={formData.prizeRates.oneDigitClose} onChange={handleChange} className={inputClass} />
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
                            <Icons.clock className="w-5 h-5" />
                        </div>
                        <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Market Temporal Constraints</h4>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-6 rounded-3xl bg-white/5 border border-white/5">
                        {Object.keys(formData.gameDurations).map(game => (
                            <div key={game}>
                                <label className={labelClass}>{game} (MIN)</label>
                                <input type="number" name={`gameDurations.${game}`} value={formData.gameDurations[game as keyof typeof formData.gameDurations]} onChange={handleChange} className={inputClass} />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="space-y-4">
                    <label className={labelClass}>Broadcasting Message (Marquee)</label>
                    <textarea name="marqueeText" value={formData.marqueeText} onChange={handleChange as any} placeholder="ENTER SYSTEM ANNOUNCEMENT..." className={inputClass + " h-24 resize-none pt-4"} />
                </div>

                <div className="flex justify-center pt-4">
                    <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        disabled={isLoading}
                        type="submit" 
                        className="w-full py-5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs uppercase tracking-[0.3em] shadow-2xl shadow-cyan-500/40 transition-all flex items-center justify-center gap-3"
                    >
                        {isLoading ? <div className="w-5 h-5 border-3 border-slate-950/20 border-t-slate-950 animate-spin rounded-full" /> : <Icons.checkCircle className="w-5 h-5" />}
                        {isLoading ? 'SYNCING ARCHITECTURE...' : 'COMMIT PROTOCOL CHANGES'}
                    </motion.button>
                </div>
            </form>
        </div>
    );
};

const DealerTransactionForm: React.FC<{ 
    dealers: Dealer[]; 
    onTransaction: (dealerId: string, amount: number) => Promise<void>; 
    onCancel: () => void;
    type: 'Top-Up' | 'Withdrawal';
}> = ({ dealers, onTransaction, onCancel, type }) => {
    const [selectedDealerId, setSelectedDealerId] = useState<string>('');
    const [amount, setAmount] = useState<number | ''>('');
    const [isLoading, setIsLoading] = useState(false);
    const themeColor = type === 'Top-Up' ? 'emerald' : 'amber';
    
    const inputClass = `w-full bg-slate-950/50 p-4 rounded-2xl border border-white/10 focus:ring-2 focus:ring-${themeColor}-500/50 text-white text-sm font-bold shadow-inner transition-all appearance-none`;
    const labelClass = "block text-[10px] uppercase font-black text-slate-500 mb-1.5 tracking-widest ml-1";

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedDealerId || !amount || amount <= 0) {
            alert(`Please select a dealer and enter a valid positive amount.`);
            return;
        }
        setIsLoading(true);
        try {
            await onTransaction(selectedDealerId, Number(amount));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
                <div>
                    <label className={labelClass}>Network Origin (Dealer)</label>
                    <select value={selectedDealerId} onChange={(e) => setSelectedDealerId(e.target.value)} className={inputClass} required>
                        <option value="" disabled>-- Choose Dealer Node --</option>
                        {Array.isArray(dealers) && dealers.map(d => (
                            <option key={d.id} value={d.id}>
                                {d.name} ({d.id}) — Pool: Rs {d.wallet.toLocaleString()}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className={labelClass}>Financial Volume (PKR)</label>
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 font-mono text-xs font-black">RS</span>
                        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value))} placeholder="0.00" className={inputClass + " pl-10"} min="1" required />
                    </div>
                </div>
            </div>
            <div className="flex gap-4 pt-6">
                <button type="button" onClick={onCancel} className="flex-1 bg-white/5 hover:bg-white/10 text-white font-black py-4 rounded-2xl text-[10px] transition-all uppercase tracking-widest border border-white/10">Abort</button>
                <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={isLoading}
                    type="submit" 
                    className={`flex-grow font-black py-4 rounded-2xl text-slate-950 text-[10px] shadow-xl transition-all uppercase tracking-[0.2em] shadow-${themeColor}-500/20 bg-${themeColor}-500 hover:bg-${themeColor}-400`}
                >
                    {isLoading ? 'Processing...' : `Confirm ${type}`}
                </motion.button>
            </div>
        </form>
    );
};

const DashboardView: React.FC<{ summary: FinancialSummary | null; admin: Admin }> = ({ summary, admin }) => {
    if (!summary) {
        return (
            <div className="p-24 text-center">
                <div className="w-16 h-16 border-4 border-white/5 border-t-cyan-500 rounded-full animate-spin mx-auto mb-6" />
                <p className="text-slate-500 font-black text-[10px] uppercase tracking-widest animate-pulse">Syncing Global Financial Ledger...</p>
            </div>
        );
    }

    const SummaryCard: React.FC<{ title: string; value: number; color: string; icon: React.ReactNode }> = ({ title, value, color, icon }) => (
        <motion.div 
            whileHover={{ y: -5 }}
            className="glass-morphism p-6 rounded-[2rem] border border-white/5 shadow-2xl relative overflow-hidden group"
        >
            <div className={`absolute top-0 right-0 w-24 h-24 ${color.replace('text-', 'bg-')}/5 blur-3xl rounded-full -mr-12 -mt-12 transition-all group-hover:scale-150`} />
            <div className="relative z-10">
                <div className="flex items-center gap-4 mb-4">
                    <div className={`p-3 rounded-2xl ${color.replace('text-', 'bg-')}/10 ${color}`}>
                        {icon}
                    </div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{title}</p>
                </div>
                <p className={`text-3xl font-black font-mono tracking-tighter ${color}`}>
                    Rs {value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                    <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Protocol Verification</span>
                    <Icons.checkCircle className="w-3 h-3 text-emerald-500/50" />
                </div>
            </div>
        </motion.div>
    );
    
    return (
        <div className="space-y-12">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <SummaryCard title="System Reserve" value={admin.wallet} color="text-cyan-400" icon={<Icons.wallet className="w-5 h-5" />} />
                <SummaryCard title="Flow Stake" value={summary.totals.totalStake} color="text-white" icon={<Icons.trendingUp className="w-5 h-5" />} />
                <SummaryCard title="Payout Commit" value={summary.totals.totalPayouts} color="text-amber-400" icon={<Icons.checkCircle className="w-5 h-5" />} />
                <SummaryCard title="Net Yield" value={summary.totals.netProfit} color={summary.totals.netProfit >= 0 ? "text-emerald-400" : "text-red-400"} icon={<Icons.trendingUp className="w-5 h-5" />} />
            </div>

            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter">Market Performance Matrix</h3>
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest bg-white/5 px-4 py-1.5 rounded-full border border-white/5">Segmented Game Audit</div>
                </div>
                
                <div className="glass-morphism rounded-[2rem] overflow-hidden border border-white/5 shadow-2xl">
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left min-w-[900px]">
                            <thead className="bg-slate-950/50 border-b border-white/5">
                                <tr>
                                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Market Node</th>
                                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Inflow Stake</th>
                                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Payouts</th>
                                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Dealer Margin</th>
                                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Commissions</th>
                                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Net Liquidity</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {summary.games.map((game, idx) => (
                                    <motion.tr 
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        key={game.gameName} 
                                        className="hover:bg-white/[0.02] transition-colors group"
                                    >
                                        <td className="p-6">
                                            <div className="text-sm font-black text-white tracking-tight">{game.gameName}</div>
                                            <div className="text-[9px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded-md inline-block uppercase mt-1">Result: {game.winningNumber}</div>
                                        </td>
                                        <td className="p-6 text-right font-mono text-white text-xs">{game.totalStake.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        <td className="p-6 text-right font-mono text-amber-500/80 text-xs">{game.totalPayouts.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        <td className="p-6 text-right font-mono text-emerald-500/80 text-xs">{game.totalDealerProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        <td className="p-6 text-right font-mono text-sky-500/80 text-xs">{game.totalCommissions.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        <td className={`p-6 text-right font-mono font-black text-sm ${game.netProfit >= 0 ? "text-emerald-400" : "text-red-400"} group-hover:scale-110 transition-transform origin-right`}>
                                            {game.netProfit >= 0 ? '+' : ''}{game.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-950/80 border-t-2 border-white/10">
                                <tr className="font-black text-white">
                                    <td className="p-6 text-[10px] uppercase tracking-[0.2em] font-black">Architecture Aggregate</td>
                                    <td className="p-6 text-right font-mono text-sm">{summary.totals.totalStake.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td className="p-6 text-right font-mono text-sm text-amber-400">{summary.totals.totalPayouts.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td className="p-6 text-right font-mono text-sm text-emerald-400">{summary.totals.totalDealerProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td className="p-6 text-right font-mono text-sm text-sky-400">{summary.totals.totalCommissions.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td className={`p-6 text-right font-mono text-base ${summary.totals.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{summary.totals.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

const NumberLimitsView: React.FC = () => {
    const [limits, setLimits] = useState<NumberLimit[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [formState, setFormState] = useState<Omit<NumberLimit, 'id'>>({
        gameType: '2-digit',
        numberValue: '',
        limitAmount: 0,
    });
    const { fetchWithAuth } = useAuth();

    const fetchLimits = async () => {
        setIsLoading(true);
        try {
            const response = await fetchWithAuth('/api/admin/number-limits');
            const data = await response.json();
            setLimits(data);
        } catch (error) {
            console.error("Failed to fetch number limits:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchLimits();
    }, []);
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        
        let processedValue = value;
        if (name === 'numberValue') {
            processedValue = value.replace(/\D/g, ''); 
            const maxLength = formState.gameType === '2-digit' ? 2 : 1;
            if (processedValue.length > maxLength) {
                processedValue = processedValue.slice(0, maxLength);
            }
        }

        setFormState(prev => ({
            ...prev,
            [name]: name === 'limitAmount' ? (value ? parseFloat(value) : 0) : processedValue
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const { gameType, numberValue, limitAmount } = formState;
        if (!numberValue.trim() || limitAmount <= 0) {
            alert("Enter valid target and value nodes.");
            return;
        }

        const maxLength = formState.gameType === '2-digit' ? 2 : 1;
        if (numberValue.length !== maxLength) {
             alert(`Target must be exactly ${maxLength} digits.`);
            return;
        }

        setIsSaving(true);
        try {
            await fetchWithAuth('/api/admin/number-limits', {
                method: 'POST',
                body: JSON.stringify(formState)
            });
            setFormState({ gameType: '2-digit', numberValue: '', limitAmount: 0 });
            await fetchLimits();
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleDelete = async (limitId: number) => {
        if (window.confirm("Purge this limit restriction from protocol?")) {
            try {
                await fetchWithAuth(`/api/admin/number-limits/${limitId}`, { method: 'DELETE' });
                await fetchLimits();
            } catch (error) {
                console.error("Deletion failed:", error);
            }
        }
    };

    const inputClass = "bg-slate-950/50 text-white p-4 rounded-2xl border border-white/5 focus:ring-2 focus:ring-cyan-500/50 text-xs font-bold transition-all shadow-inner";
    const labelClass = "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1 block";

    const gameTypeLabels: Record<NumberLimit['gameType'], string> = {
        '1-open': 'One Digit Open',
        '1-close': 'One Digit Close',
        '2-digit': 'Standard 2-Digit',
    };

    return (
        <div className="space-y-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Stake Restriction Controls</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Configure Global Number Hard-Limits</p>
                </div>
            </div>

            <div className="glass-morphism p-8 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/5 blur-3xl rounded-full -mr-24 -mt-24" />
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end relative z-10">
                    <div className="space-y-4">
                        <label className={labelClass}>Market Node Type</label>
                        <select name="gameType" value={formState.gameType} onChange={handleInputChange} className={inputClass}>
                            <option value="2-digit">2 Digit</option>
                            <option value="1-open">1 Digit Open</option>
                            <option value="1-close">1 Digit Close</option>
                        </select>
                    </div>
                    <div className="space-y-4">
                        <label className={labelClass}>Target Number</label>
                        <input type="text" name="numberValue" value={formState.numberValue} onChange={handleInputChange} className={inputClass} placeholder={formState.gameType === '2-digit' ? '00-99' : '0-9'} />
                    </div>
                    <div className="space-y-4">
                        <label className={labelClass}>Max System exposure (PKR)</label>
                        <input type="number" name="limitAmount" value={formState.limitAmount || ''} onChange={handleInputChange} className={inputClass} placeholder="5000" />
                    </div>
                    <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        disabled={isSaving}
                        type="submit" 
                        className="h-[52px] bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-[10px] uppercase tracking-[0.2em] rounded-2xl transition-all shadow-xl shadow-cyan-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isSaving ? <div className="w-4 h-4 border-2 border-slate-950/20 border-t-slate-950 animate-spin rounded-full" /> : <Icons.checkCircle className="w-4 h-4" />}
                        Apply protocol limit
                    </motion.button>
                </form>
            </div>

            <div className="glass-morphism rounded-3xl overflow-hidden border border-white/5 shadow-2xl">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left min-w-[800px]">
                        <thead className="bg-slate-950/50 border-b border-white/5">
                            <tr>
                                <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Node Architecture</th>
                                <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Defined Target</th>
                                <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Max Capacity (PKR)</th>
                                <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Operational Protocol</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {isLoading ? (
                                <tr><td colSpan={4} className="p-24 text-center">
                                    <div className="w-10 h-10 border-4 border-white/5 border-t-cyan-500 rounded-full animate-spin mx-auto" />
                                </td></tr>
                            ) : limits.length === 0 ? (
                                <tr><td colSpan={4} className="p-24 text-center">
                                    <p className="text-slate-600 font-black text-[10px] uppercase tracking-widest opacity-30">No active restrictions in global buffer.</p>
                                </td></tr>
                            ) : (
                                limits.map((limit, idx) => (
                                     <motion.tr 
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: idx * 0.05 }}
                                        key={limit.id} 
                                        className="hover:bg-white/[0.02] transition-colors group"
                                     >
                                         <td className="p-6 text-xs font-black text-white uppercase tracking-widest">{gameTypeLabels[limit.gameType]}</td>
                                         <td className="p-6">
                                             <div className="font-mono text-cyan-400 text-2xl font-black bg-cyan-500/5 px-4 py-1 rounded-xl inline-block border border-cyan-500/10">{limit.numberValue}</div>
                                         </td>
                                         <td className="p-6 font-mono font-black text-white text-lg">Rs {limit.limitAmount.toLocaleString()}</td>
                                         <td className="p-6 text-center">
                                             <button onClick={() => handleDelete(limit.id)} className="px-5 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest transition-all border border-red-500/10 active:scale-95">Purge</button>
                                         </td>
                                     </motion.tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// --- IMPROVED LIVE BOOKING VIEW ---
interface BookingData {
    totalBets: number;
    totalStake: number;
    dealerData: { name: string; amount: number }[];
    typeData: { type: SubGameType; amount: number }[];
    userData: { name: string; amount: number }[];
}

const LiveBookingView: React.FC<{ games: Game[], users: User[], dealers: Dealer[], bets: Bet[] }> = ({ games, users, dealers, bets }) => {
    const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
    
    const ongoingGames = useMemo(() => games.filter(g => !g.winningNumber), [games]);

    const bookingData = useMemo(() => {
        if (!selectedGameId) return null;

        const liveBets = bets.filter(b => b.gameId === selectedGameId);
        if (liveBets.length === 0) return null;

        const dealerMap = new Map<string, number>();
        const typeMap = new Map<SubGameType, number>();
        const userMap = new Map<string, number>();

        liveBets.forEach(bet => {
            const currentDealerStake = dealerMap.get(bet.dealerId) || 0;
            dealerMap.set(bet.dealerId, currentDealerStake + bet.totalAmount);

            const currentTypeStake = typeMap.get(bet.subGameType) || 0;
            typeMap.set(bet.subGameType, currentTypeStake + bet.totalAmount);

            const currentUserStake = userMap.get(bet.userId) || 0;
            userMap.set(bet.userId, currentUserStake + bet.totalAmount);
        });

        const totalStake = liveBets.reduce((sum, b) => sum + b.totalAmount, 0);

        const dealerData = Array.from(dealerMap.entries()).map(([dealerId, amount]) => ({
            name: dealers.find(d => d.id === dealerId)?.name || 'Unknown Dealer',
            amount,
        })).sort((a, b) => b.amount - a.amount);

        const typeData = Array.from(typeMap.entries()).map(([type, amount]) => ({
            type: type as SubGameType,
            amount,
        })).sort((a, b) => b.amount - a.amount);

        const userData = Array.from(userMap.entries()).map(([userId, amount]) => ({
            name: users.find(u => u.id === userId)?.name || 'Unknown User',
            amount,
        })).sort((a, b) => b.amount - a.amount).slice(0, 10);

        return {
            totalBets: liveBets.length,
            totalStake,
            dealerData,
            typeData,
            userData
        } as BookingData;
    }, [selectedGameId, bets, users, dealers]);
    
    const BreakdownCard: React.FC<{ title: string; data: { name: string; amount: number }[] | { type: string; amount: number }[]; total: number; variant: 'cyan' | 'emerald' | 'amber' }> = ({ title, data, total, variant }) => {
        const colors = {
            cyan: { bg: 'bg-cyan-500', glow: 'shadow-cyan-500/20', text: 'text-cyan-400' },
            emerald: { bg: 'bg-emerald-500', glow: 'shadow-emerald-500/20', text: 'text-emerald-400' },
            amber: { bg: 'bg-amber-500', glow: 'shadow-amber-500/20', text: 'text-amber-400' }
        }[variant];

        return (
            <div className="glass-morphism p-6 rounded-[2rem] border border-white/5 h-full flex flex-col shadow-xl">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${colors.bg}`} />
                    {title}
                </h4>
                <div className="flex-grow overflow-y-auto custom-scrollbar pr-2 space-y-4">
                    {data.length === 0 ? (
                        <p className="text-slate-600 font-black text-[9px] uppercase tracking-widest text-center py-8">Awaiting Node Data...</p>
                    ) : data.map((item, index) => {
                        const name = 'name' in item ? item.name : item.type;
                        const amount = item.amount;
                        const percentage = total > 0 ? (amount / total) * 100 : 0;
                        return (
                            <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: '100%' }}
                                key={index} 
                                className="space-y-1.5"
                            >
                                <div className="flex justify-between items-end mb-1 px-1">
                                    <span className="text-[10px] font-black text-white/80 truncate uppercase tracking-tighter">{name}</span>
                                    <span className={`font-mono ${colors.text} font-black text-xs`}>Rs {amount.toLocaleString()}</span>
                                </div>
                                <div className="w-full bg-slate-900 rounded-full h-1 relative overflow-hidden">
                                    <motion.div 
                                        initial={{ width: 0 }}
                                        animate={{ width: `${percentage}%` }}
                                        className={`${colors.bg} h-full rounded-full transition-all duration-1000 ease-out`} 
                                    />
                                </div>
                                <div className="flex justify-end">
                                    <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">{percentage.toFixed(1)}% LOAD</span>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Live Traffic Analyzer</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Real-time Game Booking Breakdown</p>
                </div>
                <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-2xl text-[10px] text-emerald-400 font-black uppercase tracking-widest animate-pulse transition-all">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50"></span>
                    Operational Sync Active
                </div>
            </div>

            <div className="glass-morphism p-4 rounded-[2rem] flex items-center gap-3 overflow-x-auto custom-scrollbar border border-white/5 scroll-px-4">
                {ongoingGames.length > 0 ? ongoingGames.map(game => (
                    <motion.button 
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.95 }}
                        key={game.id} 
                        onClick={() => setSelectedGameId(game.id)} 
                        className={`flex items-center gap-3 py-3 px-6 text-[10px] font-black rounded-2xl transition-all uppercase tracking-widest border whitespace-nowrap ${selectedGameId === game.id ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-xl shadow-cyan-500/20' : 'bg-white/5 text-slate-400 border-white/5 hover:bg-white/10 hover:text-white'}`}
                    >
                        <img src={game.logo} alt={game.name} className="w-5 h-5 rounded-lg object-cover shadow-lg" />
                        <span>{game.name}</span>
                    </motion.button>
                )) : <p className="text-slate-600 font-black text-[10px] p-4 uppercase tracking-[0.2em] w-full text-center">Global Market nodes Offline / Closed.</p>}
            </div>

            {!selectedGameId ? (
                <div className="text-center p-24 glass-morphism rounded-[3rem] border border-white/5 shadow-2xl">
                    <Icons.activity className="w-16 h-16 text-slate-700 mx-auto mb-6 opacity-20" />
                    <p className="text-slate-500 font-black text-xs uppercase tracking-[0.3em]">Awaiting node selection for traffic audit...</p>
                </div>
            ) : bookingData ? (
                <div className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="glass-morphism p-8 rounded-[2.5rem] border border-white/5 shadow-2xl flex items-center justify-between group overflow-hidden relative">
                             <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 blur-3xl rounded-full -mr-16 -mt-16" />
                             <div className="relative z-10">
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Transaction Volume</p>
                                <p className="text-5xl font-black font-mono text-white tracking-tighter group-hover:scale-110 transition-transform origin-left">{bookingData.totalBets.toLocaleString()}</p>
                             </div>
                             <Icons.moveUpRight className="w-12 h-12 text-slate-800" />
                        </div>
                         <div className="glass-morphism p-8 rounded-[2.5rem] border border-white/5 shadow-2xl flex items-center justify-between group overflow-hidden relative">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-3xl rounded-full -mr-16 -mt-16" />
                            <div className="relative z-10">
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Operational Stake</p>
                                <p className="text-5xl font-black font-mono text-cyan-400 tracking-tighter group-hover:scale-110 transition-transform origin-left">Rs {bookingData.totalStake.toLocaleString(undefined, {maximumFractionDigits: 0})}</p>
                            </div>
                             <Icons.trendingUp className="w-12 h-12 text-cyan-950/30" />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[500px]">
                        <BreakdownCard title="Regional Dealer Load" data={bookingData.dealerData} total={bookingData.totalStake} variant="cyan" />
                        <BreakdownCard title="Sub-Market Flow" data={bookingData.typeData} total={bookingData.totalStake} variant="emerald" />
                        <BreakdownCard title="Primary User Nodes" data={bookingData.userData} total={bookingData.totalStake} variant="amber" />
                    </div>
                </div>
            ) : (
                 <div className="text-center p-24 glass-morphism rounded-[3rem] border border-white/5 shadow-2xl transition-all">
                     <Icons.activity className="w-12 h-12 text-slate-700 mx-auto mb-6 animate-pulse" />
                     <p className="text-slate-500 font-black text-xs uppercase tracking-[0.2em]">Zero engagement detected in selected market buffer.</p>
                 </div>
            )}
        </div>
    );
};

// --- NUMBER SUMMARY VIEW ---
const SummaryColumn: React.FC<{ title: string; data: { number: string; stake: number }[]; color: string; }> = ({ title, data, color }) => {
    const [copyStatus, setCopyStatus] = useState('Copy');

    const handleCopy = () => {
        if (data.length === 0 || copyStatus !== 'Copy') return;

        const copyText = data
            .map(item => `${item.number}, rs ${item.stake.toLocaleString(undefined, { minimumFractionDigits: 0 })}`)
            .join('\n');
            
        navigator.clipboard.writeText(copyText).then(() => {
            setCopyStatus('Copied!');
            setTimeout(() => setCopyStatus('Copy'), 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            setCopyStatus('Failed!');
             setTimeout(() => setCopyStatus('Copy'), 2000);
        });
    };

    return (
        <div className="glass-morphism p-6 rounded-[2rem] border border-white/5 flex flex-col shadow-xl h-full">
            <div className="flex justify-between items-center mb-6 px-1">
                <h4 className={`text-sm font-black uppercase tracking-widest ${color}`}>{title}</h4>
                <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleCopy}
                    disabled={data.length === 0}
                    className="flex items-center bg-white/5 hover:bg-white/10 text-[10px] text-slate-400 font-black uppercase tracking-widest py-2 px-4 rounded-xl transition-all disabled:opacity-50 border border-white/5"
                >
                    {copyStatus === 'Copied!' ? (
                         <>
                            <Icons.checkCircle className="h-3 w-3 mr-2 text-emerald-400" />
                            Synchronized
                        </>
                    ) : (
                        <>
                            <Icons.activity className="h-3 w-3 mr-2" />
                            {copyStatus === 'Copy' ? 'Copy Dump' : copyStatus}
                        </>
                    )}
                </motion.button>
            </div>
            <div className="flex-grow overflow-y-auto custom-scrollbar pr-2 space-y-3 max-h-[500px]">
                {data.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 opacity-20">
                         <Icons.activity className="w-8 h-8 text-slate-500 mb-3" />
                         <p className="text-slate-500 font-black text-[9px] uppercase tracking-widest">No Buffer Data</p>
                    </div>
                ) : (
                    data.map((item, index) => (
                        <motion.div 
                            initial={{ x: -10, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: index * 0.02 }}
                            key={index} 
                            className="flex justify-between items-center p-4 rounded-2xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 transition-all group"
                        >
                            <div className="flex items-center gap-4">
                                <span className={`font-mono text-2xl font-black ${color} group-hover:scale-125 transition-transform origin-left`}>{item.number}</span>
                                <div className="h-4 w-px bg-white/5" />
                                <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Target</span>
                            </div>
                            <span className="font-mono text-white font-black text-sm">
                                Rs {item.stake.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                            </span>
                        </motion.div>
                    ))
                )}
            </div>
        </div>
    );
};


const NumberSummaryView: React.FC<{
    games: Game[];
    dealers: Dealer[];
    users: User[];
    onPlaceAdminBets: AdminPanelProps['onPlaceAdminBets'];
}> = ({ games, dealers, users, onPlaceAdminBets }) => {
    const [filters, setFilters] = useState({ gameId: '', dealerId: '', date: getTodayDateString() });
    const [numberFilter, setNumberFilter] = useState('');
    const [summary, setSummary] = useState<{ twoDigit: any[], oneDigitOpen: any[], oneDigitClose: any[], gameBreakdown?: { gameId: string, stake: number }[] } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const { fetchWithAuth } = useAuth();
    
    const fetchSummary = async () => {
        if (!filters.date) {
            setSummary(null);
            return;
        }
        setIsLoading(true);
        const params = new URLSearchParams();
        if (filters.gameId) params.append('gameId', filters.gameId);
        if (filters.dealerId) params.append('dealerId', filters.dealerId);
        if (filters.date) params.append('date', filters.date);

        try {
            const response = await fetchWithAuth(`/api/admin/number-summary?${params.toString()}`);
            if (!response.ok) throw new Error('Failed to fetch summary');
            const data = await response.json();
            setSummary(data);
        } catch (error) {
            console.error("Error fetching number summary:", error);
            setSummary(null);
        } finally {
            setIsLoading(false);
        }
    };
    
    useEffect(() => {
        let intervalId: ReturnType<typeof setInterval>;
        fetchSummary();
        intervalId = setInterval(fetchSummary, 5000);
        return () => clearInterval(intervalId);
    }, [filters, fetchWithAuth]);

    const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };
    
    const clearFilters = () => {
        setFilters({ gameId: '', dealerId: '', date: getTodayDateString() });
        setNumberFilter('');
    };
    
    const filteredSummary = useMemo(() => {
        if (!summary) return null;
        if (!numberFilter.trim()) return summary;

        const filterLogic = (numStr: string) => {
            const filterValue = numberFilter.trim();
            const cleanFilter = filterValue.replace(/[\^$]/g, '');
            if (!cleanFilter) return true;
            if (filterValue.startsWith('^')) return numStr.startsWith(cleanFilter);
            if (filterValue.endsWith('$')) return numStr.endsWith(cleanFilter);
            return numStr.includes(cleanFilter);
        };
        
        return {
            ...summary,
            twoDigit: summary.twoDigit.filter(item => filterLogic(item.number)),
            oneDigitOpen: summary.oneDigitOpen.filter(item => filterLogic(item.number)),
            oneDigitClose: summary.oneDigitClose.filter(item => filterLogic(item.number)),
        };
    }, [summary, numberFilter]);

    const inputClass = "w-full bg-slate-800 p-2 rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:outline-none text-white";
    const finalSummary = filteredSummary || summary;

    const gameBreakdownData = useMemo(() => {
        if (!finalSummary?.gameBreakdown) return [];
        return finalSummary.gameBreakdown.map(item => ({
            name: games.find(g => g.id === item.gameId)?.name || 'Unknown',
            stake: item.stake
        })).sort((a, b) => b.stake - a.stake);
    }, [finalSummary, games]);

    return (
        <div className="space-y-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Number-wise Stake Audit</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Global Aggregate Analysis</p>
                </div>
            </div>

            <div className="glass-morphism p-8 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/5 blur-3xl rounded-full -mr-24 -mt-24" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 items-end relative z-10">
                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1 block">Archive Date</label>
                        <input type="date" name="date" value={filters.date} onChange={handleFilterChange} className="bg-slate-950/50 text-white p-4 rounded-2xl border border-white/5 focus:ring-2 focus:ring-cyan-500/50 text-xs font-bold transition-all shadow-inner w-full" />
                    </div>
                     <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1 block">Market Node</label>
                        <select name="gameId" value={filters.gameId} onChange={handleFilterChange} className="bg-slate-950/50 text-white p-4 rounded-2xl border border-white/5 focus:ring-2 focus:ring-cyan-500/50 text-xs font-bold transition-all shadow-inner w-full">
                            <option value="">All Markets</option>
                            {games.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                    </div>
                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1 block">Origin Dealer</label>
                        <select name="dealerId" value={filters.dealerId} onChange={handleFilterChange} className="bg-slate-950/50 text-white p-4 rounded-2xl border border-white/5 focus:ring-2 focus:ring-cyan-500/50 text-xs font-bold transition-all shadow-inner w-full">
                            <option value="">All Dealers</option>
                            {dealers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>
                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1 block">Number Filter</label>
                        <input type="text" value={numberFilter} onChange={e => setNumberFilter(e.target.value)} placeholder="^5, 5$, 5" className="bg-slate-950/50 text-white p-4 rounded-2xl border border-white/5 focus:ring-2 focus:ring-cyan-500/50 text-xs font-bold transition-all shadow-inner w-full" />
                    </div>
                    <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={clearFilters} 
                        className="h-[52px] bg-white/5 hover:bg-white/10 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl transition-all border border-white/5 flex items-center justify-center gap-2"
                    >
                        Purge Filter
                    </motion.button>
                </div>
            </div>

            {gameBreakdownData.length > 0 && (
                <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-cyan-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-cyan-500" />
                        Market Stake Distribution
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-4">
                        {gameBreakdownData.map((item, idx) => (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: idx * 0.03 }}
                                key={idx} 
                                className="glass-morphism p-4 rounded-2xl border border-white/5 text-center flex flex-col justify-center relative overflow-hidden group"
                            >
                                <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1 truncate relative z-10">{item.name}</p>
                                <p className="text-sm font-black font-mono text-white relative z-10">Rs {item.stake.toLocaleString()}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            )}

            {isLoading && !summary ? (
                <div className="text-center p-24">
                     <div className="w-10 h-10 border-4 border-white/5 border-t-cyan-500 rounded-full animate-spin mx-auto" />
                </div>
            ) : !finalSummary ? (
                <div className="text-center p-24 glass-morphism rounded-[3rem] border border-white/5 shadow-2xl opacity-30">
                    <Icons.search className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                    <p className="text-slate-500 font-black text-[10px] uppercase tracking-widest">Select Archive Date for Audit</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    <SummaryColumn title="2-Digit Node Stakes" data={finalSummary.twoDigit} color="text-cyan-400" />
                    <SummaryColumn title="1-Digit Open Buffer" data={finalSummary.oneDigitOpen} color="text-amber-400" />
                    <SummaryColumn title="1-Digit Close Buffer" data={finalSummary.oneDigitClose} color="text-rose-400" />
                </div>
            )}
        </div>
    );
};

interface AdminPanelProps {
  admin: Admin; 
  dealers: Dealer[]; 
  onSaveDealer: (dealer: Dealer, originalId?: string) => Promise<void>;
  onUpdateAdmin: (admin: Admin) => Promise<void>;
  users: User[]; 
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  games: Game[]; 
  bets: Bet[]; 
  declareWinner: (gameId: string, winningNumber: string) => void;
  updateWinner: (gameId: string, newWinningNumber: string) => void;
  approvePayouts: (gameId: string) => void;
  topUpDealerWallet: (dealerId: string, amount: number) => void;
  withdrawFromDealerWallet: (dealerId: string, amount: number) => void;
  toggleAccountRestriction: (accountId: string, accountType: 'user' | 'dealer') => void;
  onPlaceAdminBets: (details: {
    userId: string;
    gameId: string;
    betGroups: any[];
  }) => Promise<void>;
  updateGameDrawTime: (gameId: string, newDrawTime: string) => Promise<void>;
  onRefreshData?: () => Promise<void>;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ admin, dealers, onSaveDealer, onUpdateAdmin, users, setUsers, games, bets, declareWinner, updateWinner, approvePayouts, topUpDealerWallet, withdrawFromDealerWallet, toggleAccountRestriction, onPlaceAdminBets, updateGameDrawTime, onRefreshData }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDealer, setSelectedDealer] = useState<Dealer | undefined>(undefined);
  const [winningNumbers, setWinningNumbers] = useState<{[key: string]: string}>({});
  const [searchQuery, setSearchQuery] = useState('');
  
  // Ledger state by ID/Type to ensure stability across polling updates
  const [viewingLedgerId, setViewingLedgerId] = useState<string | null>(null);
  const [viewingLedgerType, setViewingLedgerType] = useState<'dealer' | 'admin' | 'user' | null>(null);

  const [betSearchQuery, setBetSearchQuery] = useState('');
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [isWithdrawalModalOpen, setIsWithdrawalModalOpen] = useState(false);
  const [summaryData, setSummaryData] = useState<FinancialSummary | null>(null);
  const [editingGame, setEditingGame] = useState<{ id: string, number: string } | null>(null);
  const [editingDrawTime, setEditingDrawTime] = useState<{ gameId: string; time: string } | null>(null);
  const { fetchWithAuth } = useAuth();
  const [isRefreshingManual, setIsRefreshingManual] = useState(false);

  // User management modal state
  const [isUserEditModalOpen, setIsUserEditModalOpen] = useState(false);
  const [selectedUserToEdit, setSelectedUserToEdit] = useState<User | undefined>(undefined);

  // State for Dealers tab
  const [dealerSortKey, setDealerSortKey] = useState<SortKey>('name');
  const [dealerSortDirection, setDealerSortDirection] = useState<SortDirection>('asc');

  // State for Users tab
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSortKey, setUserSortKey] = useState<SortKey>('name');
  const [userSortDirection, setUserSortDirection] = useState<SortDirection>('asc');

  // Derived account for the ledger modal - ensures the ledger is always fresh from props
  const activeLedgerAccount = useMemo(() => {
    if (!viewingLedgerId || !viewingLedgerType) return null;
    if (viewingLedgerType === 'admin') return admin;
    if (viewingLedgerType === 'dealer') return dealers.find(d => d.id === viewingLedgerId);
    if (viewingLedgerType === 'user') return users.find(u => u.id === viewingLedgerId);
    return null;
  }, [viewingLedgerId, viewingLedgerType, admin, dealers, users]);

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

    if (activeTab === 'dashboard') {
      fetchSummary();
    }
  }, [activeTab, fetchWithAuth]);


  const handleSaveDealer = async (dealerData: Dealer, originalId?: string) => {
      try {
          if (originalId) { // This is an update
              const idChanged = dealerData.id !== originalId;
              if (idChanged) {
                  const idTaken = dealers.some(d => d.id.toLowerCase() === dealerData.id.toLowerCase() && d.id !== originalId);
                  if (idTaken) {
                      alert('This Dealer Login ID is already taken. Please choose another one.');
                      return;
                  }
                  setUsers(prev => prev.map(u => u.dealerId === originalId ? { ...u, dealerId: dealerData.id } : u));
              }
          }

          await onSaveDealer(dealerData, originalId);

          setIsModalOpen(false);
          setSelectedDealer(undefined);
      } catch (error) {
          console.error("Failed to save dealer:", error);
      }
  };

  const handleDeclareWinner = (gameId: string, gameName: string) => {
    const num = winningNumbers[gameId];
    const isSingleDigitGame = gameName === 'AK' || gameName === 'AKC';
    const isValid = num && !isNaN(parseInt(num)) && (isSingleDigitGame ? num.length === 1 : num.length === 2);

    if (isValid) {
        declareWinner(gameId, num);
        setWinningNumbers(prev => ({...prev, [gameId]: ''}));
    } else {
        alert(`Please enter a valid ${isSingleDigitGame ? '1-digit' : '2-digit'} number.`);
    }
  };

  const handleUpdateWinner = (gameId: string, gameName: string) => {
    const isSingleDigitGame = gameName === 'AK' || gameName === 'AKC';
    if (editingGame) {
        const num = editingGame.number;
        const isValid = num && !isNaN(parseInt(num)) && (isSingleDigitGame ? num.length === 1 : num.length === 2);

        if (isValid) {
            updateWinner(gameId, num);
            setEditingGame(null);
        } else {
            alert(`Please enter a valid ${isSingleDigitGame ? '1-digit' : '2-digit'} number.`);
        }
    }
  };

  const handleManualRefresh = async () => {
      if (!onRefreshData) return;
      setIsRefreshingManual(true);
      try {
          await onRefreshData();
      } finally {
          setTimeout(() => setIsRefreshingManual(false), 500);
      }
  };

  const handleDealerSort = (key: SortKey) => {
        if (dealerSortKey === key) {
            setDealerSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setDealerSortKey(key);
            setDealerSortDirection('asc');
        }
    };

    const sortedDealers = useMemo(() => {
        const filtered = dealers.filter(d => 
            d.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            (d.area || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
            d.id.toLowerCase().includes(searchQuery.toLowerCase())
        );
        
        return [...filtered].sort((a, b) => {
            const dir = dealerSortDirection === 'asc' ? 1 : -1;
            switch (dealerSortKey) {
                case 'name': return a.name.localeCompare(b.name) * dir;
                case 'wallet': return (a.wallet - b.wallet) * dir;
                case 'status': return (a.isRestricted === b.isRestricted ? 0 : a.isRestricted ? 1 : -1) * dir;
                default: return 0;
            }
        });
    }, [dealers, searchQuery, dealerSortKey, dealerSortDirection]);

    const handleUserSort = (key: SortKey) => {
        if (userSortKey === key) {
            setUserSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setUserSortKey(key);
            setUserSortDirection('asc');
        }
    };

    const sortedUsers = useMemo(() => {
        const lowerQuery = userSearchQuery.toLowerCase();
        const filtered = userSearchQuery.trim() === '' ? users : users.filter(u => 
            u.name.toLowerCase().includes(lowerQuery) ||
            u.id.toLowerCase().includes(lowerQuery) ||
            (u.area || '').toLowerCase().includes(lowerQuery) ||
            (dealers.find(d => d.id === u.dealerId)?.name || '').toLowerCase().includes(lowerQuery)
        );

        return [...filtered].sort((a, b) => {
            const dir = userSortDirection === 'asc' ? 1 : -1;
            switch (userSortKey) {
                case 'name': return a.name.localeCompare(b.name) * dir;
                case 'wallet': return (a.wallet - b.wallet) * dir;
                case 'status': return (a.isRestricted === b.isRestricted ? 0 : a.isRestricted ? 1 : -1) * dir;
                default: return 0;
            }
        });
    }, [users, dealers, userSearchQuery, userSortKey, userSortDirection]);

  const flatBets = useMemo(() => bets.flatMap(bet => {
        const user = users.find(u => u.id === bet.userId);
        const dealer = dealers.find(d => d.id === bet.dealerId);
        const game = games.find(g => g.id === bet.gameId);
        if (!user || !dealer || !game) return [];
        return bet.numbers.map(num => ({
            betId: bet.id, userName: user.name, dealerName: dealer.name, gameName: game.name,
            subGameType: bet.subGameType, number: num, amount: bet.amountPerNumber, timestamp: bet.timestamp,
        }));
    }), [bets, users, dealers, games]);

  const filteredBets = useMemo(() => !betSearchQuery.trim() ? [] : flatBets.filter(bet => bet.number === betSearchQuery.trim()), [flatBets, betSearchQuery]);
  const searchSummary = useMemo(() => !betSearchQuery.trim() || filteredBets.length === 0 ? null : { number: betSearchQuery.trim(), count: filteredBets.length, totalStake: filteredBets.reduce((s, b) => s + b.amount, 0) }, [filteredBets, betSearchQuery]);

  const handleAdminUserUpdate = async (userData: User) => {
        try {
            // CRITICAL: Strip ledger here too for admin updates
            const payload = { ...userData, ledger: [] };
            const response = await fetchWithAuth(`/api/admin/users/${userData.id}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                alert('User updated successfully.');
                setIsUserEditModalOpen(false);
                if (onRefreshData) await onRefreshData();
            }
        } catch (error) {
            console.error('Error updating user as admin:', error);
            alert('Failed to update user.');
        }
  };

  const tabs = [
    { id: 'dashboard', label: 'Monitor', icon: <Icons.activity className="w-4 h-4" /> },
    { id: 'dealers', label: 'Nodes', icon: <Icons.userGroup className="w-4 h-4" /> }, 
    { id: 'users', label: 'Clients', icon: <Icons.user className="w-4 h-4" /> },
    { id: 'games', label: 'Markets', icon: <Icons.gamepad className="w-4 h-4" /> },
    { id: 'winners', label: 'Rewards', icon: <Icons.star className="w-4 h-4" /> },
    { id: 'liveBooking', label: 'Traffic', icon: <Icons.sparkles className="w-4 h-4" /> },
    { id: 'numberSummary', label: 'Summary', icon: <Icons.chartBar className="w-4 h-4" /> },
    { id: 'limits', label: 'Protocol', icon: <Icons.shield className="w-4 h-4" /> }, 
    { id: 'bettingSheet', label: 'Search', icon: <Icons.search className="w-4 h-4" /> }, 
    { id: 'history', label: 'Ledger', icon: <Icons.bookOpen className="w-4 h-4" /> },
    { id: 'settings', label: 'Core', icon: <Icons.settings className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen pb-24">
      {/* Header Section */}
      <header className="px-6 py-10 max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-end gap-6 relative">
          <div className="absolute top-0 left-0 w-96 h-96 bg-cyan-500/5 blur-[120px] rounded-full -ml-32 -mt-32 pointer-events-none" />
          <div className="relative z-10">
              <div className="flex items-center gap-4 mb-2">
                  <div className="w-12 h-12 rounded-2xl bg-cyan-500 shadow-xl shadow-cyan-500/20 flex items-center justify-center text-slate-950">
                    <Icons.shield className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">Command Center</h2>
                    <p className="text-[10px] text-cyan-400 font-black uppercase tracking-[0.3em] mt-1">Operational Protocol v4.0.2</p>
                  </div>
              </div>
          </div>
          
          <div className="flex items-center gap-4 relative z-10">
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleManualRefresh}
                disabled={isRefreshingManual}
                className="p-4 rounded-2xl bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all group"
            >
                <Icons.refreshCw className={`w-5 h-5 ${isRefreshingManual ? 'animate-spin text-cyan-400' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
            </motion.button>
            <div className="flex flex-col items-end">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Authenticated Admin</p>
                <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-2xl border border-white/5 shadow-inner">
                    <span className="text-xs font-black text-white uppercase tracking-tight">{admin.name}</span>
                    <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center overflow-hidden">
                        {admin.avatarUrl ? <img src={admin.avatarUrl} className="w-full h-full object-cover" /> : <Icons.user className="w-3 h-3 text-emerald-400" />}
                    </div>
                </div>
            </div>
          </div>
      </header>

      {/* Navigation Matrix */}
      <nav className="px-6 mb-12 max-w-7xl mx-auto relative z-20">
        <div className="glass-morphism p-2 rounded-[2rem] border border-white/5 shadow-2xl flex items-center gap-2 overflow-x-auto custom-scrollbar no-scrollbar">
            {tabs.map((tab, idx) => (
              <button 
                key={tab.id} 
                onClick={() => setActiveTab(tab.id)} 
                className={`flex items-center gap-3 py-3.5 px-6 text-[10px] font-black rounded-[1.5rem] transition-all whitespace-nowrap uppercase tracking-widest relative group ${activeTab === tab.id ? 'text-slate-950' : 'text-slate-500 hover:text-white'}`}
              >
                {activeTab === tab.id && (
                  <motion.div 
                    layoutId="activeTabAdmin"
                    className="absolute inset-0 bg-cyan-500 rounded-[1.5rem] shadow-xl shadow-cyan-500/40"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-3">
                  {tab.icon}
                  {tab.label}
                </span>
                {activeTab === tab.id && (
                    <motion.div 
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-white rounded-full shadow-lg z-20 border-2 border-cyan-500"
                    />
                )}
              </button>
            ))}
        </div>
      </nav>
      
      {/* Viewport Container */}
      <main className="px-6 max-w-7xl mx-auto relative z-10">
          <AnimatePresence mode="wait">
            <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
            >
                {activeTab === 'dashboard' && <DashboardView summary={summaryData} admin={admin} />}
                {activeTab === 'winners' && <WinnersView bets={bets} games={games} users={users} dealers={dealers} />}
                {activeTab === 'liveBooking' && <LiveBookingView games={games} users={users} dealers={dealers} bets={bets} />}
                {activeTab === 'numberSummary' && <NumberSummaryView games={games} dealers={dealers} users={users} onPlaceAdminBets={onPlaceAdminBets} />}
                {activeTab === 'limits' && <NumberLimitsView />}
                {activeTab === 'settings' && <SystemSettingsForm admin={admin} onSave={onUpdateAdmin} />}
                {activeTab === 'history' && (
                  <div className="space-y-8">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                      <div className="space-y-1">
                        <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Financial Archive Nexus</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Protocol Ledger Access & Liquidity Management</p>
                      </div>
                      <div className="flex flex-wrap gap-4">
                        <motion.button 
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setIsTopUpModalOpen(true)} 
                          className="px-6 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] uppercase tracking-widest shadow-xl shadow-emerald-500/20 transition-all flex items-center gap-2"
                        >
                          <Icons.plus className="w-4 h-4" /> Inject Reserve
                        </motion.button>
                        <motion.button 
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setIsWithdrawalModalOpen(true)} 
                          className="px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[10px] uppercase tracking-widest shadow-xl shadow-amber-500/20 transition-all flex items-center gap-2"
                        >
                          <Icons.minus className="w-4 h-4" /> Liquidate Funds
                        </motion.button>
                        <motion.button 
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => { setViewingLedgerId(admin.id); setViewingLedgerType('admin'); }} 
                          className="px-6 py-3.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-[10px] uppercase tracking-widest shadow-xl shadow-sky-500/20 transition-all flex items-center gap-2"
                        >
                          <Icons.eye className="w-4 h-4" /> Root Ledger
                        </motion.button>
                      </div>
                    </div>

                    <div className="glass-morphism rounded-[2.5rem] overflow-hidden border border-white/5 shadow-2xl relative">
                      <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left min-w-[800px]">
                          <thead className="bg-slate-950/50 border-b border-white/5">
                            <tr>
                              <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Dealer Identification</th>
                              <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Region</th>
                              <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Pool Balance</th>
                              <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Audit Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {dealers.map((dealer, i) => (
                              <tr key={dealer.id} className="hover:bg-white/[0.02] transition-colors group">
                                <td className="p-6">
                                  <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-slate-900 border border-white/5 overflow-hidden shadow-lg group-hover:scale-110 transition-transform">
                                      {dealer.avatarUrl ? <img src={dealer.avatarUrl} alt={dealer.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-700 bg-white/5 font-black text-xs">{dealer.name[0]}</div>}
                                    </div>
                                    <div>
                                      <div className="text-xs font-black text-white tracking-tight">{dealer.name}</div>
                                      <div className="text-[9px] text-slate-500 font-mono font-bold uppercase tracking-widest">{dealer.id}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-6">
                                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{dealer.area || 'CORE SEC'}</div>
                                </td>
                                <td className="p-6 text-right font-mono text-cyan-400 font-black text-sm">Rs {dealer.wallet.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td className="p-6">
                                  <div className="flex justify-center">
                                    <button onClick={() => { setViewingLedgerId(dealer.id); setViewingLedgerType('dealer'); }} className="px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white font-black text-[10px] uppercase tracking-widest transition-all border border-white/10">Inspect Archive</button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'dealers' && (
                  <div className="space-y-8">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                      <div className="space-y-1">
                        <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Dealer Node Registry</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{sortedDealers.length} Active Operational Units</p>
                      </div>
                      <div className="flex w-full md:w-auto gap-4">
                        <div className="relative flex-grow md:w-64 group">
                          <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500 group-focus-within:text-cyan-500 transition-colors uppercase tracking-widest text-[8px]"><Icons.search className="w-3 h-3" /></span>
                          <input type="text" placeholder="Search Node Identity..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-slate-950/50 p-3.5 pl-10 rounded-2xl border border-white/5 focus:ring-2 focus:ring-cyan-500/50 text-white text-[10px] font-black uppercase tracking-widest transition-all placeholder:text-slate-700 shadow-inner" />
                        </div>
                        <motion.button 
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => { setSelectedDealer(undefined); setIsModalOpen(true); }} 
                          className="px-6 py-3.5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-[10px] uppercase tracking-widest shadow-xl shadow-cyan-500/20 transition-all flex items-center gap-2 whitespace-nowrap"
                        >
                          <Icons.plus className="w-4 h-4" /> Initialize Node
                        </motion.button>
                      </div>
                    </div>

                    <div className="glass-morphism rounded-[2.5rem] overflow-hidden border border-white/5 shadow-2xl relative">
                      <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left min-w-[1000px]">
                          <thead className="bg-slate-950/50 border-b border-white/5">
                            <tr>
                              <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Dealer Identity</th>
                              <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Operational Region</th>
                              <SortableHeader label="Pool Reserve" sortKey="wallet" currentSortKey={dealerSortKey} sortDirection={dealerSortDirection} onSort={handleDealerSort} />
                              <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Comm Rate</th>
                              <SortableHeader label="Protocol Status" sortKey="status" currentSortKey={dealerSortKey} sortDirection={dealerSortDirection} onSort={handleDealerSort} />
                              <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Admin Controls</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {sortedDealers.map(dealer => (
                              <tr key={dealer.id} className="hover:bg-white/[0.02] transition-colors group">
                                <td className="p-6">
                                  <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-white/5 overflow-hidden shadow-xl group-hover:scale-110 transition-transform">
                                      {dealer.avatarUrl ? <img src={dealer.avatarUrl} alt={dealer.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-700 bg-white/5"><Icons.user className="w-5 h-5" /></div>}
                                    </div>
                                    <div>
                                      <div className="text-sm font-black text-white tracking-tight">{dealer.name}</div>
                                      <div className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-widest">{dealer.id}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-6">
                                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{dealer.area || 'UNMAPPED SECTION'}</div>
                                </td>
                                <td className="p-6 font-mono text-cyan-400 font-black text-sm">Rs {dealer.wallet.toLocaleString()}</td>
                                <td className="p-6 text-center">
                                  <span className="text-xs font-black text-white bg-white/5 px-3 py-1 rounded-lg border border-white/5">{dealer.commissionRate}%</span>
                                </td>
                                <td className="p-6">
                                  <div className="flex justify-center">
                                    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.1em] ${dealer.isRestricted ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'}`}>
                                      <div className={`w-1 h-1 rounded-full ${dealer.isRestricted ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`} />
                                      {dealer.isRestricted ? 'Restricted' : 'Operational'}
                                    </span>
                                  </div>
                                </td>
                                  <td className="p-6">
                                  <div className="flex items-center justify-center gap-2">
                                    <button onClick={() => { setSelectedDealer(dealer); setIsModalOpen(true); }} className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all border border-white/5"><Icons.edit className="w-4 h-4" /></button>
                                    <button onClick={() => { setViewingLedgerId(dealer.id); setViewingLedgerType('dealer'); }} className="w-10 h-10 rounded-xl bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-400 flex items-center justify-center transition-all border border-emerald-500/10"><Icons.bookOpen className="w-4 h-4" /></button>
                                    <button onClick={() => toggleAccountRestriction(dealer.id, 'dealer')} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all border ${dealer.isRestricted ? 'bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-400 border-emerald-500/10' : 'bg-red-500/5 hover:bg-red-500/10 text-red-400 border-red-500/10'}`}>
                                      {dealer.isRestricted ? <Icons.checkCircle className="w-4 h-4" /> : <Icons.close className="w-4 h-4" />}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'games' && (
                  <div className="space-y-8">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                      <div className="space-y-1">
                        <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Market Control Matrix</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Winning Node Declaration Protocols</p>
                      </div>
                      <div className="px-4 py-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 animate-pulse">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        LIVE SYNC ESTABLISHED
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                      {games.map(game => {
                        const isAK = game.name === 'AK';
                        const isAKC = game.name === 'AKC';
                        const isSingleDigitGame = isAK || isAKC;
                        const isAKPending = isAK && game.winningNumber && game.winningNumber.endsWith('_');

                        return (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            key={game.id} 
                            className="glass-morphism p-8 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden group"
                          >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform" />
                            
                            <div className="flex items-center gap-4 mb-8">
                              <img src={game.logo} className="w-14 h-14 rounded-2xl object-cover shadow-2xl border border-white/10" alt={game.name} />
                              <div>
                                <h4 className="text-xl font-black text-white uppercase tracking-tighter">{game.name}</h4>
                                <div className="flex items-center gap-2 mt-1">
                                  <Icons.clock className="w-3 h-3 text-slate-500" />
                                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Draw: {game.drawTime}</span>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-6 relative z-10">
                              {game.winningNumber ? (
                                <div className="bg-slate-950/50 p-6 rounded-3xl border border-white/5">
                                  {game.payoutsApproved ? (
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">Audit Complete</p>
                                        <p className="text-4xl font-black font-mono text-white tracking-widest">{game.winningNumber}</p>
                                      </div>
                                      <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
                                        <Icons.checkCircle className="w-6 h-6" />
                                      </div>
                                    </div>
                                  ) : editingGame?.id === game.id ? (
                                    <div className="space-y-4">
                                      <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest">Node Re-calibration</p>
                                      <div className="flex gap-2">
                                        <input type="text" maxLength={isSingleDigitGame ? 1 : 2} value={editingGame.number} onChange={(e) => setEditingGame({...editingGame, number: e.target.value.replace(/\D/g, '')})} className="flex-grow bg-slate-950 p-4 border border-white/10 rounded-2xl text-center font-black text-2xl text-white font-mono focus:ring-2 focus:ring-cyan-500/50" />
                                        <button onClick={() => handleUpdateWinner(game.id, game.name)} className="px-6 rounded-2xl bg-emerald-500 text-slate-950 font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-500/20">Save</button>
                                      </div>
                                      <button onClick={() => setEditingGame(null)} className="w-full py-3 rounded-2xl bg-white/5 text-slate-500 font-black text-[10px] uppercase tracking-widest border border-white/5">Discard</button>
                                    </div>
                                  ) : (
                                    <div className="space-y-6">
                                      <div className="flex items-end justify-between">
                                        <div>
                                          <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-1">{isAKPending ? 'Open Vector Declared' : 'Verification Required'}</p>
                                          <p className="text-4xl font-black font-mono text-white tracking-widest">{game.winningNumber}</p>
                                        </div>
                                        <button onClick={() => setEditingGame({ id: game.id, number: isAK ? game.winningNumber!.slice(0, 1) : game.winningNumber! })} className="text-slate-500 hover:text-white transition-colors"><Icons.edit className="w-4 h-4" /></button>
                                      </div>
                                      {!isAKPending && (
                                        <motion.button 
                                          whileHover={{ scale: 1.02 }}
                                          whileTap={{ scale: 0.98 }}
                                          onClick={() => { if (window.confirm(`Commit Payout protocol for ${game.name}?`)) { approvePayouts(game.id); } }} 
                                          className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
                                        >
                                          <Icons.checkCircle className="w-4 h-4" />
                                          Liquidate Payouts
                                        </motion.button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="bg-slate-950/50 p-6 rounded-3xl border border-white/5 space-y-4">
                                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Declare Game Result</p>
                                  <div className="flex gap-2">
                                    <input type="text" maxLength={isSingleDigitGame ? 1 : 2} value={winningNumbers[game.id] || ''} onChange={(e) => setWinningNumbers({...winningNumbers, [game.id]: e.target.value.replace(/\D/g, '')})} className="flex-grow bg-slate-950 p-4 border border-white/10 rounded-2xl text-center font-black text-2xl text-white font-mono focus:ring-2 focus:ring-cyan-500/50" placeholder={isSingleDigitGame ? '0' : '00'} />
                                    <motion.button 
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                      onClick={() => handleDeclareWinner(game.id, game.name)} 
                                      className="px-6 rounded-2xl bg-cyan-500 text-slate-950 font-black text-[10px] uppercase tracking-widest shadow-lg shadow-cyan-500/20"
                                    >
                                      Commit
                                    </motion.button>
                                  </div>
                                </div>
                              )}

                              <div className="pt-6 border-t border-white/5 flex items-center justify-between">
                                <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Temporal Root</div>
                                {editingDrawTime?.gameId === game.id ? (
                                  <div className="flex items-center gap-2">
                                    <input type="time" value={editingDrawTime.time} onChange={(e) => setEditingDrawTime({ ...editingDrawTime, time: e.target.value })} className="bg-slate-950 text-white p-2 rounded-xl border border-white/10 text-[10px] font-bold" />
                                    <button onClick={async () => { try { await updateGameDrawTime(editingDrawTime.gameId, editingDrawTime.time); setEditingDrawTime(null); } catch (error: any) { alert(error.message); } }} className="text-emerald-400"><Icons.checkCircle className="w-4 h-4" /></button>
                                  </div>
                                ) : (
                                  <button disabled={!!game.winningNumber} onClick={() => setEditingDrawTime({ gameId: game.id, time: game.drawTime })} className="text-[10px] font-black text-slate-400 hover:text-white transition-all uppercase tracking-widest disabled:opacity-30 flex items-center gap-2">
                                    {game.drawTime} <Icons.edit className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {activeTab === 'bettingSheet' && (
                  <div className="space-y-8">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                      <div className="space-y-1">
                        <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Event Extraction Buffer</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Audit Specific Number Vectors</p>
                      </div>
                    </div>

                    <div className="glass-morphism p-8 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/5 blur-3xl rounded-full -mr-24 -mt-24" />
                      <div className="flex flex-col md:flex-row items-end gap-6 relative z-10 font-bold uppercase tracking-widest text-[10px]">
                        <div className="flex-grow space-y-4 w-full">
                          <label className="ml-1 text-slate-500">Number Search Key</label>
                          <div className="relative group">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500 group-focus-within:text-cyan-500 transition-colors"><Icons.search className="w-4 h-4" /></span>
                            <input type="text" placeholder="e.g. 42" value={betSearchQuery} onChange={(e) => setBetSearchQuery(e.target.value)} className="w-full bg-slate-950/50 p-4 pl-12 rounded-2xl border border-white/5 focus:ring-2 focus:ring-cyan-500/50 text-white text-xs font-bold transition-all shadow-inner" />
                          </div>
                        </div>
                        {searchSummary && (
                          <div className="flex-grow grid grid-cols-2 gap-4 w-full md:w-auto">
                            <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                              <p className="text-[8px] text-slate-600 mb-1">Volume</p>
                              <p className="text-xl font-black text-white font-mono">{searchSummary.count}</p>
                            </div>
                            <div className="bg-cyan-500/5 p-4 rounded-2xl border border-cyan-500/10">
                              <p className="text-[8px] text-cyan-600 mb-1">Exposure</p>
                              <p className="text-xl font-black text-cyan-400 font-mono">Rs {searchSummary.totalStake.toLocaleString()}</p>
                            </div>
                          </div>
                        )}
                        <button onClick={() => setBetSearchQuery('')} className="bg-white/5 hover:bg-white/10 text-white px-8 py-4 rounded-2xl border border-white/5 transition-all w-full md:w-auto">Purge Input</button>
                      </div>
                    </div>

                    <div className="glass-morphism rounded-[2.5rem] overflow-hidden border border-white/5 shadow-2xl relative">
                      <div className="overflow-x-auto custom-scrollbar max-h-[60vh]">
                        <table className="w-full text-left min-w-[800px]">
                          <thead className="bg-slate-950/50 border-b border-white/5 sticky top-0 backdrop-blur-xl z-20">
                            <tr>
                              <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Timestamp</th>
                              <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Origin Client</th>
                              <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Operational Dealer</th>
                              <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Market</th>
                              <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Target Num</th>
                              <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Stake Value</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {filteredBets.length > 0 ? filteredBets.map((bet, i) => (
                              <tr key={`${bet.betId}-${bet.number}`} className="hover:bg-white/[0.02] transition-colors group">
                                <td className="p-6 text-[10px] text-slate-500 font-mono group-hover:text-slate-300 uppercase">{bet.timestamp.toLocaleString()}</td>
                                <td className="p-6 font-black text-white text-xs">{bet.userName}</td>
                                <td className="p-6 text-slate-500 text-[10px] uppercase font-bold tracking-widest">{bet.dealerName}</td>
                                <td className="p-6 text-slate-300 text-xs font-bold uppercase tracking-tight">{bet.gameName}</td>
                                <td className="p-6 text-right font-mono text-cyan-400 text-lg font-black">{bet.number}</td>
                                <td className="p-6 text-right font-mono text-white font-black text-sm">Rs {bet.amount.toLocaleString()}</td>
                              </tr>
                            )) : (
                              <tr><td colSpan={6} className="p-24 text-center">
                                <div className="opacity-20 flex flex-col items-center gap-4">
                                  <Icons.search className="w-12 h-12 text-slate-500" />
                                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">{betSearchQuery ? 'No Vectors Found' : 'Awaiting Search Key'}</p>
                                </div>
                              </td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'users' && (
                  <div className="space-y-8">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                      <div className="space-y-1">
                        <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Client Interface Directory</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{sortedUsers.length} Authorized Network Participants</p>
                      </div>
                      <div className="relative w-full md:w-64 group">
                          <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500 group-focus-within:text-sky-500 transition-colors uppercase tracking-widest text-[8px]"><Icons.search className="w-3 h-3" /></span>
                          <input type="text" placeholder="Identify Client Node..." value={userSearchQuery} onChange={(e) => setUserSearchQuery(e.target.value)} className="w-full bg-slate-950/50 p-3.5 pl-10 rounded-2xl border border-white/5 focus:ring-2 focus:ring-sky-500/50 text-white text-[10px] font-black uppercase tracking-widest transition-all placeholder:text-slate-700 shadow-inner" />
                      </div>
                    </div>

                    <div className="glass-morphism rounded-[2.5rem] overflow-hidden border border-white/5 shadow-2xl relative">
                      <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left min-w-[1000px]">
                          <thead className="bg-slate-950/50 border-b border-white/5">
                            <tr>
                              <SortableHeader label="Client Identity" sortKey="name" currentSortKey={userSortKey} sortDirection={userSortDirection} onSort={handleUserSort} />
                              <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Origin Dealer</th>
                              <SortableHeader label="Available Reserve" sortKey="wallet" currentSortKey={userSortKey} sortDirection={userSortDirection} onSort={handleUserSort} />
                              <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Comm Rate</th>
                              <SortableHeader label="Access Protocol" sortKey="status" currentSortKey={userSortKey} sortDirection={userSortDirection} onSort={handleUserSort} />
                              <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Protocol Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {sortedUsers.map(user => (
                              <tr key={user.id} className="hover:bg-white/[0.02] transition-colors group">
                                <td className="p-6">
                                  <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-white/5 overflow-hidden shadow-xl group-hover:scale-110 transition-transform">
                                      {user.avatarUrl ? <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-700 bg-white/5"><Icons.user className="w-5 h-5" /></div>}
                                    </div>
                                    <div>
                                      <div className="text-sm font-black text-white tracking-tight">{user.name}</div>
                                      <div className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-widest">{user.id}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-6">
                                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{dealers.find(d => d.id === user.dealerId)?.name || 'UNKNOWN PARENT'}</div>
                                </td>
                                <td className="p-6 font-mono text-white font-black text-sm">Rs {user.wallet.toLocaleString()}</td>
                                <td className="p-6 text-center">
                                  <span className="text-xs font-black text-white bg-white/5 px-3 py-1 rounded-lg border border-white/5">{user.commissionRate}%</span>
                                </td>
                                <td className="p-6">
                                  <div className="flex justify-center">
                                    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.1em] ${user.isRestricted ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-sky-500/10 text-sky-500 border border-sky-500/20'}`}>
                                      <div className={`w-1 h-1 rounded-full ${user.isRestricted ? 'bg-red-500' : 'bg-sky-500 animate-pulse'}`} />
                                      {user.isRestricted ? 'Restricted' : 'Operational'}
                                    </span>
                                  </div>
                                </td>
                                <td className="p-6">
                                  <div className="flex items-center justify-center gap-2">
                                    <button onClick={() => { setSelectedUserToEdit(user); setIsUserEditModalOpen(true); }} className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all border border-white/5"><Icons.edit className="w-4 h-4" /></button>
                                    <button onClick={() => { setViewingLedgerId(user.id); setViewingLedgerType('user'); }} className="w-10 h-10 rounded-xl bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-400 flex items-center justify-center transition-all border border-emerald-500/10"><Icons.bookOpen className="w-4 h-4" /></button>
                                    <button onClick={() => toggleAccountRestriction(user.id, 'user')} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all border ${user.isRestricted ? 'bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-400 border-emerald-500/10' : 'bg-red-500/5 hover:bg-red-500/10 text-red-400 border-red-500/10'}`}>
                                      {user.isRestricted ? <Icons.checkCircle className="w-4 h-4" /> : <Icons.close className="w-4 h-4" />}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
            </motion.div>
          </AnimatePresence>
        </main>
      
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={selectedDealer ? "Edit Dealer" : "Create Dealer"}>
          <DealerForm dealer={selectedDealer} dealers={dealers} onSave={handleSaveDealer} onCancel={() => setIsModalOpen(false)} adminPrizeRates={admin.prizeRates} />
      </Modal>

      {/* Admin User Edit Modal */}
      <Modal isOpen={isUserEditModalOpen} onClose={() => setIsUserEditModalOpen(false)} title="Edit User Account" themeColor="sky">
          {selectedUserToEdit && (
              <UserForm 
                  user={selectedUserToEdit} 
                  users={users} 
                  onSave={handleAdminUserUpdate} 
                  onCancel={() => setIsUserEditModalOpen(false)} 
                  dealerPrizeRates={dealers.find(d => d.id === selectedUserToEdit.dealerId)?.prizeRates || admin.prizeRates} 
                  dealerId={selectedUserToEdit.dealerId} 
                  showToast={(m) => alert(m)} 
              />
          )}
      </Modal>

      <Modal isOpen={isTopUpModalOpen} onClose={() => setIsTopUpModalOpen(false)} title="Top-Up Dealer Wallet" themeColor="emerald">
          <DealerTransactionForm type="Top-Up" dealers={dealers} onTransaction={(dealerId, amount) => { topUpDealerWallet(dealerId, amount); setIsTopUpModalOpen(false); }} onCancel={() => setIsTopUpModalOpen(false)} />
      </Modal>

      <Modal isOpen={isWithdrawalModalOpen} onClose={() => setIsWithdrawalModalOpen(false)} title="Withdraw from Dealer Wallet" themeColor="amber">
          <DealerTransactionForm type="Withdrawal" dealers={dealers} onTransaction={(dealerId, amount) => { withdrawFromDealerWallet(dealerId, amount); setIsWithdrawalModalOpen(false); }} onCancel={() => setIsWithdrawalModalOpen(false)} />
      </Modal>

      {activeLedgerAccount && (
        <Modal isOpen={!!activeLedgerAccount} onClose={() => { setViewingLedgerId(null); setViewingLedgerType(null); }} title={`Ledger for ${activeLedgerAccount.name}`} size="xl">
            <StatefulLedgerTableWrapper entries={activeLedgerAccount.ledger} />
        </Modal>
      )}

    </div>
  );
};

export default AdminPanel;
