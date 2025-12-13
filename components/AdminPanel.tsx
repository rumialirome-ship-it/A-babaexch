import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Dealer, User, Game, PrizeRates, LedgerEntry, Bet, NumberLimit, SubGameType, Admin, DailyResult } from '../types';
import { Icons } from '../constants';
import { useAuth } from '../hooks/useAuth';

// --- TYPE DEFINITIONS ---

interface PaginatedData<T> {
    items: T[];
    totalItems: number;
    totalPages: number;
    currentPage: number;
}

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

const parseDatesInLedger = (entries: LedgerEntry[]): LedgerEntry[] => {
    return entries.map(e => ({ ...e, timestamp: new Date(e.timestamp) }));
};

const LoadingSkeleton: React.FC = () => (
    <div className="space-y-4 animate-pulse">
        <div className="h-10 bg-slate-700/50 rounded-md w-1/3"></div>
        <div className="h-8 bg-slate-700/50 rounded-md w-full"></div>
        <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4 space-y-3">
            {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-slate-700/50 rounded-md"></div>
            ))}
        </div>
    </div>
);

// --- HELPER & UI COMPONENTS ---

const Pagination: React.FC<{
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}> = ({ currentPage, totalPages, onPageChange }) => {
    if (totalPages <= 1) return null;

    const pageNumbers = [];
    const maxPagesToShow = 5;
    let startPage, endPage;

    if (totalPages <= maxPagesToShow) {
        startPage = 1;
        endPage = totalPages;
    } else {
        const maxPagesBeforeCurrent = Math.floor(maxPagesToShow / 2);
        const maxPagesAfterCurrent = Math.ceil(maxPagesToShow / 2) - 1;
        if (currentPage <= maxPagesBeforeCurrent) {
            startPage = 1;
            endPage = maxPagesToShow;
        } else if (currentPage + maxPagesAfterCurrent >= totalPages) {
            startPage = totalPages - maxPagesToShow + 1;
            endPage = totalPages;
        } else {
            startPage = currentPage - maxPagesBeforeCurrent;
            endPage = currentPage + maxPagesAfterCurrent;
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        pageNumbers.push(i);
    }
    
    return (
        <nav className="flex items-center justify-between p-4 bg-slate-800/50 border-t border-slate-700">
            <button
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600"
            >
                Previous
            </button>
            <div className="hidden sm:flex items-center gap-2">
                {startPage > 1 && (
                    <>
                        <button onClick={() => onPageChange(1)} className="px-4 py-2 text-sm text-slate-400 rounded-md hover:bg-slate-700">1</button>
                        {startPage > 2 && <span className="text-slate-500">...</span>}
                    </>
                )}
                {pageNumbers.map(number => (
                    <button
                        key={number}
                        onClick={() => onPageChange(number)}
                        className={`px-4 py-2 text-sm font-medium rounded-md ${currentPage === number ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`}
                    >
                        {number}
                    </button>
                ))}
                {endPage < totalPages && (
                     <>
                        {endPage < totalPages - 1 && <span className="text-slate-500">...</span>}
                        <button onClick={() => onPageChange(totalPages)} className="px-4 py-2 text-sm text-slate-400 rounded-md hover:bg-slate-700">{totalPages}</button>
                    </>
                )}
            </div>
            <button
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600"
            >
                Next
            </button>
        </nav>
    );
};

const SortableHeader: React.FC<{ label: string; sortKey: SortKey; currentSortKey: SortKey; sortDirection: SortDirection; onSort: (key: SortKey) => void; className?: string; }> = ({ label, sortKey, currentSortKey, sortDirection, onSort, className }) => {
    const isActive = sortKey === currentSortKey;
    const icon = isActive ? (sortDirection === 'asc' ? '▲' : '▼') : '';
    return (
        <th className={`p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors ${className}`} onClick={() => onSort(sortKey)}>
            <div className="flex items-center gap-2">
                <span>{label}</span>
                <span className="text-cyan-400">{icon}</span>
            </div>
        </th>
    );
};

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
                <div className="p-6 overflow-auto">{children}</div>
            </div>
        </div>
    );
};

