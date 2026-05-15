import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Game, SubGameType, LedgerEntry, Bet, PrizeRates } from '../types';
import { Icons, GAME_LOGOS } from '../constants';
import { useCountdown } from '../hooks/useCountdown';
import { useAuth } from '../hooks/useAuth';

const getTodayDateString = () => new Date().toISOString().split('T')[0];

const Toast: React.FC<{ message: string; type: 'success' | 'error'; onClose: () => void }> = ({ message, type, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 4000);
        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <motion.div 
            initial={{ opacity: 0, y: -20, x: 20 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`fixed top-6 right-6 z-[2000] p-5 rounded-2xl shadow-2xl border flex items-center gap-4 backdrop-blur-xl max-w-sm w-full ${
                type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}
        >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${type === 'success' ? 'bg-emerald-500/20' : 'bg-rose-500/20'}`}>
                {type === 'success' ? Icons.check : Icons.alertTriangle}
            </div>
            <div className="flex-1">
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-0.5">{type === 'success' ? 'System Success' : 'Security Alert'}</p>
                <p className="font-bold text-sm leading-tight text-white">{message}</p>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/5 opacity-40 hover:opacity-100 transition-all">{Icons.close}</button>
        </motion.div>
    );
};

const calculateBetPayout = (bet: Bet, game: Game | undefined, userPrizeRates: PrizeRates) => {
    if (!game || !game.winningNumber || game.winningNumber.includes('_')) return 0;
    const winningNumber = game.winningNumber;
    let winningNumbersCount = 0;
    bet.numbers.forEach(num => {
        let isWin = false;
        switch (bet.subGameType) {
            case SubGameType.OneDigitOpen: if (winningNumber.length === 2) isWin = num === winningNumber[0]; break;
            case SubGameType.OneDigitClose: if (game.name === 'AKC') isWin = num === winningNumber; else if (winningNumber.length === 2) isWin = num === winningNumber[1]; break;
            default: isWin = num === winningNumber; break;
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

const GameStakeBreakdown: React.FC<{ games: Game[], bets: Bet[], user: User }> = ({ games, bets, user }) => {
    const data = useMemo(() => {
        return games.map(game => {
            const gameBets = bets.filter(b => b.gameId === game.id);
            const totalStake = gameBets.reduce((sum, b) => sum + b.totalAmount, 0);
            const totalCommission = gameBets.reduce((sum, b) => sum + (b.totalAmount * (user.commissionRate / 100)), 0);
            const totalPrize = gameBets.reduce((sum, bet) => sum + calculateBetPayout(bet, game, user.prizeRates), 0);
            const netProfit = (totalPrize + totalCommission) - totalStake;
            return { id: game.id, name: game.name, logo: GAME_LOGOS[game.name], totalStake, totalCommission, totalPrize, netProfit, winningNumber: game.winningNumber };
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
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-32"
        >
            <div className="flex items-center gap-4 mb-10">
                <div className="h-8 w-1 bg-sky-500 rounded-full" />
                <h3 className="text-3xl font-display font-black text-white uppercase tracking-tighter">Mission Metrics</h3>
                <span className="text-[10px] font-black text-sky-500 bg-sky-500/10 border border-sky-500/20 px-4 py-2 rounded-full uppercase tracking-[0.3em] ml-auto">Cycle Performance</span>
            </div>

            <div className="elite-card rounded-[2.5rem] overflow-hidden glass-panel border-white/5">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-black/40 border-b border-white/5 text-bold">
                                <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Game Origin</th>
                                <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-right">Stake Value</th>
                                <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-right">Yield (Prize)</th>
                                <th className="p-8 text-[10px] font-black text-sky-500 uppercase tracking-[0.3em] text-right">Node Comms</th>
                                <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-right">Net Flow</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {data.map(item => (
                                <tr key={item.id} className="group hover:bg-sky-500/[0.03] transition-all">
                                    <td className="p-8">
                                        <div className="flex items-center gap-6">
                                            <div className="relative">
                                                <img src={item.logo} className="w-12 h-12 rounded-2xl border border-white/10 group-hover:border-sky-500/30 transition-all shadow-lg" alt="" />
                                                <div className="absolute -inset-1 bg-sky-500/10 blur-md opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
                                            </div>
                                            <div>
                                                <div className="text-white font-black tracking-tight text-lg uppercase font-display">{item.name}</div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-[0.2em]">Auth Result:</span>
                                                    <span className="text-[10px] text-sky-400 font-mono font-bold tracking-widest">{item.winningNumber || 'PENDING'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-8 text-right font-mono text-slate-400 font-bold text-base">
                                        Rs {item.totalStake.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="p-8 text-right">
                                        <div className={`font-mono font-black text-lg ${item.totalPrize > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
                                            Rs {item.totalPrize.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </div>
                                    </td>
                                    <td className="p-8 text-right font-mono text-sky-400/80 font-bold">
                                        Rs {item.totalCommission.toFixed(2)}
                                    </td>
                                    <td className="p-8 text-right">
                                        <div className={`font-mono font-black text-lg ${item.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {item.netProfit >= 0 ? '+' : ''}Rs {item.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-white/[0.03] border-t-2 border-white/5">
                            <tr className="font-bold">
                                <td className="p-10 text-[10px] text-slate-500 uppercase tracking-[0.4em] font-black">Aggregate Totals</td>
                                <td className="p-10 text-right font-mono text-white text-xl font-black">Rs {totals.stake.toLocaleString()}</td>
                                <td className="p-10 text-right font-mono text-emerald-400 text-xl font-black">Rs {totals.prize.toLocaleString()}</td>
                                <td className="p-10 text-right font-mono text-sky-400 text-xl font-black">Rs {totals.commission.toFixed(2)}</td>
                                <td className="p-10 text-right">
                                    <div className={`font-mono text-3xl font-black ${totals.profit >= 0 ? 'text-emerald-400 drop-shadow-[0_0_20px_rgba(52,211,153,0.3)]' : 'text-rose-400'}`}>
                                        {totals.profit >= 0 ? '+' : ''}Rs {totals.profit.toLocaleString()}
                                    </div>
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </motion.div>
    );
};

const formatTime12h = (time24: string) => {
    const [hours, minutes] = time24.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
};

const GameCard: React.FC<{ game: Game; onPlay: (game: Game) => void; isRestricted: boolean; }> = ({ game, onPlay, isRestricted }) => {
    const { status, text: countdownText } = useCountdown(game.drawTime);
    const hasFinalWinner = !!game.winningNumber && !game.winningNumber.endsWith('_');
    const isPlayable = !!game.isMarketOpen && !isRestricted;
    const isMarketClosedForDisplay = !game.isMarketOpen;
    const logo = GAME_LOGOS[game.name] || '';

    return (
        <motion.div 
            whileHover={{ y: -8, scale: 1.02 }}
            className={`elite-card rounded-[2.5rem] p-8 flex flex-col justify-between transition-all duration-500 relative overflow-hidden group border-white/5 h-full ${!isPlayable ? 'opacity-60 saturate-50' : 'hover:border-sky-500/30 hover:shadow-2xl hover:shadow-black/50'}`}
        >
            <div className={`absolute inset-0 bg-gradient-to-b from-sky-500/[0.07] to-transparent transition-opacity duration-500 ${isPlayable ? 'opacity-0 group-hover:opacity-100' : 'opacity-0'}`} />
            
            <div className="relative z-10">
                <div className="flex items-center gap-5 mb-8">
                    <div className="relative">
                        <div className="absolute -inset-1 bg-sky-500/20 blur-lg rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                        <img src={logo} alt={game.name} className="relative w-16 h-16 rounded-2xl object-cover border border-white/10 group-hover:border-sky-500/50 transition-all duration-500 shadow-xl" />
                        {isPlayable && (
                            <div className="absolute -top-1 -right-1 flex items-center justify-center">
                                <div className="absolute inset-0 bg-emerald-500/50 animate-ping rounded-full" />
                                <div className="relative w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-[#0a0c10]" />
                            </div>
                        )}
                    </div>
                    <div>
                        <h3 className="text-2xl font-display font-black text-white tracking-tight uppercase group-hover:text-sky-300 transition-colors leading-[0.9]">{game.name}</h3>
                        <div className="mt-2 flex items-center gap-2">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest font-mono">GATE</span>
                            <span className="text-[10px] font-black text-sky-400 uppercase tracking-widest font-mono">{formatTime12h(game.drawTime)}</span>
                        </div>
                    </div>
                </div>

                <div className="bg-black/30 backdrop-blur-md border border-white/5 rounded-[2rem] p-8 mb-10 flex flex-col justify-center items-center min-h-[140px] text-center group-hover:bg-black/40 transition-colors">
                    {hasFinalWinner ? (
                        <div className="animate-in fade-in zoom-in duration-700">
                            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.4em] block mb-3">Cryptic Win</span>
                            <span className="text-5xl font-mono font-black text-white drop-shadow-[0_0_20px_rgba(52,211,153,0.4)]">{game.winningNumber}</span>
                        </div>
                    ) : isMarketClosedForDisplay ? (
                        <div className="space-y-2">
                            <span className="text-[10px] font-black text-rose-400 uppercase tracking-[0.3em] block">Market Status</span>
                            <span className="text-2xl font-black text-rose-500 tracking-tighter">RESTRICTED</span>
                        </div>
                    ) : status === 'OPEN' ? (
                        <div className="space-y-2">
                            <span className="text-[10px] font-black text-sky-400 uppercase tracking-[0.4em] block">Sync Lock In</span>
                            <span className="text-4xl font-mono font-black text-slate-100 tracking-tighter italic">{countdownText}</span>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] block">Queueing</span>
                            <span className="text-2xl font-mono font-black text-slate-500 uppercase tracking-widest">{countdownText}</span>
                        </div>
                    )}
                </div>
            </div>

            <button 
                onClick={() => onPlay(game)} 
                disabled={!isPlayable} 
                className={`w-full py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.4em] transition-all relative z-10 overflow-hidden shadow-2xl ${isPlayable ? 'bg-sky-600 text-white shadow-sky-500/20 hover:bg-sky-500 active:scale-[0.97]' : 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/5'}`}
            >
                <span className="relative z-10">{isPlayable ? 'INITIALIZE' : (isRestricted ? 'LOCKED' : 'CLOSED')}</span>
                {isPlayable && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />}
            </button>
        </motion.div>
    );
};

const BettingModal: React.FC<{ game: Game | null, games: Game[], user: User, onClose: () => void, onPlaceBet: (details: any) => Promise<void> }> = ({ game, games, user, onClose, onPlaceBet }) => {
    const { fetchWithAuth } = useAuth();
    const [subGameType, setSubGameType] = useState<SubGameType>(SubGameType.TwoDigit);
    const [manualNumbersInput, setManualNumbersInput] = useState('');
    const [manualAmountInput, setManualAmountInput] = useState('');
    const [bulkInput, setBulkInput] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);

    const [comboDigitsInput, setComboDigitsInput] = useState('');
    const [generatedCombos, setGeneratedCombos] = useState<any[]>([]);
    const [comboGlobalStake, setComboGlobalStake] = useState('');

    const { text: countdownText } = useCountdown(game?.drawTime || '00:00');

    const availableSubGameTabs = useMemo(() => {
        if (!game) return [];
        const types = [SubGameType.TwoDigit, SubGameType.OneDigitOpen, SubGameType.OneDigitClose, SubGameType.Bulk, SubGameType.Combo];
        if (game.name === 'AKC') return [SubGameType.OneDigitClose];
        if (game.name === 'AK') return types.filter(t => t !== SubGameType.OneDigitClose);
        return types;
    }, [game]);

    useEffect(() => {
        setManualNumbersInput(''); setManualAmountInput(''); setBulkInput(''); setComboDigitsInput(''); setGeneratedCombos([]); setComboGlobalStake(''); setError(null); setIsConfirming(false);
    }, [subGameType]);

    const handleManualNumberChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const raw = e.target.value.replace(/\D/g, '');
        if (!raw) { setManualNumbersInput(''); return; }
        let fmt = '';
        if (subGameType === SubGameType.TwoDigit) fmt = (raw.match(/.{1,2}/g) || []).join(', ');
        else fmt = raw.split('').join(', ');
        setManualNumbersInput(fmt);
    };

    const handleAiLuckyPick = async () => {
        setIsAiLoading(true); setError(null);
        try {
            const res = await fetchWithAuth('/api/user/ai-lucky-pick', { method: 'POST', body: JSON.stringify({ gameType: subGameType, count: 5 }) });
            const data = await res.json();
            const raw = data.luckyNumbers.replace(/,/g, '');
            let fmt = subGameType === SubGameType.TwoDigit ? (raw.match(/.{1,2}/g) || []).join(', ') : raw.split('').join(', ');
            setManualNumbersInput(fmt);
        } catch (err: any) { setError(err.message); } finally { setIsAiLoading(false); }
    };

    const parsedBulkBet = useMemo(() => {
        const res: any = { betsByGame: new Map(), grandTotalCost: 0, grandTotalNumbers: 0, errors: [] };
        if (!game || !bulkInput.trim()) return res;
        const nameMap = new Map(); games.forEach(g => nameMap.set(g.name.toLowerCase().replace(/\s+/g, ''), g.id));
        const namesRegex = new RegExp(`\\b(${Array.from(nameMap.keys()).join('|')})\\b`, 'i');
        let currentGId: string | null = game.id;
        for (const line of bulkInput.trim().split('\n')) {
            let lineStr = line.trim(); if (!lineStr) continue;
            const match = lineStr.toLowerCase().replace(/\s+/g, '').match(namesRegex);
            if (match) {
                currentGId = nameMap.get(match[0]) || null;
                const origName = games.find(g => g.id === currentGId)?.name || '';
                lineStr = lineStr.replace(new RegExp(`\\b(${origName})\\b`, 'i'), '').trim();
            }
            if (!currentGId) continue;
            const gName = games.find(g => g.id === currentGId)?.name || '';
            const sMatch = lineStr.match(/(?:rs|r)?\s*(\d+\.?\d*)$/i);
            const stake = sMatch ? parseFloat(sMatch[1]) : 0;
            if (stake <= 0) continue;
            let bPart = sMatch ? lineStr.substring(0, sMatch.index).trim() : lineStr;
            const isC = /\b(k|combo)\b/i.test(bPart);
            bPart = bPart.replace(/\b(k|combo)\b/i, '').trim();
            const tokens = bPart.split(/[-.,_*\/+<>=%;'\s]+/).filter(Boolean);
            let items: any[] = [];
            const isAKC = gName === 'AKC';
            for (const token of tokens) {
                let type: SubGameType | null = null;
                if (isC) type = SubGameType.Combo;
                else if (isAKC) type = /^\d$/.test(token) ? SubGameType.OneDigitClose : null;
                else if (/^\d\d$/.test(token)) type = SubGameType.TwoDigit;
                else if (/^\d[xX]$/i.test(token)) type = SubGameType.OneDigitOpen;
                else if (/^[xX]\d$/i.test(token)) type = SubGameType.OneDigitClose;
                if (!type) continue;
                let val = type === SubGameType.TwoDigit ? token.padStart(2, '0') : (type === SubGameType.OneDigitOpen ? token[0] : (token.length === 2 ? token[1] : token[0]));
                items.push({ number: val, subGameType: type });
            }
            if (items.length === 0) continue;
            if (!res.betsByGame.has(currentGId)) res.betsByGame.set(currentGId, { gameName: gName, totalCost: 0, totalNumbers: 0, betGroups: new Map() });
            const gData = res.betsByGame.get(currentGId)!;
            for (const i of items) {
                const key = `${i.subGameType}__${stake}`;
                if (!gData.betGroups.has(key)) gData.betGroups.set(key, { subGameType: i.subGameType, numbers: [], amountPerNumber: stake });
                gData.betGroups.get(key)!.numbers.push(i.number); gData.totalNumbers++; gData.totalCost += stake;
            }
        }
        res.grandTotalCost = Array.from(res.betsByGame.values()).reduce((s: number, g: any) => s + g.totalCost, 0);
        res.grandTotalNumbers = Array.from(res.betsByGame.values()).reduce((s: number, g: any) => s + g.totalNumbers, 0);
        return res;
    }, [bulkInput, games, game]);

    const handleGenerateCombos = () => {
        const uDigits = [...new Set(comboDigitsInput.replace(/\D/g, '').split(''))];
        if (uDigits.length < 3 || uDigits.length > 6) { setError("3-6 digits required"); return; }
        const ps: string[] = [];
        for (let i = 0; i < uDigits.length; i++) for (let j = 0; j < uDigits.length; j++) if (i !== j) ps.push(uDigits[i] + uDigits[j]);
        setGeneratedCombos(ps.map(p => ({ number: p, stake: '', selected: true })));
    };

    const parsedManualBet = useMemo(() => {
        const res = { numbers: [] as string[], totalCost: 0, error: null as string | null, count: 0, stake: parseFloat(manualAmountInput) || 0 };
        const raw = manualNumbersInput.replace(/\D/g, '');
        if (raw.length > 0) {
            if (subGameType === SubGameType.TwoDigit) {
                if (raw.length % 2 !== 0) res.error = "Digit count must be even"; else res.numbers = [...new Set(raw.match(/.{2}/g) || [])];
            } else res.numbers = [...new Set(raw.split(''))];
        }
        res.count = res.numbers.length; res.totalCost = res.count * res.stake;
        return res;
    }, [manualNumbersInput, manualAmountInput, subGameType]);

    const handleBet = async () => {
        if (!game) return; setError(null); setIsSubmitting(true);
        try {
            if (subGameType === SubGameType.Combo) {
                const valid = generatedCombos.filter(c => c.selected && parseFloat(c.stake) > 0);
                if (valid.length === 0) throw new Error("Set stakes");
                const cost = valid.reduce((s, c) => s + parseFloat(c.stake), 0);
                if (cost > user.wallet) throw new Error("Insufficient balance");
                const groupsMap = new Map(); valid.forEach(b => {
                    const s = parseFloat(b.stake); if (!groupsMap.has(s)) groupsMap.set(s, []); groupsMap.get(s).push(b.number);
                });
                const betGroups = Array.from(groupsMap.entries()).map(([amount, numbers]) => ({ subGameType: SubGameType.Combo, numbers, amountPerNumber: amount }));
                await onPlaceBet({ gameId: game.id, betGroups });
            } else if (subGameType === SubGameType.Bulk) {
                const { betsByGame } = parsedBulkBet;
                if (betsByGame.size === 0) throw new Error("No valid entries");
                const multi: any = {}; betsByGame.forEach((v: any, k: string) => { multi[k] = { gameName: v.gameName, betGroups: Array.from(v.betGroups.values()) }; });
                await onPlaceBet({ isMultiGame: true, multiGameBets: multi });
            } else {
                const { numbers, totalCost, error: pErr, stake } = parsedManualBet;
                if (stake <= 0) throw new Error("Invalid amount"); if (pErr) throw new Error(pErr);
                if (numbers.length === 0) throw new Error("Enter numbers"); if (totalCost > user.wallet) throw new Error("Limit exceeded");
                await onPlaceBet({ gameId: game.id, betGroups: [{ subGameType, numbers, amountPerNumber: stake }] });
            }
        } catch (err: any) { setError(err.message); setIsConfirming(false); } finally { setIsSubmitting(false); }
    };

    if (!game) return null;
    const finalCount = subGameType === SubGameType.Bulk ? parsedBulkBet.grandTotalNumbers : (subGameType === SubGameType.Combo ? generatedCombos.filter(c => c.selected).length : parsedManualBet.count);
    const finalCost = subGameType === SubGameType.Bulk ? parsedBulkBet.grandTotalCost : (subGameType === SubGameType.Combo ? generatedCombos.reduce((s, c) => c.selected ? s + (parseFloat(c.stake) || 0) : s, 0) : parsedManualBet.totalCost);

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex justify-center items-center z-50 p-6">
            <motion.div 
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                className="elite-card glass-panel rounded-3xl w-full max-w-lg border border-white/10 flex flex-col max-h-[90vh] overflow-hidden"
            >
                <div className="flex justify-between items-center p-8 border-b border-white/5">
                    <div>
                        <h3 className="text-xl font-bold text-white uppercase tracking-tight">{isConfirming ? "Confirm Operation" : `Terminal: ${game.name}`}</h3>
                        <div className="flex gap-2 mt-2">
                            <span className="text-[9px] font-black uppercase text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded tracking-widest">{formatTime12h(game.drawTime)}</span>
                            <span className="text-[9px] font-black uppercase text-sky-400 bg-sky-400/10 px-2 py-0.5 rounded tracking-widest animate-pulse font-mono">{countdownText}</span>
                        </div>
                    </div>
                    {!isConfirming && <button onClick={onClose} className="p-2 rounded-xl bg-white/5 text-slate-500 hover:text-white transition-all">{Icons.close}</button>}
                </div>

                <div className="p-8 overflow-y-auto no-scrollbar">
                    {isConfirming ? (
                        <div className="text-center space-y-8 animate-in fade-in duration-500">
                            <div className="w-20 h-20 bg-emerald-500/10 border-2 border-emerald-500/30 rounded-full flex items-center justify-center mx-auto text-emerald-400">
                                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>
                            </div>
                            <div className="space-y-2">
                                <h4 className="text-white font-bold uppercase tracking-widest text-sm">Review Manifest</h4>
                                <p className="text-slate-500 text-xs">Verify ticket parameters before encryption.</p>
                            </div>
                            <div className="elite-card rounded-2xl border border-white/5 overflow-hidden text-left bg-black/20 divide-y divide-white/5">
                                <div className="p-4 flex justify-between items-center"><span className="text-[10px] font-bold text-slate-500 uppercase">Gateway</span><span className="text-sky-400 font-bold">{subGameType}</span></div>
                                <div className="p-4"><span className="text-[10px] font-bold text-slate-500 uppercase block mb-3">Payload Data</span><div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-2 no-scrollbar">{(subGameType === SubGameType.Bulk ? [] : subGameType === SubGameType.Combo ? generatedCombos.filter(c => c.selected).map(c => c.number) : parsedManualBet.numbers).map((n, i) => (<span key={i} className="px-2 py-1 bg-white/5 rounded font-mono text-white text-xs">{n}</span>))}{subGameType === SubGameType.Bulk && <span className="text-sky-500 italic text-xs">Dynamic Multi-Data Packets</span>}</div></div>
                                <div className="p-6 grid grid-cols-2 bg-sky-500/5"><div className="text-left font-mono"><p className="text-[9px] text-slate-500 uppercase font-black">Entries</p><p className="text-xl text-white font-black">{finalCount}</p></div><div className="text-right font-mono"><p className="text-[9px] text-emerald-500 uppercase font-black">Price</p><p className="text-2xl text-emerald-400 font-black tracking-tighter">Rs {finalCost.toLocaleString()}</p></div></div>
                            </div>
                            <div className="flex gap-4">
                                <button onClick={() => setIsConfirming(false)} className="flex-1 py-4 bg-white/5 border border-white/10 text-white font-bold rounded-xl tracking-widest uppercase text-[10px] hover:bg-white/10 active:scale-95 transition-all">Abort</button>
                                <button onClick={handleBet} disabled={isSubmitting} className="flex-1 py-4 bg-emerald-600 shadow-xl shadow-emerald-500/10 text-white font-black rounded-xl tracking-[0.2em] uppercase text-[11px] hover:bg-emerald-500 active:scale-95 transition-all flex items-center justify-center gap-2">{isSubmitting ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"/> : 'AUTHORIZE'}</button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex p-2 bg-black/40 rounded-[1.5rem] border border-white/5 overflow-x-auto no-scrollbar">
                                {availableSubGameTabs.map(t => (
                                    <button 
                                        key={t} 
                                        onClick={() => setSubGameType(t)} 
                                        className={`flex-1 py-3 px-6 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all whitespace-nowrap ${subGameType === t ? 'bg-sky-600 text-white shadow-xl shadow-sky-500/20' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>

                            {subGameType === SubGameType.Bulk ? (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center px-1 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">
                                        <span>Protocol Input</span>
                                        <span className="opacity-40">v4.0 ALPHA</span>
                                    </div>
                                    <textarea 
                                        value={bulkInput} 
                                        onChange={e => setBulkInput(e.target.value)} 
                                        rows={10} 
                                        placeholder={"BATCH PROTOCOL:\nAK 43,9x,x2 20\nLS3 k123 50"} 
                                        className="w-full bg-black/40 border border-white/10 rounded-[1.5rem] p-8 text-white font-mono text-sm focus:border-sky-500/50 outline-none transition-all resize-none leading-relaxed"
                                    />
                                </div>
                            ) : subGameType === SubGameType.Combo ? (
                                <div className="space-y-8">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1">Sequence Seed</label>
                                        <div className="flex gap-4">
                                            <input 
                                                type="text" 
                                                value={comboDigitsInput} 
                                                onChange={e => setComboDigitsInput(e.target.value)} 
                                                placeholder="3-6 DIGIT SEED" 
                                                className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white font-mono text-lg focus:border-sky-500/50 outline-none tracking-tighter" 
                                                maxLength={6}
                                            />
                                            <button onClick={handleGenerateCombos} className="px-8 bg-sky-600 text-white font-black rounded-2xl active:scale-95 transition-all shadow-lg shadow-sky-500/20 uppercase text-[10px] tracking-widest">Map</button>
                                        </div>
                                    </div>
                                    {generatedCombos.length > 0 && (
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center px-1 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">
                                                <span>Permutations ({generatedCombos.length})</span>
                                            </div>
                                            <div className="max-h-64 overflow-y-auto pr-4 no-scrollbar space-y-3">
                                                {generatedCombos.map((c, i) => (
                                                    <div key={i} className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5 group hover:bg-white/[0.08] transition-all">
                                                        <div className="relative flex items-center justify-center w-6 h-6">
                                                            <input 
                                                                type="checkbox" 
                                                                checked={c.selected} 
                                                                onChange={e => setGeneratedCombos(p => p.map((x, j) => i === j ? {...x, selected: e.target.checked} : x))} 
                                                                className="w-5 h-5 rounded-lg bg-black border-white/10 text-sky-500 checked:bg-sky-600 transition-all opacity-0 absolute inset-0 z-10 cursor-pointer"
                                                            />
                                                            <div className={`w-5 h-5 rounded-lg border-2 transition-all flex items-center justify-center ${c.selected ? 'bg-sky-600 border-sky-600' : 'border-white/20'}`}>
                                                                {c.selected && <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"/></svg>}
                                                            </div>
                                                        </div>
                                                        <span className="font-mono text-xl text-white font-black italic tracking-tighter flex-1">{c.number}</span>
                                                        <div className="relative">
                                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-600 uppercase">Rs</span>
                                                            <input 
                                                                type="number" 
                                                                value={c.stake} 
                                                                onChange={e => setGeneratedCombos(p => p.map((x, j) => i === j ? {...x, stake: e.target.value} : x))} 
                                                                placeholder="0" 
                                                                className="w-32 bg-black/40 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-right text-white font-mono text-base outline-none focus:border-sky-500/50" 
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-8">
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center px-1">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Payload Vectors</label>
                                            <button onClick={handleAiLuckyPick} disabled={isAiLoading} className="text-[10px] font-black text-sky-500 uppercase tracking-[0.2em] flex items-center gap-3 active:scale-95 group transition-all">
                                                {isAiLoading ? <div className="w-3.5 h-3.5 border-2 border-sky-400/20 border-t-sky-400 rounded-full animate-spin"/> : Icons.sparkles} 
                                                <span className="group-hover:text-white">AI DECRYPTION</span>
                                            </button>
                                        </div>
                                        <textarea 
                                            value={manualNumbersInput} 
                                            onChange={handleManualNumberChange} 
                                            rows={4} 
                                            placeholder={subGameType === SubGameType.TwoDigit ? "e.g. 14, 05, 88" : "e.g. 1, 2, 9"} 
                                            className="w-full bg-black/40 border border-white/10 rounded-[1.5rem] p-8 text-white font-mono text-2xl font-black italic tracking-tighter focus:border-sky-500/50 outline-none transition-all resize-none shadow-inner"
                                        />
                                    </div>
                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1">Magnitude (Stake)</label>
                                        <div className="relative group">
                                            <span className="absolute left-6 top-1/2 -translate-y-1/2 text-sm font-black text-sky-500/50 group-focus-within:text-sky-500 transition-colors uppercase">Rs</span>
                                            <input 
                                                type="number" 
                                                value={manualAmountInput} 
                                                onChange={e => setManualAmountInput(e.target.value)} 
                                                placeholder="100.00" 
                                                className="w-full bg-black/40 border border-white/10 rounded-2xl py-6 pl-16 pr-8 text-white font-mono text-2xl font-black focus:border-sky-500/50 outline-none shadow-inner tracking-tighter"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="bg-sky-500/5 p-8 rounded-[2rem] grid grid-cols-2 gap-8 border border-sky-500/10 text-center font-mono relative overflow-hidden group">
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-sky-500/[0.03] to-transparent -translate-x-full group-hover:animate-shimmer" />
                                <div className="relative z-10 border-r border-white/5">
                                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-[0.3em] mb-2">Total Units</p>
                                    <p className="text-3xl font-black text-white tracking-tighter italic">{finalCount}</p>
                                </div>
                                <div className="relative z-10">
                                    <p className="text-[10px] text-emerald-500 uppercase font-black tracking-[0.3em] mb-2">Aggregate Price</p>
                                    <p className="text-3xl font-black text-emerald-400 tracking-tighter italic">Rs {finalCost.toLocaleString()}</p>
                                </div>
                            </div>

                            {error && (
                                <motion.div 
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] p-5 rounded-2xl text-center uppercase tracking-[0.2em] font-black leading-relaxed"
                                >
                                    {error}
                                </motion.div>
                            )}

                            <button 
                                onClick={() => { if (finalCost > 0 && !error) setIsConfirming(true); }} 
                                disabled={finalCost <= 0 || !!error} 
                                className="w-full py-6 bg-sky-600 hover:bg-sky-500 text-white font-black rounded-[1.5rem] tracking-[0.5em] uppercase transition-all shadow-2xl shadow-sky-500/30 active:scale-[0.98] disabled:opacity-30 disabled:grayscale mt-4 relative overflow-hidden group"
                            >
                                <span className="relative z-10">Initialize Sync</span>
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
                            </button>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

const BetHistoryView: React.FC<{ bets: Bet[], games: Game[], user: User }> = ({ bets, games, user }) => {
    const [startDate, setStartDate] = useState(getTodayDateString());
    const [endDate, setEndDate] = useState(getTodayDateString());
    const [searchTerm, setSearchTerm] = useState('');

    const filteredBets = useMemo(() => {
        return bets.filter(bet => {
            const betDateStr = bet.timestamp.toISOString().split('T')[0];
            if (startDate && betDateStr < startDate) return false;
            if (endDate && betDateStr > endDate) return false;
            if (searchTerm.trim()) {
                const game = games.find(g => g.id === bet.gameId);
                const query = searchTerm.toLowerCase();
                return game?.name.toLowerCase().includes(query) || bet.subGameType.toLowerCase().includes(query);
            }
            return true;
        });
    }, [bets, games, startDate, endDate, searchTerm]);

    return (
        <div className="space-y-10">
            <div className="flex items-center gap-4">
                <div className="h-8 w-1 bg-emerald-500 rounded-full" />
                <h3 className="text-3xl font-display font-black text-white uppercase tracking-tighter text-left">Cipher Logs</h3>
                <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-full uppercase tracking-[0.3em] ml-auto">Verified Trace</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-black/40 p-3 rounded-[1.5rem] border border-white/5 backdrop-blur-md">
                <div className="space-y-1">
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-3">Start Gate</span>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-white/5 text-white p-3 rounded-xl outline-none focus:bg-white/10 border border-transparent focus:border-emerald-500/30 transition-all font-mono text-xs" />
                </div>
                <div className="space-y-1">
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-3">End Gate</span>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-white/5 text-white p-3 rounded-xl outline-none focus:bg-white/10 border border-transparent focus:border-emerald-500/30 transition-all font-mono text-xs" />
                </div>
                <div className="space-y-1">
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-3">Filter Vector</span>
                    <input type="text" placeholder="QUERY MARKET..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-white/5 text-white p-3 rounded-xl outline-none focus:bg-white/10 border border-transparent focus:border-emerald-500/30 transition-all font-black text-[9px] uppercase tracking-widest h-[42px]" />
                </div>
            </div>

            <div className="elite-card rounded-[2.5rem] overflow-hidden glass-panel border-white/5 shadow-2xl">
                <div className="overflow-x-auto max-h-[35rem] no-scrollbar">
                    <table className="w-full text-left">
                        <thead className="sticky top-0 bg-[#0a0c10] z-20">
                            <tr className="border-b border-white/5">
                                <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] whitespace-nowrap">Timestamp</th>
                                <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Transaction Packet</th>
                                <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-right">Stake</th>
                                <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-right">Yield</th>
                                <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {[...filteredBets].reverse().map(bet => {
                                const game = games.find(g => g.id === bet.gameId);
                                const payout = calculateBetPayout(bet, game, user.prizeRates);
                                const status = (!game?.winningNumber || game.winningNumber.includes('_')) ? 'PENDING' : (payout > 0 ? 'SUCCESS' : 'SETTLED');
                                return (
                                    <tr key={bet.id} className="group hover:bg-white/[0.03] transition-all">
                                        <td className="p-8">
                                            <div className="text-[10px] font-mono text-slate-500">{bet.timestamp.toLocaleDateString()}</div>
                                            <div className="text-[11px] font-mono text-slate-400 font-bold">{bet.timestamp.toLocaleTimeString()}</div>
                                        </td>
                                        <td className="p-8">
                                            <div className="text-white font-black text-lg tracking-tight font-display uppercase italic leading-none">{game?.name}</div>
                                            <div className="flex items-center gap-2 mt-2">
                                                <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{bet.subGameType}</span>
                                                <span className="w-1 h-1 rounded-full bg-slate-700" />
                                                <span className="text-[9px] text-sky-400 font-mono font-bold tracking-widest">{bet.numbers.length} UNITS</span>
                                            </div>
                                        </td>
                                        <td className="p-8 text-right font-mono text-rose-500/80 font-black text-base italic">Rs {bet.totalAmount.toFixed(0)}</td>
                                        <td className="p-8 text-right">
                                            <div className={`font-mono font-black text-lg ${payout > 0 ? 'text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.3)]' : 'text-slate-700'}`}>
                                                {payout > 0 ? `+Rs ${payout.toLocaleString()}` : '---'}
                                            </div>
                                        </td>
                                        <td className="p-8 text-right">
                                            <span className={`text-[9px] font-black uppercase tracking-[0.3em] px-3 py-1.5 rounded-xl bg-black/40 border transition-all duration-500 ${status === 'SUCCESS' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5' : status === 'SETTLED' ? 'border-white/5 text-slate-600' : 'border-amber-500/30 text-amber-500 bg-amber-500/5 pulse-subtle'}`}>
                                                {status}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const LedgerView: React.FC<{ entries: LedgerEntry[] }> = ({ entries }) => {
    return (
        <div className="space-y-10">
            <div className="flex items-center gap-4">
                <div className="h-8 w-1 bg-sky-500 rounded-full" />
                <h3 className="text-3xl font-display font-black text-white uppercase tracking-tighter">Chain Ledger</h3>
                <span className="text-[10px] font-black text-sky-500 bg-sky-500/10 border border-sky-500/20 px-4 py-2 rounded-full uppercase tracking-[0.3em] ml-auto">Auth History</span>
            </div>

            <div className="elite-card rounded-[2.5rem] overflow-hidden glass-panel border-white/5 shadow-2xl">
                <div className="overflow-x-auto max-h-[40rem] no-scrollbar">
                    <table className="w-full text-left">
                        <thead className="sticky top-0 bg-[#0a0c10] z-20">
                            <tr className="border-b border-white/5">
                                <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] whitespace-nowrap">Execution Time</th>
                                <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Activity Vector</th>
                                <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-right">Delta</th>
                                <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-right">Final Index</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {[...entries].reverse().map(e => (
                                <tr key={e.id} className="hover:bg-white/[0.03] group transition-all">
                                    <td className="p-8">
                                        <div className="text-[10px] font-mono text-slate-500">{e.timestamp.toLocaleDateString()}</div>
                                        <div className="text-[11px] font-mono text-sky-500/60 font-bold">{e.timestamp.toLocaleTimeString()}</div>
                                    </td>
                                    <td className="p-8">
                                        <div className="text-white font-black text-base tracking-tight uppercase font-display leading-tight">{e.description}</div>
                                        <div className="text-[9px] text-slate-600 font-bold uppercase tracking-widest mt-1">Transaction Verified</div>
                                    </td>
                                    <td className="p-8 text-right font-mono font-black text-lg">
                                        {e.debit > 0 ? (
                                            <span className="text-rose-500 italic">-{e.debit.toFixed(0)}</span>
                                        ) : (
                                            <span className="text-emerald-400 italic">+{e.credit.toFixed(0)}</span>
                                        )}
                                    </td>
                                    <td className="p-8 text-right font-mono font-black text-white text-xl tracking-tighter italic">
                                        Rs {e.balance.toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const UserPanel: React.FC<{ user: User, games: Game[], bets: Bet[], placeBet: (details: any) => Promise<void> }> = ({ user, games, bets, placeBet }) => {
    const [selectedGame, setSelectedGame] = useState<Game | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const stats = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        const todayBets = bets.filter(b => b.timestamp.toISOString().split('T')[0] === today);
        const totalWinnings = todayBets.reduce((sum, b) => {
            const game = games.find(g => g.id === b.gameId);
            return sum + calculateBetPayout(b, game, user.prizeRates);
        }, 0);
        return {
            todayStake: todayBets.reduce((sum, b) => sum + b.totalAmount, 0),
            todayWinnings,
            totalActiveGames: games.filter(g => g.isMarketOpen).length
        };
    }, [bets, games, user]);

    return (
        <div className="max-w-7xl mx-auto px-8 py-16 md:py-24 relative z-10">
            <AnimatePresence>
                {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            </AnimatePresence>
            
            <motion.div 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-24"
            >
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-12">
                    <div className="space-y-6">
                        <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-sky-500/10 border border-sky-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                            <span className="text-[10px] font-black text-sky-400 uppercase tracking-[0.3em]">Node Operational</span>
                        </div>
                        <div className="border-l-4 border-sky-600 pl-8">
                            <h2 className="text-5xl md:text-8xl font-display font-black text-white tracking-tighter uppercase leading-[0.85] mb-4">
                                Control <br />
                                <span className="text-gradient-cyan">Center</span>
                            </h2>
                            <p className="text-slate-500 font-bold uppercase tracking-[0.4em] text-[10px]">Active Terminal: <span className="text-sky-500">{user.name}</span></p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full lg:w-auto">
                        <div className="elite-card px-10 py-8 rounded-[2.5rem] glass-panel min-w-[320px] relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                                {Icons.wallet}
                            </div>
                            <p className="text-[10px] text-slate-500 uppercase font-black tracking-[0.4em] mb-4 opacity-60">Liquid Liquidity</p>
                            <div className="flex items-baseline gap-2">
                                <span className="text-sm font-bold text-sky-500 uppercase font-mono">Rs</span>
                                <span className="text-5xl font-black text-white font-mono tracking-tighter italic drop-shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                                    {user.wallet.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="elite-card p-6 rounded-[2rem] bg-emerald-500/5 border-emerald-500/10">
                                <p className="text-[9px] text-emerald-500/60 uppercase font-black tracking-widest mb-2">Today Win</p>
                                <p className="text-xl font-black text-emerald-400 font-mono tracking-tighter">+{stats.todayWinnings.toLocaleString()}</p>
                            </div>
                            <div className="elite-card p-6 rounded-[2rem] bg-rose-500/5 border-rose-500/10">
                                <p className="text-[9px] text-rose-500/60 uppercase font-black tracking-widest mb-2">Today Stake</p>
                                <p className="text-xl font-black text-rose-400 font-mono tracking-tighter">-{stats.todayStake.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>

            <GameStakeBreakdown games={games} bets={bets} user={user} />

            <div className="mb-32">
                <div className="flex items-center justify-between mb-12">
                    <div className="flex items-center gap-4">
                        <div className="h-8 w-1 bg-sky-500 rounded-full" />
                        <h3 className="text-3xl font-display font-black text-white uppercase tracking-tighter">Active Markets</h3>
                    </div>
                    <div className="px-4 py-2 bg-white/5 rounded-2xl border border-white/10 text-[10px] font-black text-slate-500 tracking-[0.2em] uppercase">
                        {stats.totalActiveGames} Synchronized
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-10">
                    {games.map((g, i) => (
                        <motion.div 
                            key={g.id} 
                            initial={{ opacity: 0, y: 20 }} 
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1 }}
                        >
                            <GameCard game={g} onPlay={setSelectedGame} isRestricted={user.isRestricted} />
                        </motion.div>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-24 items-start">
                <BetHistoryView bets={bets} games={games} user={user} />
                <LedgerView entries={user.ledger} />
            </div>

            <AnimatePresence>
                {selectedGame && (
                    <BettingModal 
                        game={selectedGame} games={games} user={user} 
                        onClose={() => setSelectedGame(null)} 
                        onPlaceBet={async (d) => {
                            try {
                                await placeBet(d); 
                                setToast({ msg: "Transaction synchronized successfully.", type: 'success' });
                                setSelectedGame(null);
                            } catch (e: any) { setToast({ msg: e.message, type: 'error' }); throw e; }
                        }} 
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default UserPanel;
