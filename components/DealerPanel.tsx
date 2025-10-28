
import React, { useState, useMemo } from 'react';
import { Dealer, User, PrizeRates, LedgerEntry, BetLimits, Bet, Game } from '../types';
import { Icons } from '../constants';

// Internal components
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
                <div className="p-6 overflow-y-auto">{children}</div>
            </div>
        </div>
    );
};

const LedgerTable: React.FC<{ entries: LedgerEntry[] }> = ({ entries }) => (
    <div className="bg-slate-900/50 rounded-lg overflow-hidden border border-slate-700">
        <div className="overflow-y-auto max-h-[60vh]">
            <table className="w-full text-left">
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
                        <tr key={entry.id} className="hover:bg-emerald-500/10 text-sm transition-colors">
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

const UserForm: React.FC<{ user?: User; users: User[]; onSave: (user: User, originalId?: string, initialDeposit?: number) => void; onCancel: () => void; dealerPrizeRates: PrizeRates, dealerId: string }> = ({ user, users, onSave, onCancel, dealerPrizeRates, dealerId }) => {
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
                    oneDigit: user.betLimits?.oneDigit ?? (user.betLimits as any)?.oneDigitOpen ?? '', // Handle old and new data structures
                    twoDigit: user.betLimits?.twoDigit || '',
                }
            };
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
            if(!user && name === 'password') { setFormData(prev => ({ ...prev, password: value })); return; }
            setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? (checked as any) : (type === 'number' ? (value ? parseFloat(value) : '') : value) }));
        }
    };
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const newPassword = user ? password : formData.password!;
        if (newPassword && newPassword !== confirmPassword) { alert("New passwords do not match."); return; }
        if (!user && !newPassword) { alert("Password is required for new users."); return; }
        
        const formId = (formData.id as string).toLowerCase();
        if (!user && users.some(u => u.id.toLowerCase() === formId)) {
            alert("This User Login ID is already taken. Please choose another one.");
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
        onSave(finalData, user?.id, initialDeposit);
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
                    <div className="col-span-1 sm:col-span-2">
                        <label className="text-sm">1 Digit Limit (per number)</label>
                        <input type="number" name="betLimits.oneDigit" value={(formData.betLimits as any).oneDigit} onChange={handleChange} placeholder="e.g., 200" className={inputClass} />
                    </div>
                    <div className="col-span-1 sm:col-span-2">
                        <label className="text-sm">2 Digit Limit (per number)</label>
                        <input type="number" name="betLimits.twoDigit" value={(formData.betLimits as any).twoDigit} onChange={handleChange} placeholder="e.g., 500" className={inputClass} />
                    </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">This is the maximum stake a user can place on a single number (e.g., "47") per game draw. 0 means no limit.</p>
            </fieldset>

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
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-md transition-colors">Save User</button>
            </div>
        </form>
    );
};

const UserTransactionForm: React.FC<{ 
    users: User[]; 
    onTransaction: (userId: string, amount: number) => void; 
    onCancel: () => void;
    type: 'Top-Up' | 'Withdrawal';
}> = ({ users, onTransaction, onCancel, type }) => {
    const [selectedUserId, setSelectedUserId] = useState<string>('');
    const [amount, setAmount] = useState<number | ''>('');
    const themeColor = type === 'Top-Up' ? 'emerald' : 'amber';

    const inputClass = `w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-${themeColor}-500 focus:outline-none text-white`;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUserId || !amount || amount <= 0) {
            alert(`Please select a user and enter a valid positive amount.`);
            return;
        }
        const userName = users.find(u => u.id === selectedUserId)?.name || 'the selected user';
        const confirmationAction = type === 'Top-Up' ? 'to' : 'from';
        if (window.confirm(`Are you sure you want to ${type.toLowerCase()} PKR ${amount} ${confirmationAction} ${userName}'s wallet?`)) {
            onTransaction(selectedUserId, Number(amount));
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 text-slate-200">
            <div>
                <label htmlFor="user-select" className="block text-sm font-medium text-slate-400 mb-1">Select User</label>
                <select id="user-select" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className={inputClass} required >
                    <option value="" disabled>-- Choose a user --</option>
                    {users.map(user => <option key={user.id} value={user.id}>{user.name} ({user.id})</option>)}
                </select>
            </div>
            <div>
                <label htmlFor="amount-input" className="block text-sm font-medium text-slate-400 mb-1">Amount (PKR)</label>
                <input id="amount-input" type="number" value={amount} onChange={(e) => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value))} placeholder="e.g. 1000" className={inputClass} min="1" required />
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

