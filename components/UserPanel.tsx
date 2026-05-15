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
            animate={{ opacity: 1, y: 0 }}
            className="mb-16"
        >
            <div className="flex items-center gap-4 mb-8">
                <div className="h-8 w-1 bg-sky-500 rounded-full" />
                <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Mission Performance</h3>
                <span className="text-[10px] font-bold text-sky-500 bg-sky-500/10 border border-sky-500/20 px-3 py-1 rounded-full uppercase tracking-widest ml-auto">Real-time Stats</span>
            </div>

            <div className="elite-card rounded-3xl overflow-hidden glass-panel">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-black/40 border-b border-white/5">
                                <th className="p-6 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Game Origin</th>
                                <th className="p-6 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] text-right">Stake Value</th>
                                <th className="p-6 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] text-right">Yield (Prize)</th>
                                <th className="p-6 text-[10px] font-bold text-sky-500 uppercase tracking-[0.2em] text-right">Node Comms</th>
                                <th className="p-6 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] text-right">Net Liquidity</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {data.map(item => (
                                <tr key={item.id} className="group hover:bg-sky-500/5 transition-all">
                                    <td className="p-6">
                                        <div className="flex items-center gap-4">
                                            <img src={item.logo} className="w-10 h-10 rounded-full border border-white/10 group-hover:border-sky-500/30 transition-all" alt="" />
                                            <div>
                                                <div className="text-white font-bold tracking-tight text-base">{item.name}</div>
                                                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">{item.winningNumber || '---'}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-6 text-right font-mono text-slate-400 font-bold">
                                        Rs {item.totalStake.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="p-6 text-right">
                                        <div className={`font-mono font-black ${item.totalPrize > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
                                            Rs {item.totalPrize.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </div>
                                    </td>
                                    <td className="p-6 text-right font-mono text-sky-400/80 font-bold">
                                        Rs {item.totalCommission.toFixed(2)}
                                    </td>
                                    <td className="p-6 text-right">
                                        <div className={`font-mono font-black ${item.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {item.netProfit >= 0 ? '+' : ''}Rs {item.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-white/[0.02] border-t border-white/10">
                            <tr className="font-bold">
                                <td className="p-8 text-[10px] text-slate-500 uppercase tracking-[0.3em]">Aggregate Totals</td>
                                <td className="p-8 text-right font-mono text-white text-lg font-black">Rs {totals.stake.toLocaleString()}</td>
                                <td className="p-8 text-right font-mono text-emerald-400 text-lg font-black underline decoration-emerald-500/30 underline-offset-8">Rs {totals.prize.toLocaleString()}</td>
                                <td className="p-8 text-right font-mono text-sky-400 text-lg font-black">Rs {totals.commission.toFixed(2)}</td>
                                <td className="p-8 text-right">
                                    <div className={`font-mono text-2xl font-black ${totals.profit >= 0 ? 'text-emerald-400 drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'text-rose-400'}`}>
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
            whileHover={{ y: -4 }}
            className={`elite-card rounded-2xl p-6 flex flex-col justify-between transition-all duration-500 relative overflow-hidden group ${!isPlayable ? 'opacity-60 saturate-50' : 'hover:border-sky-500/40 hover:shadow-2xl hover:shadow-sky-500/10'}`}
        >
            <div className={`absolute inset-0 bg-gradient-to-b from-sky-500/5 to-transparent transition-opacity duration-500 ${isPlayable ? 'opacity-0 group-hover:opacity-100' : 'opacity-0'}`} />
            
            <div className="relative z-10">
                <div className="flex items-center gap-4 mb-6">
                    <div className="relative">
                        <img src={logo} alt={game.name} className="w-14 h-14 rounded-2xl object-cover border border-white/10 group-hover:border-sky-500/50 transition-all duration-500" />
                        {isPlayable && <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#0a0c10]" />}
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white tracking-tight uppercase group-hover:text-sky-300 transition-colors">{game.name}</h3>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">DRAW @ {formatTime12h(game.drawTime)}</p>
                    </div>
                </div>

                <div className="bg-black/30 border border-white/5 rounded-2xl p-5 mb-6 flex flex-col justify-center items-center min-h-[100px] text-center">
                    {hasFinalWinner ? (
                        <div className="animate-in fade-in zoom-in duration-500">
                            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-[0.3em] block mb-2">Authenticated Result</span>
                            <span className="text-4xl font-mono font-black text-white drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]">{game.winningNumber}</span>
                        </div>
                    ) : isMarketClosedForDisplay ? (
                        <div>
                            <span className="text-[10px] font-bold text-rose-400 uppercase tracking-[0.2em] block mb-1">Status</span>
                            <span className="text-xl font-black text-rose-500/80">MARKET CLOSED</span>
                        </div>
                    ) : status === 'OPEN' ? (
                        <div>
                            <span className="text-[10px] font-bold text-sky-400 uppercase tracking-[0.3em] block mb-2">Gate Closes In</span>
                            <span className="text-3xl font-mono font-black text-slate-100 italic">{countdownText}</span>
                        </div>
                    ) : (
                        <div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] block mb-1">Queueing</span>
                            <span className="text-xl font-mono font-bold text-slate-500 uppercase">{countdownText}</span>
                        </div>
                    )}
                </div>
            </div>

            <button 
                onClick={() => onPlay(game)} 
                disabled={!isPlayable} 
                className={`w-full py-4 rounded-xl font-black text-[11px] uppercase tracking-[0.3em] transition-all relative z-10 ${isPlayable ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20 hover:bg-sky-400 active:scale-95' : 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/5'}`}
            >
                {isPlayable ? 'Initialize Entry' : (isRestricted ? 'Account Locked' : 'Market Closed')}
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
                            <div className="flex p-1.5 bg-black/40 rounded-2xl border border-white/5 overflow-x-auto no-scrollbar">
                                {availableSubGameTabs.map(t => (<button key={t} onClick={() => setSubGameType(t)} className={`flex-1 py-2 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${subGameType === t ? 'bg-sky-600 text-white shadow-xl' : 'text-slate-500 hover:text-slate-300'}`}>{t}</button>))}
                            </div>
                            {subGameType === SubGameType.Bulk ? (
                                <textarea value={bulkInput} onChange={e => setBulkInput(e.target.value)} rows={8} placeholder={"Format Guidelines:\nAK 43,9x,x2 20\nLS3 k123 50"} className="w-full bg-black/40 border border-white/10 rounded-2xl p-6 text-white font-mono text-sm focus:border-sky-500/50 outline-none transition-all resize-none"/>
                            ) : subGameType === SubGameType.Combo ? (
                                <div className="space-y-6">
                                    <div className="flex gap-4">
                                        <input type="text" value={comboDigitsInput} onChange={e => setComboDigitsInput(e.target.value)} placeholder="ENTER 3-6 DIGITS" className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm focus:border-sky-500/50 outline-none" maxLength={6}/>
                                        <button onClick={handleGenerateCombos} className="px-6 py-3 bg-sky-600 text-white font-bold rounded-xl active:scale-95 transition-all">MAP</button>
                                    </div>
                                    {generatedCombos.length > 0 && (<div className="max-h-60 overflow-y-auto pr-4 no-scrollbar space-y-2">{generatedCombos.map((c, i) => (<div key={i} className="flex items-center gap-4 p-3 bg-white/5 rounded-xl border border-white/5"><input type="checkbox" checked={c.selected} onChange={e => setGeneratedCombos(p => p.map((x, j) => i === j ? {...x, selected: e.target.checked} : x))} className="w-4 h-4 rounded bg-black border-white/10 text-sky-500"/><span className="font-mono text-white flex-1">{c.number}</span><input type="number" value={c.stake} onChange={e => setGeneratedCombos(p => p.map((x, j) => i === j ? {...x, stake: e.target.value} : x))} placeholder="0" className="w-24 bg-black/40 border border-white/10 rounded-lg p-2 text-right text-white font-mono text-sm select-none"/></div>))}</div>)}
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center px-1">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Entry Numbers</label>
                                            <button onClick={handleAiLuckyPick} disabled={isAiLoading} className="text-[10px] font-black text-sky-500 uppercase tracking-widest flex items-center gap-2 active:scale-95 group">{isAiLoading ? <div className="w-3 h-3 border-2 border-sky-400/20 border-t-sky-400 rounded-full animate-spin"/> : Icons.sparkles} <span className="group-hover:underline">AI Predict</span></button>
                                        </div>
                                        <textarea value={manualNumbersInput} onChange={handleManualNumberChange} rows={3} placeholder={subGameType === SubGameType.TwoDigit ? "e.g. 14, 05" : "e.g. 1, 2, 9"} className="w-full bg-black/40 border border-white/10 rounded-2xl p-6 text-white font-mono text-lg focus:border-sky-500/50 outline-none transition-all resize-none"/>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Stake Per Unit</label>
                                        <input type="number" value={manualAmountInput} onChange={e => setManualAmountInput(e.target.value)} placeholder="RS 100" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-white font-mono text-xl focus:border-sky-500/50 outline-none"/>
                                    </div>
                                </div>
                            )}
                            <div className="bg-sky-500/5 p-6 rounded-2xl grid grid-cols-2 gap-4 border border-sky-500/10 text-center font-mono">
                                <div><p className="text-[10px] text-slate-500 uppercase font-black mb-1">UNITS</p><p className="text-xl font-bold text-white">{finalCount}</p></div>
                                <div><p className="text-[10px] text-rose-500 uppercase font-black mb-1">TOTAL COST</p><p className="text-xl font-bold text-rose-400">Rs {finalCost.toLocaleString()}</p></div>
                            </div>
                            {error && <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] p-4 rounded-xl text-center uppercase tracking-widest font-black leading-relaxed">{error}</div>}
                            <button onClick={() => { if (finalCost > 0 && !error) setIsConfirming(true); }} disabled={finalCost <= 0 || !!error} className="w-full py-5 bg-sky-600 hover:bg-sky-500 text-white font-black rounded-2xl tracking-[0.3em] uppercase transition-all shadow-xl shadow-sky-500/10 active:scale-[0.98] disabled:opacity-50 mt-4">INITIATE ENCRYPTION</button>
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
        <div className="space-y-8">
            <div className="flex items-center gap-4">
                <div className="h-8 w-1 bg-emerald-500 rounded-full" />
                <h3 className="text-2xl font-black text-white uppercase tracking-tighter text-left">Deployment Log</h3>
                <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full uppercase tracking-widest ml-auto">Bet History</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-black/40 p-2 rounded-2xl border border-white/5">
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent text-white p-3 rounded-xl outline-none focus:bg-white/5 border border-transparent focus:border-white/10 transition-all font-mono text-sm" />
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent text-white p-3 rounded-xl outline-none focus:bg-white/5 border border-transparent focus:border-white/10 transition-all font-mono text-sm" />
                <input type="text" placeholder="FILTER BY GAME..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="bg-transparent text-white p-3 rounded-xl outline-none focus:bg-white/5 border border-transparent focus:border-white/10 transition-all font-bold text-[10px] uppercase tracking-widest" />
            </div>

            <div className="elite-card rounded-3xl overflow-hidden glass-panel">
                <div className="overflow-x-auto max-h-[30rem] no-scrollbar">
                    <table className="w-full text-left">
                        <thead className="sticky top-0 bg-[#0a0c10] z-20 shadow-xl">
                            <tr className="border-b border-white/5">
                                <th className="p-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Timestamp</th>
                                <th className="p-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Entry</th>
                                <th className="p-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Stake</th>
                                <th className="p-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Payout</th>
                                <th className="p-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Gate</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {[...filteredBets].reverse().map(bet => {
                                const game = games.find(g => g.id === bet.gameId);
                                const payout = calculateBetPayout(bet, game, user.prizeRates);
                                const status = (!game?.winningNumber || game.winningNumber.includes('_')) ? 'PENDING' : (payout > 0 ? 'WON' : 'LOST');
                                return (
                                    <tr key={bet.id} className="group hover:bg-white/[0.02]">
                                        <td className="p-6 text-[10px] font-mono text-slate-500 whitespace-nowrap">{bet.timestamp.toLocaleString()}</td>
                                        <td className="p-6">
                                            <div className="text-white font-bold text-sm tracking-tight">{game?.name}</div>
                                            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">{bet.subGameType} / {bet.numbers.length} units</div>
                                        </td>
                                        <td className="p-6 text-right font-mono text-rose-500/80 font-bold">Rs {bet.totalAmount.toFixed(0)}</td>
                                        <td className="p-6 text-right">
                                            <div className={`font-mono font-black ${payout > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>{payout > 0 ? `+Rs ${payout.toLocaleString()}` : '---'}</div>
                                        </td>
                                        <td className="p-6 text-right">
                                            <span className={`text-[9px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded bg-black/40 border ${status === 'WON' ? 'border-emerald-500/30 text-emerald-400' : status === 'LOST' ? 'border-rose-500/30 text-rose-400' : 'border-amber-500/30 text-amber-500'}`}>
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
        <div className="space-y-8">
            <div className="flex items-center gap-4">
                <div className="h-8 w-1 bg-sky-500 rounded-full" />
                <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Financial Ledger</h3>
                <span className="text-[10px] font-bold text-sky-500 bg-sky-500/10 border border-sky-500/20 px-3 py-1 rounded-full uppercase tracking-widest ml-auto">Balance Auth</span>
            </div>

            <div className="elite-card rounded-3xl overflow-hidden glass-panel">
                <div className="overflow-x-auto max-h-[34rem] no-scrollbar">
                    <table className="w-full text-left">
                        <thead className="sticky top-0 bg-[#0a0c10] z-20 shadow-xl">
                            <tr className="border-b border-white/5">
                                <th className="p-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Event Time</th>
                                <th className="p-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Transaction Descriptor</th>
                                <th className="p-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Debit / Credit</th>
                                <th className="p-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Net Balance</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {[...entries].reverse().map(e => (
                                <tr key={e.id} className="hover:bg-white/[0.02]">
                                    <td className="p-6 text-[10px] font-mono text-slate-500">{e.timestamp.toLocaleString()}</td>
                                    <td className="p-6 text-white font-bold text-sm tracking-tight">{e.description}</td>
                                    <td className="p-6 text-right font-mono font-black">
                                        {e.debit > 0 ? <span className="text-rose-500">-{e.debit.toFixed(0)}</span> : <span className="text-emerald-500">+{e.credit.toFixed(0)}</span>}
                                    </td>
                                    <td className="p-6 text-right font-mono font-black text-white italic">Rs {e.balance.toLocaleString()}</td>
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

    return (
        <div className="max-w-7xl mx-auto px-6 py-12 md:py-20 relative z-10">
            <AnimatePresence>
                {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            </AnimatePresence>
            
            <motion.div 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row justify-between items-end mb-24 gap-8"
            >
                <div className="border-l-4 border-sky-500 pl-8">
                    <h2 className="text-5xl md:text-7xl font-black text-white tracking-widest uppercase mb-4">Dashboard</h2>
                    <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[10px]">Active Terminal Identity: <span className="text-sky-500">{user.name}</span></p>
                </div>
                <div className="elite-card px-10 py-6 rounded-3xl glass-panel text-right min-w-[280px]">
                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2 opacity-60">Liquidity Index</p>
                    <p className="text-4xl font-black text-white font-mono tracking-tighter italic">Rs {user.wallet.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
            </motion.div>

            <GameStakeBreakdown games={games} bets={bets} user={user} />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 mb-24">
                {games.map((g, i) => (
                    <motion.div key={g.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}>
                        <GameCard game={g} onPlay={setSelectedGame} isRestricted={user.isRestricted} />
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-20">
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
                                setToast({ msg: "Transaction encrypted successfully.", type: 'success' });
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
