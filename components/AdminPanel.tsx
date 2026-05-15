import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Dealer, User, Game, PrizeRates, LedgerEntry, Bet, NumberLimit, SubGameType, Admin } from '../types';
import { Icons, GAME_LOGOS } from '../constants';
import { useAuth } from '../hooks/useAuth';
import { UserForm } from './DealerPanel';

interface FinancialSummary {
  games: {
    gameName: string;
    winningNumber: string;
    totalStake: number;
    totalPayouts: number;
    totalDealerProfit: number;
    totalCommissions: number;
    netProfit: number;
  }[];
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

const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: 'md' | 'lg' | 'xl'; themeColor?: string }> = ({ isOpen, onClose, title, children, size = 'md', themeColor = 'sky' }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/90 backdrop-blur-md flex justify-center items-center z-[100] p-6"
                    onClick={(e) => e.target === e.currentTarget && onClose()}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        className={`elite-card rounded-3xl w-full flex flex-col max-h-[90vh] overflow-hidden ${size === 'xl' ? 'max-w-5xl' : size === 'lg' ? 'max-w-3xl' : 'max-w-md'} border-${themeColor}-500/20 shadow-2xl shadow-${themeColor}-500/10`}
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

const LedgerTable: React.FC<{ entries: LedgerEntry[] }> = ({ entries }) => (
    <div className="elite-card rounded-[2.5rem] overflow-hidden glass-panel border-white/5 shadow-2xl">
        <div className="overflow-x-auto max-h-[35rem] no-scrollbar">
            <table className="w-full text-left">
                <thead className="sticky top-0 bg-[#0a0c10] z-20 border-b border-white/5 shadow-xl">
                    <tr>
                        <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Execution Time</th>
                        <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Activity Vector</th>
                        <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-right">Debit</th>
                        <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-right">Credit</th>
                        <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-right">Final Index</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {[...entries].reverse().map(entry => (
                        <tr key={entry.id} className="hover:bg-white/[0.03] group transition-all">
                            <td className="p-8">
                                <div className="text-[10px] font-mono text-slate-500">{entry.timestamp?.toLocaleDateString()}</div>
                                <div className="text-[11px] font-mono text-rose-500/60 font-bold">{entry.timestamp?.toLocaleTimeString()}</div>
                            </td>
                            <td className="p-8">
                                <div className="text-white font-black text-base tracking-tight font-display uppercase leading-tight italic">{entry.description}</div>
                                <div className="text-[9px] text-slate-600 font-bold uppercase tracking-widest mt-1">LOG_SUCCESS</div>
                            </td>
                            <td className="p-8 text-right text-rose-500 font-mono font-black italic text-lg">{entry.debit > 0 ? `-${entry.debit.toFixed(0)}` : '---'}</td>
                            <td className="p-8 text-right text-emerald-400 font-mono font-black italic text-lg">{entry.credit > 0 ? `+${entry.credit.toFixed(0)}` : '---'}</td>
                            <td className="p-8 text-right font-black text-white font-mono italic text-xl tracking-tighter">Rs {entry.balance.toLocaleString()}</td>
                        </tr>
                    ))}
                    {entries.length === 0 && (
                        <tr><td colSpan={5} className="p-20 text-center text-slate-500 text-[11px] font-black uppercase tracking-[0.5em] italic">Cipher Ledger Empty</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
);

const DashboardView: React.FC<{ summary: FinancialSummary | null; admin: Admin }> = ({ summary, admin }) => {
    if (!summary) return <div className="p-32 text-center text-slate-600 font-black text-[11px] uppercase tracking-[0.5em] animate-pulse italic">Scanning Global Economy Vectors...</div>;

    const cards = [
        { title: 'Global Reserve', value: admin.wallet, color: 'text-sky-400', sub: 'System Liquidity', icon: Icons.wallet, gradient: 'from-sky-500/10 to-transparent' },
        { title: 'Total Stake', value: summary.totals.totalStake, color: 'text-white', sub: 'Network Volume', icon: Icons.chartBar, gradient: 'from-white/5 to-transparent' },
        { title: 'Total Prize', value: summary.totals.totalPayouts, color: 'text-rose-400', sub: 'Yield Distribution', icon: Icons.star, gradient: 'from-rose-500/10 to-transparent' },
        { title: 'Net Harvest', value: summary.totals.netProfit, color: summary.totals.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-500', sub: 'Protocol Profit', icon: Icons.trendingUp, gradient: summary.totals.netProfit >= 0 ? 'from-emerald-500/10 to-transparent' : 'from-rose-500/10 to-transparent' },
    ];

    return (
        <div className="space-y-24 animate-in fade-in duration-1000">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {cards.map((c, i) => (
                    <motion.div 
                        key={i} 
                        initial={{ opacity: 0, y: 30 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        transition={{ delay: i * 0.1, ease: [0.23, 1, 0.32, 1] }} 
                        className={`elite-card p-10 rounded-[2.5rem] glass-panel relative overflow-hidden group border-white/5 shadow-2xl`}
                    >
                        <div className={`absolute inset-0 bg-gradient-to-br ${c.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                        <div className="absolute top-0 right-0 p-6 opacity-5 scale-150 group-hover:scale-125 transition-transform duration-700 blur-[1px]">{c.icon}</div>
                        <p className="text-[10px] text-slate-500 uppercase font-black tracking-[0.3em] mb-4 relative z-10">{c.title}</p>
                        <p className={`text-4xl font-black font-mono tracking-tighter italic ${c.color} relative z-10`}>Rs {c.value.toLocaleString(undefined, { minimumFractionDigits: 0 })}</p>
                        <div className="mt-6 flex items-center gap-3 relative z-10">
                            <div className="h-0.5 w-4 bg-white/10 rounded-full" />
                            <p className="text-[9px] text-slate-600 uppercase font-black tracking-[0.2em]">{c.sub}</p>
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="space-y-12">
                <div className="flex items-center gap-6">
                    <div className="h-10 w-1.5 bg-rose-500 rounded-full" />
                    <div>
                        <h3 className="text-3xl font-display font-black text-white uppercase tracking-tighter">Market Sector Diagnostics</h3>
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] mt-1">Real-time Node Performance Metrics</p>
                    </div>
                </div>
                <div className="elite-card rounded-[2.5rem] overflow-hidden glass-panel border-white/5 shadow-2xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-[#0a0c10] border-b border-white/5">
                                <tr>
                                    <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Sector Descriptor</th>
                                    <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-right">Gross Protocol Stake</th>
                                    <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-right">Yield Distribution</th>
                                    <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-right">Node Profit</th>
                                    <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-right">Core Net Harvest</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {summary.games.map((g, i) => (
                                    <tr key={i} className="group hover:bg-rose-500/[0.03] transition-all">
                                        <td className="p-8">
                                            <div className="flex items-center gap-6">
                                                <div className="relative">
                                                     <img src={GAME_LOGOS[g.gameName]} className="w-14 h-14 rounded-2xl border border-white/10 object-cover shadow-lg" alt="" />
                                                     <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-emerald-500 rounded-full border-2 border-[#0a0c10] shadow-glow" />
                                                </div>
                                                <div>
                                                    <div className="text-white font-black text-xl tracking-tight font-display italic uppercase group-hover:text-rose-400 transition-colors">{g.gameName}</div>
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <span className="text-[9px] text-slate-600 font-black tracking-widest uppercase">LAST_INDEX:</span>
                                                        <span className="text-[10px] text-rose-500/70 font-mono font-bold tracking-widest">{g.winningNumber || '---'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-8 text-right font-mono text-white text-xl font-black italic tracking-tighter">Rs {g.totalStake.toLocaleString()}</td>
                                        <td className="p-8 text-right font-mono text-rose-400 font-black italic text-lg">Rs {g.totalPayouts.toLocaleString()}</td>
                                        <td className="p-8 text-right font-mono text-emerald-400 font-black italic text-base">Rs {g.totalDealerProfit.toLocaleString()}</td>
                                        <td className="p-8 text-right font-mono text-sky-400 font-black italic text-2xl tracking-tighter">Rs {g.netProfit.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

const WinnersView: React.FC<{ bets: Bet[], games: Game[], users: User[], dealers: Dealer[] }> = ({ bets, games, users, dealers }) => {
    const [start, setStart] = useState(getTodayDateString());
    const [end, setEnd] = useState(getTodayDateString());
    const [q, setQ] = useState('');

    const records = useMemo(() => {
        const final: any[] = [];
        games.filter(g => g.winningNumber && !g.winningNumber.includes('_')).forEach(game => {
            bets.filter(b => b.gameId === game.id).forEach(bet => {
                const user = users.find(u => u.id === bet.userId);
                if (!user) return;
                const winNums = bet.numbers.filter(n => {
                    const w = game.winningNumber!;
                    if (bet.subGameType === SubGameType.OneDigitOpen) return w.length === 2 && n === w[0];
                    if (bet.subGameType === SubGameType.OneDigitClose) return (game.name === 'AKC' ? n === w : (w.length === 2 && n === w[1]));
                    return n === w;
                });
                if (winNums.length > 0) {
                    const rate = (bet.subGameType === SubGameType.OneDigitOpen ? user.prizeRates.oneDigitOpen : (bet.subGameType === SubGameType.OneDigitClose ? user.prizeRates.oneDigitClose : user.prizeRates.twoDigit));
                    final.push({
                        id: bet.id, time: bet.timestamp, user: user.name, dealer: dealers.find(d => d.id === bet.dealerId)?.name || 'N/A',
                        game: game.name, win: game.winningNumber, type: bet.subGameType, nums: winNums, stake: bet.totalAmount, prize: winNums.length * bet.amountPerNumber * rate, approved: !!game.payoutsApproved
                    });
                }
            });
        });
        return final.filter(r => {
            const dStr = r.time.toISOString().split('T')[0];
            return (!start || dStr >= start) && (!end || dStr <= end) && (!q || r.user.toLowerCase().includes(q.toLowerCase()) || r.game.toLowerCase().includes(q.toLowerCase()));
        }).sort((a,b) => b.time.getTime() - a.time.getTime());
    }, [bets, games, users, dealers, start, end, q]);

    return (
        <div className="space-y-12">
            <div className="flex flex-col lg:flex-row justify-between items-center gap-12">
                <div className="border-l-4 border-emerald-500 pl-8 space-y-2">
                    <h3 className="text-4xl font-display font-black text-white uppercase tracking-tighter">Winners Registry</h3>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Authorized Prize Distribution Sequence</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 bg-black/30 backdrop-blur-md p-3 rounded-[2rem] border border-white/5 flex-1 w-full max-w-3xl shadow-2xl">
                    <div className="flex-1 flex items-center px-4 border-r border-white/5">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mr-4">Range:</span>
                        <input type="date" value={start} onChange={e => setStart(e.target.value)} className="bg-transparent text-white p-2 text-xs font-mono outline-none flex-1" />
                        <span className="text-slate-700 px-2">/</span>
                        <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="bg-transparent text-white p-2 text-xs font-mono outline-none flex-1" />
                    </div>
                    <div className="flex-1 flex items-center px-4">
                        <span className="text-slate-500 mr-4 opacity-50">{Icons.search}</span>
                        <input type="text" placeholder="LOCATE NODE..." value={q} onChange={e => setQ(e.target.value)} className="bg-transparent text-white p-2 text-[10px] font-black uppercase tracking-[0.3em] outline-none flex-1" />
                    </div>
                </div>
            </div>

            <div className="elite-card rounded-[2.5rem] overflow-hidden glass-panel border-white/5 shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-[#0a0c10] border-b border-white/5">
                            <tr>
                                <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Temporal Mark</th>
                                <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Target Node</th>
                                <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Sector Hub</th>
                                <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Result Data</th>
                                <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-right">Yield Magnitude</th>
                                <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-center">Auth Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {records.map((r, i) => (
                                <tr key={i} className="hover:bg-emerald-500/[0.03] group transition-all">
                                    <td className="p-8 text-[10px] font-mono text-slate-600 group-hover:text-emerald-500/50 transition-colors">{r.time.toLocaleString()}</td>
                                    <td className="p-8">
                                        <div className="text-white font-black text-lg tracking-tight font-display uppercase italic">{r.user}</div>
                                        <div className="text-[9px] text-slate-600 font-black uppercase tracking-widest mt-1">UPLINK: {r.dealer}</div>
                                    </td>
                                    <td className="p-8">
                                        <div className="text-sky-400 font-black text-[11px] uppercase tracking-[0.2em]">{r.game}</div>
                                        <div className="text-[10px] text-slate-600 font-mono italic font-bold uppercase">{r.type}</div>
                                    </td>
                                    <td className="p-8">
                                        <div className="text-emerald-400 font-black text-3xl font-mono italic tracking-tighter">{r.win}</div>
                                        <div className="text-[9px] text-slate-600 uppercase font-black tracking-[0.2em] -mt-1">RESULT_VALID</div>
                                    </td>
                                    <td className="p-8 text-right">
                                        <div className="text-white font-black text-2xl font-mono tracking-tighter italic leading-none group-hover:text-emerald-400 transition-colors">Rs {r.prize.toLocaleString()}</div>
                                        <div className="text-[9px] text-slate-600 uppercase font-black tracking-[0.2em] mt-2">Initial Stake: Rs {r.stake.toLocaleString()}</div>
                                    </td>
                                    <td className="p-8 text-center">
                                        <span className={`text-[10px] font-black uppercase tracking-[0.2em] px-4 py-2 rounded-xl border ${r.approved ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-500'}`}>
                                            {r.approved ? 'AUTHORIZED' : 'PENDING'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {records.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-32 text-center text-slate-600 font-black text-[11px] uppercase tracking-[0.5em] italic">No Resolved Prize Vectors Detected</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const NumberSummaryView: React.FC<{ games: Game[], dealers: Dealer[], users: User[], onPlaceAdminBets: any }> = ({ games, dealers, users, onPlaceAdminBets }) => {
    const [filters, setFilters] = useState({ gameId: '', dealerId: '', date: getTodayDateString() });
    const [q, setQ] = useState('');
    const [summary, setSummary] = useState<any>(null);
    const { fetchWithAuth } = useAuth();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetch = async () => {
            if (!filters.date) return; setLoading(true);
            const p = new URLSearchParams(filters);
            try { const res = await fetchWithAuth(`/api/admin/number-summary?${p.toString()}`); setSummary(await res.json()); } catch (e) {} finally { setLoading(false); }
        };
        fetch(); const id = setInterval(fetch, 10000); return () => clearInterval(id);
    }, [filters, fetchWithAuth]);

    const filtered = useMemo(() => {
        if (!summary) return null;
        const logic = (n: string) => { const f = q.trim().replace(/[\^$]/g, ''); if (!f) return true; if (q.startsWith('^')) return n.startsWith(f); if (q.endsWith('$')) return n.endsWith(f); return n.includes(f); };
        return { twoDigit: summary.twoDigit.filter((x:any) => logic(x.number)), oneDigitOpen: summary.oneDigitOpen.filter((x:any) => logic(x.number)), oneDigitClose: summary.oneDigitClose.filter((x:any) => logic(x.number)) };
    }, [summary, q]);

    const Col = ({ title, data, color, icon }: any) => (
        <div className="elite-card p-10 rounded-[2.5rem] glass-panel space-y-8 border-white/5 shadow-2xl relative overflow-hidden group">
            <div className={`absolute top-0 right-0 p-8 opacity-5 scale-150 transition-transform group-hover:scale-125 ${color.replace('text-', 'text-')}`}>{icon}</div>
            <div className="flex justify-between items-end relative z-10">
                <div>
                   <h4 className={`text-[11px] font-black uppercase tracking-[0.3em] ${color}`}>{title}</h4>
                   <p className="text-[10px] text-slate-600 font-bold uppercase tracking-[0.2em] mt-1 italic">Active Manifest</p>
                </div>
                <span className="text-[10px] text-white/40 font-black font-mono tracking-widest">{data.length} UNITS</span>
            </div>
            <div className="divide-y divide-white/5 max-h-[40rem] overflow-y-auto no-scrollbar pr-2 relative z-10">
                {data.map((item: any, i: number) => (
                    <div key={i} className="py-5 flex justify-between items-center group/item transition-all hover:translate-x-2">
                        <span className={`text-4xl font-black font-mono tracking-tighter italic ${color} group-hover/item:scale-110 transition-transform`}>{item.number}</span>
                        <div className="text-right">
                            <div className="text-white font-black font-mono text-2xl tracking-tighter italic">Rs {item.stake.toLocaleString(undefined, { minimumFractionDigits: 0 })}</div>
                            <div className="text-[9px] text-slate-600 uppercase font-black tracking-[0.2em] mt-1">AGGREGATE_STAKE</div>
                        </div>
                    </div>
                ))}
                {data.length === 0 && <div className="py-20 text-center text-slate-700 font-black text-[10px] uppercase tracking-widest italic opacity-40">Zero Unit Allocation</div>}
            </div>
        </div>
    );

    return (
        <div className="space-y-16">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 bg-black/30 backdrop-blur-md p-3 rounded-[2.5rem] border border-white/5 shadow-2xl">
                <div className="flex items-center px-4 border-r border-white/5">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mr-4">Epoch:</span>
                    <input type="date" value={filters.date} onChange={e => setFilters(p => ({ ...p, date: e.target.value }))} className="bg-transparent text-white p-3 text-xs font-mono outline-none flex-1" />
                </div>
                <div className="border-r border-white/5">
                    <select value={filters.gameId} onChange={e => setFilters(p => ({ ...p, gameId: e.target.value }))} className="w-full bg-transparent text-white p-3 text-[10px] font-black uppercase tracking-widest outline-none appearance-none cursor-pointer"><option value="">ALL DOMAINS</option>{games.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
                </div>
                <div className="border-r border-white/5">
                    <select value={filters.dealerId} onChange={e => setFilters(p => ({ ...p, dealerId: e.target.value }))} className="w-full bg-transparent text-white p-3 text-[10px] font-black uppercase tracking-widest outline-none appearance-none cursor-pointer"><option value="">ALL NODES</option>{dealers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
                </div>
                <div className="flex items-center px-4">
                    <span className="text-slate-500 mr-4 opacity-50">{Icons.search}</span>
                    <input type="text" placeholder="FILTER INDICES..." value={q} onChange={e => setQ(e.target.value)} className="w-full bg-transparent text-white p-3 text-[10px] font-black uppercase tracking-[0.3em] outline-none" />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                {filtered ? (
                    <>
                        <Col title="2-Digit Manifest" data={filtered.twoDigit} color="text-sky-400" icon={Icons.chartBar} />
                        <Col title="Open Gate Manifest" data={filtered.oneDigitOpen} color="text-amber-400" icon={Icons.sparkles} />
                        <Col title="Close Gate Manifest" data={filtered.oneDigitClose} color="text-rose-400" icon={Icons.history} />
                    </>
                ) : (
                    <div className="col-span-3 p-40 text-center text-slate-600 font-black text-[11px] uppercase tracking-[0.5em] animate-pulse italic">Syncing Cryptographic Summaries...</div>
                )}
            </div>
        </div>
    );
};

const AdminPanel: React.FC<AdminPanelProps> = (props) => {
    const { admin, dealers, games, bets, users, onSaveDealer, onUpdateAdmin, declareWinner, approvePayouts, topUpDealerWallet, withdrawFromDealerWallet, toggleAccountRestriction, updateGameDrawTime, onRefreshData } = props;
    const [activeTab, setActiveTab] = useState('dashboard');
    const [q, setQ] = useState('');
    const [vLedgerId, setVLedgerId] = useState<string | null>(null);
    const [vLedgerType, setVLedgerType] = useState<'dealer' | 'admin' | 'user' | null>(null);
    const [summaryData, setSummaryData] = useState<FinancialSummary | null>(null);
    const [isDealerModalOpen, setIsDealerModalOpen] = useState(false);
    const [selDealer, setSelDealer] = useState<Dealer | undefined>(undefined);
    const [winners, setWinners] = useState<{[key: string]: string}>({});
    const { logout, fetchWithAuth } = useAuth();
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleManualRefresh = async () => {
        setIsRefreshing(true);
        if (onRefreshData) await onRefreshData();
        // Force re-fetch summary if on dashboard
        if (activeTab === 'dashboard') {
            try { const res = await fetchWithAuth('/api/admin/summary'); setSummaryData(await res.json()); } catch (e) {}
        }
        setTimeout(() => setIsRefreshing(false), 1000);
    };

    useEffect(() => {
        const fetch = async () => { if (activeTab === 'dashboard') { try { const res = await fetchWithAuth('/api/admin/summary'); setSummaryData(await res.json()); } catch (e) {} } };
        fetch();
    }, [activeTab, fetchWithAuth]);

    const activeLedgerAccount = useMemo(() => {
        if (!vLedgerId || !vLedgerType) return null;
        if (vLedgerType === 'admin') return admin;
        if (vLedgerType === 'dealer') return dealers.find(d => d.id === vLedgerId);
        if (vLedgerType === 'user') return users.find(u => u.id === vLedgerId);
        return null;
    }, [vLedgerId, vLedgerType, admin, dealers, users]);

    const tabs = [
        { id: 'dashboard', label: 'Monitor', icon: Icons.chartBar },
        { id: 'dealers', label: 'Nodes', icon: Icons.userGroup }, 
        { id: 'users', label: 'Identity', icon: Icons.clipboardList },
        { id: 'games', label: 'Markets', icon: Icons.gamepad },
        { id: 'winners', label: 'Winners', icon: Icons.star },
        { id: 'liveBooking', label: 'Live Trace', icon: Icons.sparkles },
        { id: 'numberSummary', label: 'Manifests', icon: Icons.chartBar },
        { id: 'settings', label: 'Global', icon: Icons.settings },
    ];

    return (
        <div className="max-w-7xl mx-auto px-8 py-16 md:py-24 relative z-10">
            <motion.div 
                initial={{ opacity: 0, y: 30 }} 
                animate={{ opacity: 1, y: 0 }} 
                className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-24 gap-12"
            >
                <div className="space-y-6">
                    <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shadow-glow shadow-rose-500" />
                        <span className="text-[10px] font-black text-rose-400 uppercase tracking-[0.4em]">Master Protocol Override Active</span>
                    </div>
                    <div className="border-l-4 border-rose-600 pl-8">
                        <h2 className="text-5xl md:text-8xl font-display font-black text-white tracking-tighter uppercase leading-[0.85] mb-4">
                            Command <br />
                            <span className="text-rose-500">Authority</span>
                        </h2>
                        <div className="flex items-center gap-6 mt-2">
                             <p className="text-slate-500 font-bold uppercase tracking-[0.4em] text-[10px]">Superuser ID: <span className="text-rose-500">{admin.name}</span></p>
                             <button onClick={logout} className="p-2 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all shadow-xl">{Icons.close}</button>
                        </div>
                    </div>
                </div>

                <div className="bg-black/30 backdrop-blur-md p-2 rounded-[2.5rem] border border-white/5 flex gap-2 overflow-x-auto no-scrollbar shadow-2xl">
                    {tabs.map(t => (
                        <button 
                            key={t.id} 
                            onClick={() => setActiveTab(t.id)} 
                            className={`flex items-center gap-3 px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all whitespace-nowrap ${activeTab === t.id ? 'bg-rose-600 text-white shadow-xl shadow-rose-500/20' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
                        >
                            <span className="opacity-60">{t.icon}</span>
                            {t.label}
                        </button>
                    ))}
                </div>
            </motion.div>

            {activeTab === 'dealers' && (
                <div className="space-y-16 animate-in fade-in duration-1000">
                    <div className="flex flex-col lg:flex-row justify-between items-center gap-8">
                        <div className="relative flex-1 w-full lg:max-w-xl group">
                            <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 group-hover:text-rose-500 transition-colors">{Icons.search}</span>
                            <input 
                                type="text" 
                                placeholder="Locate Proxy Node..." 
                                value={q} 
                                onChange={e => setQ(e.target.value)} 
                                className="w-full bg-black/30 backdrop-blur-md border border-white/5 rounded-[2rem] pl-16 pr-8 py-5 text-white font-black text-[11px] uppercase tracking-[0.3em] focus:border-rose-500/50 outline-none transition-all shadow-2xl" 
                            />
                        </div>
                        <button 
                            onClick={() => { setSelDealer(undefined); setIsDealerModalOpen(true); }} 
                            className="w-full lg:w-auto px-12 py-5 bg-rose-600 shadow-2xl shadow-rose-500/30 text-white font-black rounded-2xl tracking-[0.4em] uppercase text-[11px] hover:bg-rose-500 active:scale-95 transition-all flex items-center justify-center gap-3"
                        >
                            <span className="text-lg leading-none">+</span>
                            New Node Relay
                        </button>
                    </div>
                    <div className="elite-card rounded-[2.5rem] overflow-hidden glass-panel border-white/5 shadow-2xl">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-[#0a0c10] border-b border-white/5">
                                    <tr>
                                        <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Node Descriptor</th>
                                        <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Sector Hub</th>
                                        <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-right">Liquidity</th>
                                        <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-center">Protocol Rate</th>
                                        <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-center">Auth Status</th>
                                        <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-right">Commands</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {dealers.filter(d => d.name.toLowerCase().includes(q.toLowerCase()) || d.id.toLowerCase().includes(q.toLowerCase())).map(d => (
                                        <tr key={d.id} className="hover:bg-rose-500/[0.03] group transition-all">
                                            <td className="p-8">
                                                <div className="flex items-center gap-6">
                                                    <div className="relative">
                                                        <div className="w-14 h-14 rounded-2xl bg-slate-800/50 border border-white/10 flex items-center justify-center text-slate-500 group-hover:text-rose-500 transition-colors shadow-lg">
                                                            {d.avatarUrl ? <img src={d.avatarUrl} className="w-full h-full rounded-2xl object-cover" /> : Icons.user}
                                                        </div>
                                                        <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-rose-500 rounded-full border-2 border-[#0a0c10] shadow-glow" />
                                                    </div>
                                                    <div>
                                                        <div className="text-white font-black text-xl tracking-tight font-display italic uppercase group-hover:text-rose-400 transition-colors">{d.name}</div>
                                                        <div className="flex items-center gap-2 mt-2">
                                                            <span className="text-[10px] text-slate-600 font-black tracking-widest uppercase">PROXY_ID:</span>
                                                            <span className="text-[10px] text-rose-500/70 font-mono font-bold tracking-widest uppercase">{d.id}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-8">
                                                <div className="text-slate-300 font-bold text-sm tracking-tight italic uppercase">{d.area}</div>
                                                <div className="text-[10px] text-slate-500 font-mono tracking-widest uppercase mt-1.5">{d.contact}</div>
                                            </td>
                                            <td className="p-8 text-right font-mono">
                                                <div className="text-emerald-400 font-black text-2xl tracking-tighter italic">Rs {d.wallet.toLocaleString()}</div>
                                                <div className="text-[9px] text-slate-600 uppercase font-black tracking-[0.2em] mt-1">AVAILABLE RESERVE</div>
                                            </td>
                                            <td className="p-8 text-center font-black text-white font-mono italic text-lg">{d.commissionRate}%</td>
                                            <td className="p-8 text-center">
                                                <span className={`text-[10px] font-black uppercase tracking-[0.2em] px-4 py-2 rounded-xl border ${d.isRestricted ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'}`}>
                                                    {d.isRestricted ? 'LOCKED' : 'VERIFIED'}
                                                </span>
                                            </td>
                                            <td className="p-8 text-right space-x-6">
                                                <button onClick={() => { setSelDealer(d); setIsDealerModalOpen(true); }} className="text-[10px] font-black text-sky-500 uppercase tracking-widest hover:text-white transition-colors border-b border-sky-500/20 pb-1">Config</button>
                                                <button onClick={() => { setVLedgerId(d.id); setVLedgerType('dealer'); }} className="text-[10px] font-black text-emerald-400 uppercase tracking-widest hover:text-white transition-colors border-b border-emerald-500/20 pb-1">Audit</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'users' && (
                <div className="space-y-10 animate-in slide-in-from-bottom duration-700">
                    <div className="flex flex-col lg:flex-row justify-between items-center gap-8">
                        <div className="border-l-4 border-sky-500 pl-8 space-y-2">
                             <h3 className="text-4xl font-display font-black text-white uppercase tracking-tighter">Identity Oracle</h3>
                             <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em]">Global Unified Node Directory</p>
                        </div>
                        <div className="relative flex-1 w-full lg:max-w-xl group">
                            <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 group-hover:text-sky-500 transition-colors">{Icons.search}</span>
                            <input 
                                type="text" 
                                placeholder="Trace Terminal ID..." 
                                value={q} 
                                onChange={e => setQ(e.target.value)} 
                                className="w-full bg-black/30 backdrop-blur-md border border-white/5 rounded-[2rem] pl-16 pr-8 py-5 text-white font-black text-[11px] uppercase tracking-[0.3em] focus:border-sky-500/50 outline-none transition-all shadow-2xl" 
                            />
                        </div>
                    </div>
                    <div className="elite-card rounded-[2.5rem] overflow-hidden glass-panel border-white/5 shadow-2xl">
                        <div className="overflow-x-auto max-h-[50rem] no-scrollbar">
                           <table className="w-full text-left">
                               <thead className="sticky top-0 bg-[#0a0c10] border-b border-white/5 z-20">
                                   <tr>
                                       <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Identity Hub</th>
                                       <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Relay Descriptor</th>
                                       <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-right">Liquidity</th>
                                       <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-center">Status</th>
                                       <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-right">Trace</th>
                                   </tr>
                               </thead>
                               <tbody className="divide-y divide-white/5">
                                   {users.filter(u => u.name.toLowerCase().includes(q.toLowerCase()) || u.id.toLowerCase().includes(q.toLowerCase()) || u.dealerId.toLowerCase().includes(q.toLowerCase())).map(u => (
                                       <tr key={u.id} className="hover:bg-sky-500/[0.03] group transition-all">
                                           <td className="p-8">
                                                <div className="flex items-center gap-6">
                                                     <div className="w-12 h-12 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center text-sky-400/50 font-black text-xs ring-4 ring-sky-500/5">{u.name[0]}</div>
                                                     <div>
                                                         <div className="text-white font-black text-lg tracking-tight font-display uppercase italic group-hover:text-sky-400 transition-colors">{u.name}</div>
                                                         <div className="text-[10px] text-slate-600 font-mono font-bold tracking-widest mt-1 uppercase">{u.id}</div>
                                                     </div>
                                                </div>
                                           </td>
                                           <td className="p-8">
                                               <div className="text-slate-400 font-black text-[11px] uppercase tracking-widest">RELAY: {u.dealerId}</div>
                                               <div className="text-[10px] text-slate-600 font-mono tracking-widest uppercase mt-1">{u.area}</div>
                                           </td>
                                           <td className="p-8 text-right font-mono">
                                               <div className="text-sky-400 font-black text-xl tracking-tighter italic">Rs {u.wallet.toLocaleString()}</div>
                                           </td>
                                           <td className="p-8 text-center">
                                               <span className={`text-[10px] font-black uppercase tracking-[0.2em] px-4 py-2 rounded-xl border ${u.isRestricted ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' : 'bg-sky-500/10 border-sky-500/20 text-sky-400'}`}>
                                                   {u.isRestricted ? 'LOCKED' : 'NOMINAL'}
                                               </span>
                                           </td>
                                           <td className="p-8 text-right">
                                               <button onClick={() => { setVLedgerId(u.id); setVLedgerType('user'); }} className="text-[10px] font-black text-sky-500 uppercase tracking-widest hover:text-white transition-colors border-b border-sky-500/20 pb-1">Audit Trace</button>
                                           </td>
                                       </tr>
                                   ))}
                               </tbody>
                           </table>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'liveBooking' && (
                <div className="space-y-12 animate-in zoom-in-95 duration-1000">
                    <div className="flex items-center gap-6">
                        <div className="h-10 w-1.5 bg-rose-500 rounded-full animate-pulse shadow-glow" />
                        <div>
                             <h3 className="text-4xl font-display font-black text-white uppercase tracking-tighter">Live Circuit Trace</h3>
                             <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] mt-1">Real-time Bitstream Monitoring</p>
                        </div>
                    </div>
                    <div className="elite-card rounded-[2.5rem] overflow-hidden glass-panel border-white/5 shadow-2xl">
                         <div className="overflow-x-auto max-h-[60rem] no-scrollbar">
                             <table className="w-full text-left">
                                 <thead className="sticky top-0 bg-[#0a0c10] border-b border-white/5 z-20">
                                     <tr>
                                         <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Temporal Delta</th>
                                         <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Packet Source</th>
                                         <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Domain / Vector</th>
                                         <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-right">Magnitude</th>
                                     </tr>
                                 </thead>
                                 <tbody className="divide-y divide-white/5">
                                     {[...bets].sort((a,b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 100).map((b, i) => {
                                         const g = games.find(x => x.id === b.gameId);
                                         const u = users.find(x => x.id === b.userId);
                                         return (
                                             <tr key={i} className="hover:bg-rose-500/[0.03] group transition-all">
                                                 <td className="p-8">
                                                      <div className="text-[10px] font-mono text-slate-600 font-bold uppercase tracking-widest">{b.timestamp.toLocaleTimeString()}</div>
                                                 </td>
                                                 <td className="p-8">
                                                      <div className="text-white font-black text-lg font-display uppercase italic">{u?.name || 'UNKNOWN'}</div>
                                                      <div className="text-[9px] text-slate-600 font-black uppercase tracking-widest mt-1">HUB: {b.dealerId}</div>
                                                 </td>
                                                 <td className="p-8">
                                                      <div className="text-rose-500 font-black text-[11px] uppercase tracking-[0.2em]">{g?.name || 'N/A'}</div>
                                                      <div className="text-[10px] text-slate-500 font-mono italic font-bold mt-1">{b.subGameType} / {b.numbers.join(', ')}</div>
                                                 </td>
                                                 <td className="p-8 text-right">
                                                      <div className="text-white font-black text-2xl font-mono tracking-tighter italic">Rs {b.totalAmount.toLocaleString()}</div>
                                                 </td>
                                             </tr>
                                         );
                                     })}
                                     {bets.length === 0 && <tr><td colSpan={4} className="p-40 text-center text-slate-700 font-black text-[11px] uppercase tracking-[0.5em] italic">No Active Signal Detected</td></tr>}
                                 </tbody>
                             </table>
                         </div>
                    </div>
                </div>
            )}

            {activeTab === 'games' && (
                <div className="space-y-16 animate-in fade-in duration-1000">
                     <div className="flex justify-between items-center">
                        <div className="border-l-4 border-sky-500 pl-8 space-y-2">
                             <h3 className="text-4xl font-display font-black text-white uppercase tracking-tighter">Market Vector Control</h3>
                             <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em]">Autonomous Gateway Management</p>
                        </div>
                        <button onClick={handleManualRefresh} className="p-6 rounded-2xl bg-white/5 border border-white/5 text-slate-500 hover:text-white transition-all shadow-xl active:scale-90">
                            <div className={isRefreshing ? 'animate-spin' : ''}>{Icons.refresh}</div>
                        </button>
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
                        {games.map(g => (
                            <div key={g.id} className="elite-card p-12 rounded-[3.5rem] glass-panel space-y-10 relative overflow-hidden group shadow-2xl border-white/5">
                                <div className="absolute top-0 right-0 p-10 opacity-5 scale-150 group-hover:scale-125 transition-transform duration-700 blur-[1px]">{Icons.terminal}</div>
                                <div className="flex items-center gap-8 relative z-10">
                                    <div className="relative">
                                        <img src={GAME_LOGOS[g.name]} className="w-20 h-20 rounded-3xl border border-white/10 shadow-2xl object-cover" alt="" />
                                        <div className={`absolute -top-2 -right-2 w-5 h-5 rounded-full border-4 border-[#0a0c10] shadow-glow ${g.isMarketOpen ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                    </div>
                                    <div>
                                        <h4 className="text-3xl font-display font-black text-white uppercase tracking-tighter italic">{g.name}</h4>
                                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] mt-2">GATE_DRAW @ {formatTime12h(g.drawTime)}</p>
                                    </div>
                                </div>
                                {g.winningNumber ? (
                                    <div className="relative z-10 px-8 py-10 bg-black/40 rounded-[2.5rem] border border-white/5 space-y-6 text-center transform transition-all group-hover:scale-[1.02] shadow-inner">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.4em]">Authorized Result</p>
                                            <p className="text-7xl font-black text-white font-mono tracking-widest italic drop-shadow-glow">
                                                {g.winningNumber.split('').map((char, i) => (
                                                    <span key={i} className={i % 2 === 0 ? 'text-white' : 'text-emerald-500'}>{char}</span>
                                                ))}
                                            </p>
                                        </div>
                                        <div className="flex flex-col gap-4 items-center">
                                            <span className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] border ${g.payoutsApproved ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-500'}`}>
                                                {g.payoutsApproved ? 'AUDIT_COMPLETE' : 'PENDING_FINALIZATION'}
                                            </span>
                                            {!g.payoutsApproved && (
                                                <button 
                                                    onClick={() => approvePayouts(g.id)} 
                                                    className="w-full py-5 bg-emerald-600 text-white font-black rounded-2xl tracking-[0.4em] uppercase text-[11px] shadow-2xl shadow-emerald-500/20 hover:bg-emerald-500 active:scale-95 transition-all"
                                                >
                                                    FINALIZE PAYOUTS
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-8 relative z-10">
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center px-1">
                                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Input Protocol</label>
                                                <span className="text-[8px] text-slate-700 font-mono uppercase tracking-[0.2em] italic underline decoration-rose-500/30 underline-offset-4">Double Verification Required</span>
                                            </div>
                                            <input 
                                                type="text" 
                                                maxLength={2} 
                                                value={winners[g.id] || ''} 
                                                onChange={e => setWinners({...winners, [g.id]: e.target.value.replace(/\D/g, '')})} 
                                                className="w-full bg-black/60 border border-white/5 rounded-[2rem] p-8 text-6xl text-center font-black text-white font-mono outline-none focus:border-rose-500/50 shadow-inner group-hover:bg-black/80 transition-all placeholder:text-white/5" 
                                                placeholder="--" 
                                            />
                                        </div>
                                        <button 
                                            onClick={() => declareWinner(g.id, winners[g.id])} 
                                            disabled={!winners[g.id] || winners[g.id].length < 2}
                                            className="w-full py-6 bg-sky-600 disabled:opacity-20 text-white font-black rounded-[1.5rem] tracking-[0.5em] uppercase text-[12px] shadow-2xl shadow-sky-500/30 hover:bg-sky-500 active:scale-95 transition-all relative overflow-hidden"
                                        >
                                            AUTHORIZE SECTOR
                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-shimmer" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                     </div>
                </div>
            )}

            {activeTab === 'settings' && (
                <div className="max-w-4xl mx-auto space-y-16 animate-in slide-in-from-top duration-1000">
                    <div className="flex items-center gap-6 justify-center">
                        <div className="h-0.5 w-12 bg-rose-500" />
                        <h3 className="text-3xl font-display font-black text-white uppercase tracking-[0.2em]">Global Protocol Strategy</h3>
                        <div className="h-0.5 w-12 bg-rose-500" />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                        <div className="elite-card p-12 rounded-[3.5rem] glass-panel border border-white/5 shadow-2xl flex flex-col justify-between group">
                            <div className="space-y-6">
                                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.4em] bg-emerald-400/5 px-4 py-2 rounded-full border border-emerald-400/10">Financial Integrity</span>
                                <h4 className="text-2xl font-display font-black text-white uppercase tracking-tighter mt-4">Master Ledger Asset</h4>
                                <p className="text-slate-500 font-bold text-xs uppercase tracking-widest italic opacity-60">Consolidated System Reserves of Global Exchange Protocol</p>
                            </div>
                            <div className="mt-16 bg-black/40 rounded-[2.5rem] p-10 border border-white/5 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-8 opacity-5 scale-150 text-emerald-400">{Icons.wallet}</div>
                                <div className="relative z-10">
                                    <p className="text-[9px] text-slate-500 uppercase font-black tracking-widest mb-2">Total Unified Liquidity</p>
                                    <p className="text-6xl font-black font-mono text-emerald-400 italic tracking-tighter drop-shadow-glow">Rs {admin.wallet.toLocaleString()}</p>
                                </div>
                                <button 
                                    onClick={() => { setVLedgerId(admin.id); setVLedgerType('admin'); }} 
                                    className="absolute bottom-10 right-10 text-[10px] font-black text-sky-500 uppercase tracking-[0.2em] hover:text-white transition-colors border-b border-sky-500/20 pb-1"
                                >
                                    Audit Manifest
                                </button>
                            </div>
                        </div>

                        <div className="elite-card p-12 rounded-[3.5rem] glass-panel border border-white/5 shadow-2xl space-y-12">
                            <div className="space-y-6">
                                <span className="text-[10px] font-black text-rose-500 uppercase tracking-[0.4em] bg-rose-500/5 px-4 py-2 rounded-full border border-rose-500/10">Critical Override</span>
                                <h4 className="text-2xl font-display font-black text-white uppercase tracking-tighter mt-4">Manual Disconnect</h4>
                                <p className="text-slate-500 font-bold text-xs uppercase tracking-widest italic opacity-60">Instant Protocol Termination & Session Nullification</p>
                            </div>
                            <div className="space-y-6 pt-10">
                                <button className="w-full py-6 bg-rose-600 text-white font-black rounded-3xl tracking-[0.5em] uppercase text-[12px] shadow-2xl shadow-rose-500/30 hover:bg-rose-500 active:scale-95 transition-all outline-none">
                                    EXECUTE SESSION WIPE
                                </button>
                                <p className="text-[8px] text-rose-500/50 text-center font-black uppercase tracking-[0.3em]">Warning: This action triggers global logout across all active nodes.</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <Modal isOpen={isDealerModalOpen} onClose={() => setIsDealerModalOpen(false)} title="Node Synchronization" themeColor="rose">
                <DealerForm dealer={selDealer} dealers={dealers} onSave={async (d, o) => { await onSaveDealer(d, o); setIsDealerModalOpen(false); }} onCancel={() => setIsDealerModalOpen(false)} adminPrizeRates={admin.prizeRates} />
            </Modal>
            {activeLedgerAccount && (
                <Modal isOpen={!!vLedgerId} onClose={() => setVLedgerId(null)} title={`Audit Trace: ${activeLedgerAccount.name || 'Admin'}`} size="xl" themeColor="sky">
                    <LedgerTable entries={activeLedgerAccount.ledger} />
                </Modal>
            )}
        </div>
    );
};

const formatTime12h = (t: string) => { const [h, m] = t.split(':').map(Number); const am = h >= 12 ? 'PM' : 'AM'; const h12 = h % 12 || 12; return `${String(h12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${am}`; };

export default AdminPanel;

interface FinancialSummary {
  games: any[];
  totals: any;
  totalBets: number;
}

interface AdminPanelProps {
  admin: Admin; dealers: Dealer[]; onSaveDealer: any; onUpdateAdmin: any; users: User[]; setUsers: any; games: Game[]; bets: Bet[]; declareWinner: any; updateWinner: any; approvePayouts: any; topUpDealerWallet: any; withdrawFromDealerWallet: any; toggleAccountRestriction: any; onPlaceAdminBets: any; updateGameDrawTime: any; onRefreshData?: any;
}

interface DealerFormProps { dealer?: Dealer; dealers: Dealer[]; onSave: any; onCancel: any; adminPrizeRates: PrizeRates; }
const DealerForm: React.FC<DealerFormProps> = ({ dealer, dealers, onSave, onCancel, adminPrizeRates }) => {
    const [d, setD] = useState({ id: dealer?.id || '', name: dealer?.name || '', pass: '', area: dealer?.area || '', contact: dealer?.contact || '', comm: (dealer?.commissionRate || 0).toString(), rates: { oneDigitOpen: (dealer?.prizeRates?.oneDigitOpen || adminPrizeRates.oneDigitOpen).toString(), oneDigitClose: (dealer?.prizeRates?.oneDigitClose || adminPrizeRates.oneDigitClose).toString(), twoDigit: (dealer?.prizeRates?.twoDigit || adminPrizeRates.twoDigit).toString() }, wallet: (dealer?.wallet || 0).toString() });
    const inCls = "w-full bg-black/40 border border-white/10 p-4 rounded-xl text-white text-sm focus:border-rose-500/50 outline-none";
    const labCls = "block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-widest ml-1";
    return (
        <form onSubmit={e => { e.preventDefault(); onSave({...dealer, id: d.id, name: d.name, password: d.pass || dealer?.password, area: d.area, contact: d.contact, wallet: Number(d.wallet), commissionRate: Number(d.comm), prizeRates: { oneDigitOpen: Number(d.rates.oneDigitOpen), oneDigitClose: Number(d.rates.oneDigitClose), twoDigit: Number(d.rates.twoDigit) }, ledger: [] }, dealer?.id); }} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
                <div><label className={labCls}>ID</label><input value={d.id} onChange={e => setD({...d, id: e.target.value})} className={inCls} disabled={!!dealer} /></div>
                <div><label className={labCls}>NAME</label><input value={d.name} onChange={e => setD({...d, name: e.target.value})} className={inCls} /></div>
                <div className="col-span-2"><label className={labCls}>SECRET KEY</label><input type="password" value={d.pass} onChange={e => setD({...d, pass: e.target.value})} className={inCls} placeholder={dealer ? "UNCHANGED IF EMPTY" : ""} /></div>
                <div><label className={labCls}>AREA</label><input value={d.area} onChange={e => setD({...d, area: e.target.value})} className={inCls} /></div>
                <div><label className={labCls}>CONTACT</label><input value={d.contact} onChange={e => setD({...d, contact: e.target.value})} className={inCls} /></div>
                <div><label className={labCls}>COMM %</label><input value={d.comm} onChange={e => setD({...d, comm: e.target.value})} className={inCls} /></div>
                <div><label className={labCls}>LIQUIDITY</label><input value={d.wallet} onChange={e => setD({...d, wallet: e.target.value})} className={inCls} disabled={!!dealer} /></div>
            </div>
            <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl grid grid-cols-3 gap-4">
                 <div className="col-span-3 text-[10px] font-black text-rose-400 uppercase tracking-widest mb-2">Payout Config</div>
                 <div><label className={labCls}>2D</label><input value={d.rates.twoDigit} onChange={e => setD({...d, rates: {...d.rates, twoDigit: e.target.value}})} className={inCls} /></div>
                 <div><label className={labCls}>OPEN</label><input value={d.rates.oneDigitOpen} onChange={e => setD({...d, rates: {...d.rates, oneDigitOpen: e.target.value}})} className={inCls} /></div>
                 <div><label className={labCls}>CLOSE</label><input value={d.rates.oneDigitClose} onChange={e => setD({...d, rates: {...d.rates, oneDigitClose: e.target.value}})} className={inCls} /></div>
            </div>
            <button type="submit" className="w-full py-5 bg-rose-600 text-white font-black rounded-2xl tracking-[0.3em] uppercase text-[11px] shadow-2xl shadow-rose-500/20 active:scale-95 transition-all">SYNCHRONIZE NODE</button>
        </form>
    );
};
