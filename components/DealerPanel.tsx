
import React, { useState, useMemo } from 'react';
import { Dealer, User, PrizeRates, LedgerEntry, BetLimits, Bet, Game, SubGameType, DailyResult } from '../types';
import { Icons } from '../constants';
import { useCountdown, getMarketDateForBet } from '../hooks/useCountdown';

const getTodayDateString = () => new Date().toISOString().split('T')[0];

const formatTime12h = (time24: string) => {
    if (!time24 || !time24.includes(':')) return 'N/A';
    const [hours, minutes] = time24.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
};

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

const ProfessionalLedgerView: React.FC<{ title: string; entries: LedgerEntry[] }> = ({ title, entries }) => {
    const [startDate, setStartDate] = useState(getTodayDateString());
    const [endDate, setEndDate] = useState(getTodayDateString());

    const { filteredEntries, summary } = useMemo(() => {
        const filtered = entries.filter(entry => {
            const entryDateStr = entry.timestamp.toISOString().split('T')[0];
            if (startDate && entryDateStr < startDate) return false;
            if (endDate && entryDateStr > endDate) return false;
            return true;
        });
        
        const summaryData = filtered.reduce((acc, entry) => {
            acc.totalDebit += entry.debit;
            acc.totalCredit += entry.credit;
            return acc;
        }, { totalDebit: 0, totalCredit: 0 });

        return { filteredEntries: filtered, summary: summaryData };
    }, [entries, startDate, endDate]);
    
    const inputClass = "w-full bg-slate-800 p-2 rounded-md border border-slate-600 focus:ring-2 focus:ring-emerald-500 focus:outline-none text-white font-sans";

    return (
        <div>
            <h3 className="text-xl font-semibold mb-4 text-white">{title}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                    <p className="text-sm text-slate-400 uppercase">Total Credit</p>
                    <p className="text-2xl font-bold font-mono text-green-400">{summary.totalCredit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                    <p className="text-sm text-slate-400 uppercase">Total Debit</p>
                    <p className="text-2xl font-bold font-mono text-red-400">{summary.totalDebit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end mb-4 bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">From Date</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputClass} />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">To Date</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputClass} />
                </div>
                <button onClick={() => { setStartDate(''); setEndDate(''); }} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-md transition-colors h-fit">Show All History</button>
            </div>
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
                            {[...filteredEntries].reverse().map(entry => (
                                <tr key={entry.id} className="hover:bg-emerald-500/10 text-sm transition-colors">
                                    <td className="p-3 text-slate-400 whitespace-nowrap">{entry.timestamp.toLocaleString()}</td>
                                    <td className="p-3 text-white">{entry.description}</td>
                                    <td className="p-3 text-right text-red-400 font-mono">{entry.debit > 0 ? entry.debit.toFixed(2) : '-'}</td>
                                    <td className="p-3 text-right text-green-400 font-mono">{entry.credit > 0 ? entry.credit.toFixed(2) : '-'}</td>
                                    <td className="p-3 text-right font-semibold text-white font-mono">{entry.balance.toFixed(2)}</td>
                                </tr>
                            ))}
                            {filteredEntries.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-slate-500">
                                        No entries for the selected date range.
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

const UserForm: React.FC<{ user?: User; users: User[]; onSave: (user: User, originalId?: string, initialDeposit?: number) => Promise<void>; onCancel: () => void; dealerPrizeRates: PrizeRates, dealerId: string }> = ({ user, users, onSave, onCancel, dealerPrizeRates, dealerId }) => {
    // This is a placeholder as the file was corrupted.
    return <div>User Form</div>;
};

interface DealerPanelProps {
  dealer: Dealer;
  users: User[];
  onSaveUser: (user: User, originalId?: string, initialDeposit?: number) => Promise<void>;
  topUpUserWallet: (userId: string, amount: number) => Promise<void>;
  withdrawFromUserWallet: (userId: string, amount: number) => Promise<void>;
  toggleAccountRestriction: (userId: string, userType: 'user') => void;
  bets: Bet[];
  games: Game[];
  dailyResults: DailyResult[];
  placeBetAsDealer: (details: {
    userId: string;
    gameId: string;
    betGroups: any[];
  }) => Promise<void>;
}


const DealerPanel: React.FC<DealerPanelProps> = ({ dealer, users, onSaveUser, topUpUserWallet, withdrawFromUserWallet, toggleAccountRestriction, bets, games, dailyResults, placeBetAsDealer }) => {
  const [activeTab, setActiveTab] = useState('users');
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | undefined>(undefined);
  const [viewingUserLedgerFor, setViewingUserLedgerFor] = useState<User | null>(null);

  const tabs = [
    { id: 'terminal', label: 'Betting Terminal' },
    { id: 'users', label: 'Manage Users' },
    { id: 'ledger', label: 'My Ledger' },
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <h2 className="text-3xl font-bold text-emerald-400 mb-6 uppercase tracking-widest">Dealer Panel</h2>
       <div className="bg-slate-800/50 p-1.5 rounded-lg flex items-center space-x-2 mb-6 self-start flex-wrap border border-slate-700">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center space-x-2 py-2 px-4 text-sm font-semibold rounded-md transition-all duration-300 ${activeTab === tab.id ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
                <span>{tab.label}</span>
            </button>
        ))}
      </div>
      
      {activeTab === 'ledger' && <ProfessionalLedgerView title="My Ledger" entries={dealer.ledger} />}

      {activeTab === 'users' && (
        <div>
           <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-white">My Users</h3>
            <button onClick={() => { setSelectedUser(undefined); setIsUserModalOpen(true); }} className="flex items-center bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-md">
              Create User
            </button>
          </div>
          <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
            <table className="w-full text-left">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="p-4">User</th>
                  <th className="p-4">Wallet</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td className="p-4">{user.name}</td>
                    <td className="p-4">{user.wallet.toFixed(2)}</td>
                    <td className="p-4">{user.isRestricted ? 'Restricted' : 'Active'}</td>
                    <td className="p-4 text-center">
                      <button onClick={() => setViewingUserLedgerFor(user)} className="bg-slate-700 text-emerald-400 font-semibold py-1 px-3 rounded-md text-sm">
                        View Ledger
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'terminal' && <div>Betting Terminal Placeholder</div>}

      {viewingUserLedgerFor && (
        <Modal isOpen={!!viewingUserLedgerFor} onClose={() => setViewingUserLedgerFor(null)} title={`Ledger for ${viewingUserLedgerFor.name}`} size="xl">
            <ProfessionalLedgerView title="" entries={viewingUserLedgerFor.ledger} />
        </Modal>
      )}

      {isUserModalOpen && (
        <Modal isOpen={isUserModalOpen} onClose={() => setIsUserModalOpen(false)} title={selectedUser ? 'Edit User' : 'Create User'}>
{/* Fix: Corrected typo in function name from `setIsUserModal-Open` to `setIsUserModalOpen` */}
          <UserForm user={selectedUser} users={users} onSave={onSaveUser} onCancel={() => setIsUserModalOpen(false)} dealerPrizeRates={dealer.prizeRates} dealerId={dealer.id} />
        </Modal>
      )}
    </div>
  );
};

export default DealerPanel;
