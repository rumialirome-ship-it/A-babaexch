import React, { useState, useMemo, useEffect } from 'react';
import { Dealer, User, PrizeRates, LedgerEntry, BetLimits, Bet, Game, SubGameType, DailyResult, LedgerEntryType } from '../types';
import { Icons } from '../constants';
import { useAuth } from '../hooks/useAuth';
import './UserPanel.css';

// --- STABLE, TOP-LEVEL COMPONENT DEFINITIONS ---

const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: 'md' | 'lg' | 'xl'; themeColor?: string }> = ({ isOpen, onClose, title, children, size = 'md', themeColor = 'emerald' }) => {
    if (!isOpen) return null;
     const sizeClasses: Record<string, string> = { md: 'max-w-md', lg: 'max-w-3xl', xl: 'max-w-5xl' };
    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
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

const SuccessModal: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => (
    <Modal isOpen={true} onClose={onClose} title="Success" size="md">
        <div className="text-center p-4">
            <div className="mx-auto mb-4">
                <svg className="animated-check" viewBox="0 0 52 52">
                    <circle className="animated-check__circle" cx="26" cy="26" r="25" fill="none" />
                    <path className="animated-check__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
                </svg>
            </div>
            <p className="text-lg text-white font-semibold">{message}</p>
            <button onClick={onClose} className="mt-6 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-6 rounded-md transition-colors">
                OK
            </button>
        </div>
    </Modal>
);

// --- NEW PROFESSIONAL LEDGER COMPONENT ---

const SummaryCard: React.FC<{ title: string; value: number; color: string; icon: React.ReactElement<any> }> = ({ title, value, color, icon }) => (
    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 flex items-center gap-4">
        <div className={`p-3 rounded-full bg-${color}-500/20 text-${color}-400`}>
            {React.cloneElement(icon, { className: 'h-6 w-6' })}
        </div>
        <div>
            <p className="text-sm text-slate-400 uppercase tracking-wider">{title}</p>
            <p className={`text-2xl font-bold font-mono text-white`}>{value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
    </div>
);

const ProfessionalLedgerView: React.FC<{ accountId: string, accountType: 'user' | 'dealer' | 'admin', themeColor?: string }> = ({ accountId, accountType, themeColor = 'cyan' }) => {
    const [entries, setEntries] = useState<LedgerEntry[]>([]);
    const [totalEntries, setTotalEntries] = useState(0);
    const [summary, setSummary] = useState({ totalDebit: 0, totalCredit: 0, totalBets: 0, totalWinnings: 0, totalCommission: 0 });

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { fetchWithAuth } = useAuth();
    
    const [datePreset, setDatePreset] = useState<'today' | 'week' | 'month' | 'all'>('today');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ENTRIES_PER_PAGE = 25;

    useEffect(() => {
        const fetchLedger = async () => {
            if (!accountId) return;

            setIsLoading(true);
            setError(null);
            
            const params = new URLSearchParams({
                page: String(currentPage),
                limit: String(ENTRIES_PER_PAGE),
            });

            const now = new Date();
            let finalStartDate: Date | null = null;
            let finalEndDate: Date | null = new Date();
            
            switch(datePreset) {
                case 'today': finalStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break;
                case 'week': finalStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()); break;
                case 'month': finalStartDate = new Date(now.getFullYear(), now.getMonth(), 1); break;
                case 'all': finalStartDate = null; finalEndDate = null; break;
            }

            if (customStartDate) {
                finalStartDate = new Date(customStartDate);
                finalStartDate.setHours(0,0,0,0);
            }
            if (customEndDate) {
                finalEndDate = new Date(customEndDate);
                finalEndDate.setHours(23, 59, 59, 999);
            }

            if (finalStartDate) params.append('startDate', finalStartDate.toISOString().split('T')[0]);
            if (finalEndDate) params.append('endDate', finalEndDate.toISOString().split('T')[0]);
            if (searchQuery) params.append('searchQuery', searchQuery);

            try {
                const response = await fetchWithAuth(`/api/ledger/${accountType}/${accountId}?${params.toString()}`);
                if (!response.ok) throw new Error('Failed to fetch ledger data.');
                const data = await response.json(); // { entries, totalCount, summary }
                
                setEntries(data.entries.map((e: any) => ({ ...e, timestamp: new Date(e.timestamp) })));
                setTotalEntries(data.totalCount);
                setSummary(data.summary);

            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        
        const debounceFetch = setTimeout(() => {
            fetchLedger();
        }, 300); // Small debounce for search input

        return () => clearTimeout(debounceFetch);

    }, [accountId, accountType, fetchWithAuth, currentPage, datePreset, customStartDate, customEndDate, searchQuery]);
    
    const totalPages = Math.ceil(totalEntries / ENTRIES_PER_PAGE);

    const handlePresetChange = (preset: 'today' | 'week' | 'month' | 'all') => {
        setDatePreset(preset);
        setCustomStartDate('');
        setCustomEndDate('');
        setCurrentPage(1);
    }
    
    const entryTypeIcons: Record<LedgerEntryType, React.ReactElement> = {
        [LedgerEntryType.InitialDeposit]: Icons.initialDeposit,
        [LedgerEntryType.Deposit]: Icons.deposit,
        [LedgerEntryType.Withdrawal]: Icons.withdrawal,
        [LedgerEntryType.BetPlaced]: Icons.betPlaced,
        [LedgerEntryType.WinPayout]: Icons.winPayout,
        [LedgerEntryType.CommissionPayout]: Icons.commission,
        [LedgerEntryType.DealerProfit]: Icons.commission,
        [LedgerEntryType.AdminAdjustment]: Icons.adjustment,
    };

    const inputClass = "w-full bg-slate-800 p-2 rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:outline-none text-white";
    
    const displaySummary = isLoading ? { totalCredit: 0, totalDebit: 0, totalBets: 0, totalWinnings: 0, totalCommission: 0 } : summary;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <SummaryCard title="Total Credit" value={displaySummary.totalCredit} color="green" icon={Icons.deposit} />
                <SummaryCard title="Total Debit" value={displaySummary.totalDebit} color="red" icon={Icons.withdrawal} />
                <SummaryCard title="Total Bets" value={displaySummary.totalBets} color="amber" icon={Icons.betPlaced} />
                <SummaryCard title="Total Earnings" value={displaySummary.totalWinnings + displaySummary.totalCommission} color="cyan" icon={Icons.winPayout} />
            </div>

            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 flex flex-col md:flex-row gap-4 items-center flex-wrap">
                <div className="flex items-center space-x-2 flex-wrap gap-2">
                    { (['today', 'week', 'month', 'all'] as const).map(p => (
                        <button key={p} onClick={() => handlePresetChange(p)} className={`py-2 px-4 text-sm font-semibold rounded-md transition-all duration-300 capitalize ${datePreset === p && !customStartDate ? `bg-slate-700 text-${themeColor}-400 shadow-lg` : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'}`}>
                            {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : p}
                        </button>
                    ))}
                </div>
                <div className="flex-grow"></div> {/* Spacer */}
                <div className="flex items-center gap-4 flex-wrap md:justify-end">
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">{Icons.search}</span>
                        <input
                            type="text"
                            placeholder="Search description..."
                            value={searchQuery}
                            onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            className={`${inputClass} pl-10 text-sm w-full sm:w-48`}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <input type="date" value={customStartDate} onChange={e => { setCustomStartDate(e.target.value); setDatePreset('all'); setCurrentPage(1); }} className={`${inputClass} text-sm`} />
                        <span className="text-slate-400">to</span>
                        <input type="date" value={customEndDate} onChange={e => { setCustomEndDate(e.target.value); setDatePreset('all'); setCurrentPage(1); }} className={`${inputClass} text-sm`} />
                    </div>
                </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                <div className="overflow-auto min-h-[300px] mobile-scroll-x">
                    <table className="w-full text-left min-w-[700px]">
                        <thead className="bg-slate-800/50 sticky top-0 backdrop-blur-sm">
                            <tr>
                                <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date & Time</th>
                                <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</th>
                                <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Description</th>
                                <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Debit</th>
                                <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Credit</th>
                                <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Balance</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {isLoading ? (
                                <tr><td colSpan={6} className="p-8 text-center text-slate-500">Loading entries...</td></tr>
                            ) : error ? (
                                <tr><td colSpan={6} className="p-8 text-center text-red-400">{error}</td></tr>
                            ) : entries.length === 0 ? (
                                <tr><td colSpan={6} className="p-8 text-center text-slate-500">No ledger entries found for the selected criteria.</td></tr>
                            ) : (
                                entries.map(entry => (
                                    <tr key={entry.id} className={`hover:bg-${themeColor}-500/10 text-sm transition-colors`}>
                                        <td className="p-3 text-slate-400 whitespace-nowrap">{entry.timestamp.toLocaleString()}</td>
                                        <td className="p-3">
                                            <div className="flex items-center gap-2" title={entry.type.replace(/_/g, ' ')}>
                                                <span className={`text-${themeColor}-400`}>{entryTypeIcons[entry.type] || Icons.adjustment}</span>
                                                <span className="text-slate-300 text-xs hidden sm:inline capitalize">{entry.type.replace(/_/g, ' ').toLowerCase()}</span>
                                            </div>
                                        </td>
                                        <td className="p-3 text-white">{entry.description}</td>
                                        <td className="p-3 text-right text-red-400 font-mono">{entry.debit > 0 ? entry.debit.toFixed(2) : '-'}</td>
                                        <td className="p-3 text-right text-green-400 font-mono">{entry.credit > 0 ? entry.credit.toFixed(2) : '-'}</td>
                                        <td className="p-3 text-right font-semibold text-white font-mono">{entry.balance.toFixed(2)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                 <div className="p-4 bg-slate-800/50 border-t border-slate-700 flex justify-between items-center text-sm">
                    <p className="text-slate-400">Showing <span className="font-semibold text-white">{totalEntries > 0 ? (currentPage - 1) * ENTRIES_PER_PAGE + 1 : 0}-{Math.min(currentPage * ENTRIES_PER_PAGE, totalEntries)}</span> of <span className="font-semibold text-white">{totalEntries}</span> entries</p>
                    <div className="flex gap-2">
                        <button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1} className="bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold py-1.5 px-3 rounded-md transition-colors text-xs">Previous</button>
                        <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage >= totalPages} className="bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold py-1.5 px-3 rounded-md transition-colors text-xs">Next</button>
                    </div>
                </div>
            </div>
        </div>
    );
};


const UserForm: React.FC<{ user?: User; users: User[]; onSave: (user: User, originalId?: string, initialDeposit?: number) => Promise<void>; onCancel: () => void; dealerPrizeRates: PrizeRates, dealerId: string }> = ({ user, users, onSave, onCancel, dealerPrizeRates, dealerId }) => {
    const [formData, setFormData] = useState(() => {
        const defaults = {
            id: '', name: '', password: '', area: '', contact: '', commissionRate: 0, 
            prizeRates: { ...dealerPrizeRates }, avatarUrl: '', wallet: '',
            betLimits: { oneDigit: '', twoDigit: '' }
        };
        if (user) {
            return {
                ...user,
                password: '',
                betLimits: {
                    oneDigit: user.betLimits?.oneDigit ?? '',
                    twoDigit: user.betLimits?.twoDigit ?? '',
                }
            };
        }
        return defaults;
    });

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        if (name.includes('.')) {
            const [parent, child] = name.split('.');
            setFormData(prev => ({ ...prev, [parent]: { ...(prev[parent as keyof typeof prev] as object), [child]: type === 'number' ? parseFloat(value) : value } }));
        } else {
            if(!user && name === 'password') { setFormData(prev => ({ ...prev, password: value })); return; }
            setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? (checked as any) : (type === 'number' ? (value ? parseFloat(value) : '') : value) }));
        }
    };
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const newPassword = user ? password : formData.password!;
        if (newPassword && newPassword !== confirmPassword) { setError("New passwords do not match."); return; }
        if (!user && !newPassword) { setError("Password is required for new users."); return; }
        
        const formId = (formData.id as string).toLowerCase();
        if (!user && users.some(u => u.id.toLowerCase() === formId)) {
            setError("This User Login ID is already taken. Please choose another one.");
            return;
        }

        let finalData: User;
        const initialDeposit = Number(formData.wallet) || 0;
        const betLimitsValue: BetLimits = {
            oneDigit: Number((formData.betLimits as any).oneDigit) || 0,
            twoDigit: Number((formData.betLimits as any).twoDigit) || 0,
        };

        if (user) { // Editing
            finalData = {
                ...user,
                name: formData.name,
                password: newPassword ? newPassword : user.password,
                area: formData.area,
                contact: formData.contact,
                avatarUrl: formData.avatarUrl,
                betLimits: betLimitsValue,
                commissionRate: Number(formData.commissionRate) || 0,
                prizeRates: {
                    oneDigitOpen: Number(formData.prizeRates.oneDigitOpen) || 0,
                    oneDigitClose: Number(formData.prizeRates.oneDigitClose) || 0,
                    twoDigit: Number(formData.prizeRates.twoDigit) || 0,
                },
            };
        } else { // Creating
            finalData = {
                id: formData.id as string,
                dealerId,
                name: formData.name,
                password: newPassword,
                area: formData.area,
                contact: formData.contact,
                wallet: 0, // Wallet is set by parent logic
                commissionRate: Number(formData.commissionRate) || 0,
                betLimits: betLimitsValue,
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
        
        setIsLoading(true);
        try {
            await onSave(finalData, user?.id, initialDeposit);
        } catch (err: any) {
            setError(err.message || 'An unknown error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    const displayPassword = user ? password : formData.password!;
    const inputClass = "w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-emerald-500 focus:outline-none text-white";

    return (
        <form onSubmit={handleSubmit} className="space-y-4 text-slate-200">
            <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">User Login ID</label>
                <input type="text" name="id" value={formData.id as string} onChange={handleChange} placeholder="User Login ID" className={inputClass} required disabled={!!user}/>
            </div>
            <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="User Display Name" className={inputClass} required />
            <div className="relative">
                 <input type={isPasswordVisible ? 'text' : 'password'} name="password" value={displayPassword} onChange={user ? (e) => setPassword(e.target.value) : handleChange} placeholder={user ? "New Password (optional)" : "Password"} className={inputClass + " pr-10"} required={!user} />
                <button type="button" onClick={() => setIsPasswordVisible(!isPasswordVisible)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white">{isPasswordVisible ? Icons.eyeOff : Icons.eye}</button>
            </div>
            {displayPassword && (
                 <div className="relative">
                    <input type={isConfirmPasswordVisible ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm New Password" className={inputClass + " pr-10"} required />
                    <button type="button" onClick={() => setIsConfirmPasswordVisible(!isConfirmPasswordVisible)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white">{isConfirmPasswordVisible ? Icons.eyeOff : Icons.eye}</button>
                </div>
            )}
            <input type="url" name="avatarUrl" value={formData.avatarUrl || ''} onChange={handleChange} placeholder="Avatar Image URL (optional)" className={inputClass} />
            <input type="text" name="area" value={formData.area} onChange={handleChange} placeholder="Area / Contact" className={inputClass} />
            <input type="text" name="contact" value={formData.contact} onChange={handleChange} placeholder="Contact Number" className={inputClass} />
            {!user && (
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Initial Wallet Amount (PKR)</label>
                  <input type="number" name="wallet" value={formData.wallet as string} onChange={handleChange} placeholder="e.g. 5000" className={inputClass} />
                </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Commission Rate (%)</label>
              <input type="number" name="commissionRate" value={formData.commissionRate} onChange={handleChange} placeholder="e.g. 2" className={inputClass} />
            </div>
            
            <fieldset className="border border-slate-600 p-4 rounded-md">
                <legend className="px-2 text-sm font-medium text-slate-400">Bet Limits (Per Number)</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm">1 Digit (Open/Close)</label>
                        <input type="number" name="betLimits.oneDigit" value={(formData.betLimits as any).oneDigit} onChange={handleChange} placeholder="e.g. 500" className={inputClass} />
                    </div>
                    <div>
                        <label className="block text-sm">2 Digit</label>
                        <input type="number" name="betLimits.twoDigit" value={formData.betLimits.twoDigit} onChange={handleChange} placeholder="e.g. 1000" className={inputClass} />
                    </div>
                </div>
            </fieldset>

            {error && <div className="bg-red-500/20 text-red-300 p-3 rounded-md text-sm mt-2">{error}</div>}

            <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={onCancel} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-md transition-colors">Cancel</button>
                <button type="submit" disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-md transition-colors disabled:bg-slate-600 disabled:cursor-wait">
                    {isLoading ? 'Saving...' : (user ? 'Save Changes' : 'Create User')}
                </button>
            </div>
        </form>
    );
};

const BettingView: React.FC<DealerPanelProps> = ({ users, games, placeBetAsDealer }) => {
    const [selectedUserId, setSelectedUserId] = useState('');
    const [selectedGameId, setSelectedGameId] = useState('');

    const betTypes = [SubGameType.TwoDigit, SubGameType.OneDigitOpen, SubGameType.OneDigitClose];
    const [activeBetType, setActiveBetType] = useState<SubGameType>(betTypes[0]);
    const [betInputs, setBetInputs] = useState<Record<SubGameType, { numbers: string, amount: string }>>({
        [SubGameType.TwoDigit]: { numbers: '', amount: '' }, [SubGameType.OneDigitOpen]: { numbers: '', amount: '' }, [SubGameType.OneDigitClose]: { numbers: '', amount: '' },
        [SubGameType.Bulk]: { numbers: '', amount: '' }, [SubGameType.Combo]: { numbers: '', amount: '' }
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const { fetchWithAuth } = useAuth();
    
    const selectedUser = useMemo(() => users.find(u => u.id === selectedUserId), [users, selectedUserId]);
    const selectedGame = useMemo(() => games.find(g => g.id === selectedGameId), [games, selectedGameId]);
    const openGames = useMemo(() => games.filter(g => g.isMarketOpen), [games]);

    const handleInputChange = (subGameType: SubGameType, field: 'numbers' | 'amount', value: string) => {
        if (field === 'amount') {
            const sanitizedValue = value.replace(/[^0-9.]/g, '');
            setBetInputs(prev => ({ ...prev, [subGameType]: { ...prev[subGameType], [field]: sanitizedValue } }));
            return;
        }
    
        if (field === 'numbers') {
            const isTwoDigit = subGameType === SubGameType.TwoDigit;
            const chunkSize = isTwoDigit ? 2 : 1;
            const digitsOnly = value.replace(/\D/g, '');
    
            if (digitsOnly.length > 0) {
                const chunks = [];
                for (let i = 0; i < digitsOnly.length; i += chunkSize) {
                    chunks.push(digitsOnly.substring(i, i + chunkSize));
                }
                const formattedValue = chunks.join(',');
                setBetInputs(prev => ({ ...prev, [subGameType]: { ...prev[subGameType], [field]: formattedValue } }));
            } else {
                setBetInputs(prev => ({ ...prev, [subGameType]: { ...prev[subGameType], [field]: '' } }));
            }
        }
    };

    const getLuckyPicks = async () => {
        if (!selectedGame) return;
        setIsLoading(true);
        try {
            const response = await fetchWithAuth('/api/ai/lucky-pick', { method: 'POST', body: JSON.stringify({ gameName: selectedGame.name, count: 5 }) });
            if (!response.ok) throw new Error("Failed to get lucky picks.");
            const { luckyNumbers } = await response.json();
            handleInputChange(activeBetType, 'numbers', luckyNumbers.join(''));
        } catch (err: any) { setError(err.message); } 
        finally { setIsLoading(false); }
    };
    
    const betSummary = useMemo(() => {
        let totalCost = 0; let totalNumbers = 0;
        for (const type of betTypes) {
            const { numbers, amount } = betInputs[type];
            if (amount && Number(amount) > 0) {
                const numberList = numbers.trim().split(/[\s,]+/).filter(Boolean);
                totalNumbers += numberList.length;
                totalCost += numberList.length * Number(amount);
            }
        }
        return { totalCost, totalNumbers };
    }, [betInputs, betTypes]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!selectedUser || !selectedGame) { setError("Please select a user and a game."); return; }
        if (betSummary.totalCost <= 0) { setError("Please enter numbers and an amount to bet."); return; }
        if (betSummary.totalCost > selectedUser.wallet) { setError("Insufficient wallet balance for this user."); return; }

        const betGroups = betTypes.map(type => {
            const { numbers, amount } = betInputs[type];
            const numberList = numbers.trim().split(/[\s,]+/).filter(Boolean);
            return { subGameType: type, numbers: numberList, amountPerNumber: Number(amount) };
        }).filter(group => group.numbers.length > 0 && group.amountPerNumber > 0);

        if (betGroups.length === 0) { setError("No valid bets to place."); return; }
        
        setIsLoading(true);
        try {
            await placeBetAsDealer({ userId: selectedUser.id, gameId: selectedGame.id, betGroups });
            setSuccess(`Bet placed for ${selectedUser.name} on ${selectedGame.name} successfully!`);
            // Fix: Corrected property names 'n' and 'a' to 'numbers' and 'amount' to match the state type.
            setBetInputs({ [SubGameType.TwoDigit]:{numbers:'',amount:''}, [SubGameType.OneDigitOpen]:{numbers:'',amount:''}, [SubGameType.OneDigitClose]:{numbers:'',amount:''}, [SubGameType.Bulk]:{numbers:'',amount:''}, [SubGameType.Combo]:{numbers:'',amount:''}});
        } catch (err: any) { setError(err.message); } 
        finally { setIsLoading(false); }
    };
    
    if (success) { return <SuccessModal message={success} onClose={() => setSuccess(null)} />; }

    const inputClass = "w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-emerald-500 focus:outline-none text-white";

    return (
        <div>
            <h3 className="text-xl font-semibold text-white mb-4">Place a Bet for a User</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Select User</label>
                    <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} className={inputClass}>
                        <option value="">-- Choose a user --</option>
                        {users.filter(u=>!u.isRestricted).map(u => <option key={u.id} value={u.id}>{u.name} (Wallet: {u.wallet.toFixed(2)})</option>)}
                    </select>
                </div>
                 <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Select Game</label>
                    <select value={selectedGameId} onChange={e => setSelectedGameId(e.target.value)} className={inputClass}>
                        <option value="">-- Choose a game --</option>
                        {openGames.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                </div>
            </div>

            {selectedUser && selectedGame && (
                <form onSubmit={handleSubmit} className="bg-slate-800/50 rounded-lg border border-slate-700 p-6 space-y-6">
                    <div className="flex items-center space-x-2 bg-slate-800 p-1 rounded-lg">
                        {betTypes.map(type => <button key={type} type="button" onClick={() => setActiveBetType(type)} className={`flex-1 py-2 px-4 text-sm font-semibold rounded-md transition-all duration-300 ${activeBetType === type ? 'bg-slate-700 text-emerald-400' : 'text-slate-400 hover:bg-slate-600'}`}>{type}</button>)}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Numbers</label>
                        <textarea value={betInputs[activeBetType].numbers} onChange={e => handleInputChange(activeBetType, 'numbers', e.target.value)} rows={3} className={inputClass} placeholder={`Enter ${activeBetType === SubGameType.TwoDigit ? '2-digit' : '1-digit'} numbers (e.g. 12,34,56)`} />
                         <div className="flex justify-end mt-2">
                            <button type="button" onClick={getLuckyPicks} disabled={isLoading} className="flex items-center text-sm bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 font-semibold py-1 px-3 rounded-md transition-colors disabled:opacity-50">
                                {Icons.sparkles} AI Lucky Pick
                            </button>
                        </div>
                    </div>
                    <div><label className="block text-sm font-medium text-slate-400 mb-1">Amount Per Number (PKR)</label><input type="number" value={betInputs[activeBetType].amount} onChange={e => handleInputChange(activeBetType, 'amount', e.target.value)} className={inputClass} placeholder="e.g., 10" /></div>
                    
                    <div className="border-t border-slate-700 pt-4 space-y-2 text-white">
                        <div className="flex justify-between"><span className="text-slate-400">Total Numbers:</span><span className="font-mono">{betSummary.totalNumbers}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Total Cost:</span><span className="font-mono font-bold text-lg">{betSummary.totalCost.toFixed(2)} PKR</span></div>
                        <div className="flex justify-between text-sm"><span className="text-slate-400">{selectedUser.name}'s Wallet:</span><span className="font-mono">{selectedUser.wallet.toFixed(2)} PKR</span></div>
                    </div>
                    {error && <div className="bg-red-500/20 text-red-300 p-3 rounded-md text-sm">{error}</div>}
                    <button type="submit" disabled={isLoading || betSummary.totalCost <= 0 || betSummary.totalCost > selectedUser.wallet} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-md transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed">
                        {isLoading ? 'Placing Bet...' : `Place Bet for ${selectedUser.name}`}
                    </button>
                </form>
            )}
        </div>
    );
};

interface DealerPanelProps {
    dealer: Dealer;
    users: User[];
    onSaveUser: (user: User, originalId?: string, initialDeposit?: number) => Promise<void>;
    topUpUserWallet: (userId: string, amount: number) => Promise<void>;
    withdrawFromUserWallet: (userId: string, amount: number) => Promise<void>;
    toggleAccountRestriction: (userId: string, accountType: 'user') => void;
    games: Game[];
    dailyResults: DailyResult[];
    placeBetAsDealer: (details: {
        userId: string;
        gameId: string;
        betGroups: {
            subGameType: SubGameType;
            numbers: string[];
            amountPerNumber: number;
        }[];
    }) => Promise<void>;
}

const DealerPanel: React.FC<DealerPanelProps> = ({ dealer, users, onSaveUser, topUpUserWallet, withdrawFromUserWallet, toggleAccountRestriction, games, dailyResults, placeBetAsDealer }) => {
    const [activeTab, setActiveTab] = useState('users');
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | undefined>(undefined);
    const [searchQuery, setSearchQuery] = useState('');
    const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
    const [transactionType, setTransactionType] = useState<'Top-Up' | 'Withdrawal'>('Top-Up');
    const [transactionUser, setTransactionUser] = useState<User | null>(null);
    const [transactionAmount, setTransactionAmount] = useState<number | ''>('');
    const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
    const [ledgerUser, setLedgerUser] = useState<User | null>(null);
    
    const handleSaveUser = async (userData: User, originalId?: string, initialDeposit?: number) => {
        await onSaveUser(userData, originalId, initialDeposit);
        setIsUserModalOpen(false);
    };

    const handleOpenTransactionModal = (user: User, type: 'Top-Up' | 'Withdrawal') => {
        setTransactionUser(user);
        setTransactionType(type);
        setTransactionAmount('');
        setIsTransactionModalOpen(true);
    };

    const handleTransactionSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!transactionUser || !transactionAmount || transactionAmount <= 0) {
            alert("Invalid amount");
            return;
        }
        try {
            if (transactionType === 'Top-Up') {
                await topUpUserWallet(transactionUser.id, transactionAmount);
            } else {
                await withdrawFromUserWallet(transactionUser.id, transactionAmount);
            }
            setIsTransactionModalOpen(false);
        } catch (error: any) {
            alert(error.message);
        }
    };
    
    const tabs = [
        { id: 'users', label: 'My Users', icon: Icons.userGroup },
        { id: 'ledger', label: 'My Ledger', icon: Icons.bookOpen },
        { id: 'betting', label: 'Bet for User', icon: Icons.gamepad },
    ];
    
    const filteredUsers = useMemo(() => {
        return users.filter(user => user.name.toLowerCase().includes(searchQuery.toLowerCase()) || user.id.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [users, searchQuery]);

    return (
        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
            <h2 className="text-3xl font-bold text-emerald-400 mb-6 uppercase tracking-widest">Dealer Panel</h2>

             <div className="bg-slate-800/50 p-1.5 rounded-lg flex items-center space-x-2 mb-6 self-start flex-wrap border border-slate-700">
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center space-x-2 py-2 px-4 text-sm font-semibold rounded-md transition-all duration-300 ${activeTab === tab.id ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
                        {tab.icon} <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            {activeTab === 'ledger' && (
                <div>
                     <h3 className="text-xl font-semibold text-white mb-4">My Ledger</h3>
                     <ProfessionalLedgerView accountId={dealer.id} accountType="dealer" themeColor="emerald" />
                </div>
            )}
            
            {activeTab === 'users' && (
                <div>
                    <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                        <h3 className="text-xl font-semibold text-white text-left w-full sm:w-auto">My Users ({filteredUsers.length})</h3>
                        <div className="flex w-full sm:w-auto sm:justify-end gap-2 flex-col sm:flex-row">
                             <div className="relative w-full sm:w-64">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">{Icons.search}</span>
                                <input type="text" placeholder="Search by name or ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-slate-800 p-2 pl-10 rounded-md border border-slate-600 focus:ring-2 focus:ring-emerald-500 focus:outline-none w-full"/>
                            </div>
                            <button onClick={() => { setSelectedUser(undefined); setIsUserModalOpen(true); }} className="flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-md whitespace-nowrap transition-colors">
                              {Icons.plus} Create User
                            </button>
                        </div>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                        <div className="overflow-x-auto mobile-scroll-x">
                            <table className="w-full text-left min-w-[800px]">
                                <thead className="bg-slate-800/50">
                                    <tr>
                                        <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">User</th>
                                        <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">ID / Area</th>
                                        <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Wallet (PKR)</th>
                                        <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                                        <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {filteredUsers.map(user => (
                                        <tr key={user.id} className="hover:bg-emerald-500/10 transition-colors">
                                            <td className="p-4 font-medium"><div className="flex items-center gap-3">
                                                {user.avatarUrl ? <img src={user.avatarUrl} alt={user.name} className="w-10 h-10 rounded-full object-cover" /> : <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-400">{Icons.user}</div>}
                                                <span className="font-semibold text-white">{user.name}</span>
                                            </div></td>
                                            <td className="p-4 text-slate-400"><div className="font-mono">{user.id}</div><div className="text-xs">{user.area}</div></td>
                                            <td className="p-4 font-mono text-white">{user.wallet.toLocaleString()}</td>
                                            <td className="p-4"><span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${user.isRestricted ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>{user.isRestricted ? 'Restricted' : 'Active'}</span></td>
                                            <td className="p-4">
                                                 <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                                    <button onClick={() => { setSelectedUser(user); setIsUserModalOpen(true); }} className="bg-slate-700 hover:bg-slate-600 text-cyan-400 font-semibold py-1 px-3 rounded-md text-sm transition-colors text-center">Edit</button>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => handleOpenTransactionModal(user, 'Top-Up')} className="flex-1 bg-slate-700 hover:bg-slate-600 text-emerald-400 font-semibold py-1 px-3 rounded-md text-sm transition-colors text-center">Top-Up</button>
                                                        <button onClick={() => handleOpenTransactionModal(user, 'Withdrawal')} className="flex-1 bg-slate-700 hover:bg-slate-600 text-amber-400 font-semibold py-1 px-3 rounded-md text-sm transition-colors text-center">Withdraw</button>
                                                    </div>
                                                    <button onClick={() => toggleAccountRestriction(user.id, 'user')} className={`font-semibold py-1 px-3 rounded-md text-sm transition-colors text-center ${user.isRestricted ? 'bg-green-500/20 hover:bg-green-500/40 text-green-300' : 'bg-red-500/20 hover:bg-red-500/40 text-red-300'}`}>
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

            {activeTab === 'betting' && (
                <BettingView 
                    dealer={dealer}
                    users={users}
                    onSaveUser={onSaveUser}
                    topUpUserWallet={topUpUserWallet}
                    withdrawFromUserWallet={withdrawFromUserWallet}
                    toggleAccountRestriction={toggleAccountRestriction}
                    games={games}
                    dailyResults={dailyResults}
                    placeBetAsDealer={placeBetAsDealer}
                />
            )}

            <Modal isOpen={isUserModalOpen} onClose={() => setIsUserModalOpen(false)} title={selectedUser ? "Edit User" : "Create User"}>
                <UserForm user={selectedUser} users={users} onSave={handleSaveUser} onCancel={() => setIsUserModalOpen(false)} dealerPrizeRates={dealer.prizeRates} dealerId={dealer.id} />
            </Modal>
            
            <Modal isOpen={isTransactionModalOpen} onClose={() => setIsTransactionModalOpen(false)} title={`${transactionType} User Wallet`} themeColor={transactionType === 'Top-Up' ? 'emerald' : 'amber'}>
                <form onSubmit={handleTransactionSubmit} className="space-y-4 text-slate-200">
                    <div>
                        <p className="text-sm text-slate-400">User</p>
                        <p className="font-semibold text-white text-lg">{transactionUser?.name}</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Amount (PKR)</label>
                        <input type="number" value={transactionAmount} onChange={(e) => setTransactionAmount(e.target.value === '' ? '' : parseFloat(e.target.value))} placeholder="e.g., 1000" className="w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-emerald-500 focus:outline-none text-white" min="1" required />
                    </div>
                    <div className="flex justify-end space-x-3 pt-4">
                        <button type="button" onClick={() => setIsTransactionModalOpen(false)} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-md transition-colors">Cancel</button>
                        <button type="submit" className={`font-bold py-2 px-4 rounded-md transition-colors text-white ${transactionType === 'Top-Up' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-amber-600 hover:bg-amber-500'}`}>Confirm {transactionType}</button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={isLedgerModalOpen} onClose={() => setIsLedgerModalOpen(false)} title={`Ledger for ${ledgerUser?.name}`} size="xl">
                {ledgerUser && <ProfessionalLedgerView accountId={ledgerUser.id} accountType="user" themeColor="emerald" />}
            </Modal>
        </div>
    );
};

export default DealerPanel;