const LedgerTable: React.FC<{ entries: LedgerEntry[] }> = ({ entries }) => (
    <div className="bg-slate-900/50 rounded-lg overflow-hidden border border-slate-700">
        <div className="overflow-auto max-h-[60vh] mobile-scroll-x">
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
                     {entries.length === 0 && (
                        <tr><td colSpan={5} className="p-8 text-center text-slate-500">No ledger entries found.</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
);

// --- FORM COMPONENTS ---

// FIX: The `dealers` prop is used to check for ID uniqueness and is passed `dealerList` which has a lightweight type.
// Updated the prop type from `Dealer[]` to `{ id: string; name: string; }[]` to match the passed data.
const DealerForm: React.FC<{ dealer?: Dealer; dealers: { id: string; name: string; }[]; onSave: (dealer: Dealer, originalId?: string) => Promise<void>; onCancel: () => void; adminPrizeRates: PrizeRates }> = ({ dealer, dealers, onSave, onCancel, adminPrizeRates }) => {
    const [formData, setFormData] = useState(() => {
        const defaults = { id: '', name: '', password: '', area: '', contact: '', commissionRate: 0, prizeRates: { ...adminPrizeRates }, avatarUrl: '', wallet: '' };
        if (dealer) return { ...dealer, password: '' };
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
             if(!dealer && name === 'password') { setFormData(prev => ({ ...prev, password: value })); return; }
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
                ...dealer, ...formData, password: newPassword ? newPassword : dealer.password,
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
                id: formData.id as string, name: formData.name, password: newPassword, area: formData.area, contact: formData.contact, 
                wallet: Number(formData.wallet) || 0, commissionRate: Number(formData.commissionRate) || 0, isRestricted: false, 
                prizeRates: {
                    oneDigitOpen: Number(formData.prizeRates.oneDigitOpen) || 0,
                    oneDigitClose: Number(formData.prizeRates.oneDigitClose) || 0,
                    twoDigit: Number(formData.prizeRates.twoDigit) || 0,
                }, ledger: [], avatarUrl: formData.avatarUrl,
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
                <input type="text" name="id" value={formData.id as string} onChange={handleChange} placeholder="e.g., dealer02" className={inputClass} required disabled={!!dealer} />
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
    dealers: {id: string; name: string}[];
    onTransaction: (dealerId: string, amount: number) => Promise<void>;
    onCancel: () => void;
    type: 'Top-Up' | 'Withdrawal';
}> = ({ dealers, onTransaction, onCancel, type }) => {
    const [selectedDealerId, setSelectedDealerId] = useState<string>('');
    const [amount, setAmount] = useState<number | ''>('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const themeColor = type === 'Top-Up' ? 'emerald' : 'amber';

    const inputClass = `w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-${themeColor}-500 focus:outline-none text-white`;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!selectedDealerId || !amount || amount <= 0) {
            setError(`Please select a dealer and enter a valid positive amount.`);
            return;
        }
        const dealerName = dealers.find(d => d.id === selectedDealerId)?.name || 'the selected dealer';
        const confirmationAction = type === 'Top-Up' ? 'to' : 'from';
        if (window.confirm(`Are you sure you want to ${type.toLowerCase()} PKR ${amount} ${confirmationAction} ${dealerName}'s wallet?`)) {
            setIsLoading(true);
            try {
                await onTransaction(selectedDealerId, Number(amount));
            } catch (err: any) {
                setError(err.message || `An unknown error occurred during the ${type.toLowerCase()}.`);
            } finally {
                setIsLoading(false);
            }
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
            {error && (
                <div className="bg-red-500/20 border border-red-500/30 text-red-300 text-sm p-3 rounded-md mt-2" role="alert">
                    {error}
                </div>
            )}
            <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={onCancel} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-md transition-colors">Cancel</button>
                <button type="submit" disabled={isLoading} className={`font-bold py-2 px-4 rounded-md transition-colors text-white disabled:bg-slate-600 disabled:cursor-wait ${type === 'Top-Up' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-amber-600 hover:bg-amber-500'}`}>
                    {isLoading ? 'Processing...' : type}
                </button>
            </div>
        </form>
    );
};


// --- TAB VIEW COMPONENTS (Now with data fetching logic) ---

const DashboardView: React.FC<{ admin: Admin }> = ({ admin }) => {
    const [summary, setSummary] = useState<FinancialSummary | null>(null);
    const [selectedDate, setSelectedDate] = useState(getTodayDateString());
    const [isLoading, setIsLoading] = useState(true);
    const { fetchWithAuth } = useAuth();

    useEffect(() => {
        const fetchSummary = async () => {
            setIsLoading(true);
            try {
                const response = await fetchWithAuth(`/api/admin/summary?date=${selectedDate}`);
                if (!response.ok) throw new Error('Failed to fetch summary');
                const data = await response.json();
                setSummary(data);
            } catch (error) {
                console.error("Error fetching financial summary:", error);
                setSummary(null);
            } finally {
                setIsLoading(false);
            }
        };
        fetchSummary();
    }, [selectedDate, fetchWithAuth]);

    const SummaryCard: React.FC<{ title: string; value: number; color: string }> = ({ title, value, color }) => (
        <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
            <p className="text-sm text-slate-400 uppercase tracking-wider">{title}</p>
            <p className={`text-3xl font-bold font-mono ${color}`}>{value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
    );
    
    if (isLoading) return <LoadingSkeleton />;

    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                 <h3 className="text-xl font-semibold text-white">Financial Dashboard</h3>
                 <div className="w-full md:w-auto">
                    <label className="block text-sm font-medium text-slate-400 mb-1">Select Market Date</label>
                    <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-full md:w-auto bg-slate-800 p-2 rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:outline-none text-white font-sans" />
                 </div>
            </div>
            
            {!summary ? (
                 <div className="text-center p-8 text-slate-400">No financial summary available for this date.</div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                        <SummaryCard title="System Wallet" value={admin.wallet} color="text-cyan-400" />
                        <SummaryCard title="Total Stake" value={summary.totals.totalStake} color="text-white" />
                        <SummaryCard title="Total Prize Payouts" value={summary.totals.totalPayouts} color="text-amber-400" />
                        <SummaryCard title="Net System Profit" value={summary.totals.netProfit} color={summary.totals.netProfit >= 0 ? "text-green-400" : "text-red-400"} />
                    </div>

                    <h3 className="text-xl font-semibold text-white mb-4">Day-wise Breakdown for {selectedDate}</h3>
                    <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                        {summary.games.length === 0 ? (
                            <p className="p-8 text-center text-slate-500">No financial data found for the selected date.</p>
                        ) : (
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
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

// ... (Other view components like NumberLimitsView, LiveBookingView etc. would also be refactored to fetch their own data)
// For brevity, I'll focus on the main AdminPanel, Dealers, and Users tabs refactor. The pattern is the same for other views.

// --- MAIN ADMIN PANEL COMPONENT ---

interface AdminPanelProps {
  initialAdmin: Admin; 
}

const AdminPanel: React.FC<AdminPanelProps> = ({ initialAdmin }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { fetchWithAuth } = useAuth();
  
  // --- Centralized State Management ---
  const [admin, setAdmin] = useState<Admin>(initialAdmin);
  const [games, setGames] = useState<Game[]>([]);
  const [dailyResults, setDailyResults] = useState<DailyResult[]>([]);
  
  const [dealers, setDealers] = useState<PaginatedData<Dealer>>({ items: [], totalItems: 0, totalPages: 1, currentPage: 1 });
  const [users, setUsers] = useState<PaginatedData<User>>({ items: [], totalItems: 0, totalPages: 1, currentPage: 1 });
  
  // Lightweight lists for dropdowns
  const [dealerList, setDealerList] = useState<{ id: string; name: string }[]>([]);
  const [userList, setUserList] = useState<{ id: string; name: string }[]>([]);

  // UI State
  const [isLoading, setIsLoading] = useState({ core: true, dealers: true, users: true });
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDealer, setSelectedDealer] = useState<Dealer | undefined>(undefined);
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [isWithdrawalModalOpen, setIsWithdrawalModalOpen] = useState(false);
  const [ledgerModalData, setLedgerModalData] = useState<{ title: string; entries: LedgerEntry[] } | null>(null);

  // Filter/Sort States
  const [dealerFilters, setDealerFilters] = useState({ page: 1, limit: 25, search: '', sortKey: 'name' as SortKey, sortDir: 'asc' as SortDirection });
  const [userFilters, setUserFilters] = useState({ page: 1, limit: 25, search: '', sortKey: 'name' as SortKey, sortDir: 'asc' as SortDirection });

  // --- Data Fetching Callbacks ---

  const fetchCoreData = useCallback(async () => {
    setIsLoading(prev => ({ ...prev, core: true }));
    try {
        const res = await fetchWithAuth('/api/admin/data');
        if (!res.ok) throw new Error('Failed to fetch core data');
        const data = await res.json();
        // The admin object from this endpoint has the most up-to-date ledger.
        setAdmin({ ...data.admin, ledger: parseDatesInLedger(data.admin.ledger) });
        setGames(data.games);
        setDailyResults(data.daily_results);
    } catch (error) {
        console.error("Core data fetch error:", error);
    } finally {
        setIsLoading(prev => ({ ...prev, core: false }));
    }
  }, [fetchWithAuth]);

  const fetchDealers = useCallback(async () => {
    setIsLoading(prev => ({...prev, dealers: true}));
    const { page, limit, search, sortKey, sortDir } = dealerFilters;
    const params = new URLSearchParams({ page: String(page), limit: String(limit), search, sortKey, sortDir });
    try {
        const res = await fetchWithAuth(`/api/admin/dealers?${params.toString()}`);
        const data: PaginatedData<Dealer> = await res.json();
        data.items = data.items.map(d => ({...d, ledger: parseDatesInLedger(d.ledger) }));
        setDealers(data);
    } catch (error) {
        console.error("Failed to fetch dealers", error);
    } finally {
        setIsLoading(prev => ({...prev, dealers: false}));
    }
  }, [fetchWithAuth, dealerFilters]);

  const fetchUsers = useCallback(async () => {
    setIsLoading(prev => ({...prev, users: true}));
    const { page, limit, search, sortKey, sortDir } = userFilters;
    const params = new URLSearchParams({ page: String(page), limit: String(limit), search, sortKey, sortDir });
    try {
        const res = await fetchWithAuth(`/api/admin/users?${params.toString()}`);
        const data: PaginatedData<User> = await res.json();
        data.items = data.items.map(u => ({...u, ledger: parseDatesInLedger(u.ledger) }));
        setUsers(data);
    } catch (error) {
        console.error("Failed to fetch users", error);
    } finally {
        setIsLoading(prev => ({...prev, users: false}));
    }
  }, [fetchWithAuth, userFilters]);

  const fetchLightweightLists = useCallback(async () => {
      try {
          const [dealersRes, usersRes] = await Promise.all([
              fetchWithAuth('/api/admin/dealers/list'),
              fetchWithAuth('/api/admin/users/list')
          ]);
          setDealerList(await dealersRes.json());
          setUserList(await usersRes.json());
      } catch (error) {
          console.error("Failed to fetch lightweight lists", error);
      }
  }, [fetchWithAuth]);
  
  // --- Effects for Initial & Triggered Data Fetches ---
  
  useEffect(() => {
    fetchCoreData();
    fetchLightweightLists();
    // Fetch initial data for the default tab
    if (activeTab === 'dealers') fetchDealers();
    if (activeTab === 'users') fetchUsers();
  }, []); // Run once on mount

  useEffect(() => { fetchDealers(); }, [dealerFilters, fetchDealers]);
  useEffect(() => { fetchUsers(); }, [userFilters, fetchUsers]);

  useEffect(() => {
    if (notification) {
        const timer = setTimeout(() => setNotification(null), 5000);
        return () => clearTimeout(timer);
    }
  }, [notification]);

  // --- Action Handlers (Mutations) ---
  const onSaveDealer = useCallback(async (dealerData: Dealer, originalId?: string) => {
    const isCreating = !originalId;
    const url = isCreating ? '/api/admin/dealers' : `/api/admin/dealers/${originalId}`;
    const method = isCreating ? 'POST' : 'PUT';
    
    try {
        const response = await fetchWithAuth(url, { method, body: JSON.stringify(dealerData) });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message);
        }
        setIsModalOpen(false);
        setSelectedDealer(undefined);
        setNotification({ type: 'success', message: `Dealer ${dealerData.name} saved successfully.` });
        await fetchDealers();
        await fetchLightweightLists(); // Refresh dropdown lists
    } catch (error: any) {
        alert(`Failed to save dealer: ${error.message}`);
    }
  }, [fetchWithAuth, fetchDealers, fetchLightweightLists]);

    const handleTransaction = async (action: 'topup' | 'withdraw', dealerId: string, amount: number) => {
        try {
            const response = await fetchWithAuth(`/api/admin/${action}/dealer`, {
                method: 'POST',
                body: JSON.stringify({ dealerId, amount }),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message);
            }
            const dealerName = dealerList.find(d => d.id === dealerId)?.name || 'dealer';
            const actionText = action === 'topup' ? 'Topped up' : 'Withdrew from';
            setNotification({ type: 'success', message: `${actionText} ${dealerName}'s wallet.` });
            
            // Close relevant modal
            if (action === 'topup') setIsTopUpModalOpen(false);
            else setIsWithdrawalModalOpen(false);
            
            await fetchDealers();
            await fetchCoreData(); // To update admin wallet balance
        } catch (error: any) {
            throw error; // Re-throw to be caught by the form
        }
    };
    
  const toggleAccountRestriction = useCallback(async (accountId: string, accountType: 'user' | 'dealer') => {
    try {
      await fetchWithAuth(`/api/admin/accounts/${accountType}/${accountId}/toggle-restriction`, { method: 'PUT' });
      setNotification({ type: 'success', message: `Account status updated.`});
      if (accountType === 'user') await fetchUsers();
      if (accountType === 'dealer') await fetchDealers();
    } catch (error: any) {
        alert(`Failed to update status: ${error.message}`);
    }
  }, [fetchWithAuth, fetchUsers, fetchDealers]);


  // Placeholder for other action handlers (declareWinner, approvePayouts, etc.)
  // These would be implemented similarly, using fetchWithAuth and then calling fetchCoreData() to refresh state.

  // --- RENDER LOGIC ---

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: Icons.chartBar },
    { id: 'dealers', label: 'Dealers', icon: Icons.userGroup }, 
    { id: 'users', label: 'Users', icon: Icons.clipboardList },
    { id: 'games', label: 'Games', icon: Icons.gamepad },
    { id: 'ledgers', label: 'Ledgers', icon: Icons.bookOpen },
    // Add other tabs here...
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      {notification && (
          <div className={`fixed top-24 right-4 md:right-8 p-4 rounded-lg shadow-2xl z-[100] border-2 animate-fade-in-down ${notification.type === 'success' ? 'bg-green-600/90 border-green-500' : 'bg-red-600/90 border-red-500'} text-white flex items-center gap-4`}>
              <span>{notification.message}</span>
              <button onClick={() => setNotification(null)} className="text-white hover:text-slate-200 font-bold text-lg leading-none">&times;</button>
          </div>
      )}
      <h2 className="text-3xl font-bold text-red-400 mb-6 uppercase tracking-widest">Admin Console</h2>
      <div className="bg-slate-800/50 p-1.5 rounded-lg flex items-center space-x-2 mb-6 self-start flex-wrap border border-slate-700">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center space-x-2 py-2 px-4 text-sm font-semibold rounded-md transition-all duration-300 ${activeTab === tab.id ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
            {tab.icon} <span>{tab.label}</span>
          </button>
        ))}
      </div>
      
      {activeTab === 'dashboard' && <DashboardView admin={admin} />}
      
      {activeTab === 'dealers' && (
        isLoading.dealers ? <LoadingSkeleton /> : 
        <div>
          <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
            <h3 className="text-xl font-semibold text-white text-left w-full sm:w-auto">Dealers ({dealers.totalItems})</h3>
            <div className="flex w-full sm:w-auto sm:justify-end gap-2 flex-col sm:flex-row">
                 <div className="relative w-full sm:w-64">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">{Icons.search}</span>
                    <input type="text" placeholder="Search by name, area, ID..." value={dealerFilters.search} onChange={(e) => setDealerFilters({...dealerFilters, search: e.target.value, page: 1})} className="bg-slate-800 p-2 pl-10 rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:outline-none w-full"/>
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
                             <SortableHeader label="Dealer" sortKey="name" currentSortKey={dealerFilters.sortKey} sortDirection={dealerFilters.sortDir} onSort={(key) => setDealerFilters({...dealerFilters, sortKey: key, sortDir: dealerFilters.sortKey === key ? (dealerFilters.sortDir === 'asc' ? 'desc' : 'asc') : 'asc'})} />
                             <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">ID / Area</th>
                              <SortableHeader label="Wallet (PKR)" sortKey="wallet" currentSortKey={dealerFilters.sortKey} sortDirection={dealerFilters.sortDir} onSort={(key) => setDealerFilters({...dealerFilters, sortKey: key, sortDir: dealerFilters.sortKey === key ? (dealerFilters.sortDir === 'asc' ? 'desc' : 'asc') : 'asc'})} />
                             <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Commission</th>
                             <SortableHeader label="Status" sortKey="status" currentSortKey={dealerFilters.sortKey} sortDirection={dealerFilters.sortDir} onSort={(key) => setDealerFilters({...dealerFilters, sortKey: key, sortDir: dealerFilters.sortKey === key ? (dealerFilters.sortDir === 'asc' ? 'desc' : 'asc') : 'asc'})} />
                             <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-800">
                         {dealers.items.map(dealer => (
                             <tr key={dealer.id} className="hover:bg-cyan-500/10 transition-colors">
                                 <td className="p-4 font-medium"><div className="flex items-center gap-3">
                                     {dealer.avatarUrl ? <img src={dealer.avatarUrl} alt={dealer.name} className="w-10 h-10 rounded-full object-cover" /> : <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-400">{Icons.user}</div>}
                                     <span className="font-semibold text-white">{dealer.name}</span>
                                 </div></td>
                                 <td className="p-4 text-slate-400"><div className="font-mono">{dealer.id}</div><div className="text-xs">{dealer.area}</div></td>
                                 <td className="p-4 font-mono text-white">{dealer.wallet.toLocaleString()}</td>
                                 <td className="p-4 text-slate-300">{dealer.commissionRate}%</td>
                                 <td className="p-4"><span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${dealer.isRestricted ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>{dealer.isRestricted ? 'Restricted' : 'Active'}</span></td>
                                 <td className="p-4">
                                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                        <button onClick={() => { setSelectedDealer(dealer); setIsModalOpen(true); }} className="bg-slate-700 hover:bg-slate-600 text-cyan-400 font-semibold py-1 px-3 rounded-md text-sm transition-colors text-center">Edit</button>
                                        <button onClick={() => setLedgerModalData({ title: dealer.name, entries: dealer.ledger })} className="bg-slate-700 hover:bg-slate-600 text-emerald-400 font-semibold py-1 px-3 rounded-md text-sm transition-colors text-center">Ledger</button>
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
             <Pagination currentPage={dealers.currentPage} totalPages={dealers.totalPages} onPageChange={(page) => setDealerFilters({...dealerFilters, page})} />
          </div>
        </div>
      )}

       {activeTab === 'users' && (
        isLoading.users ? <LoadingSkeleton /> :
        <div>
          <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
            <h3 className="text-xl font-semibold text-white text-left w-full sm:w-auto">All Users ({users.totalItems})</h3>
             <div className="flex w-full sm:w-auto sm:justify-end gap-2 flex-col sm:flex-row">
                 <div className="relative w-full sm:w-64">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">{Icons.search}</span>
                    <input type="text" placeholder="Search by name, ID, dealer..." value={userFilters.search} onChange={(e) => setUserFilters({...userFilters, search: e.target.value, page: 1})} className="bg-slate-800 p-2 pl-10 rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:outline-none w-full"/>
                </div>
            </div>
          </div>
           <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
               <div className="overflow-x-auto mobile-scroll-x">
                   <table className="w-full text-left min-w-[700px]">
                       <thead className="bg-slate-800/50">
                           <tr>
                               <SortableHeader label="Name" sortKey="name" currentSortKey={userFilters.sortKey} sortDirection={userFilters.sortDir} onSort={(key) => setUserFilters({...userFilters, sortKey: key, sortDir: userFilters.sortKey === key ? (userFilters.sortDir === 'asc' ? 'desc' : 'asc') : 'asc'})} />
                               <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Dealer</th>
                               <SortableHeader label="Wallet (PKR)" sortKey="wallet" currentSortKey={userFilters.sortKey} sortDirection={userFilters.sortDir} onSort={(key) => setUserFilters({...userFilters, sortKey: key, sortDir: userFilters.sortKey === key ? (userFilters.sortDir === 'asc' ? 'desc' : 'asc') : 'asc'})} />
                               <SortableHeader label="Status" sortKey="status" currentSortKey={userFilters.sortKey} sortDirection={userFilters.sortDir} onSort={(key) => setUserFilters({...userFilters, sortKey: key, sortDir: userFilters.sortKey === key ? (userFilters.sortDir === 'asc' ? 'desc' : 'asc') : 'asc'})} />
                               <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-center">Actions</th>
                           </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-800">
                           {users.items.map(user => (
                               <tr key={user.id} className="hover:bg-cyan-500/10 transition-colors">
                                   <td className="p-4 font-medium"><div className="flex items-center gap-3">
                                     {user.avatarUrl ? <img src={user.avatarUrl} alt={user.name} className="w-10 h-10 rounded-full object-cover" /> : <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-400">{Icons.user}</div>}
                                     <div>
                                        <div className="font-semibold text-white">{user.name}</div>
                                        <div className="text-xs text-slate-400 font-mono">{user.id}</div>
                                     </div>
                                   </div></td>
                                   <td className="p-4 text-slate-400">{dealerList.find(d => d.id === user.dealerId)?.name || 'N/A'}</td>
                                   <td className="p-4 font-mono text-white">{user.wallet.toLocaleString()}</td>
                                   <td className="p-4"><span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${user.isRestricted ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>{user.isRestricted ? 'Restricted' : 'Active'}</span></td>
                                   <td className="p-4 text-center">
                                       <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2">
                                            <button onClick={() => setLedgerModalData({ title: user.name, entries: user.ledger })} className="bg-slate-700 hover:bg-slate-600 text-cyan-400 font-semibold py-1 px-3 rounded-md text-sm transition-colors w-full sm:w-auto text-center">View Ledger</button>
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
               <Pagination currentPage={users.currentPage} totalPages={users.totalPages} onPageChange={(page) => setUserFilters({...userFilters, page})} />
           </div>
        </div>
      )}
      
      {activeTab === 'ledgers' && (
        <div>
          <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
            <h3 className="text-xl font-semibold text-white">Dealer Transaction Ledgers</h3>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setIsTopUpModalOpen(true)} className="flex items-center bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-md transition-colors whitespace-nowrap">{Icons.plus} Wallet Top-Up</button>
              <button onClick={() => setIsWithdrawalModalOpen(true)} className="flex items-center bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 px-4 rounded-md transition-colors whitespace-nowrap">{Icons.minus} Withdraw Funds</button>
               <button onClick={() => setLedgerModalData({ title: admin.name, entries: admin.ledger })} className="flex items-center bg-sky-600 hover:bg-sky-500 text-white font-bold py-2 px-4 rounded-md transition-colors whitespace-nowrap">{Icons.eye} View Admin Ledger</button>
            </div>
          </div>
          {isLoading.dealers ? <LoadingSkeleton /> : <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
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
                  {dealers.items.map(dealer => (
                    <tr key={dealer.id} className="hover:bg-cyan-500/10 transition-colors">
                      <td className="p-4 font-medium"><div className="flex items-center gap-3">
                        {dealer.avatarUrl ? <img src={dealer.avatarUrl} alt={dealer.name} className="w-10 h-10 rounded-full object-cover" /> : <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-400">{Icons.user}</div>}
                        <span className="font-semibold text-white">{dealer.name}</span>
                      </div></td>
                      <td className="p-4 text-slate-400">{dealer.area}</td>
                      <td className="p-4 font-mono text-white text-right">{dealer.wallet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="p-4 text-center"><button onClick={() => setLedgerModalData({ title: dealer.name, entries: dealer.ledger })} className="bg-slate-700 hover:bg-slate-600 text-cyan-400 font-semibold py-1 px-3 rounded-md text-sm transition-colors">View Ledger</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination currentPage={dealers.currentPage} totalPages={dealers.totalPages} onPageChange={(page) => setDealerFilters({...dealerFilters, page})} />
          </div>}
        </div>
      )}

      {/* MODALS */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={selectedDealer ? "Edit Dealer" : "Create Dealer"}>
          <DealerForm dealer={selectedDealer} dealers={dealerList} onSave={onSaveDealer} onCancel={() => setIsModalOpen(false)} adminPrizeRates={admin.prizeRates} />
      </Modal>

      <Modal isOpen={isTopUpModalOpen} onClose={() => setIsTopUpModalOpen(false)} title="Top-Up Dealer Wallet" themeColor="emerald">
          <DealerTransactionForm type="Top-Up" dealers={dealerList} onTransaction={(dealerId, amount) => handleTransaction('topup', dealerId, amount)} onCancel={() => setIsTopUpModalOpen(false)} />
      </Modal>

      <Modal isOpen={isWithdrawalModalOpen} onClose={() => setIsWithdrawalModalOpen(false)} title="Withdraw from Dealer Wallet" themeColor="amber">
          <DealerTransactionForm type="Withdrawal" dealers={dealerList} onTransaction={(dealerId, amount) => handleTransaction('withdraw', dealerId, amount)} onCancel={() => setIsWithdrawalModalOpen(false)} />
      </Modal>

      {ledgerModalData && (
        <Modal isOpen={!!ledgerModalData} onClose={() => setLedgerModalData(null)} title={`Ledger for ${ledgerModalData.title}`} size="xl">
            <LedgerTable entries={ledgerModalData.entries} />
        </Modal>
      )}
    </div>
  );
};

export default AdminPanel;