const BetHistoryView: React.FC<{ bets: Bet[], games: Game[], users: User[] }> = ({ bets, games, users }) => {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const getBetOutcome = (bet: Bet) => {
        const game = games.find(g => g.id === bet.gameId);
        const user = users.find(u => u.id === bet.userId);
        if (!game || !user || !game.winningNumber || game.winningNumber.includes('_')) return { status: 'Pending', payout: 0, color: 'text-amber-400' };
        
        const winningNumber = game.winningNumber;
        let winningNumbersCount = 0;

        bet.numbers.forEach(num => {
            let isWin = false;
            switch (bet.subGameType) {
                case "1 Digit Open": isWin = num === winningNumber[0]; break;
                case "1 Digit Close": isWin = num === winningNumber[1]; break;
                default: isWin = num === winningNumber; break;
            }
            if (isWin) winningNumbersCount++;
        });

        if (winningNumbersCount > 0) {
            const getPrizeMultiplier = (rates: PrizeRates) => {
                switch (bet.subGameType) {
                    case "1 Digit Open": return rates.oneDigitOpen;
                    case "1 Digit Close": return rates.oneDigitClose;
                    default: return rates.twoDigit;
                }
            };
            const payout = winningNumbersCount * bet.amountPerNumber * getPrizeMultiplier(user.prizeRates);
            return { status: 'Win', payout, color: 'text-green-400' };
        }
        return { status: 'Lost', payout: 0, color: 'text-red-400' };
    };

    const filteredBets = useMemo(() => {
        return bets.filter(bet => {
            const betDateStr = bet.timestamp.toISOString().split('T')[0];
            if (startDate && betDateStr < startDate) return false;
            if (endDate && betDateStr > endDate) return false;

            if (searchTerm.trim()) {
                const user = users.find(u => u.id === bet.userId);
                const game = games.find(g => g.id === bet.gameId);
                const lowerSearchTerm = searchTerm.trim().toLowerCase();

                const userNameMatch = user?.name.toLowerCase().includes(lowerSearchTerm);
                const gameNameMatch = game?.name.toLowerCase().includes(lowerSearchTerm);
                
                if (!userNameMatch && !gameNameMatch) return false;
            }

            return true;
        }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [bets, games, users, startDate, endDate, searchTerm]);

    const handleClearFilters = () => {
        setStartDate('');
        setEndDate('');
        setSearchTerm('');
    };
    
    const inputClass = "w-full bg-slate-800 p-2 rounded-md border border-slate-600 focus:ring-2 focus:ring-emerald-500 focus:outline-none text-white";

    return (
        <div>
            <h3 className="text-xl font-semibold mb-4 text-white">User Bet History</h3>
            
            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">From Date</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={`${inputClass} font-sans`} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">To Date</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={`${inputClass} font-sans`} />
                    </div>
                    <div className="md:col-span-2 lg:col-span-1">
                        <label className="block text-sm font-medium text-slate-400 mb-1">User / Game</label>
                        <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="e.g., ADU-001, LS3" className={inputClass} />
                    </div>
                    <div className="flex items-center">
                        <button onClick={handleClearFilters} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-md transition-colors">Clear Filters</button>
                    </div>
                </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                <div className="overflow-x-auto max-h-[60vh] mobile-scroll-x">
                    <table className="w-full text-left min-w-[800px]">
                        <thead className="bg-slate-800/50 sticky top-0 backdrop-blur-sm">
                            <tr>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Timestamp</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">User</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Game</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Bet Details</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Stake (PKR)</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Payout (PKR)</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                           {filteredBets.map(bet => {
                                const game = games.find(g => g.id === bet.gameId);
                                const user = users.find(u => u.id === bet.userId);
                                const outcome = getBetOutcome(bet);
                                return (
                                <tr key={bet.id} className="hover:bg-emerald-500/10 transition-colors">
                                    <td className="p-4 text-sm text-slate-400 whitespace-nowrap">{new Date(bet.timestamp).toLocaleString()}</td>
                                    <td className="p-4 text-white font-medium">{user?.name || 'Unknown User'}</td>
                                    <td className="p-4 text-slate-300 font-medium">{game?.name || 'Unknown Game'}</td>
                                    <td className="p-4 text-slate-300">
                                        <div className="font-semibold">{bet.subGameType}</div>
                                        <div className="text-xs text-slate-400 max-w-[200px] truncate" title={bet.numbers.join(', ')}>{bet.numbers.join(', ')}</div>
                                    </td>
                                    <td className="p-4 text-right text-red-400 font-mono">{bet.totalAmount.toFixed(2)}</td>
                                    <td className="p-4 text-right text-green-400 font-mono">{outcome.payout > 0 ? outcome.payout.toFixed(2) : '-'}</td>
                                    <td className="p-4 text-right font-semibold"><span className={outcome.color}>{outcome.status}</span></td>
                                </tr>);
                           })}
                           {filteredBets.length === 0 && (
                               <tr>
                                   <td colSpan={7} className="p-8 text-center text-slate-500">
                                       {bets.length === 0 ? "No bets placed by your users yet." : "No bets found matching your filters."}
                                   </td>
                               </tr>
                           )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// --- NEW WALLET VIEW ---
const WalletView: React.FC<{ dealer: Dealer }> = ({ dealer }) => {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
    const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);

    const { filteredEntries, summary } = useMemo(() => {
        const filtered = dealer.ledger.filter(entry => {
            const entryDateStr = entry.timestamp.toISOString().split('T')[0];
            if (startDate && entryDateStr < startDate) return false;
            if (endDate && entryDateStr > endDate) return false;
            if (searchTerm.trim() && !entry.description.toLowerCase().includes(searchTerm.trim().toLowerCase())) return false;
            return true;
        });
        
        const summaryData = dealer.ledger.reduce((acc, entry) => {
            const desc = entry.description.toLowerCase();
            if (entry.credit > 0) {
                if (desc.includes('top-up from admin')) acc.totalDeposits += entry.credit;
                if (desc.includes('commission') || desc.includes('profit')) acc.totalEarnings += entry.credit;
            }
            if (entry.debit > 0) {
                if (desc.includes('withdrawal by admin')) acc.totalWithdrawals += entry.debit;
                if (desc.includes('top-up for user') || desc.includes('initial deposit for user')) acc.transfersToUsers += entry.debit;
            }
            return acc;
        }, { totalDeposits: 0, totalWithdrawals: 0, transfersToUsers: 0, totalEarnings: 0 });

        return { filteredEntries: filtered, summary: summaryData };
    }, [dealer.ledger, startDate, endDate, searchTerm]);

    const handleClearFilters = () => {
        setStartDate('');
        setEndDate('');
        setSearchTerm('');
    };
    
    const inputClass = "w-full bg-slate-800 p-2 rounded-md border border-slate-600 focus:ring-2 focus:ring-emerald-500 focus:outline-none text-white";

    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h3 className="text-xl font-semibold text-white">My Wallet</h3>
                <div className="flex gap-2 w-full md:w-auto">
                    <button onClick={() => setIsTopUpModalOpen(true)} className="flex-1 flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-md transition-colors whitespace-nowrap">
                        {Icons.plus} Request Top-Up
                    </button>
                    <button onClick={() => setIsWithdrawModalOpen(true)} className="flex-1 flex items-center justify-center bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 px-4 rounded-md transition-colors whitespace-nowrap">
                        {Icons.minus} Request Withdrawal
                    </button>
                </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 text-center sm:col-span-2 lg:col-span-1">
                    <p className="text-sm text-slate-400 uppercase">Current Balance</p>
                    <p className="text-3xl font-bold font-mono text-emerald-400">{dealer.wallet.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 text-center">
                    <p className="text-sm text-slate-400 uppercase">Total Deposits</p>
                    <p className="text-2xl font-bold font-mono text-green-400">{summary.totalDeposits.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 text-center">
                    <p className="text-sm text-slate-400 uppercase">Total Withdrawals</p>
                    <p className="text-2xl font-bold font-mono text-red-400">{summary.totalWithdrawals.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 text-center">
                    <p className="text-sm text-slate-400 uppercase">Transfers to Users</p>
                    <p className="text-2xl font-bold font-mono text-amber-400">{summary.transfersToUsers.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 text-center">
                    <p className="text-sm text-slate-400 uppercase">Total Earnings</p>
                    <p className="text-2xl font-bold font-mono text-cyan-400">{summary.totalEarnings.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
            </div>

            <h4 className="text-lg font-semibold mb-4 text-white">Transaction History</h4>
            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">From Date</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={`${inputClass} font-sans`} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">To Date</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={`${inputClass} font-sans`} />
                    </div>
                    <div className="md:col-span-2 lg:col-span-1">
                        <label className="block text-sm font-medium text-slate-400 mb-1">Search Description</label>
                        <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="e.g., Top-Up, Commission" className={inputClass} />
                    </div>
                    <div className="flex items-center">
                        <button onClick={handleClearFilters} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-md transition-colors">Clear Filters</button>
                    </div>
                </div>
            </div>

            <LedgerTable entries={filteredEntries} />
            {filteredEntries.length === 0 && (
                <div className="text-center p-8 bg-slate-800/50 rounded-lg border border-slate-700 mt-[-1px]">
                    <p className="text-slate-500">
                        {dealer.ledger.length === 0 ? "No transactions recorded yet." : "No transactions found for the selected filters."}
                    </p>
                </div>
            )}
            <Modal isOpen={isTopUpModalOpen} onClose={() => setIsTopUpModalOpen(false)} title="Request Top-Up" themeColor="emerald">
                <p className="text-slate-300">Please contact your administrator directly to request a wallet top-up. Provide your Dealer ID for faster processing.</p>
            </Modal>
            <Modal isOpen={isWithdrawModalOpen} onClose={() => setIsWithdrawModalOpen(false)} title="Request Withdrawal" themeColor="amber">
                <p className="text-slate-300">Please contact your administrator directly to request a withdrawal from your wallet.</p>
            </Modal>
        </div>
    );
};


// Helper function to format the last active timestamp
const formatLastActive = (timestamp: number): React.ReactNode => {
    if (timestamp === 0) return <span className="text-slate-500">Never</span>;

    const now = new Date();
    const lastActiveDate = new Date(timestamp);
    const diffSeconds = Math.floor((now.getTime() - lastActiveDate.getTime()) / 1000);
    const diffDays = Math.floor(diffSeconds / 86400);

    if (diffDays === 0) {
        return `Today, ${lastActiveDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (diffDays === 1) {
        return 'Yesterday';
    }
    return `${diffDays} days ago`;
};


interface DealerPanelProps {
  dealer: Dealer;
  users: User[];
  onSaveUser: (userData: User, originalId: string | undefined, initialDeposit?: number) => void;
  topUpUserWallet: (userId: string, amount: number) => void;
  withdrawFromUserWallet: (userId: string, amount: number) => void;
  toggleAccountRestriction: (accountId: string, accountType: 'user' | 'dealer') => void;
  bets: Bet[];
  games: Game[];
}

const DealerPanel: React.FC<DealerPanelProps> = ({ dealer, users: myUsers, onSaveUser, topUpUserWallet, withdrawFromUserWallet, toggleAccountRestriction, bets, games }) => {
  const [activeTab, setActiveTab] = useState('users');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | undefined>(undefined);
  const [viewingLedgerFor, setViewingLedgerFor] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [isWithdrawalModalOpen, setIsWithdrawalModalOpen] = useState(false);
  const [sortOption, setSortOption] = useState('name_asc');

  const handleSaveUser = async (userData: User, originalId?: string, initialDeposit?: number) => {
      try {
        await onSaveUser(userData, originalId, initialDeposit);
        setIsModalOpen(false);
        setSelectedUser(undefined);
      } catch (error) {
        console.error("Failed to save user:", error);
        // Error alerts are handled in the parent component (App.tsx)
        // and the modal will correctly stay open now on failure.
      }
  };
  
  const tabs = [
    { id: 'users', label: 'Users', icon: Icons.userGroup }, 
    { id: 'wallet', label: 'Wallet', icon: Icons.wallet },
    { id: 'betHistory', label: 'Bet History', icon: Icons.clipboardList },
    { id: 'ledgers', label: 'Ledgers', icon: Icons.bookOpen },
  ];

  const filteredUsers = useMemo(() => myUsers.filter(u => 
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (u.contact || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
        u.id.toLowerCase().includes(searchQuery.toLowerCase())
    ), [myUsers, searchQuery]);
    
    const userStats = useMemo(() => {
        const stats = new Map<string, { lastBet: number; betCount: number }>();
        myUsers.forEach(u => stats.set(u.id, { lastBet: 0, betCount: 0 }));
        bets.forEach(bet => {
            if (stats.has(bet.userId)) {
                const userStat = stats.get(bet.userId)!;
                userStat.betCount++;
                const betTimestamp = new Date(bet.timestamp).getTime();
                if (betTimestamp > userStat.lastBet) {
                    userStat.lastBet = betTimestamp;
                }
            }
        });
        return stats;
    }, [myUsers, bets]);

    const sortedAndFilteredUsers = useMemo(() => {
        const usersToSort = [...filteredUsers];
        usersToSort.sort((a, b) => {
            switch (sortOption) {
                case 'name_asc': return a.name.localeCompare(b.name);
                case 'name_desc': return b.name.localeCompare(a.name);
                case 'balance_desc': return b.wallet - a.wallet;
                case 'balance_asc': return a.wallet - b.wallet;
                case 'last_active_desc': {
                    const lastBetA = userStats.get(a.id)?.lastBet || 0;
                    const lastBetB = userStats.get(b.id)?.lastBet || 0;
                    return lastBetB - lastBetA;
                }
                case 'total_bets_desc': {
                    const betCountA = userStats.get(a.id)?.betCount || 0;
                    const betCountB = userStats.get(b.id)?.betCount || 0;
                    return betCountB - betCountA;
                }
                default: return 0;
            }
        });
        return usersToSort;
    }, [filteredUsers, sortOption, userStats]);
  
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <h2 className="text-3xl font-bold text-emerald-400 mb-6 uppercase tracking-widest">Dealer Console</h2>
      <div className="bg-slate-800/50 p-1.5 rounded-lg flex items-center space-x-2 mb-6 self-start border border-slate-700">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center space-x-2 py-2 px-4 text-sm font-semibold rounded-md transition-all duration-300 ${activeTab === tab.id ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
            {tab.icon} <span>{tab.label}</span>
          </button>
        ))}
      </div>

       {activeTab === 'users' && (
        <div>
          <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
            <h3 className="text-xl font-semibold text-white text-left w-full md:w-auto">My Users ({sortedAndFilteredUsers.length})</h3>
            <div className="flex flex-col sm:flex-row w-full md:w-auto md:justify-end gap-2">
                <div className="relative w-full md:w-52">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">{Icons.search}</span>
                    <input type="text" placeholder="Search ID, Name..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-slate-800 p-2 pl-10 rounded-md border border-slate-600 focus:ring-2 focus:ring-emerald-500 focus:outline-none w-full"/>
                </div>
                <div className="relative w-full md:w-48">
                    <select value={sortOption} onChange={(e) => setSortOption(e.target.value)} className="bg-slate-800 p-2 rounded-md border border-slate-600 focus:ring-2 focus:ring-emerald-500 focus:outline-none w-full appearance-none pl-3 pr-8 text-sm">
                        <option value="name_asc">Sort by Name (A-Z)</option>
                        <option value="name_desc">Sort by Name (Z-A)</option>
                        <option value="balance_desc">Balance (High-Low)</option>
                        <option value="balance_asc">Balance (Low-High)</option>
                        <option value="last_active_desc">Last Active</option>
                        <option value="total_bets_desc">Total Bets</option>
                    </select>
                </div>
                <button onClick={() => { setSelectedUser(undefined); setIsModalOpen(true); }} className="flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-md whitespace-nowrap transition-colors w-full md:w-auto">
                  {Icons.plus} Create User
                </button>
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
             <div className="overflow-x-auto mobile-scroll-x">
                 <table className="w-full text-left min-w-[800px]">
                     <thead className="bg-slate-800/50">
                         <tr>
                             <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                             <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Wallet (PKR)</th>
                             <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Bets</th>
                             <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Last Active</th>
                             <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                             <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-800">
                         {sortedAndFilteredUsers.map(user => (
                             <tr key={user.id} className="hover:bg-emerald-500/10 transition-colors text-sm">
                                 <td className="p-4 font-medium">
                                    <div className="flex items-center gap-3">
                                     {user.avatarUrl ? <img src={user.avatarUrl} alt={user.name} className="w-10 h-10 rounded-full object-cover" /> : <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-400">{Icons.user}</div>}
                                     <div>
                                        <div className="font-semibold text-white">{user.name}</div>
                                        <div className="text-xs text-slate-400 font-mono">{user.id}</div>
                                     </div>
                                    </div>
                                 </td>
                                 <td className="p-4 font-mono text-white">{user.wallet.toLocaleString()}</td>
                                 <td className="p-4 text-center font-mono text-cyan-300">{userStats.get(user.id)?.betCount || 0}</td>
                                 <td className="p-4 text-slate-400 whitespace-nowrap">{formatLastActive(userStats.get(user.id)?.lastBet || 0)}</td>
                                 <td className="p-4"><span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${user.isRestricted ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>{user.isRestricted ? 'Restricted' : 'Active'}</span></td>
                                 <td className="p-4">
                                     <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                        <button onClick={() => { setSelectedUser(user); setIsModalOpen(true); }} className="bg-slate-700 hover:bg-slate-600 text-emerald-400 font-semibold py-1 px-3 rounded-md text-sm transition-colors text-center">Edit</button>
                                        <button onClick={() => setViewingLedgerFor(user)} className="bg-slate-700 hover:bg-slate-600 text-cyan-400 font-semibold py-1 px-3 rounded-md text-sm transition-colors text-center">Ledger</button>
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

      {activeTab === 'wallet' && <WalletView dealer={dealer} />}

      {activeTab === 'betHistory' && <BetHistoryView bets={bets} games={games} users={myUsers} />}
      
      {activeTab === 'ledgers' && (
        <div>
          <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
              <h3 className="text-xl font-semibold text-white">User Transaction Ledgers</h3>
              <div className="flex gap-2 w-full md:w-auto">
                <button onClick={() => setIsTopUpModalOpen(true)} className="flex-1 flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-md transition-colors whitespace-nowrap">
                  {Icons.plus} Wallet Top-Up
                </button>
                <button onClick={() => setIsWithdrawalModalOpen(true)} className="flex-1 flex items-center justify-center bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 px-4 rounded-md transition-colors whitespace-nowrap">
                  {Icons.minus} Withdraw Funds
                </button>
              </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
            <div className="overflow-x-auto mobile-scroll-x">
              <table className="w-full text-left min-w-[600px]">
                <thead className="bg-slate-800/50">
                  <tr>
                    <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">User</th>
                    <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Contact</th>
                    <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Balance (PKR)</th>
                    <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {myUsers.map(user => (
                    <tr key={user.id} className="hover:bg-emerald-500/10 transition-colors">
                      <td className="p-4 font-medium"><div className="flex items-center gap-3">
                          {user.avatarUrl ? <img src={user.avatarUrl} alt={user.name} className="w-10 h-10 rounded-full object-cover" /> : <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-400">{Icons.user}</div>}
                          <span className="font-semibold text-white">{user.name}</span>
                      </div></td>
                      <td className="p-4 text-slate-400">{user.contact}</td>
                      <td className="p-4 font-mono text-white text-right">{user.wallet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="p-4 text-center"><button onClick={() => setViewingLedgerFor(user)} className="bg-slate-700 hover:bg-slate-600 text-emerald-400 font-semibold py-1 px-3 rounded-md text-sm transition-colors">View Ledger</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={selectedUser ? "Edit User" : "Create User"}>
        <UserForm user={selectedUser} users={myUsers} onSave={handleSaveUser} onCancel={() => setIsModalOpen(false)} dealerPrizeRates={dealer.prizeRates} dealerId={dealer.id} />
      </Modal>

      <Modal isOpen={isTopUpModalOpen} onClose={() => setIsTopUpModalOpen(false)} title="Top-Up User Wallet" themeColor="emerald">
          <UserTransactionForm type="Top-Up" users={myUsers} onTransaction={(userId, amount) => { topUpUserWallet(userId, amount); setIsTopUpModalOpen(false); }} onCancel={() => setIsTopUpModalOpen(false)} />
      </Modal>

      <Modal isOpen={isWithdrawalModalOpen} onClose={() => setIsWithdrawalModalOpen(false)} title="Withdraw from User Wallet" themeColor="amber">
          <UserTransactionForm type="Withdrawal" users={myUsers} onTransaction={(userId, amount) => { withdrawFromUserWallet(userId, amount); setIsWithdrawalModalOpen(false); }} onCancel={() => setIsWithdrawalModalOpen(false)} />
      </Modal>

      {viewingLedgerFor && (
        <Modal isOpen={!!viewingLedgerFor} onClose={() => setViewingLedgerFor(null)} title={`Ledger for ${viewingLedgerFor.name}`} size="lg">
            <LedgerTable entries={viewingLedgerFor.ledger} />
        </Modal>
      )}
    </div>
  );
};

export default DealerPanel;