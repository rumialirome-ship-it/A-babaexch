import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Game, SubGameType, LedgerEntry, Bet, PrizeRates, BetLimits } from '../types';
import { Icons, GAME_LOGOS } from '../constants';
import { useCountdown } from '../hooks/useCountdown';
import { useAuth } from '../hooks/useAuth';

const getTodayDateString = () => new Date().toISOString().split('T')[0];

const Toast = React.memo<{ message: string; type: 'success' | 'error'; onClose: () => void }>(({ message, type, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 4000);
        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <motion.div 
            initial={{ opacity: 0, x: 20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            className={`fixed top-4 right-4 z-[2000] p-4 rounded-2xl shadow-2xl border backdrop-blur-md flex items-center gap-4 max-w-[90vw] sm:max-w-md ${
                type === 'success' ? 'bg-emerald-950/80 border-emerald-500/30 text-emerald-50' : 'bg-red-950/80 border-red-500/30 text-red-50'
            }`}
        >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${type === 'success' ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
                {type === 'success' ? <Icons.checkCircle className="w-5 h-5 text-emerald-400" /> : <Icons.sparkles className="w-5 h-5 text-red-400" />}
            </div>
            <span className="font-bold text-xs uppercase tracking-tight">{message}</span>
            <button onClick={onClose} className="ml-auto p-1.5 hover:bg-white/5 rounded-full transition-colors">
                <Icons.close className="w-4 h-4 opacity-50" />
            </button>
        </motion.div>
    );
});

// Helper to calculate payout for a single bet (internal use)
const calculateBetPayout = (bet: Bet, game: Game | undefined, userPrizeRates: PrizeRates) => {
    if (!game || !game.winningNumber || game.winningNumber.includes('_')) return 0;

    const winningNumber = game.winningNumber;
    let winningNumbersCount = 0;

    bet.numbers.forEach(num => {
        let isWin = false;
        switch (bet.subGameType) {
            case SubGameType.OneDigitOpen:
                if (winningNumber.length === 2) { isWin = num === winningNumber[0]; }
                break;
            case SubGameType.OneDigitClose:
                if (game.name === 'AKC') { isWin = num === winningNumber; } 
                else if (winningNumber.length === 2) { isWin = num === winningNumber[1]; }
                break;
            default: // Covers TwoDigit, Bulk, Combo
                isWin = num === winningNumber;
                break;
        }
        if (isWin) winningNumbersCount++;
    });

    if (winningNumbersCount > 0) {
        const getPrizeMultiplier = (rates: PrizeRates, subGameType: SubGameType) => {
            switch (subGameType) {
                case SubGameType.OneDigitOpen: return rates.oneDigitOpen;
                case SubGameType.OneDigitClose: return rates.oneDigitClose;
                default: return rates.twoDigit;
            }
        };
        const multiplier = getPrizeMultiplier(userPrizeRates, bet.subGameType);
        return winningNumbersCount * bet.amountPerNumber * multiplier;
    }
    return 0;
};

const GameStakeBreakdown = React.memo<{ games: Game[], bets: Bet[], user: User }>(({ games, bets, user }) => {
    const data = useMemo(() => {
        return games.map(game => {
            const gameBets = bets.filter(b => b.gameId === game.id);
            const totalStake = gameBets.reduce((sum, b) => sum + b.totalAmount, 0);
            const totalCommission = gameBets.reduce((sum, b) => sum + (b.totalAmount * (user.commissionRate / 100)), 0);
            
            // Calculate total prize won for this specific game
            const totalPrize = gameBets.reduce((sum, bet) => {
                return sum + calculateBetPayout(bet, game, user.prizeRates);
            }, 0);

            // Net Profit for the user = (Winnings + Commissions Earned) - Stake Invested
            const netProfit = (totalPrize + totalCommission) - totalStake;

            return {
                id: game.id,
                name: game.name,
                logo: GAME_LOGOS[game.name] || game.logo,
                totalStake,
                totalCommission,
                totalPrize,
                netProfit,
                winningNumber: game.winningNumber,
                isMarketOpen: game.isMarketOpen
            };
        }).filter(d => d.totalStake > 0).sort((a, b) => b.totalStake - a.totalStake);
    }, [games, bets, user]);

    const totals = useMemo(() => {
        return data.reduce((acc, item) => ({
            stake: acc.stake + item.totalStake,
            commission: acc.commission + item.totalCommission,
            prize: acc.prize + item.totalPrize,
            profit: acc.profit + item.netProfit
        }), { stake: 0, commission: 0, prize: 0, profit: 0 });
    }, [data]);

    if (data.length === 0) return null;

    return (
        <section className="mb-16">
            <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold text-white uppercase tracking-widest flex items-center gap-3">
                    Daily Performance
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                </h3>
                <div className="text-[10px] font-black tracking-widest text-slate-500 uppercase">Live Metrics</div>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {[
                    { label: 'Invested', val: totals.stake, color: 'text-white' },
                    { label: 'Winnings', val: totals.prize, color: 'text-emerald-400' },
                    { label: 'Commission', val: totals.commission, color: 'text-sky-400' },
                    { label: 'Performance', val: totals.profit, color: totals.profit >= 0 ? 'text-emerald-400' : 'text-red-400', isProfit: true }
                ].map((stat, i) => (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        key={stat.label} 
                        className="glass p-5 rounded-2xl border border-white/5 relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-3 opacity-5">
                            <Icons.sparkles className={`w-8 h-8 ${stat.color}`} />
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{stat.label}</p>
                        <p className={`text-2xl font-mono font-black ${stat.color}`}>
                            {stat.isProfit && stat.val >= 0 ? '+' : ''}{stat.val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                    </motion.div>
                ))}
            </div>

            {/* Mobile View - Cards */}
            <div className="sm:hidden space-y-4">
                {data.map(item => (
                    <div key={item.id} className="glass p-4 rounded-2xl border border-white/5">
                        <div className="flex items-center gap-4 mb-3">
                            <img src={item.logo} className="w-10 h-10 rounded-full border border-white/10" alt="" />
                            <div className="flex-grow">
                                <p className="text-white font-bold text-sm uppercase tracking-tight">{item.name}</p>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Net: <span className={item.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>Rs {item.netProfit.toFixed(2)}</span></p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-slate-500 uppercase font-black">Result</p>
                                <p className={item.winningNumber ? 'text-white font-mono font-bold' : 'text-slate-600'}>{item.winningNumber || '--'}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Desktop View - Table */}
            <div className="hidden sm:block glass rounded-2xl border border-white/5 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-950/50 border-b border-white/5">
                        <tr>
                            <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Market</th>
                            <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Stake</th>
                            <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Prize</th>
                            <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Comm.</th>
                            <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">P/L</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {data.map(item => (
                            <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <img src={item.logo} className="w-8 h-8 rounded-full border border-white/10" alt="" />
                                        <div>
                                            <p className="text-white font-bold text-xs uppercase tracking-tight">{item.name}</p>
                                            <p className="text-[10px] text-slate-500 font-mono tracking-tighter">RS: {item.winningNumber || 'Pending'}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-4 text-right font-mono text-xs text-white">Rs {item.totalStake.toLocaleString()}</td>
                                <td className="p-4 text-right font-mono text-xs text-emerald-400">Rs {item.totalPrize.toLocaleString()}</td>
                                <td className="p-4 text-right font-mono text-xs text-sky-400">Rs {item.totalCommission.toFixed(2)}</td>
                                <td className={`p-4 text-right font-mono text-xs font-black ${item.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {item.netProfit >= 0 ? '+' : ''}{item.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
});

const LedgerView = React.memo<{ entries: LedgerEntry[] }>(({ entries }) => {
    const [startDate, setStartDate] = useState(getTodayDateString());
    const [endDate, setEndDate] = useState(getTodayDateString());

    const filteredEntries = useMemo(() => {
        if (!startDate && !endDate) return entries;
        return entries.filter(entry => {
            if (!(entry.timestamp instanceof Date) || isNaN(entry.timestamp.getTime())) return false;
            const entryDateStr = entry.timestamp.toISOString().split('T')[0];
            if (startDate && entryDateStr < startDate) return false;
            if (endDate && entryDateStr > endDate) return false;
            return true;
        });
    }, [entries, startDate, endDate]);

    const handleClearFilters = () => {
        setStartDate('');
        setEndDate('');
    };

    const inputClass = "w-full bg-white/5 p-3 rounded-xl border border-white/10 focus:ring-1 focus:ring-cyan-500 focus:outline-none text-white text-xs font-mono transition-all";

    return (
        <section className="mt-16">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-white uppercase tracking-widest flex items-center gap-3">
                    Ledger
                    <span className="text-[10px] text-slate-500 font-normal">Transaction Logs</span>
                </h3>
            </div>

            <div className="glass p-6 rounded-2xl border border-white/5 mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">From</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">To</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputClass} />
                    </div>
                    <div className="flex items-end">
                        <button onClick={handleClearFilters} className="w-full bg-white/5 hover:bg-white/10 text-white font-bold text-[10px] uppercase tracking-widest py-3 rounded-xl border border-white/10 transition-all active:scale-95">Reset View</button>
                    </div>
                </div>
            </div>

            <div className="glass rounded-2xl border border-white/5 overflow-hidden">
                <div className="overflow-x-auto max-h-[400px] no-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-950/50 sticky top-0 z-10 backdrop-blur-md">
                            <tr>
                                <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5">Date</th>
                                <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5">Label</th>
                                <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5 text-right">Out</th>
                                <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5 text-right">In</th>
                                <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5 text-right">Vault</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {[...filteredEntries].reverse().map(entry => (
                                <tr key={entry.id} className="hover:bg-white/[0.02] transition-colors">
                                    <td className="p-4 text-[10px] text-slate-400 font-mono whitespace-nowrap">{entry.timestamp.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                                    <td className="p-4 text-xs text-white font-medium truncate max-w-[200px]">{entry.description}</td>
                                    <td className="p-4 text-right text-xs text-red-400 font-mono">{entry.debit > 0 ? `-${entry.debit.toFixed(2)}` : '--'}</td>
                                    <td className="p-4 text-right text-xs text-emerald-400 font-mono">{entry.credit > 0 ? `+${entry.credit.toFixed(2)}` : '--'}</td>
                                    <td className="p-4 text-right text-xs font-black text-white font-mono">{entry.balance.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    );
});

const BetHistoryView = React.memo<{ bets: Bet[], games: Game[], user: User }>(({ bets, games, user }) => {
    const [startDate, setStartDate] = useState(getTodayDateString());
    const [endDate, setEndDate] = useState(getTodayDateString());
    const [searchTerm, setSearchTerm] = useState('');

    const getBetOutcome = (bet: Bet) => {
        const game = games.find(g => g.id === bet.gameId);
        if (!game || !user || !game.winningNumber || game.winningNumber.includes('_')) return { status: 'Live', payout: 0, color: 'text-cyan-400' };

        const payout = calculateBetPayout(bet, game, user.prizeRates);
        if (payout > 0) return { status: 'Win', payout, color: 'text-emerald-400' };
        return { status: 'Lost', payout: 0, color: 'text-red-400' };
    };

    const filteredBets = useMemo(() => {
        return bets.filter(bet => {
            if (!(bet.timestamp instanceof Date) || isNaN(bet.timestamp.getTime())) return false;
            const betDateStr = bet.timestamp.toISOString().split('T')[0];
            if (startDate && betDateStr < startDate) return false;
            if (endDate && betDateStr > endDate) return false;

            if (searchTerm.trim()) {
                const game = games.find(g => g.id === bet.gameId);
                const lowerSearchTerm = searchTerm.trim().toLowerCase();
                const gameNameMatch = game?.name.toLowerCase().includes(lowerSearchTerm);
                const subGameTypeMatch = bet.subGameType.toLowerCase().includes(lowerSearchTerm);
                if (!gameNameMatch && !subGameTypeMatch) return false;
            }
            return true;
        });
    }, [bets, games, startDate, endDate, searchTerm]);

    const handleClearFilters = () => {
        setStartDate('');
        setEndDate('');
        setSearchTerm('');
    };
    
    const inputClass = "w-full bg-white/5 p-3 rounded-xl border border-white/10 focus:ring-1 focus:ring-cyan-500 focus:outline-none text-white text-xs transition-all";

    return (
        <section className="mt-16">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-white uppercase tracking-widest flex items-center gap-3">
                    Bet Journal
                    <span className="text-[10px] text-slate-500 font-normal">History & Results</span>
                </h3>
            </div>
            
            <div className="glass p-6 rounded-2xl border border-white/5 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">From</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={`${inputClass} font-mono`} />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">To</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={`${inputClass} font-mono`} />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Filter</label>
                        <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Game or Type..." className={inputClass} />
                    </div>
                    <div className="flex items-end">
                        <button onClick={handleClearFilters} className="w-full bg-white/5 hover:bg-white/10 text-white font-bold text-[10px] uppercase tracking-widest py-3 rounded-xl border border-white/10 transition-all active:scale-95">Clear Filters</button>
                    </div>
                </div>
            </div>

            <div className="glass rounded-2xl border border-white/5 overflow-hidden">
                <div className="overflow-x-auto max-h-[500px] no-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-950/50 sticky top-0 z-10 backdrop-blur-md">
                            <tr>
                                <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5">Details</th>
                                <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5">Selection</th>
                                <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5 text-right">Stake</th>
                                <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5 text-right">Won</th>
                                <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5 text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                           {[...filteredBets].reverse().map(bet => {
                                const game = games.find(g => g.id === bet.gameId);
                                const outcome = getBetOutcome(bet);
                                return (
                                <tr key={bet.id} className="hover:bg-white/[0.02] transition-colors">
                                    <td className="p-4">
                                        <div className="font-bold text-white text-xs uppercase tracking-tight">{game?.name || '---'}</div>
                                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">{bet.timestamp.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                                    </td>
                                    <td className="p-4">
                                        <div className="text-[10px] font-black uppercase text-slate-400 mb-1">{bet.subGameType}</div>
                                        <div className="flex flex-wrap gap-1 max-w-[280px] sm:max-w-[400px] xl:max-w-none">
                                            {bet.numbers.map((n, i) => (
                                                <span key={i} className="text-[10px] font-mono text-slate-300 bg-white/10 border border-white/5 px-1.5 py-0.5 rounded shadow-sm inline-block">{n}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="p-4 text-right text-xs text-white font-mono">Rs {bet.totalAmount.toFixed(2)}</td>
                                    <td className="p-4 text-right text-xs text-emerald-400 font-mono">{outcome.payout > 0 ? `+${outcome.payout.toFixed(2)}` : '--'}</td>
                                    <td className="p-4 text-right">
                                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md bg-white/5 border border-white/5 ${outcome.color}`}>
                                            {outcome.status}
                                        </span>
                                    </td>
                                </tr>);
                           })}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    );
});

const formatTime12h = (time24: string) => {
    if (!time24 || typeof time24 !== 'string' || !time24.includes(':')) return '--:--';
    const parts = time24.split(':');
    const hours = parseInt(parts[0]);
    const minutes = parseInt(parts[1]);
    if (isNaN(hours) || isNaN(minutes)) return '--:--';
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
};

const GameCard = React.memo<{ game: Game; onPlay: (game: Game) => void; isRestricted: boolean; }>(({ game, onPlay, isRestricted }) => {
    const { status, text: countdownText } = useCountdown(game.drawTime);
    const hasFinalWinner = !!game.winningNumber && !game.winningNumber.endsWith('_');
    const isAK = game.name === 'AK';
    const isAKPending = isAK && game.winningNumber && game.winningNumber.endsWith('_');
    const isPlayable = !!game.isMarketOpen && !isRestricted;

    return (
        <motion.div 
            whileHover={{ y: -4 }}
            className={`glass-card p-5 rounded-2xl relative overflow-hidden flex flex-col justify-between ${!isPlayable ? 'opacity-60' : 'border-white/10'}`}
        >
            <div className="relative z-10">
                <div className="flex items-center gap-4 mb-6">
                    <div className="relative">
                        <motion.div 
                            animate={isPlayable ? { scale: [1, 1.1, 1] } : {}}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="absolute -inset-1 bg-cyan-500/20 rounded-full blur-sm"
                        />
                        <img src={GAME_LOGOS[game.name] || game.logo} alt={game.name} className="relative w-12 h-12 rounded-full border border-white/10" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white uppercase tracking-tighter leading-none mb-1">{game.name}</h3>
                        <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">Draw @ {formatTime12h(game.drawTime)}</p>
                    </div>
                </div>

                <div className="bg-black/30 rounded-xl p-4 border border-white/5 backdrop-blur-sm text-center mb-6 min-h-[80px] flex flex-col justify-center">
                    {hasFinalWinner ? (
                        <>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 mb-1">Market Result</p>
                            <p className="text-3xl font-mono font-black text-white tracking-widest">{game.winningNumber}</p>
                        </>
                    ) : isAKPending ? (
                        <>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500 mb-1">Open Declared</p>
                            <div className="flex items-center justify-center gap-1">
                                <span className="text-3xl font-mono font-black text-white tracking-widest">{game.winningNumber.slice(0, 1)}</span>
                                <span className="text-2xl font-black text-amber-400 font-mono animate-pulse">_</span>
                            </div>
                        </>
                    ) : !game.isMarketOpen ? (
                        <>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">Status</p>
                            <p className="text-xl font-bold text-red-500/80">MARKET CLOSED</p>
                        </>
                    ) : (
                        <>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">
                                {status === 'OPEN' ? 'Closing In' : 'Opening In'}
                            </p>
                            <p className={`text-2xl font-mono font-black ${status === 'OPEN' ? 'text-cyan-400' : 'text-slate-400'}`}>
                                {countdownText}
                            </p>
                        </>
                    )}
                </div>
            </div>

            <motion.button 
                whileTap={{ scale: 0.98 }}
                onClick={() => onPlay(game)} 
                disabled={!isPlayable} 
                className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-[10px] uppercase tracking-widest py-3 rounded-xl shadow-lg shadow-cyan-500/10 transition-all disabled:bg-slate-800 disabled:text-slate-600 disabled:shadow-none"
            >
                Start Betting
            </motion.button>
        </motion.div>
    );
});

interface BettingModalProps {
    game: Game | null;
    games: Game[];
    user: User;
    bets: Bet[];
    onClose: () => void;
    onPlaceBet: (details: any) => Promise<void>;
}

const BettingModal = React.memo<BettingModalProps>(({ game, games, user, bets, onClose, onPlaceBet }) => {
    const { fetchWithAuth } = useAuth();
    const [subGameType, setSubGameType] = useState<SubGameType>(SubGameType.TwoDigit);
    const [manualNumbersInput, setManualNumbersInput] = useState('');
    const [manualAmountInput, setManualAmountInput] = useState('');
    const [bulkInput, setBulkInput] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);

    const [comboDigitsInput, setComboDigitsInput] = useState('');
    const [generatedCombos, setGeneratedCombos] = useState<any[]>([]);
    const [comboGlobalStake, setComboGlobalStake] = useState('');

    const { text: countdownText } = useCountdown(game?.drawTime || '00:00');

    const availableSubGameTabs = useMemo(() => {
        if (!game) return [];
        const allSubGameTypes = [SubGameType.TwoDigit, SubGameType.OneDigitOpen, SubGameType.OneDigitClose, SubGameType.Bulk, SubGameType.Combo];
        if (game.name === 'AKC') return [SubGameType.OneDigitClose];
        if (game.name === 'AK') return allSubGameTypes.filter(type => type !== SubGameType.OneDigitClose);
        return allSubGameTypes;
    }, [game]);

    useEffect(() => {
        setManualNumbersInput('');
        setManualAmountInput('');
        setBulkInput('');
        setComboDigitsInput('');
        setGeneratedCombos([]);
        setComboGlobalStake('');
        setError(null);
        setIsConfirming(false);
    }, [subGameType]);

    const handleManualNumberChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const rawValue = e.target.value;
        const digitsOnly = rawValue.replace(/\D/g, '');
        if (digitsOnly === '') { setManualNumbersInput(''); return; }
        let formattedValue = '';
        switch (subGameType) {
            case SubGameType.OneDigitOpen:
            case SubGameType.OneDigitClose:
                formattedValue = digitsOnly.split('').join(', ');
                break;
            case SubGameType.TwoDigit:
                formattedValue = (digitsOnly.match(/.{1,2}/g) || []).join(', ');
                break;
            default:
                formattedValue = digitsOnly;
                break;
        }
        setManualNumbersInput(formattedValue);
    };
    
    useEffect(() => { 
        if (availableSubGameTabs.length > 0 && !availableSubGameTabs.includes(subGameType)) {
            setSubGameType(availableSubGameTabs[0]); 
        }
    }, [availableSubGameTabs, subGameType]);

    const handleAiLuckyPick = async () => {
        if (isAiLoading) return;
        setIsAiLoading(true);
        setError(null);
        try {
            const response = await fetchWithAuth('/api/user/ai-lucky-pick', {
                method: 'POST',
                body: JSON.stringify({ gameType: subGameType, count: 5 })
            });
            const data = await response.json();
            const numbers = data.luckyNumbers.replace(/,/g, '');
            let formatted = '';
            if (subGameType === SubGameType.TwoDigit) {
                formatted = (numbers.match(/.{1,2}/g) || []).join(', ');
            } else {
                formatted = numbers.split('').join(', ');
            }
            setManualNumbersInput(formatted);
        } catch (err: any) {
            setError(err.message || "Failed to get AI lucky numbers.");
        } finally {
            setIsAiLoading(false);
        }
    };

    const [isCompleted, setIsCompleted] = useState(false);

    const parsedBulkBet = useMemo(() => {
        const result: any = { betsByGame: new Map(), grandTotalCost: 0, grandTotalNumbers: 0, errors: [] };
        if (!game || !bulkInput.trim()) return result;
        const gameNameMap = new Map<string, string>();
        games.forEach(g => gameNameMap.set(g.name.toLowerCase().replace(/\s+/g, ''), g.id));
        const gameNameRegex = new RegExp(`\\b(${Array.from(gameNameMap.keys()).join('|')})\\b`, 'i');
        const delimiterRegex = /[-.,_*\/+<>=%;'\s]+/; 
        let currentGameId: string | null = game.id;
        for (const line of bulkInput.trim().split('\n')) {
            let currentLine = line.trim();
            if (!currentLine) continue;
            const gameMatch = currentLine.toLowerCase().replace(/\s+/g, '').match(gameNameRegex);
            if (gameMatch) {
                const matchedGameKey = gameMatch[0];
                currentGameId = gameNameMap.get(matchedGameKey) || null;
                const originalGameNameRegex = new RegExp(`\\b(${games.find(g => g.id === currentGameId)?.name})\\b`, 'i');
                currentLine = currentLine.replace(originalGameNameRegex, '').trim();
            }
            if (!currentGameId) { result.errors.push(`Line "${line}" missing valid game.`); continue; }
            const gameNameOnLine = games.find(g => g.id === currentGameId)?.name || 'Unknown Game';
            
            const stakeMatch = currentLine.match(/(?:rs|r)?\s*(\d+\.?\d*)$/i);
            const stake = stakeMatch ? parseFloat(stakeMatch[1]) : 0;
            if (stake <= 0) { result.errors.push(`Line "${line}" missing stake.`); continue; }
            
            let betPart = stakeMatch ? currentLine.substring(0, stakeMatch.index).trim() : currentLine;
            const isCombo = /\b(k|combo)\b/i.test(betPart);
            betPart = betPart.replace(/\b(k|combo)\b/i, '').trim();
            const tokens = betPart.split(delimiterRegex).filter(Boolean);
            let betItems: any[] = [];
            const isAkcGame = gameNameOnLine === 'AKC';
            const determineType = (token: string): SubGameType | null => {
                if (isAkcGame) return /^[xX]?\d$/.test(token) ? SubGameType.OneDigitClose : null;
                if (/^\d{1,2}$/.test(token)) return SubGameType.TwoDigit;
                if (/^\d[xX]$/i.test(token)) return SubGameType.OneDigitOpen;
                if (/^[xX]\d$/i.test(token)) return SubGameType.OneDigitClose;
                return null;
            };
            if (isCombo) {
                const digits = betPart.replace(/\D/g, '');
                const uniqueDigits = [...new Set(digits.split(''))];
                if (uniqueDigits.length < 3 || uniqueDigits.length > 6) { result.errors.push(`Line "${line}": Combo 3-6 digits required.`); continue; }
                for (let i = 0; i < uniqueDigits.length; i++) {
                    for (let j = 0; j < uniqueDigits.length; j++) {
                        if (i !== j) betItems.push({ number: uniqueDigits[i] + uniqueDigits[j], subGameType: SubGameType.Combo });
                    }
                }
            } else {
                for (const token of tokens) {
                    const tokenType = determineType(token);
                    if (!tokenType) { result.errors.push(`Invalid token '${token}' in "${line}".`); continue; }
                    let numberValue = tokenType === SubGameType.TwoDigit ? token.padStart(2, '0') : (tokenType === SubGameType.OneDigitOpen ? token[0] : (token.length === 2 ? token[1] : token[0]));
                    betItems.push({ number: numberValue, subGameType: tokenType });
                }
            }
            if (betItems.length === 0) continue;
            if (!result.betsByGame.has(currentGameId)) result.betsByGame.set(currentGameId, { gameName: gameNameOnLine, totalCost: 0, totalNumbers: 0, betGroups: new Map() });
            const gameData = result.betsByGame.get(currentGameId)!;
            for (const item of betItems) {
                const groupKey = `${item.subGameType}__${stake}`;
                if (!gameData.betGroups.has(groupKey)) gameData.betGroups.set(groupKey, { subGameType: item.subGameType, numbers: [], amountPerNumber: stake });
                const group = gameData.betGroups.get(groupKey)!;
                group.numbers.push(item.number);
                gameData.totalNumbers++; gameData.totalCost += stake;
            }
        }
        result.grandTotalCost = Array.from(result.betsByGame.values()).reduce((sum: number, g: any) => sum + g.totalCost, 0);
        result.grandTotalNumbers = Array.from(result.betsByGame.values()).reduce((sum: number, g: any) => sum + g.totalNumbers, 0);
        return result;
    }, [bulkInput, games, game.id]); // Use game.id instead of game object to avoid unnecessary re-memos

    const handleGenerateCombos = () => {
        setError(null);
        const digits = comboDigitsInput.replace(/\D/g, '');
        const uniqueDigits = [...new Set(digits.split(''))];
        if (uniqueDigits.length < 3 || uniqueDigits.length > 6) { setError("Enter 3-6 unique digits."); setGeneratedCombos([]); return; }
        const perms: string[] = [];
        for (let i = 0; i < uniqueDigits.length; i++) {
            for (let j = 0; j < uniqueDigits.length; j++) { if (i !== j) perms.push(uniqueDigits[i] + uniqueDigits[j]); }
        }
        setGeneratedCombos(perms.map(p => ({ number: p, stake: '', selected: true })));
    };

    const handleComboSelectionChange = (index: number, selected: boolean) => {
        setGeneratedCombos(prev => prev.map((c, i) => i === index ? { ...c, selected } : c));
    };

    const handleComboStakeChange = (index: number, stake: string) => {
        setGeneratedCombos(prev => prev.map((c, i) => i === index ? { ...c, stake } : c));
    };
    
    const handleApplyGlobalStake = () => {
        if (parseFloat(comboGlobalStake) > 0) setGeneratedCombos(prev => prev.map(c => ({...c, stake: comboGlobalStake})));
    };

    const parsedManualBet = useMemo(() => {
        const result = { numbers: [] as string[], totalCost: 0, error: null as string | null, numberCount: 0, stake: 0 };
        const amount = parseFloat(manualAmountInput);
        if (!isNaN(amount) && amount > 0) { result.stake = amount; }
        const digitsOnly = manualNumbersInput.replace(/\D/g, '');
        let numbers: string[] = [];
        if (digitsOnly.length > 0) {
            switch (subGameType) {
                case SubGameType.OneDigitOpen: case SubGameType.OneDigitClose: numbers = digitsOnly.split(''); break;
                case SubGameType.TwoDigit:
                    if (digitsOnly.length % 2 !== 0) { result.error = "Digit count must be even."; } else { numbers = digitsOnly.match(/.{2}/g) || []; }
                    break;
            }
        }
        result.numbers = [...new Set(numbers)]; 
        result.numberCount = result.numbers.length;
        if (result.stake > 0) { result.totalCost = result.numberCount * result.stake; }
        return result;
    }, [manualNumbersInput, manualAmountInput, subGameType]);

    const handleBet = async () => {
        if (!game) return;
        setError(null); setIsSubmitting(true);
        try {
            const checkLimitsForGame = (targetGameId: string, requestTotal: number, newOneDigit: number, newTwoDigit: number, gameName: string) => {
                const limits = user.betLimits || { oneDigit: 1000, twoDigit: 5000, perDraw: 20000 };
                const oneDigitLimit = Number(limits.oneDigit) || 0;
                const twoDigitLimit = Number(limits.twoDigit) || 0;
                const perDrawLimit = Number(limits.perDraw) || 0;

                const existingGameBets = bets.filter(b => b.gameId === targetGameId);
                const existingTotal = existingGameBets.reduce((sum, b) => sum + b.totalAmount, 0);

                if (perDrawLimit > 0 && (existingTotal + requestTotal) > perDrawLimit) {
                    throw new Error(`Bet exceeds the per-draw limit of Rs ${perDrawLimit.toLocaleString()} for ${gameName}. (Current total on this market: Rs ${existingTotal.toLocaleString()})`);
                }

                if (oneDigitLimit > 0 && newOneDigit > 0) {
                    const existingOneDigit = existingGameBets
                        .filter(b => b.subGameType === SubGameType.OneDigitOpen || b.subGameType === SubGameType.OneDigitClose)
                        .reduce((sum, b) => sum + b.totalAmount, 0);
                    if ((existingOneDigit + newOneDigit) > oneDigitLimit) {
                        throw new Error(`Bet exceeds the 1-Digit total limit of Rs ${oneDigitLimit.toLocaleString()} for ${gameName}. (Current total on 1-Digit: Rs ${existingOneDigit.toLocaleString()})`);
                    }
                }

                if (twoDigitLimit > 0 && newTwoDigit > 0) {
                    const existingTwoDigit = existingGameBets
                        .filter(b => b.subGameType !== SubGameType.OneDigitOpen && b.subGameType !== SubGameType.OneDigitClose)
                        .reduce((sum, b) => sum + b.totalAmount, 0);
                    if ((existingTwoDigit + newTwoDigit) > twoDigitLimit) {
                        throw new Error(`Bet exceeds the 2-Digit total limit of Rs ${twoDigitLimit.toLocaleString()} for ${gameName}. (Current total on 2-Digit: Rs ${existingTwoDigit.toLocaleString()})`);
                    }
                }
            };

            if (subGameType === SubGameType.Combo) {
                const validBets = generatedCombos.filter(c => c.selected && parseFloat(c.stake) > 0);
                if (validBets.length === 0) throw new Error("Select combinations and enter stakes.");
                const totalCost = validBets.reduce((sum, c) => sum + parseFloat(c.stake), 0);
                if (totalCost > user.wallet) throw new Error(`Insufficient balance.`);

                checkLimitsForGame(game.id, totalCost, 0, totalCost, game.name);

                const groups = new Map<number, string[]>();
                validBets.forEach(bet => {
                    const stake = parseFloat(bet.stake);
                    if (!groups.has(stake)) groups.set(stake, []);
                    groups.get(stake)!.push(bet.number);
                });
                const betGroups = Array.from(groups.entries()).map(([amount, numbers]) => ({ subGameType: SubGameType.Combo, numbers, amountPerNumber: amount }));
                await onPlaceBet({ gameId: game.id, betGroups });
            } else if (subGameType === SubGameType.Bulk) {
                const { betsByGame, errors } = parsedBulkBet;
                if (errors.length > 0) throw new Error(errors[0]);
                if (betsByGame.size === 0) throw new Error("No valid bets entered.");
                
                betsByGame.forEach((gameData: any, gId: string) => {
                    const targetGame = games.find(g => g.id === gId);
                    const gameName = targetGame?.name || 'Selected Game';
                    let totalRequest = 0;
                    let bulkOneDigit = 0;
                    let bulkTwoDigit = 0;
                    
                    const betGroupsArray = Array.from(gameData.betGroups.values()) as any[];
                    for (const bg of betGroupsArray) {
                        const bgCost = (bg.numbers?.length || 0) * (bg.amountPerNumber || 0);
                        totalRequest += bgCost;
                        const isOneDigit = bg.subGameType === SubGameType.OneDigitOpen || bg.subGameType === SubGameType.OneDigitClose;
                        if (isOneDigit) {
                            bulkOneDigit += bgCost;
                        } else {
                            bulkTwoDigit += bgCost;
                        }
                    }
                    checkLimitsForGame(gId, totalRequest, bulkOneDigit, bulkTwoDigit, gameName);
                });

                const multiGameBetsObj: any = {};
                betsByGame.forEach((gameData: any, gameId: string) => { 
                    multiGameBetsObj[gameId] = { 
                        gameName: gameData.gameName, 
                        betGroups: Array.from(gameData.betGroups.values()) 
                    }; 
                });
                
                await onPlaceBet({ isMultiGame: true, multiGameBets: multiGameBetsObj });
            } else {
                const { numbers, totalCost, error: parseError, stake } = parsedManualBet;
                if (stake <= 0) throw new Error("Enter valid amount.");
                if (parseError) throw new Error(parseError);
                if (numbers.length === 0) throw new Error("Enter at least one number.");
                if (totalCost > user.wallet) throw new Error(`Insufficient balance.`);

                const isOneDigit = subGameType === SubGameType.OneDigitOpen || subGameType === SubGameType.OneDigitClose;
                const newOneDigitTotal = isOneDigit ? totalCost : 0;
                const newTwoDigitTotal = isOneDigit ? 0 : totalCost;
                checkLimitsForGame(game.id, totalCost, newOneDigitTotal, newTwoDigitTotal, game.name);

                await onPlaceBet({ gameId: game.id, betGroups: [{ subGameType, numbers, amountPerNumber: stake }] });
            }
            setIsCompleted(true);
            setIsSuccess(true);
            setTimeout(() => {
                onClose();
            }, 1800);
        } catch (err: any) { 
            setError(err.message); 
            setIsConfirming(false); 
        } finally { 
            setIsSubmitting(false); 
        }
    };

    if (!game) return null;

    const totalSelectedNumbers = subGameType === SubGameType.Bulk ? parsedBulkBet.grandTotalNumbers : (subGameType === SubGameType.Combo ? generatedCombos.filter(c => c.selected).length : parsedManualBet.numberCount);
    const finalBetTotalCost = subGameType === SubGameType.Bulk ? parsedBulkBet.grandTotalCost : (subGameType === SubGameType.Combo ? generatedCombos.reduce((s, c) => c.selected ? s + (parseFloat(c.stake) || 0) : s, 0) : parsedManualBet.totalCost);

    return (
        <AnimatePresence>
            <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex justify-center items-center z-[1500] p-4">
                <motion.div 
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="glass-card shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center p-6 border-b border-white/5 bg-white/[0.02]">
                        <div>
                            <h3 className="text-xl font-bold text-white uppercase tracking-tighter mb-1">
                                {isConfirming ? "Verify Ticket" : `Join Market: ${game.name}`}
                            </h3>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1 text-[10px] font-black text-slate-500 uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded">
                                    <Icons.clock className="w-3 h-3" /> {formatTime12h(game.drawTime)}
                                </div>
                                <div className="flex items-center gap-1 text-[10px] font-black text-cyan-400 uppercase tracking-widest animate-pulse">
                                    {countdownText} Left
                                </div>
                            </div>
                        </div>
                        {!isConfirming && (
                            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors text-slate-500 hover:text-white">
                                <Icons.close className="w-5 h-5" />
                            </button>
                        )}
                    </div>

                    <div className="p-6 overflow-y-auto no-scrollbar flex-grow">
                        {isSuccess ? (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="flex flex-col items-center justify-center py-8 text-center"
                            >
                                <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 relative">
                                    <motion.div 
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1.5, opacity: 0 }}
                                        transition={{ duration: 1, repeat: Infinity }}
                                        className="absolute inset-0 bg-emerald-500/20 rounded-full"
                                    />
                                    <Icons.checkCircle className="w-10 h-10 text-emerald-400 relative z-10" />
                                </div>
                                <h4 className="text-2xl font-black text-white uppercase tracking-tighter mb-1">Played Successfully</h4>
                                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-6">Your ticket has been confirmed</p>
                                
                                <div className="w-full space-y-3 mb-8">
                                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-2">
                                        <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                            <span>Type</span>
                                            <span className="text-cyan-400">{subGameType}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                            <span>Selections</span>
                                            <span className="text-white">{totalSelectedNumbers} Numbers</span>
                                        </div>
                                        <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                            <span>Total Investment</span>
                                            <span className="text-emerald-400 font-mono">PKR {finalBetTotalCost}</span>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2 text-left">Confirmed Numbers</p>
                                        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto no-scrollbar">
                                            {(subGameType === SubGameType.Bulk 
                                                ? ["Bulk Entry List"] 
                                                : subGameType === SubGameType.Combo 
                                                    ? generatedCombos.filter(c => c.selected).map(c => c.number) 
                                                    : parsedManualBet.numbers
                                            ).map((num, i) => (
                                                <span key={i} className="text-[10px] font-mono text-white/50 bg-white/5 px-1.5 py-0.5 rounded">{num}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <button 
                                    onClick={onClose}
                                    className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-bold text-[10px] uppercase tracking-widest rounded-2xl border border-white/10 transition-all"
                                >
                                    Dismiss
                                </button>
                            </motion.div>
                        ) : isConfirming ? (
                            <div className="space-y-6">
                                <div className="bg-white/5 rounded-2xl border border-white/5 overflow-hidden">
                                    <div className="p-4 border-b border-white/5 flex justify-between items-center">
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Market Category</span>
                                        <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest bg-cyan-400/10 px-2 py-1 rounded">{subGameType}</span>
                                    </div>
                                    <div className="p-4">
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-3">Selections</span>
                                        <div className="flex flex-wrap gap-1.5 overflow-y-auto max-h-32 pr-2">
                                            {(subGameType === SubGameType.Bulk 
                                                ? ["Bulk Entry Data..."] 
                                                : subGameType === SubGameType.Combo 
                                                    ? generatedCombos.filter(c => c.selected).map(c => c.number) 
                                                    : parsedManualBet.numbers
                                            ).map((num, i) => (
                                                <span key={i} className="px-2 py-1 bg-white/5 border border-white/5 rounded font-mono text-white text-xs">{num}</span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="p-4 bg-emerald-500/5 grid grid-cols-2 gap-4">
                                        <div>
                                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Count</span>
                                            <span className="text-xl font-black text-white">{totalSelectedNumbers}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest block">Investment</span>
                                            <span className="text-2xl font-black text-emerald-400 font-mono leading-none">Rs {finalBetTotalCost}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-4">
                                    <button onClick={() => setIsConfirming(false)} className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white font-bold text-[10px] uppercase tracking-widest rounded-2xl border border-white/10 transition-all">Back</button>
                                    <button 
                                        onClick={handleBet} 
                                        disabled={isSubmitting || isCompleted}
                                        className={`flex-[2] py-4 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest ${
                                            isCompleted ? 'bg-emerald-500 text-slate-950' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                                        }`}
                                    >
                                        {isSubmitting ? (
                                            <div className="w-4 h-4 border-2 border-slate-950/20 border-t-slate-950 rounded-full animate-spin" />
                                        ) : isCompleted ? (
                                            <><Icons.checkCircle className="w-4 h-4" /> Finalized</>
                                        ) : (
                                            "Authorize & Pay"
                                        )}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="flex flex-wrap gap-2 mb-2 p-1 bg-white/5 rounded-2xl border border-white/5">
                                    {availableSubGameTabs.map(tab => (
                                        <button 
                                            key={tab} 
                                            onClick={() => setSubGameType(tab)} 
                                            className={`flex-1 py-2 px-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${subGameType === tab ? 'bg-cyan-500 text-slate-950 shadow-lg' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
                                        >
                                            {tab}
                                        </button>
                                    ))}
                                </div>

                                {subGameType === SubGameType.Bulk ? (
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Universal Entry</label>
                                            <textarea 
                                                value={bulkInput} 
                                                onChange={e => setBulkInput(e.target.value)} 
                                                rows={8} 
                                                placeholder={"LS3: 45, 92, x3 20\nAK: 01, 88 50"}
                                                className="w-full bg-white/5 p-4 rounded-2xl border border-white/10 focus:ring-1 focus:ring-cyan-500 focus:outline-none text-white font-mono text-xs no-scrollbar" 
                                            />
                                        </div>
                                    </div>
                                ) : subGameType === SubGameType.Combo ? (
                                    <div className="space-y-6">
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="col-span-2">
                                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Digits (3-6)</label>
                                                <input 
                                                    type="text" 
                                                    value={comboDigitsInput} 
                                                    onChange={e => setComboDigitsInput(e.target.value)} 
                                                    placeholder="0123" 
                                                    className="w-full bg-white/5 p-3 rounded-xl border border-white/10 focus:ring-1 focus:ring-cyan-500 text-white font-mono" 
                                                    maxLength={6}
                                                />
                                            </div>
                                            <div className="flex items-end">
                                                <button onClick={handleGenerateCombos} className="w-full h-[46px] bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black text-[10px] uppercase tracking-widest rounded-xl">Build</button>
                                            </div>
                                        </div>

                                        {generatedCombos.length > 0 && (
                                            <div className="space-y-4 animate-fade-in">
                                                <div className="flex gap-2">
                                                    <input 
                                                        type="number" 
                                                        value={comboGlobalStake} 
                                                        onChange={e => setComboGlobalStake(e.target.value)} 
                                                        placeholder="Uniform Stake" 
                                                        className="flex-grow bg-white/5 p-3 rounded-xl border border-white/10 text-white font-mono text-xs" 
                                                    />
                                                    <button onClick={handleApplyGlobalStake} className="bg-cyan-500 text-slate-950 font-black text-[10px] uppercase tracking-widest px-4 rounded-xl">Apply All</button>
                                                </div>
                                                <div className="max-h-48 overflow-y-auto no-scrollbar space-y-2 border border-white/5 p-2 rounded-2xl">
                                                    {generatedCombos.map((combo, index) => (
                                                        <div key={index} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                                                            <input type="checkbox" checked={combo.selected} onChange={(e) => handleComboSelectionChange(index, e.target.checked)} className="h-4 w-4 rounded bg-slate-950 border-white/10 text-cyan-500" />
                                                            <span className="font-mono text-white text-sm flex-shrink-0">{combo.number}</span>
                                                            <input type="number" value={combo.stake} onChange={e => handleComboStakeChange(index, e.target.value)} placeholder="0" className="w-full bg-transparent text-right font-mono text-cyan-400 focus:outline-none" />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div>
                                            <div className="flex justify-between items-center mb-2 px-1">
                                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Selections</label>
                                                <button onClick={handleAiLuckyPick} disabled={isAiLoading} className="text-[10px] font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1.5 hover:text-cyan-300 disabled:opacity-50">
                                                    {isAiLoading ? <div className="w-3 h-3 border border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" /> : <Icons.sparkles className="w-3 h-3" />}
                                                    Neural Pick
                                                </button>
                                            </div>
                                            <textarea 
                                                value={manualNumbersInput} 
                                                onChange={handleManualNumberChange} 
                                                rows={3} 
                                                placeholder={subGameType === SubGameType.TwoDigit ? "e.g. 14, 05" : "e.g. 1, 2"}
                                                className="w-full bg-white/5 p-4 rounded-2xl border border-white/10 focus:ring-1 focus:ring-cyan-500 focus:outline-none text-white font-mono text-xs no-scrollbar" 
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Stake Per Line</label>
                                            <input 
                                                type="number" 
                                                value={manualAmountInput} 
                                                onChange={e => setManualAmountInput(e.target.value)} 
                                                placeholder="Enter amount" 
                                                className="w-full bg-white/5 p-4 rounded-2xl border border-white/10 focus:ring-1 focus:ring-cyan-500 focus:outline-none text-white font-mono text-xs" 
                                            />
                                        </div>
                                    </div>
                                )}

                                {error && <p className="text-[10px] font-black text-red-400 uppercase tracking-widest bg-red-400/10 p-3 rounded-xl border border-red-400/20">{error}</p>}

                                <div className="flex justify-between items-center pt-4 border-t border-white/5">
                                    <div className="text-left">
                                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Total Cost</span>
                                        <span className="text-xl font-black text-white font-mono">Rs {finalBetTotalCost}</span>
                                    </div>
                                    <button 
                                        onClick={() => { if (finalBetTotalCost > 0 && !error) setIsConfirming(true); }} 
                                        disabled={finalBetTotalCost <= 0 || !!error}
                                        className="px-8 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-[10px] uppercase tracking-widest rounded-xl shadow-lg transition-all disabled:opacity-50"
                                    >
                                        Place Ticket
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
});

interface UserPanelProps {
  user: User;
  games: Game[];
  bets: Bet[];
  placeBet: (details: any) => Promise<void>;
}

const UserPanel = React.memo<UserPanelProps>(({ user, games, bets, placeBet }) => {
    const [selectedGame, setSelectedGame] = useState<Game | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const handlePlaceBet = async (details: any) => {
        try {
            await placeBet(details);
            setToast({ msg: "Bet confirmed successfully!", type: 'success' });
            setSelectedGame(null);
        } catch (err: any) {
            setToast({ msg: err.message || "Operation failed.", type: 'error' });
            throw err; 
        }
    };

    return (
        <div className="p-4 md:p-8 lg:p-12 max-w-7xl mx-auto space-y-16">
            <AnimatePresence>
                {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            </AnimatePresence>
            
            <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-white/5 pb-8">
                <div className="space-y-1">
                    <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Market Dashboard</h2>
                        <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded border border-cyan-400/20">Authorized Access</span>
                    </div>
                    <p className="text-slate-500 text-sm font-medium">System Profile: <span className="text-white">{user.name}</span></p>
                </div>
                <div className="glass px-8 py-4 rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1 text-right">Liquidity Pool</p>
                    <p className="text-3xl font-black text-cyan-400 font-mono tracking-tight text-right">Rs {user.wallet.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
            </header>

            <GameStakeBreakdown games={games} bets={bets} user={user} />

            <section className="space-y-8">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white uppercase tracking-widest flex items-center gap-3">
                        Active Markets
                        <span className="h-1 w-8 rounded-full bg-gradient-to-r from-cyan-500 to-transparent" />
                    </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                    {games.map((game, i) => (
                        <motion.div
                            key={game.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                        >
                            <GameCard 
                                game={game} 
                                onPlay={setSelectedGame} 
                                isRestricted={user.isRestricted} 
                            />
                        </motion.div>
                    ))}
                </div>
            </section>

            {selectedGame && (
                <BettingModal 
                    game={selectedGame} 
                    games={games}
                    user={user}
                    bets={bets}
                    onClose={() => setSelectedGame(null)} 
                    onPlaceBet={handlePlaceBet}
                />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 pt-8">
                <BetHistoryView bets={bets} games={games} user={user} />
                <LedgerView entries={user.ledger} />
            </div>

            <footer className="pt-12 text-center">
                <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.5em]">A-Baba Exchange Security Infrastructure</p>
            </footer>
        </div>
    );
});

export default UserPanel;