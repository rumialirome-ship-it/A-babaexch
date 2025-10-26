import React, { useState, useMemo } from 'react';
import { Dealer, User, Game, PrizeRates, LedgerEntry, Bet } from '../types';
import { Icons } from '../constants';

// Internal components
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
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-sm">1 Digit Open</label><input type="number" name="prizeRates.oneDigitOpen" value={formData.prizeRates.oneDigitOpen} onChange={handleChange} className={inputClass} /></div>
                    <div><label className="text-sm">1 Digit Close</label><input type="number" name="prizeRates.oneDigitClose" value={formData.prizeRates.oneDigitClose} onChange={handleChange} className={inputClass} /></div>
                    <div className="col-span-2"><label className="text-sm">2 Digit</label><input type="number" name="prizeRates.twoDigit" value={formData.prizeRates.twoDigit} onChange={handleChange} className={inputClass} /></div>
                </div>
            </fieldset>

            <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={onCancel} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-md transition-colors">Cancel</button>
                <button type="submit" className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded-md transition-colors">Save Dealer</button>
            </div>
        </form>
    );
};

const TopUpForm: React.FC<{ dealers: Dealer[]; onTopUp: (dealerId: string, amount: number) => void; onCancel: () => void; }> = ({ dealers, onTopUp, onCancel }) => {
    const [selectedDealerId, setSelectedDealerId] = useState<string>('');
    const [amount, setAmount] = useState<number | ''>('');
    const inputClass = "w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-emerald-500 focus:outline-none text-white";

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedDealerId || !amount || amount <= 0) { alert('Please select a dealer and enter a valid positive amount.'); return; }
        const dealerName = dealers.find(d => d.id === selectedDealerId)?.name || 'the selected dealer';
        if (window.confirm(`Are you sure you want to top up ${dealerName}'s wallet with PKR ${amount}?`)) { onTopUp(selectedDealerId, Number(amount)); }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 text-slate-200">
            <div>
                <label htmlFor="dealer-select" className="block text-sm font-medium text-slate-400 mb-1">Select Dealer</label>
                <select id="dealer-select" value={selectedDealerId} onChange={(e) => setSelectedDealerId(e.target.value)} className={inputClass} required >
                    <option value="" disabled>-- Choose a dealer --</option>
                    {dealers.map(dealer => <option key={dealer.id} value={dealer.id}>{dealer.name} ({dealer.id})</option>)}
                </select>
            </div>
            <div>
                <label htmlFor="topup-amount" className="block text-sm font-medium text-slate-400 mb-1">Amount (PKR)</label>
                <input id="topup-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value))} placeholder="e.g. 5000" className={inputClass} min="1" required />
            </div>
            <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={onCancel} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-md transition-colors">Cancel</button>
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-md transition-colors">Top-Up Wallet</button>
            </div>
        </form>
    );
};

