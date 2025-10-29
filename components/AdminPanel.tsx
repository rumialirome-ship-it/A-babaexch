

import React, { useState, useMemo, useEffect } from 'react';
import { Dealer, User, Game, PrizeRates, LedgerEntry, Bet, NumberLimit, SubGameType, Admin } from '../types';
import { Icons } from '../constants';
import { useAuth } from '../hooks/useAuth';

// --- TYPE DEFINITIONS FOR NEW DASHBOARD ---
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


// --- INTERNAL COMPONENTS (UNCHANGED) ---
const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: 'md' | 'lg' | 'xl'; themeColor?: string }> = ({ isOpen, onClose, title, children, size = 'md', themeColor = 'cyan' }) => {
    if (!isOpen) return null;
    const sizeClasses: Record<string, string> = { md: 'max-w-md', lg: 'max-w-3xl', xl: 'max-w-5xl' };
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className={`bg-slate-900/80 rounded-lg shadow-2xl w-full border border-${themeColor}-500/30 ${sizeClasses[size]} flex flex-col max-h-[90vh]`}>
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
                        <tr key={entry.id} className="hover:bg-cyan-500/10 text-sm transition-colors">
                            <td className="p-3 text-slate-400 whitespace-nowrap">{entry.timestamp.toLocaleString()}</td>
                            <td className="p-3 text-white">{entry.description}</td>
                            <td className="p-3 text-right text-red-400 font-mono">{entry.debit > 0 ? entry.debit.toFixed(2) : '-'}</td>
                            <td className="p-3 text-right text-green-400 font-mono">{entry.credit > 0 ? entry.credit.toFixed(2) : '-'}</td>
                            <td className="p-3 text-right font-semibold text-white font-mono">{entry.balance.toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);


const DealerForm: React.FC<{ dealer?: Dealer; dealers: Dealer[]; onSave: (dealer: Dealer, originalId?: string) => Promise<void>; onCancel: () => void; adminPrizeRates: PrizeRates }> = ({ dealer, dealers, onSave, onCancel, adminPrizeRates }) => {
    // For new dealers, password is part of formData. For edits, it's handled separately.
    const [formData, setFormData] = useState(() => {
        const defaults = { id: '', name: '', password: '', area: '', contact: '', commissionRate: 0, prizeRates: { ...adminPrizeRates }, avatarUrl: '', wallet: '' };
        if (dealer) {
            // Ensure formData has a consistent shape by always including a password property.
            return { ...dealer, password: '' };
        }
        return defaults;
    });
    
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        if (name.includes('.')) {
            const [parent, child] = name.split('.');
            setFormData(prev => ({ ...prev, [parent]: { ...(prev[parent as keyof typeof prev] as object), [child]: type === 'number' ? parseFloat(value) : value } }));
        } else {
             if(!dealer && name === 'password') {
                 setFormData(prev => ({ ...prev, password: value }));
                 return;
            }
            setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? (checked as any) : (type === 'number' ? (value ? parseFloat(value) : '') : value) }));
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const newPassword = dealer ? password : formData.password!;
        if (newPassword && newPassword !== confirmPassword) { alert("New passwords do not match."); return; }
        if (!dealer && !newPassword) { alert("Password is required for new dealers."); return; }
        
        const formId = (formData.id as string).toLowerCase();
        if (!dealer && dealers.some(d => d.id.toLowerCase() === formId)) {
            alert("This Dealer Login ID is already taken. Please choose another one.");
            return;
        }

        let finalData: Dealer;
        if (dealer) {
            finalData = { 
                ...dealer, 
                ...formData, 
                password: newPassword ? newPassword : dealer.password,
                wallet: Number(formData.wallet) || 0,
                commissionRate: Number(formData.commissionRate) || 0,
                prizeRates: {
                    oneDigitOpen: Number(formData.prizeRates.oneDigitOpen) || 0,
                    oneDigitClose: Number(formData.prizeRates.oneDigitClose) || 0,
                    twoDigit: Number(formData.prizeRates.twoDigit) || 0,
                }
            };
        } else {
            finalData = {
                id: formData.id as string, 
                name: formData.name, 
                password: newPassword, 
                area: formData.area,
                contact: formData.contact, 
                wallet: Number(formData.wallet) || 0,
                commissionRate: Number(formData.commissionRate) || 0, 
                isRestricted: false, 
                prizeRates: {
                    oneDigitOpen: Number(formData.prizeRates.oneDigitOpen) || 0,
                    oneDigitClose: Number(formData.prizeRates.oneDigitClose) || 0,
                    twoDigit: Number(formData.prizeRates.twoDigit) || 0,
                },
                ledger: [], 
                avatarUrl: formData.avatarUrl,
            };
        }
        onSave(finalData, dealer?.id);
    };

    const displayPassword = dealer ? password : formData.password!;
    const inputClass = "w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:outline-none text-white";

    return (
        <form onSubmit={handleSubmit} className="space-y-4 text-slate-200">
            <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Dealer Login ID</label>
                <input type="text" name="id" value={formData.id as string} onChange={handleChange} placeholder="Dealer Login ID (e.g., dealer02)" className={inputClass} required />
            </div>
            <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="Dealer Display Name" className={inputClass} required />
            <div className="relative">
                <input type={isPasswordVisible ? 'text' : 'password'} name="password" value={displayPassword} onChange={dealer ? (e) => setPassword(e.target.value) : handleChange} placeholder={dealer ? "New Password (optional)" : "Password"} className={inputClass + " pr-10"} required={!dealer} />
                <button type="button" onClick={() => setIsPasswordVisible(!isPasswordVisible)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white">{isPasswordVisible ? Icons.eyeOff : Icons.eye}</button>
            </div>
            {displayPassword && (
                 <div className="relative">
                    <input type={isConfirmPasswordVisible ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm New Password" className={inputClass + " pr-10"} required />
                    <button type="button" onClick={() => setIsConfirmPasswordVisible(!isConfirmPasswordVisible)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white">{isConfirmPasswordVisible ? Icons.eyeOff : Icons.eye}</button>
                </div>
            )}
            <input type="url" name="avatarUrl" value={formData.avatarUrl || ''} onChange={handleChange} placeholder="Avatar URL (optional)" className={inputClass} />
            <input type="text" name="area" value={formData.area} onChange={handleChange} placeholder="Area / Region" className={inputClass} />
            <input type="text" name="contact" value={formData.contact} onChange={handleChange} placeholder="Contact Number" className={inputClass} />
             {!dealer && (
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Initial Wallet Amount (PKR)</label>
                  <input type="number" name="wallet" value={formData.wallet as string} onChange={handleChange} placeholder="e.g. 10000" className={inputClass} />
                </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Commission Rate (%)</label>
              <input type="number" name="commissionRate" value={formData.commissionRate} onChange={handleChange} placeholder="e.g. 5" className={inputClass} />
            </div>
            
            <fieldset className="border border-slate-600 p-4 rounded-md">
                <legend className="px-2 text-sm font-medium text-slate-400">Prize Rates</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><label className="text-sm">1 Digit Open</label><input type="number" name="prizeRates.oneDigitOpen" value={formData.prizeRates.oneDigitOpen} onChange={handleChange} className={inputClass} /></div>
                    <div><label className="text-sm">1 Digit Close</label><input type="number" name="prizeRates.oneDigitClose" value={formData.prizeRates.oneDigitClose} onChange={handleChange} className={inputClass} /></div>
                    <div className="col-span-1 sm:col-span-2"><label className="text-sm">2 Digit</label><input type="number" name="prizeRates.twoDigit" value={formData.prizeRates.twoDigit} onChange={handleChange} className={inputClass} /></div>
                </div>
            </fieldset>

            <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={onCancel} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-md transition-colors">Cancel</button>
                <button type="submit" className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded-md transition-colors">Save Dealer</button>
            </div>
        </form>
    );
};

const DealerTransactionForm: React.FC<{ 
    dealers: Dealer[]; 
    onTransaction: (dealerId: string, amount: number) => void; 
    onCancel: () => void;
    type: 'Top-Up' | 'Withdrawal';
}> = ({ dealers, onTransaction, onCancel, type }) => {
    const [selectedDealerId, setSelectedDealerId] = useState<string>('');
    const [amount, setAmount] = useState<number | ''>('');
    const themeColor = type === 'Top-Up' ? 'emerald' : 'amber';
    
    const inputClass = `w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-${themeColor}-500 focus:outline-none text-white`;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedDealerId || !amount || amount <= 0) {
            alert(`Please select a dealer and enter a valid positive amount.`);
            return;
        }
        const dealerName = dealers.find(d => d.id === selectedDealerId)?.name || 'the selected dealer';
        const confirmationAction = type === 'Top-Up' ? 'to' : 'from';
        if (window.confirm(`Are you sure you want to ${type.toLowerCase()} PKR ${amount} ${confirmationAction} ${dealerName}'s wallet?`)) {
            onTransaction(selectedDealerId, Number(amount));
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 text-slate-200">
            <div>
                <label htmlFor="dealer-select" className="block text-sm font-medium text-slate-400 mb-1">Select Dealer</label>
                <select id="dealer-select" value={selectedDealerId} onChange={(e) => setSelectedDealerId(e.target.value)} className={inputClass} required>
                    <option value="" disabled>-- Choose a dealer --</option>
                    {dealers.map(dealer => <option key={dealer.id} value={dealer.id}>{dealer.name} ({dealer.id})</option>)}
                </select>
            </div>
            <div>
                <label htmlFor="amount-input" className="block text-sm font-medium text-slate-400 mb-1">Amount (PKR)</label>
                <input id="amount-input" type="number" value={amount} onChange={(e) => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value))} placeholder="e.g. 5000" className={inputClass} min="1" required />
            </div>
            <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={onCancel} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-md transition-colors">Cancel</button>
                <button type="submit" className={`font-bold py-2 px-4 rounded-md transition-colors text-white ${type === 'Top-Up' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-amber-600 hover:bg-amber-500'}`}>
                    {type}
                </button>
            </div>
        </form>
    );
};

// --- NEW DASHBOARD COMPONENT ---
const DashboardView: React.FC<{ summary: FinancialSummary | null; admin: Admin }> = ({ summary, admin }) => {
    if (!summary) {
        return <div className="text-center p-8 text-slate-400">Loading financial summary...</div>;
    }

    const SummaryCard: React.FC<{ title: string; value: number; color: string }> = ({ title, value, color }) => (
        <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
            <p className="text-sm text-slate-400 uppercase tracking-wider">{title}</p>
            <p className={`text-3xl font-bold font-mono ${color}`}>{value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
    );
    
    return (
        <div>
            <h3 className="text-xl font-semibold text-white mb-4">Financial Dashboard</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <SummaryCard title="System Wallet" value={admin.wallet} color="text-cyan-400" />
                <SummaryCard title="Total Bets Placed" value={summary.totals.totalStake} color="text-white" />
                <SummaryCard title="Total Prize Payouts" value={summary.totals.totalPayouts} color="text-amber-400" />
                <SummaryCard title="Net System Profit" value={summary.totals.netProfit} color={summary.totals.netProfit >= 0 ? "text-green-400" : "text-red-400"} />
            </div>

            <h3 className="text-xl font-semibold text-white mb-4">Game-by-Game Breakdown</h3>
            <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                <div className="overflow-x-auto mobile-scroll-x">
                    <table className="w-full text-left min-w-[700px]">
                        <thead className="bg-slate-800/50">
                            <tr>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Game</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Stake</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Payouts</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Dealer Profit</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Commissions</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Net Profit</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {summary.games.map(game => (
                                <tr key={game.gameName} className="hover:bg-cyan-500/10 transition-colors">
                                    <td className="p-4 font-medium text-white">{game.gameName} <span className="text-xs text-slate-400">({game.winningNumber})</span></td>
                                    <td className="p-4 text-right font-mono text-white">{game.totalStake.toFixed(2)}</td>
                                    <td className="p-4 text-right font-mono text-amber-400">{game.totalPayouts.toFixed(2)}</td>
                                    <td className="p-4 text-right font-mono text-emerald-400">{game.totalDealerProfit.toFixed(2)}</td>
                                    <td className="p-4 text-right font-mono text-sky-400">{game.totalCommissions.toFixed(2)}</td>
                                    <td className={`p-4 text-right font-mono font-bold ${game.netProfit >= 0 ? "text-green-400" : "text-red-400"}`}>{game.netProfit.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-slate-800/50 border-t-2 border-slate-600">
                            <tr className="font-bold text-white">
                                <td className="p-4 text-sm uppercase">Grand Total</td>
                                <td className="p-4 text-right font-mono">{summary.totals.totalStake.toFixed(2)}</td>
                                <td className="p-4 text-right font-mono text-amber-300">{summary.totals.totalPayouts.toFixed(2)}</td>
                                <td className="p-4 text-right font-mono text-emerald-300">{summary.totals.totalDealerProfit.toFixed(2)}</td>
                                <td className="p-4 text-right font-mono text-sky-300">{summary.totals.totalCommissions.toFixed(2)}</td>
                                <td className={`p-4 text-right font-mono ${summary.totals.netProfit >= 0 ? "text-green-300" : "text-red-300"}`}>{summary.totals.netProfit.toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
};

const NumberLimitsView: React.FC = () => {
    const [limits, setLimits] = useState<NumberLimit[]>([]);
    const [isLoading, setIsLoading] = useState(true);
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
            alert("Failed to fetch number limits.");
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
            processedValue = value.replace(/\D/g, ''); // Digits only
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
            alert("Please enter a valid number and a limit amount greater than zero.");
            return;
        }

        const maxLength = formState.gameType === '2-digit' ? 2 : 1;
        if (numberValue.length !== maxLength) {
             alert(`Number must be ${maxLength} digit(s) long for this game type.`);
            return;
        }

        try {
            await fetchWithAuth('/api/admin/number-limits', {
                method: 'POST',
                body: JSON.stringify(formState)
            });
            setFormState({ gameType: '2-digit', numberValue: '', limitAmount: 0 });
            await fetchLimits();
        } catch (error) {
            console.error("Failed to save limit:", error);
            alert("Failed to save limit.");
        }
    };
    
    const handleDelete = async (limitId: number) => {
        if (window.confirm("Are you sure you want to delete this limit?")) {
            try {
                await fetchWithAuth(`/api/admin/number-limits/${limitId}`, { method: 'DELETE' });
                await fetchLimits();
            } catch (error) {
                console.error("Failed to delete limit:", error);
                alert("Failed to delete limit.");
            }
        }
    };

    const inputClass = "bg-slate-800 p-2 rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:outline-none w-full";
    const gameTypeLabels: Record<NumberLimit['gameType'], string> = {
        '1-open': '1 Digit Open',
        '1-close': '1 Digit Close',
        '2-digit': '2 Digit',
    };

    return (
        <div>
            <h3 className="text-xl font-semibold text-white mb-4">Manage Number Betting Limits</h3>
            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 mb-6">
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Game Type</label>
                        <select name="gameType" value={formState.gameType} onChange={handleInputChange} className={inputClass}>
                            <option value="2-digit">2 Digit</option>
                            <option value="1-open">1 Digit Open</option>
                            <option value="1-close">1 Digit Close</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Number</label>
                        <input type="text" name="numberValue" value={formState.numberValue} onChange={handleInputChange} className={inputClass} placeholder={formState.gameType === '2-digit' ? 'e.g., 42' : 'e.g., 7'} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Max Stake (PKR)</label>
                        <input type="number" name="limitAmount" value={formState.limitAmount || ''} onChange={handleInputChange} className={inputClass} placeholder="e.g., 5000" />
                    </div>
                    <button type="submit" className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded-md transition-colors h-fit">Set Limit</button>
                </form>
            </div>
             <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                 <div className="overflow-x-auto mobile-scroll-x">
                     <table className="w-full text-left min-w-[600px]">
                         <thead className="bg-slate-800/50">
                             <tr>
                                 <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Game Type</th>
                                 <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Number</th>
                                 <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Limit Amount (PKR)</th>
                                 <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-800">
                            {isLoading ? (
                                <tr><td colSpan={4} className="p-8 text-center text-slate-400">Loading limits...</td></tr>
                            ) : limits.length === 0 ? (
                                <tr><td colSpan={4} className="p-8 text-center text-slate-500">No limits set.</td></tr>
                            ) : (
                                limits.map(limit => (
                                     <tr key={limit.id} className="hover:bg-cyan-500/10 transition-colors">
                                         <td className="p-4 text-white">{gameTypeLabels[limit.gameType]}</td>
                                         <td className="p-4 font-mono text-cyan-300 text-lg">{limit.numberValue}</td>
                                         <td className="p-4 font-mono text-white">{limit.limitAmount.toLocaleString()}</td>
                                         <td className="p-4">
                                             <button onClick={() => handleDelete(limit.id)} className="bg-red-500/20 hover:bg-red-500/40 text-red-300 font-semibold py-1 px-3 rounded-md text-sm transition-colors">Delete</button>
                                         </td>
                                     </tr>
                                ))
                            )}
                         </tbody>
                     </table>
                 </div>
            </div>
        </div>
    );
};

// --- LIVE BOOKING VIEW ---
interface BookingData {
    totalBets: number;
    totalStake: number;
    dealerData: { name: string; amount: number }[];
    typeData: { type: SubGameType; amount: number }[];
    userData: { name: string; amount: number }[];
}

const LiveBookingView: React.FC<{ games: Game[], users: User[], dealers: Dealer[] }> = ({ games, users, dealers }) => {
    const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
    const [bookingData, setBookingData] = useState<BookingData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const { fetchWithAuth } = useAuth();
    
    const ongoingGames = useMemo(() => games.filter(g => !g.winningNumber), [games]);

    useEffect(() => {
        let intervalId: ReturnType<typeof setInterval>;
        
        const fetchDataForGame = async (gameId: string) => {
            setIsLoading(true);
            try {
                const response = await fetchWithAuth(`/api/admin/live-booking/${gameId}`);
                if (!response.ok) throw new Error('Failed to fetch data');
                const liveBets: Bet[] = await response.json();

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
                    type,
                    amount,
                })).sort((a, b) => b.amount - a.amount);

                const userData = Array.from(userMap.entries()).map(([userId, amount]) => ({
                    name: users.find(u => u.id === userId)?.name || 'Unknown User',
                    amount,
                })).sort((a, b) => b.amount - a.amount).slice(0, 10); // Top 10 users

                setBookingData({
                    totalBets: liveBets.length,
                    totalStake,
                    dealerData,
                    typeData,
                    userData
                });

            } catch (error) {
                console.error("Error fetching live booking data:", error);
                setBookingData(null);
            } finally {
                setIsLoading(false);
            }
        };

        if (selectedGameId) {
            fetchDataForGame(selectedGameId); // Initial fetch
            intervalId = setInterval(() => fetchDataForGame(selectedGameId), 5000); // Poll every 5 seconds
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [selectedGameId, fetchWithAuth, users, dealers]);
    
    const BreakdownCard: React.FC<{ title: string; data: { name: string; amount: number }[] | { type: string; amount: number }[]; total: number; children?: React.ReactNode }> = ({ title, data, total }) => (
        <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 h-full flex flex-col">
            <h4 className="text-lg font-semibold text-white mb-3">{title}</h4>
            <div className="flex-grow overflow-y-auto pr-2 space-y-2">
                {data.length === 0 ? <p className="text-slate-500 text-sm">No data yet.</p> : data.map((item, index) => {
                    const name = 'name' in item ? item.name : item.type;
                    const amount = item.amount;
                    const percentage = total > 0 ? (amount / total) * 100 : 0;
                    return (
                        <div key={index} className="text-sm">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-slate-300 truncate pr-2">{name}</span>
                                <span className="font-mono text-white font-semibold">{amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                            </div>
                            <div className="w-full bg-slate-700 rounded-full h-1.5">
                                <div className="bg-cyan-500 h-1.5 rounded-full" style={{ width: `${percentage}%` }}></div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    return (
        <div>
            <h3 className="text-xl font-semibold text-white mb-4">Live Game Booking Breakdown</h3>
            <div className="bg-slate-800/50 p-3 rounded-lg flex items-center space-x-2 mb-6 self-start flex-wrap border border-slate-700">
                {ongoingGames.length > 0 ? ongoingGames.map(game => (
                    <button key={game.id} onClick={() => setSelectedGameId(game.id)} className={`flex items-center space-x-2 py-2 px-4 text-sm font-semibold rounded-md transition-all duration-300 ${selectedGameId === game.id ? 'bg-slate-700 text-cyan-400 shadow-lg' : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'}`}>
                        <img src={game.logo} alt={game.name} className="w-5 h-5 rounded-full" />
                        <span>{game.name}</span>
                    </button>
                )) : <p className="text-slate-400 p-2">No games are currently open for betting.</p>}
            </div>

            {!selectedGameId ? (
                <div className="text-center p-8 bg-slate-800/50 rounded-lg border border-slate-700">
                    <p className="text-slate-400">Please select an ongoing game to view its live booking status.</p>
                </div>
            ) : isLoading && !bookingData ? (
                <div className="text-center p-8"><p className="text-slate-400">Loading live data...</p></div>
            ) : bookingData ? (
                <div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                            <p className="text-sm text-slate-400 uppercase tracking-wider">Total Bets</p>
                            <p className="text-4xl font-bold font-mono text-white">{bookingData.totalBets.toLocaleString()}</p>
                        </div>
                         <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                            <p className="text-sm text-slate-400 uppercase tracking-wider">Total Stake</p>
                            <p className="text-4xl font-bold font-mono text-cyan-400">{bookingData.totalStake.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <BreakdownCard title="Booking by Dealer" data={bookingData.dealerData} total={bookingData.totalStake} />
                        <BreakdownCard title="Booking by Type" data={bookingData.typeData} total={bookingData.totalStake} />
                        <BreakdownCard title="Top Players (by Stake)" data={bookingData.userData} total={bookingData.totalStake} />
                    </div>
                </div>
            ) : (
                 <div className="text-center p-8"><p className="text-slate-500">No betting data available for this game yet.</p></div>
            )}
        </div>
    );
};

// --- NUMBER SUMMARY VIEW ---
const SummaryColumn: React.FC<{ title: string; data: { number: string; stake: number }[]; color: string; }> = ({ title, data, color }) => (
    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 flex flex-col">
        <h4 className={`text-lg font-semibold text-center mb-3 ${color}`}>{title}</h4>
        <div className="flex-grow overflow-y-auto pr-2 space-y-2 max-h-[60vh]">
            {data.length === 0 ? (
                <p className="text-slate-500 text-sm text-center pt-4">No data for this selection.</p>
            ) : (
                data.map((item, index) => (
                    <div key={index} className="flex justify-between items-baseline text-sm p-3 rounded-md bg-slate-900/50 transition-all hover:bg-slate-800/70 border-l-4 border-transparent hover:border-cyan-500">
                        <span className={`font-mono text-2xl font-bold ${color}`}>{item.number}</span>
                        <span className="font-mono text-white font-semibold text-lg">
                            Rs {item.stake.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                        </span>
                    </div>
                ))
            )}
        </div>
    </div>
);


const NumberSummaryView: React.FC<{ games: Game[]; dealers: Dealer[]; }> = ({ games, dealers }) => {
    const getTodayDateString = () => new Date().toISOString().split('T')[0];
    const [filters, setFilters] = useState({ gameId: '', dealerId: '', date: getTodayDateString() });
    const [summary, setSummary] = useState<{ twoDigit: any[], oneDigitOpen: any[], oneDigitClose: any[] } | null>(null);
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
    };

    const inputClass = "w-full bg-slate-800 p-2 rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:outline-none text-white";

    return (
        <div>
            <h3 className="text-xl font-semibold text-white mb-4">Number-wise Stake Summary</h3>
            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Date</label>
                        <input type="date" name="date" value={filters.date} onChange={handleFilterChange} className={`${inputClass} font-sans`} />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Game</label>
                        <select name="gameId" value={filters.gameId} onChange={handleFilterChange} className={inputClass}>
                            <option value="">All Games</option>
                            {games.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Dealer</label>
                        <select name="dealerId" value={filters.dealerId} onChange={handleFilterChange} className={inputClass}>
                            <option value="">All Dealers</option>
                            {dealers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>
                    <button onClick={clearFilters} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-md transition-colors h-fit">Clear Filters</button>
                </div>
            </div>
            {isLoading && !summary ? (
                <div className="text-center p-8 text-slate-400">Loading summary...</div>
            ) : !summary ? (
                <div className="text-center p-8 bg-slate-800/50 rounded-lg border border-slate-700 text-slate-500">Please select a date to view the summary.</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <SummaryColumn title="2 Digit Stakes" data={summary.twoDigit} color="text-cyan-400" />
                    <SummaryColumn title="1 Digit Open" data={summary.oneDigitOpen} color="text-amber-400" />
                    <SummaryColumn title="1 Digit Close" data={summary.oneDigitClose} color="text-rose-400" />
                </div>
            )}
        </div>
    );
};

interface AdminPanelProps {
  admin: Admin; 
  dealers: Dealer[]; 
  onSaveDealer: (dealer: Dealer, originalId?: string) => Promise<void>;
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
  // FIX: Add missing onPlaceAdminBets prop
  onPlaceAdminBets: (details: {
    userId: string;
    gameId: string;
    betGroups: any[];
  }) => Promise<void>;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ admin, dealers, onSaveDealer, users, setUsers, games, bets, declareWinner, updateWinner, approvePayouts, topUpDealerWallet, withdrawFromDealerWallet, toggleAccountRestriction, onPlaceAdminBets }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDealer, setSelectedDealer] = useState<Dealer | undefined>(undefined);
  const [winningNumbers, setWinningNumbers] = useState<{[key: string]: string}>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [viewingLedgerFor, setViewingLedgerFor] = useState<Dealer | Admin | null>(null);
  const [betSearchQuery, setBetSearchQuery] = useState('');
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [isWithdrawalModalOpen, setIsWithdrawalModalOpen] = useState(false);
  const [viewingUserLedgerFor, setViewingUserLedgerFor] = useState<User | null>(null);
  const [summaryData, setSummaryData] = useState<FinancialSummary | null>(null);
  const [editingGame, setEditingGame] = useState<{ id: string, number: string } | null>(null);
  const { fetchWithAuth } = useAuth();
  
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
                  // Cascade ID change to users
                  setUsers(prev => prev.map(u => u.dealerId === originalId ? { ...u, dealerId: dealerData.id } : u));
              }
          }

          await onSaveDealer(dealerData, originalId);

          setIsModalOpen(false);
          setSelectedDealer(undefined);
      } catch (error) {
          console.error("Failed to save dealer:", error);
          // Error alert is handled by the parent component, so the modal remains open for correction.
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

  const filteredDealers = dealers.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()) || (d.area || '').toLowerCase().includes(searchQuery.toLowerCase()) || d.id.toLowerCase().includes(searchQuery.toLowerCase()));

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

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: Icons.chartBar },
    { id: 'dealers', label: 'Dealers', icon: Icons.userGroup }, 
    { id: 'games', label: 'Games', icon: Icons.gamepad },
    { id: 'liveBooking', label: 'Live Booking', icon: Icons.sparkles },
    { id: 'numberSummary', label: 'Number Summary', icon: Icons.chartBar },
    { id: 'limits', label: 'Limits', icon: Icons.clipboardList }, 
    { id: 'bettingSheet', label: 'Bet Search', icon: Icons.search }, 
    { id: 'users', label: 'Users', icon: Icons.clipboardList },
    { id: 'history', label: 'Ledgers', icon: Icons.bookOpen },
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <h2 className="text-3xl font-bold text-red-400 mb-6 uppercase tracking-widest">Admin Console</h2>
      <div className="bg-slate-800/50 p-1.5 rounded-lg flex items-center space-x-2 mb-6 self-start flex-wrap border border-slate-700">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center space-x-2 py-2 px-4 text-sm font-semibold rounded-md transition-all duration-300 ${activeTab === tab.id ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
            {tab.icon} <span>{tab.label}</span>
          </button>
        ))}
      </div>
      
      {activeTab === 'dashboard' && <DashboardView summary={summaryData} admin={admin} />}
      {activeTab === 'liveBooking' && <LiveBookingView games={games} users={users} dealers={dealers} />}
      {activeTab === 'numberSummary' && <NumberSummaryView games={games} dealers={dealers} />}
      {activeTab === 'limits' && <NumberLimitsView />}

      {activeTab === 'dealers' && (
        <div>
          <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
            <h3 className="text-xl font-semibold text-white text-left w-full sm:w-auto">Dealers ({filteredDealers.length})</h3>
            <div className="flex w-full sm:w-auto sm:justify-end gap-2 flex-col sm:flex-row">
                 <div className="relative w-full sm:w-64">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">{Icons.search}</span>
                    <input type="text" placeholder="Search by name, area, ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-slate-800 p-2 pl-10 rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:outline-none w-full"/>
                </div>
                <button onClick={() => { setSelectedDealer(undefined); setIsModalOpen(true); }} className="flex items-center justify-center bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded-md whitespace-nowrap transition-colors">
                  {Icons.plus} Create Dealer
                </button>
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
             <div className="overflow-x-auto mobile-scroll-x">
                 <table className="w-full text-left min-w-[800px]">
                     <thead className="bg-slate-800/50">
                         <tr>
                             <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Dealer</th>
                             <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Login ID</th>
                             <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Area</th>
                             <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Wallet (PKR)</th>
                             <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Commission</th>
                             <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                             <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-800">
                         {filteredDealers.map(dealer => (
                             <tr key={dealer.id} className="hover:bg-cyan-500/10 transition-colors">
                                 <td className="p-4 font-medium"><div className="flex items-center gap-3">
                                     {dealer.avatarUrl ? <img src={dealer.avatarUrl} alt={dealer.name} className="w-10 h-10 rounded-full object-cover" /> : <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-400">{Icons.user}</div>}
                                     <span className="font-semibold text-white">{dealer.name}</span>
                                 </div></td>
                                 <td className="p-4 text-slate-400 font-mono">{dealer.id}</td>
                                 <td className="p-4 text-slate-400">{dealer.area}</td>
                                 <td className="p-4 font-mono text-white">{dealer.wallet.toLocaleString()}</td>
                                 <td className="p-4 text-slate-300">{dealer.commissionRate}%</td>
                                 <td className="p-4"><span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${dealer.isRestricted ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>{dealer.isRestricted ? 'Restricted' : 'Active'}</span></td>
                                 <td className="p-4">
                                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                        <button onClick={() => { setSelectedDealer(dealer); setIsModalOpen(true); }} className="bg-slate-700 hover:bg-slate-600 text-cyan-400 font-semibold py-1 px-3 rounded-md text-sm transition-colors text-center">Edit</button>
                                        <button onClick={() => setViewingLedgerFor(dealer)} className="bg-slate-700 hover:bg-slate-600 text-emerald-400 font-semibold py-1 px-3 rounded-md text-sm transition-colors text-center">Ledger</button>
                                        <button onClick={() => toggleAccountRestriction(dealer.id, 'dealer')} className={`font-semibold py-1 px-3 rounded-md text-sm transition-colors text-center ${dealer.isRestricted ? 'bg-green-500/20 hover:bg-green-500/40 text-green-300' : 'bg-red-500/20 hover:bg-red-500/40 text-red-300'}`}>
                                            {dealer.isRestricted ? 'Unrestrict' : 'Restrict'}
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
        <div>
            <h3 className="text-xl font-semibold mb-4 text-white">Declare Winning Numbers</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {games.map(game => {
                    const isAK = game.name === 'AK';
                    const isAKC = game.name === 'AKC';
                    const isSingleDigitGame = isAK || isAKC;
                    const isAKPending = isAK && game.winningNumber && game.winningNumber.endsWith('_');

                    return (
                    <div key={game.id} className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                        <h4 className="font-bold text-lg text-white">{game.name}</h4>
                        {game.winningNumber ? (
                            game.payoutsApproved ? (
                                <div className="flex items-center justify-between my-2">
                                    <div>
                                        <p className="text-sm text-slate-400">Winner Declared</p>
                                        <p className="text-2xl font-bold text-emerald-400">{game.winningNumber}</p>
                                    </div>
                                    <div className="flex items-center gap-2 bg-slate-700/50 text-emerald-400 font-semibold py-1 px-3 rounded-md text-sm">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                        <span>Approved</span>
                                    </div>
                                </div>
                            ) : editingGame?.id === game.id ? (
                                <div className="my-2">
                                    <p className="text-sm text-slate-400">Editing Number...</p>
                                    <div className="flex items-center space-x-2 mt-1">
                                        <input type="text" maxLength={isSingleDigitGame ? 1 : 2} value={editingGame.number} onChange={(e) => setEditingGame({...editingGame, number: e.target.value.replace(/\D/g, '')})} className="w-20 bg-slate-900 p-2 text-center text-xl font-bold rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500" placeholder={isSingleDigitGame ? '0' : '00'} />
                                        <button onClick={() => handleUpdateWinner(game.id, game.name)} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-3 rounded-md text-sm transition-colors">Save</button>
                                        <button onClick={() => setEditingGame(null)} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-3 rounded-md text-sm transition-colors">Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between my-2 gap-2">
                                    {isAKPending ? (
                                        <>
                                            <div>
                                                <p className="text-sm text-slate-400">Open Declared</p>
                                                <p className="text-2xl font-bold text-amber-400">{game.winningNumber}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm text-slate-400">Waiting for AKC</p>
                                            </div>
                                        </>
                                    ) : (
                                        <div>
                                            <p className="text-sm text-slate-400">Pending Approval</p>
                                            <p className="text-2xl font-bold text-amber-400">{game.winningNumber}</p>
                                        </div>
                                    )}
                                    <div className='flex flex-col sm:flex-row gap-2 self-end sm:self-center'>
                                        <button onClick={() => setEditingGame({ id: game.id, number: isAK ? game.winningNumber!.slice(0, 1) : game.winningNumber! })} className="bg-slate-700 hover:bg-slate-600 text-amber-400 font-semibold py-2 px-3 rounded-md text-sm transition-colors">
                                            Edit
                                        </button>
                                        {!isAKPending && (
                                            <button 
                                                onClick={() => { if (window.confirm(`Are you sure you want to approve payouts for ${game.name}? This action cannot be undone.`)) { approvePayouts(game.id); } }} 
                                                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-md transition-colors animate-pulse whitespace-nowrap"
                                            >
                                                Approve Payouts
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )
                        ) : (
                            <div className="flex items-center space-x-2 my-2">
                                <input type="text" maxLength={isSingleDigitGame ? 1 : 2} value={winningNumbers[game.id] || ''} onChange={(e) => setWinningNumbers({...winningNumbers, [game.id]: e.target.value.replace(/\D/g, '')})} className="w-20 bg-slate-800 p-2 text-center text-xl font-bold rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500" placeholder={isSingleDigitGame ? '0' : '00'} />
                                <button onClick={() => handleDeclareWinner(game.id, game.name)} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded-md transition-colors">Declare</button>
                            </div>
                        )}
                        <p className="text-sm text-slate-400">Draw Time: {game.drawTime}</p>
                        {(isAK || isAKC) && (
                            <p className="text-xs text-slate-500 mt-2">
                                Note: The AKC result provides the 'close' digit for the AK game.
                            </p>
                        )}
                    </div>
                )})}
            </div>
        </div>
      )}

      {activeTab === 'bettingSheet' && (
        <div>
            <h3 className="text-xl font-semibold text-white mb-4">Comprehensive Betting Sheet</h3>
            <div className="flex items-center gap-4 mb-4 bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                <label htmlFor="bet-search" className="font-semibold text-slate-300 whitespace-nowrap">Search by Number:</label>
                <div className="relative flex-grow max-w-xs">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">{Icons.search}</span>
                    <input id="bet-search" type="text" placeholder="e.g. 42" value={betSearchQuery} onChange={(e) => setBetSearchQuery(e.target.value)} className="bg-slate-800 p-2 pl-10 rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:outline-none w-full" />
                </div>
            </div>

            {searchSummary && (
                <div className="mb-4 bg-slate-800/50 p-4 rounded-lg border border-slate-700 grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                    <div><p className="text-sm text-slate-400 uppercase">Number</p><p className="text-2xl font-bold text-cyan-400">{searchSummary.number}</p></div>
                    <div><p className="text-sm text-slate-400 uppercase">Total Bets</p><p className="text-2xl font-bold text-white">{searchSummary.count}</p></div>
                    <div><p className="text-sm text-slate-400 uppercase">Total Stake</p><p className="text-2xl font-bold text-emerald-400">PKR {searchSummary.totalStake.toLocaleString()}</p></div>
                </div>
            )}

            <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                <div className="overflow-x-auto max-h-[60vh] mobile-scroll-x">
                    <table className="w-full text-left min-w-[700px]">
                        <thead className="bg-slate-800/50 sticky top-0 backdrop-blur-sm">
                            <tr>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Timestamp</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">User</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Dealer</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Game</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Number</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Stake (PKR)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {filteredBets.length > 0 ? (
                                filteredBets.map(bet => (
                                    <tr key={`${bet.betId}-${bet.number}`} className="hover:bg-cyan-500/10 transition-colors">
                                        <td className="p-4 text-sm text-slate-400 whitespace-nowrap">{bet.timestamp.toLocaleString()}</td>
                                        <td className="p-4 font-semibold text-white">{bet.userName}</td>
                                        <td className="p-4 text-slate-400">{bet.dealerName}</td>
                                        <td className="p-4 text-slate-300">{bet.gameName}</td>
                                        <td className="p-4 text-right font-mono text-cyan-300 text-lg">{bet.number}</td>
                                        <td className="p-4 text-right font-mono text-white">{bet.amount.toLocaleString()}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan={6} className="text-center p-8 text-slate-500">{betSearchQuery ? 'No bets found.' : 'Enter a number to search.'}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      )}

       {activeTab === 'users' && (
        <div>
          <h3 className="text-xl font-semibold mb-4 text-white">All Users ({users.length})</h3>
           <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
               <div className="overflow-x-auto mobile-scroll-x">
                   <table className="w-full text-left min-w-[700px]">
                       <thead className="bg-slate-800/50">
                           <tr>
                               <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                               <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Dealer</th>
                               <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Wallet (PKR)</th>
                               <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                               <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-center">Actions</th>
                           </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-800">
                           {users.map(user => (
                               <tr key={user.id} className="hover:bg-cyan-500/10 transition-colors">
                                   <td className="p-4 font-semibold text-white">{user.name}</td>
                                   <td className="p-4 text-slate-400">{dealers.find(d => d.id === user.dealerId)?.name || 'N/A'}</td>
                                   <td className="p-4 font-mono text-white">{user.wallet.toLocaleString()}</td>
                                   <td className="p-4"><span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${user.isRestricted ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>{user.isRestricted ? 'Restricted' : 'Active'}</span></td>
                                   <td className="p-4 text-center">
                                       <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2">
                                            <button onClick={() => setViewingUserLedgerFor(user)} className="bg-slate-700 hover:bg-slate-600 text-cyan-400 font-semibold py-1 px-3 rounded-md text-sm transition-colors w-full sm:w-auto text-center">View Ledger</button>
                                            <button onClick={() => toggleAccountRestriction(user.id, 'user')} className={`font-semibold py-1 px-3 rounded-md text-sm transition-colors w-full sm:w-auto text-center ${user.isRestricted ? 'bg-green-500/20 hover:bg-green-500/40 text-green-300' : 'bg-red-500/20 hover:bg-red-500/40 text-red-300'}`}>
                                                {user.isRestricted ? 'Unrestrict' : 'Restrict'}
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
      
      {activeTab === 'history' && (
        <div>
          <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
            <h3 className="text-xl font-semibold text-white">Dealer Transaction Ledgers</h3>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setIsTopUpModalOpen(true)} className="flex items-center bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-md transition-colors whitespace-nowrap">
                {Icons.plus} Wallet Top-Up
              </button>
              <button onClick={() => setIsWithdrawalModalOpen(true)} className="flex items-center bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 px-4 rounded-md transition-colors whitespace-nowrap">
                {Icons.minus} Withdraw Funds
              </button>
               <button onClick={() => setViewingLedgerFor(admin)} className="flex items-center bg-sky-600 hover:bg-sky-500 text-white font-bold py-2 px-4 rounded-md transition-colors whitespace-nowrap">
                {Icons.eye} View Admin Ledger
              </button>
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
            <div className="overflow-x-auto mobile-scroll-x">
              <table className="w-full text-left min-w-[600px]">
                <thead className="bg-slate-800/50">
                  <tr>
                    <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Dealer</th>
                    <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Area</th>
                    <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Current Balance (PKR)</th>
                    <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {dealers.map(dealer => (
                    <tr key={dealer.id} className="hover:bg-cyan-500/10 transition-colors">
                      <td className="p-4 font-medium"><div className="flex items-center gap-3">
                        {dealer.avatarUrl ? <img src={dealer.avatarUrl} alt={dealer.name} className="w-10 h-10 rounded-full object-cover" /> : <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-400">{Icons.user}</div>}
                        <span className="font-semibold text-white">{dealer.name}</span>
                      </div></td>
                      <td className="p-4 text-slate-400">{dealer.area}</td>
                      <td className="p-4 font-mono text-white text-right">{dealer.wallet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="p-4 text-center"><button onClick={() => setViewingLedgerFor(dealer)} className="bg-slate-700 hover:bg-slate-600 text-cyan-400 font-semibold py-1 px-3 rounded-md text-sm transition-colors">View Ledger</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={selectedDealer ? "Edit Dealer" : "Create Dealer"}>
          <DealerForm dealer={selectedDealer} dealers={dealers} onSave={handleSaveDealer} onCancel={() => setIsModalOpen(false)} adminPrizeRates={admin.prizeRates} />
      </Modal>

      <Modal isOpen={isTopUpModalOpen} onClose={() => setIsTopUpModalOpen(false)} title="Top-Up Dealer Wallet" themeColor="emerald">
          <DealerTransactionForm type="Top-Up" dealers={dealers} onTransaction={(dealerId, amount) => { topUpDealerWallet(dealerId, amount); setIsTopUpModalOpen(false); }} onCancel={() => setIsTopUpModalOpen(false)} />
      </Modal>

      <Modal isOpen={isWithdrawalModalOpen} onClose={() => setIsWithdrawalModalOpen(false)} title="Withdraw from Dealer Wallet" themeColor="amber">
          <DealerTransactionForm type="Withdrawal" dealers={dealers} onTransaction={(dealerId, amount) => { withdrawFromDealerWallet(dealerId, amount); setIsWithdrawalModalOpen(false); }} onCancel={() => setIsWithdrawalModalOpen(false)} />
      </Modal>

      {viewingLedgerFor && (
        <Modal isOpen={!!viewingLedgerFor} onClose={() => setViewingLedgerFor(null)} title={`Ledger for ${viewingLedgerFor.name}`} size="lg">
            <LedgerTable entries={viewingLedgerFor.ledger} />
        </Modal>
      )}

      {viewingUserLedgerFor && (
        <Modal isOpen={!!viewingUserLedgerFor} onClose={() => setViewingUserLedgerFor(null)} title={`Ledger for ${viewingUserLedgerFor.name}`} size="lg">
            <LedgerTable entries={viewingUserLedgerFor.ledger} />
        </Modal>
      )}

    </div>
  );
};

export default AdminPanel;