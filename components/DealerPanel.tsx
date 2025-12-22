
import React, { useState, useMemo } from 'react';
import { Dealer, User, PrizeRates, LedgerEntry, BetLimits, Bet, Game, SubGameType } from '../types';
import { Icons } from '../constants';

const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: 'md' | 'lg' | 'xl'; themeColor?: string }> = ({ isOpen, onClose, title, children, size = 'md', themeColor = 'emerald' }) => {
    if (!isOpen) return null;
    const sizeClasses: Record<string, string> = { md: 'max-w-md', lg: 'max-w-3xl', xl: 'max-w-5xl' };
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className={`bg-slate-900 rounded-lg shadow-2xl w-full border border-${themeColor}-500/30 ${sizeClasses[size]} flex flex-col max-h-[90vh]`}>
                <div className="flex justify-between items-center p-5 border-b border-slate-700 flex-shrink-0">
                    <h3 className={`text-lg font-bold text-${themeColor}-400 uppercase tracking-widest`}>{title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">{Icons.close}</button>
                </div>
                <div className="p-6 overflow-y-auto">{children}</div>
            </div>
        </div>
    );
};

const UserWalletModal: React.FC<{ user: User; onTopUp: (amount: number) => Promise<void>; onWithdraw: (amount: number) => Promise<void>; onClose: () => void }> = ({ user, onTopUp, onWithdraw, onClose }) => {
    const [amount, setAmount] = useState<number | ''>('');
    const [isLoading, setIsLoading] = useState(false);

    const handleAction = async (action: 'topup' | 'withdraw') => {
        if (!amount || amount <= 0) return alert("Enter a valid amount.");
        setIsLoading(true);
        try {
            if (action === 'topup') await onTopUp(Number(amount));
            else await onWithdraw(Number(amount));
            onClose();
        } catch (e: any) {
            alert(e.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="text-center">
            <div className="mb-6 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <p className="text-xs text-slate-500 uppercase font-bold mb-1">Current Balance</p>
                <p className="text-3xl font-mono text-emerald-400 font-bold">PKR {user.wallet.toLocaleString()}</p>
            </div>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value))} placeholder="Enter Amount" className="w-full bg-slate-800 p-3 rounded-md border border-slate-700 text-white text-2xl font-mono text-center mb-6 outline-none focus:ring-2 focus:ring-emerald-500" />
            <div className="grid grid-cols-2 gap-4">
                <button onClick={() => handleAction('topup')} disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-500 py-3 rounded-lg font-bold uppercase transition-all">Top-Up</button>
                <button onClick={() => handleAction('withdraw')} disabled={isLoading} className="bg-red-600 hover:bg-red-500 py-3 rounded-lg font-bold uppercase transition-all">Withdraw</button>
            </div>
        </div>
    );
};