interface AdminPanelProps {
  admin: { name: string, prizeRates: PrizeRates }; 
  dealers: Dealer[]; 
  onSaveDealer: (dealer: Dealer, originalId?: string) => Promise<void>;
  users: User[]; 
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  games: Game[]; 
  bets: Bet[]; 
  declareWinner: (gameId: string, winningNumber: string) => void;
  approvePayouts: (gameId: string) => void;
  topUpDealerWallet: (dealerId: string, amount: number) => void;
  toggleAccountRestriction: (accountId: string, accountType: 'user' | 'dealer') => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ admin, dealers, onSaveDealer, users, setUsers, games, bets, declareWinner, approvePayouts, topUpDealerWallet, toggleAccountRestriction }) => {
  const [activeTab, setActiveTab] = useState('dealers');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDealer, setSelectedDealer] = useState<Dealer | undefined>(undefined);
  const [winningNumbers, setWinningNumbers] = useState<{[key: string]: string}>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [viewingLedgerFor, setViewingLedgerFor] = useState<Dealer | null>(null);
  const [betSearchQuery, setBetSearchQuery] = useState('');
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [viewingUserLedgerFor, setViewingUserLedgerFor] = useState<User | null>(null);

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

  const handleDeclareWinner = (gameId: string) => {
    const num = winningNumbers[gameId];
    if (num && num.length === 2 && !isNaN(parseInt(num))) {
        declareWinner(gameId, num);
        setWinningNumbers(prev => ({...prev, [gameId]: ''}));
    } else { alert("Please enter a valid 2-digit number."); }
  };

  const filteredDealers = dealers.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()) || d.area.toLowerCase().includes(searchQuery.toLowerCase()) || d.id.toLowerCase().includes(searchQuery.toLowerCase()));

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
    { id: 'dealers', label: 'Dealers', icon: Icons.userGroup }, { id: 'games', label: 'Games', icon: Icons.gamepad },
    { id: 'bettingSheet', label: 'Bet Search', icon: Icons.search }, { id: 'users', label: 'Users', icon: Icons.clipboardList },
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

      {activeTab === 'dealers' && (
        <div>
          <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
            <h3 className="text-xl font-semibold text-white text-left w-full md:w-auto">Dealers ({filteredDealers.length})</h3>
            <div className="flex w-full md:w-auto md:justify-end gap-2">
                 <div className="relative w-full md:w-64">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">{Icons.search}</span>
                    <input type="text" placeholder="Search by name, area, ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-slate-800 p-2 pl-10 rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:outline-none w-full"/>
                </div>
                <button onClick={() => { setSelectedDealer(undefined); setIsModalOpen(true); }} className="flex items-center bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded-md whitespace-nowrap transition-colors">
                  {Icons.plus} Create Dealer
                </button>
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
             <div className="overflow-x-auto">
                 <table className="w-full text-left">
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
                                      <div className="flex items-center gap-2">
                                        <button onClick={() => { setSelectedDealer(dealer); setIsModalOpen(true); }} className="bg-slate-700 hover:bg-slate-600 text-cyan-400 font-semibold py-1 px-3 rounded-md text-sm transition-colors">Edit</button>
                                        <button onClick={() => setViewingLedgerFor(dealer)} className="bg-slate-700 hover:bg-slate-600 text-emerald-400 font-semibold py-1 px-3 rounded-md text-sm transition-colors">Ledger</button>
                                        <button onClick={() => toggleAccountRestriction(dealer.id, 'dealer')} className={`font-semibold py-1 px-3 rounded-md text-sm transition-colors ${dealer.isRestricted ? 'bg-green-500/20 hover:bg-green-500/40 text-green-300' : 'bg-red-500/20 hover:bg-red-500/40 text-red-300'}`}>
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
                {games.map(game => (
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
                            ) : (
                                <div className="flex items-center justify-between my-2">
                                    <div>
                                        <p className="text-sm text-slate-400">Pending Approval</p>
                                        <p className="text-2xl font-bold text-amber-400">{game.winningNumber}</p>
                                    </div>
                                    <button 
                                        onClick={() => { if (window.confirm(`Are you sure you want to approve payouts for ${game.name}? This action cannot be undone.`)) { approvePayouts(game.id); } }} 
                                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-md transition-colors animate-pulse"
                                    >
                                        Approve Payouts
                                    </button>
                                </div>
                            )
                        ) : (
                            <div className="flex items-center space-x-2 my-2">
                                <input type="text" maxLength={2} value={winningNumbers[game.id] || ''} onChange={(e) => setWinningNumbers({...winningNumbers, [game.id]: e.target.value})} className="w-20 bg-slate-800 p-2 text-center text-xl font-bold rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500" placeholder="00" />
                                <button onClick={() => handleDeclareWinner(game.id)} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded-md transition-colors">Declare</button>
                            </div>
                        )}
                        <p className="text-sm text-slate-400">Draw Time: {game.drawTime}</p>
                    </div>
                ))}
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
                <div className="overflow-x-auto max-h-[60vh]">
                    <table className="w-full text-left">
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
               <div className="overflow-x-auto">
                   <table className="w-full text-left">
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
                                       <div className="flex items-center justify-center gap-2">
                                            <button onClick={() => setViewingUserLedgerFor(user)} className="bg-slate-700 hover:bg-slate-600 text-cyan-400 font-semibold py-1 px-3 rounded-md text-sm transition-colors">View Ledger</button>
                                            <button onClick={() => toggleAccountRestriction(user.id, 'user')} className={`font-semibold py-1 px-3 rounded-md text-sm transition-colors ${user.isRestricted ? 'bg-green-500/20 hover:bg-green-500/40 text-green-300' : 'bg-red-500/20 hover:bg-red-500/40 text-red-300'}`}>
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
            <button onClick={() => setIsTopUpModalOpen(true)} className="flex items-center bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-md transition-colors whitespace-nowrap">
              {Icons.plus} Wallet Top-Up
            </button>
          </div>
          <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
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
          <TopUpForm dealers={dealers} onTopUp={(dealerId, amount) => { topUpDealerWallet(dealerId, amount); setIsTopUpModalOpen(false); }} onCancel={() => setIsTopUpModalOpen(false)} />
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