import React, { useState, useMemo, useEffect } from 'react';
import { Dealer, User, PrizeRates, LedgerEntry, BetLimits, Bet, Game, SubGameType, DailyResult } from '../types';
import { Icons } from '../constants';
import { useAuth } from '../hooks/useAuth';

const getTodayDateString = () => new Date().toISOString().split('T')[0];

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

const UserForm: React.FC<{ user?: User; users: User[]; onSave: (user: User, originalId?: string, initialDeposit?: number) => Promise<void>; onCancel: () => void; dealerPrizeRates: PrizeRates, dealerId: string }> = ({ user, users, onSave, onCancel, dealerPrizeRates, dealerId }) => {
    return <div>User Form Placeholder</div>; // Rebuild needed
};

interface DealerPanelProps {
  dealer: Dealer;
  users: User[];
  onSaveUser: (user: User, originalId?: string, initialDeposit?: number) => Promise<void>;
  topUpUserWallet: (userId: string, amount: number) => Promise<void>;
  withdrawFromUserWallet: (userId: string, amount: number) => Promise<void>;
  toggleAccountRestriction: (userId: string, userType: 'user') => void;
  games: Game[];
  dailyResults: DailyResult[];
  placeBetAsDealer: (details: {
    userId: string;
    gameId: string;
    betGroups: any[];
  }) => Promise<void>;
}


const DealerPanel: React.FC<DealerPanelProps> = ({ dealer, users, onSaveUser, topUpUserWallet, withdrawFromUserWallet, toggleAccountRestriction, games, dailyResults, placeBetAsDealer }) => {
  const [activeTab, setActiveTab] = useState('users');
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | undefined>(undefined);
  const [viewingUserLedgerFor, setViewingUserLedgerFor] = useState<User | null>(null);

  const tabs = [
    { id: 'terminal', label: 'Betting Terminal' },
    { id: 'users', label: 'Manage Users' },
    { id: 'ledger', label: 'My Ledger' },
    { id: 'bet_history', label: 'Bet History' },
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
      
      {activeTab === 'ledger' && (
        <p className="text-white">Dealer Ledger placeholder</p>
      )}
       {activeTab === 'bet_history' && (
        <p className="text-white">Dealer Bet History placeholder</p>
      )}

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
           <p>User Ledger for {viewingUserLedgerFor.name} placeholder</p>
        </Modal>
      )}

      {isUserModalOpen && (
        <Modal isOpen={isUserModalOpen} onClose={() => setIsUserModalOpen(false)} title={selectedUser ? 'Edit User' : 'Create User'}>
          <UserForm user={selectedUser} users={users} onSave={onSaveUser} onCancel={() => setIsUserModalOpen(false)} dealerPrizeRates={dealer.prizeRates} dealerId={dealer.id} />
        </Modal>
      )}
    </div>
  );
};

export default DealerPanel;
