
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

    const inputClass = "w-full bg-slate-800 p-3 rounded-md border border-slate-700 text-white text-2xl font-mono text-center focus:ring-2 focus:ring-emerald-500 outline-none mb-6";

    return (
        <div className="text-center">
            <div className="mb-6 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <p className="text-xs text-slate-500 uppercase font-bold mb-1">Current User Balance</p>
                <p className="text-3xl font-mono text-emerald-400 font-bold">PKR {user.wallet.toLocaleString()}</p>
            </div>
            
            <label className="block text-sm text-slate-400 mb-2 uppercase font-bold">Enter Amount (PKR)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value))} placeholder="0.00" className={inputClass} />
            
            <div className="grid grid-cols-2 gap-4">
                <button onClick={() => handleAction('topup')} disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-lg shadow-lg shadow-emerald-600/20 transition-all uppercase tracking-widest text-sm">Top-Up User</button>
                <button onClick={() => handleAction('withdraw')} disabled={isLoading} className="bg-red-600 hover:bg-red-500 text-white font-bold py-4 rounded-lg shadow-lg shadow-red-600/20 transition-all uppercase tracking-widest text-sm">Withdraw Funds</button>
            </div>
        </div>
    );
};

// ... UserForm and ProfileSettings same as before ...

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
                        <tr key={entry.id} className="hover:bg-emerald-500/10 text-sm transition-colors">
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

const UserForm: React.FC<{ user?: User; users: User[]; onSave: (user: User, originalId?: string, initialDeposit?: number) => Promise<void>; onCancel: () => void; dealerPrizeRates: PrizeRates; dealerCommRate: number; dealerId: string }> = ({ user, users, onSave, onCancel, dealerPrizeRates, dealerCommRate, dealerId }) => {
    const [formData, setFormData] = useState(() => {
        const defaults = {
            id: '', name: '', password: '', area: '', contact: '', commissionRate: 0, 
            prizeRates: { ...dealerPrizeRates }, avatarUrl: '', wallet: '',
            betLimits: { oneDigit: 5000, twoDigit: 2000 }
        };
        if (user) return { ...user, password: '' };
        return defaults;
    });

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type } = e.target;
        if (name.includes('.')) {
            const [parent, child] = name.split('.');
            setFormData(prev => ({ ...prev, [parent]: { ...(prev[parent as keyof typeof prev] as object), [child]: type === 'number' ? parseFloat(value) : value } }));
        } else {
            setFormData(prev => ({ ...prev, [name]: type === 'number' ? (value ? parseFloat(value) : '') : value }));
        }
    };
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const newPassword = user ? password : formData.password!;
        if (newPassword && newPassword !== confirmPassword) return alert("Passwords do not match.");
        setIsLoading(true);
        try {
            const finalData = { ...formData, id: user ? user.id : formData.id, dealerId, password: newPassword || (user?.password || '') };
            await onSave(finalData as any, user?.id, Number(formData.wallet) || 0);
        } finally { setIsLoading(false); }
    };

    const inputClass = "w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 text-white outline-none";

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
             <div className="grid grid-cols-2 gap-4">
                <input type="text" name="id" value={formData.id as string} onChange={handleChange} placeholder="User ID" className={inputClass} required disabled={!!user}/>
                <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="Name" className={inputClass} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <input type="password" value={user ? password : formData.password!} onChange={user ? (e) => setPassword(e.target.value) : handleChange} placeholder="Password" className={inputClass} required={!user} />
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm" className={inputClass} required={!!(user ? password : formData.