const LedgerTable: React.FC<{ entries: LedgerEntry[] }> = ({ entries }) => (
    <div className="bg-slate-900/50 rounded-lg overflow-hidden border border-slate-700">
        <div className="overflow-y-auto max-h-[60vh]">
            <table className="w-full text-left">
                <thead className="bg-slate-800/50 sticky top-0">
                    <tr className="text-xs text-slate-400 uppercase">
                        <th className="p-3">Date</th>
                        <th className="p-3">Description</th>
                        <th className="p-3 text-right">Debit</th>
                        <th className="p-3 text-right">Credit</th>
                        <th className="p-3 text-right">Balance</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-sm">
                    {[...entries].reverse().map(entry => (
                        <tr key={entry.id} className="hover:bg-slate-800/30">
                            <td className="p-3 whitespace-nowrap">{entry.timestamp.toLocaleString()}</td>
                            <td className="p-3">{entry.description}</td>
                            <td className="p-3 text-right text-red-400 font-mono">{entry.debit > 0 ? entry.debit.toFixed(2) : '-'}</td>
                            <td className="p-3 text-right text-green-400 font-mono">{entry.credit > 0 ? entry.credit.toFixed(2) : '-'}</td>
                            <td className="p-3 text-right font-bold font-mono">{entry.balance.toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);

const DealerPanel: React.FC<{
    dealer: Dealer;
    users: User[];
    onSaveUser: (user: User, originalId?: string, initialDeposit?: number) => Promise<void>;
    topUpUserWallet: (userId: string, amount: number) => Promise<void>;
    withdrawFromUserWallet: (userId: string, amount: number) => Promise<void>;
    toggleAccountRestriction: (accountId: string, accountType: 'user' | 'dealer') => Promise<void>;
    onUpdateSelf: (data: any) => Promise<void>;
    bets: Bet[];
    games: Game[];
}> = ({ dealer, users, onSaveUser, topUpUserWallet, withdrawFromUserWallet, toggleAccountRestriction, onUpdateSelf, bets, games }) => {
    const [activeTab, setActiveTab] = useState<'users' | 'ledger'>('users');
    const [walletTargetUser, setWalletTargetUser] = useState<User | null>(null);

    const filteredUsers = useMemo(() => users.filter(u => u.dealerId === dealer.id), [users, dealer.id]);

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-3xl font-bold text-emerald-400 uppercase">Dealer Desk</h2>
                    <p className="text-slate-500 font-mono text-sm">{dealer.name} | {dealer.id}</p>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 text-right">
                    <p className="text-xs text-slate-500 uppercase mb-1">My Wallet</p>
                    <p className="text-2xl font-mono font-bold text-emerald-400">PKR {dealer.wallet.toLocaleString()}</p>
                </div>
            </div>

            <div className="flex gap-2 mb-8 bg-slate-800/30 p-1.5 rounded-lg w-fit">
                <button onClick={() => setActiveTab('users')} className={`px-6 py-2 rounded-md font-bold text-sm uppercase transition-all ${activeTab === 'users' ? 'bg-slate-700 text-emerald-400' : 'text-slate-400'}`}>Network</button>
                <button onClick={() => setActiveTab('ledger')} className={`px-6 py-2 rounded-md font-bold text-sm uppercase transition-all ${activeTab === 'ledger' ? 'bg-slate-700 text-emerald-400' : 'text-slate-400'}`}>Ledger</button>
            </div>

            {activeTab === 'users' && (
                <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                    <table className="w-full text-left">
                        <thead className="bg-slate-800/50 text-xs text-slate-500 uppercase font-bold">
                            <tr>
                                <th className="p-4">User</th>
                                <th className="p-4 text-right">Balance</th>
                                <th className="p-4 text-right">Comm Rate</th>
                                <th className="p-4 text-center">Status</th>
                                <th className="p-4 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {filteredUsers.map(user => (
                                <tr key={user.id} className="hover:bg-slate-800/20">
                                    <td className="p-4">
                                        <div className="font-bold text-white">{user.name}</div>
                                        <div className="text-xs font-mono text-slate-500">{user.id}</div>
                                    </td>
                                    <td className="p-4 text-right font-mono text-emerald-400">PKR {user.wallet.toLocaleString()}</td>
                                    <td className="p-4 text-right text-slate-400">{user.commissionRate}%</td>
                                    <td className="p-4 text-center">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${user.isRestricted ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>{user.isRestricted ? 'Locked' : 'Active'}</span>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex justify-center gap-2">
                                            <button onClick={() => setWalletTargetUser(user)} className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 p-2 rounded transition-all border border-emerald-500/20">{Icons.wallet}</button>
                                            <button onClick={() => toggleAccountRestriction(user.id, 'user')} className={`p-2 rounded border ${user.isRestricted ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>{user.isRestricted ? Icons.checkCircle : Icons.close}</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'ledger' && <LedgerTable entries={dealer.ledger} />}

            <Modal isOpen={!!walletTargetUser} onClose={() => setWalletTargetUser(null)} title={`Wallet Management: ${walletTargetUser?.name || ''}`}>
                {walletTargetUser && (
                    <UserWalletModal user={walletTargetUser} onTopUp={(amt) => topUpUserWallet(walletTargetUser.id, amt)} onWithdraw={(amt) => withdrawFromUserWallet(walletTargetUser.id, amt)} onClose={() => setWalletTargetUser(null)} />
                )}
            </Modal>
        </div>
    );
};

export default DealerPanel;
