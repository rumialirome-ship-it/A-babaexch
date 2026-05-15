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

const DashboardView: React.FC<{ summary: FinancialSummary | null; admin: Admin }> = ({ summary, admin }) => {
    if (!summary) return <div className="p-20 text-center text-slate-600 font-black text-[10px] uppercase tracking-[0.4em] animate-pulse">Scanning Global Economy...</div>;

    const cards = [
        { title: 'Global Reserve', value: admin.wallet, color: 'text-sky-400', sub: 'System Liquidity', icon: Icons.wallet },
        { title: 'Total Stake', value: summary.totals.totalStake, color: 'text-white', sub: 'Network Volume', icon: Icons.chartBar },
        { title: 'Total Prize', value: summary.totals.totalPayouts, color: 'text-rose-400', sub: 'Yield Distribution', icon: Icons.star },
        { title: 'Net Harvest', value: summary.totals.netProfit, color: summary.totals.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-500', sub: 'Protocol Profit', icon: Icons.trendingUp },
    ];

    return (
        <div className="space-y-16 animate-in fade-in duration-700">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {cards.map((c, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className="elite-card p-8 rounded-3xl glass-panel relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 scale-150 group-hover:scale-125 transition-transform">{c.icon}</div>
                        <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2 opacity-60">{c.title}</p>
                        <p className={`text-3xl font-black font-mono tracking-tighter ${c.color}`}>Rs {c.value.toLocaleString(undefined, { minimumFractionDigits: 1 })}</p>
                        <p className="text-[9px] text-slate-600 uppercase font-bold tracking-widest mt-4">{c.sub}</p>
                    </motion.div>
                ))}
            </div>

            <div className="space-y-8">
                <div className="flex items-center gap-4">
                    <div className="h-8 w-1 bg-sky-500 rounded-full" />
                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Market Sector Performance</h3>
                </div>
                <div className="elite-card rounded-3xl overflow-hidden glass-panel">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-white/[0.02] border-b border-white/5">
                                <tr>
                                    <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Game Domain</th>
                                    <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-right">Raw Stake</th>
                                    <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-right">Yield</th>
                                    <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-right">Dealer Node</th>
                                    <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-right">Global Net</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {summary.games.map((g, i) => (
                                    <tr key={i} className="group hover:bg-sky-500/[0.02] transition-colors">
                                        <td className="p-8">
                                            <div className="flex items-center gap-4">
                                                <img src={GAME_LOGOS[g.gameName]} className="w-10 h-10 rounded-full border border-white/10" alt="" />
                                                <div>
                                                    <div className="text-white font-bold text-base">{g.gameName}</div>
                                                    <div className="text-[10px] text-slate-500 font-mono tracking-widest uppercase mt-0.5">{g.winningNumber || 'PENDING'}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-8 text-right font-mono text-white text-base">Rs {g.totalStake.toLocaleString()}</td>
                                        <td className="p-8 text-right font-mono text-rose-400 font-bold">Rs {g.totalPayouts.toLocaleString()}</td>
                                        <td className="p-8 text-right font-mono text-emerald-400 text-sm">Rs {g.totalDealerProfit.toLocaleString()}</td>
                                        <td className="p-8 text-right font-mono text-sky-400 font-black text-lg">Rs {g.netProfit.toLocaleString()}</td>
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
        <div className="space-y-10">
            <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                <div className="border-l-4 border-emerald-500 pl-6">
                    <h3 className="text-3xl font-black text-white uppercase tracking-widest">Winners Registry</h3>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-1">Authorized Prize Distribution Logs</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-black/40 p-2 rounded-2xl border border-white/5 flex-1 w-full max-w-2xl">
                    <input type="date" value={start} onChange={e => setStart(e.target.value)} className="bg-transparent text-white p-2 text-xs font-mono outline-none" />
                    <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="bg-transparent text-white p-2 text-xs font-mono outline-none" />
                    <input type="text" placeholder="FILTER BY NODE..." value={q} onChange={e => setQ(e.target.value)} className="bg-transparent text-white p-2 text-[10px] font-black uppercase tracking-widest outline-none" />
                </div>
            </div>

            <div className="elite-card rounded-3xl overflow-hidden glass-panel">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-white/[0.02] border-b border-white/5">
                            <tr>
                                <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-widest">Event Mark</th>
                                <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-widest">Node Node</th>
                                <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-widest">Market</th>
                                <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-widest">Result</th>
                                <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Yield</th>
                                <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {records.map((r, i) => (
                                <tr key={i} className="hover:bg-emerald-500/[0.02] transition-colors">
                                    <td className="p-8 text-[10px] font-mono text-slate-600">{r.time.toLocaleString()}</td>
                                    <td className="p-8">
                                        <div className="text-white font-bold text-sm tracking-tight">{r.user}</div>
                                        <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1 opacity-60">{r.dealer}</div>
                                    </td>
                                    <td className="p-8">
                                        <div className="text-sky-400 font-black text-xs uppercase tracking-tighter">{r.game}</div>
                                        <div className="text-[10px] text-slate-500 font-mono italic">{r.type}</div>
                                    </td>
                                    <td className="p-8">
                                        <div className="text-emerald-400 font-black text-2xl font-mono">{r.win}</div>
                                        <div className="text-[9px] text-slate-600 uppercase font-black -mt-1 tracking-[0.2em]">Validated</div>
                                    </td>
                                    <td className="p-8 text-right">
                                        <div className="text-white font-black text-xl font-mono tracking-tighter">Rs {r.prize.toLocaleString()}</div>
                                        <div className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">Stake: Rs {r.stake.toLocaleString()}</div>
                                    </td>
                                    <td className="p-8 text-center">
                                        <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${r.approved ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-amber-500/10 border-amber-500/20 text-amber-500'}`}>
                                            {r.approved ? 'AUTHORIZED' : 'PENDING'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {records.length === 0 && <tr><td colSpan={6} className="p-20 text-center text-slate-600 font-black text-[10px] uppercase tracking-[0.5em]">Zero Resolved Wins Found</td></tr>}
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

    const Col = ({ title, data, color }: any) => (
        <div className="elite-card p-8 rounded-3xl glass-panel space-y-6">
            <div className="flex justify-between items-center"><h4 className={`text-xs font-black uppercase tracking-[0.3em] ${color}`}>{title}</h4><span className="text-[10px] text-slate-600 font-bold">{data.length} UNITS</span></div>
            <div className="divide-y divide-white/5 max-h-[30rem] overflow-y-auto no-scrollbar pr-2">
                {data.map((item: any, i: number) => (
                    <div key={i} className="py-4 flex justify-between items-center group transition-all hover:translate-x-1">
                        <span className={`text-2xl font-black font-mono tracking-tighter ${color}`}>{item.number}</span>
                        <div className="text-right">
                            <div className="text-white font-black font-mono text-lg tracking-tighter">Rs {item.stake.toLocaleString(undefined, { minimumFractionDigits: 0 })}</div>
                            <div className="text-[8px] text-slate-600 uppercase font-bold tracking-widest">Active Stake</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="space-y-12">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-black/40 p-3 rounded-2xl border border-white/5">
                <input type="date" value={filters.date} onChange={e => setFilters(p => ({ ...p, date: e.target.value }))} className="bg-transparent text-white p-3 text-xs font-mono outline-none" />
                <select value={filters.gameId} onChange={e => setFilters(p => ({ ...p, gameId: e.target.value }))} className="bg-transparent text-white p-3 text-xs font-black uppercase tracking-widest outline-none"><option value="">ALL DOMAINS</option>{games.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
                <select value={filters.dealerId} onChange={e => setFilters(p => ({ ...p, dealerId: e.target.value }))} className="bg-transparent text-white p-3 text-xs font-black uppercase tracking-widest outline-none"><option value="">ALL NODES</option>{dealers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
                <input type="text" placeholder="FILTER NUMBERS..." value={q} onChange={e => setQ(e.target.value)} className="bg-transparent text-white p-3 text-[10px] font-black uppercase tracking-widest outline-none" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                {filtered ? (
                    <>
                        <Col title="2-Digit Manifest" data={filtered.twoDigit} color="text-sky-400" />
                        <Col title="Open Gate Manifest" data={filtered.oneDigitOpen} color="text-amber-400" />
                        <Col title="Close Gate Manifest" data={filtered.oneDigitClose} color="text-rose-400" />
                    </>
                ) : <div className="col-span-3 p-20 text-center text-slate-600 font-black text-[10px] uppercase tracking-[0.5em] animate-pulse">Syncing Cryptographic Summary...</div>}
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
    const { fetchWithAuth } = useAuth();
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
        <div className="max-w-7xl mx-auto px-6 py-12 md:py-20 relative z-10">
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row justify-between items-end mb-20 gap-8">
                <div className="border-l-4 border-rose-500 pl-8">
                    <h2 className="text-5xl md:text-7xl font-black text-white tracking-widest uppercase mb-4">Command</h2>
                    <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[10px]">Superuser Identity: <span className="text-rose-500">{admin.name}</span></p>
                </div>
                <div className="bg-black/40 p-2 rounded-2xl border border-white/5 flex gap-2 overflow-x-auto no-scrollbar max-w-full">
                    {tabs.map(t => (
                        <button key={t.id} onClick={() => setActiveTab(t.id)} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === t.id ? 'bg-rose-600 text-white shadow-xl shadow-rose-500/10' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}>
                            {t.label}
                        </button>
                    ))}
                </div>
            </motion.div>

            {activeTab === 'dashboard' && <DashboardView summary={summaryData} admin={admin} />}
            {activeTab === 'winners' && <WinnersView bets={bets} games={games} users={users} dealers={dealers} />}
            {activeTab === 'numberSummary' && <NumberSummaryView games={games} dealers={dealers} users={users} onPlaceAdminBets={props.onPlaceAdminBets} />}
            {activeTab === 'settings' && <div className="space-y-12">
                <div className="max-w-2xl mx-auto elite-card p-10 rounded-3xl glass-panel"><h3 className="text-xl font-black text-white uppercase tracking-widest mb-10 border-b border-white/5 pb-6">Protocol Authority</h3><div className="space-y-10">
                    <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/5"><p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2">Master Ledger Status</p><div className="flex justify-between items-end"><p className="text-3xl font-black font-mono text-emerald-400">Rs {admin.wallet.toLocaleString()}</p><button onClick={() => { setVLedgerId(admin.id); setVLedgerType('admin'); }} className="text-[10px] font-black text-sky-500 uppercase tracking-widest hover:underline">Audit Logs</button></div></div>
                    <button className="w-full py-5 bg-rose-600 text-white font-black rounded-2xl tracking-[0.4em] uppercase text-[11px] shadow-2xl shadow-rose-500/20 active:scale-95 transition-all">TERMINATE ALL SESSIONS</button>
                </div></div>
            </div>}

            {activeTab === 'dealers' && (
                <div className="space-y-10">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <input type="text" placeholder="FILTER DEALER NODES..." value={q} onChange={e => setQ(e.target.value)} className="flex-1 w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white font-bold text-[11px] uppercase tracking-[0.2em] focus:border-rose-500/50 outline-none transition-all" />
                        <button onClick={() => { setSelDealer(undefined); setIsDealerModalOpen(true); }} className="w-full md:w-auto px-10 py-5 bg-rose-600 text-white font-black rounded-2xl tracking-[0.3em] uppercase text-[11px] shadow-2xl shadow-rose-500/20 active:scale-95 transition-all">New Node Proxy</button>
                    </div>
                    <div className="elite-card rounded-3xl overflow-hidden glass-panel">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-white/[0.02] border-b border-white/5">
                                    <tr>
                                        <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Node Descriptor</th>
                                        <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Sector</th>
                                        <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-right">Liquidity</th>
                                        <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-center">Protocol Rate</th>
                                        <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-center">Auth Status</th>
                                        <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-right">Ops</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {dealers.filter(d => d.name.toLowerCase().includes(q.toLowerCase()) || d.id.toLowerCase().includes(q.toLowerCase())).map(d => (
                                        <tr key={d.id} className="hover:bg-rose-600/[0.02] transition-colors">
                                            <td className="p-8"><div className="flex items-center gap-4">{d.avatarUrl ? <img src={d.avatarUrl} className="w-10 h-10 rounded-full border border-white/10" /> : <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-500">{Icons.user}</div>}<div><div className="text-white font-bold text-base">{d.name}</div><div className="text-[10px] text-slate-500 font-mono tracking-widest mt-1 uppercase">{d.id}</div></div></div></td>
                                            <td className="p-8"><div className="text-slate-300 font-bold text-sm tracking-tight">{d.area}</div><div className="text-[10px] text-slate-500 font-mono tracking-widest uppercase mt-1">{d.contact}</div></td>
                                            <td className="p-8 text-right font-mono"><div className="text-emerald-400 font-black text-lg">Rs {d.wallet.toLocaleString()}</div></td>
                                            <td className="p-8 text-center font-black text-white font-mono">{d.commissionRate}%</td>
                                            <td className="p-8 text-center"><span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${d.isRestricted ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'}`}>{d.isRestricted ? 'LOCKED' : 'VERIFIED'}</span></td>
                                            <td className="p-8 text-right space-x-4"><button onClick={() => { setSelDealer(d); setIsDealerModalOpen(true); }} className="text-[10px] font-black text-sky-500 uppercase hover:underline">Config</button><button onClick={() => { setVLedgerId(d.id); setVLedgerType('dealer'); }} className="text-[10px] font-black text-emerald-400 uppercase hover:underline">Audit</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'games' && (
                <div className="space-y-12">
                     <div className="flex justify-between items-center"><h3 className="text-3xl font-black text-white uppercase tracking-widest">Market Control</h3><button onClick={handleManualRefresh} className="p-4 rounded-xl bg-white/5 border border-white/5 text-slate-500 hover:text-white transition-all">
    <div className={isRefreshing ? 'animate-spin' : ''}>{Icons.refresh}</div>
</button></div>
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                        {games.map(g => (
                            <div key={g.id} className="elite-card p-10 rounded-3xl glass-panel space-y-8 relative overflow-hidden group">
                                <div className="flex items-center gap-4 border-b border-white/5 pb-6">
                                    <img src={GAME_LOGOS[g.name]} className="w-16 h-16 rounded-2xl border border-white/10" alt="" />
                                    <div><h4 className="text-xl font-black text-white uppercase tracking-tight">{g.name}</h4><p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">GATE CLO @ {formatTime12h(g.drawTime)}</p></div>
                                </div>
                                {g.winningNumber ? (
                                    <div className="text-center py-6 bg-black/20 rounded-2xl border border-white/5 space-y-4">
                                        <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em]">Authorized Result</p>
                                        <p className="text-6xl font-black text-white font-mono tracking-tighter italic">{g.winningNumber}</p>
                                        <div className="flex justify-center pt-2"><span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${g.payoutsApproved ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500' : 'bg-amber-500/10 border border-amber-500/20 text-amber-500'}`}>{g.payoutsApproved ? 'AUDIT COMPLETE' : 'PENDING AUDIT'}</span></div>
                                        {!g.payoutsApproved && <button onClick={() => approvePayouts(g.id)} className="w-full mt-4 py-4 bg-emerald-600 text-white font-black rounded-xl tracking-widest uppercase text-[10px] shadow-xl shadow-emerald-500/10">FINALIZE PAYOUTS</button>}
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="space-y-2"><label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Input Result Protocol</label><input type="text" maxLength={2} value={winners[g.id] || ''} onChange={e => setWinners({...winners, [g.id]: e.target.value.replace(/\D/g, '')})} className="w-full bg-black/40 border border-white/10 rounded-xl p-5 text-4xl text-center font-black text-white font-mono outline-none focus:border-rose-500/50" placeholder="--" /></div>
                                        <button onClick={() => declareWinner(g.id, winners[g.id])} className="w-full py-5 bg-sky-600 text-white font-black rounded-2xl tracking-[0.3em] uppercase text-[11px] shadow-2xl shadow-sky-500/20">AUTHORIZE SECTOR</button>
                                    </div>
                                )}
                            </div>
                        ))}
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
