
import React, { useState, useMemo, useEffect } from 'react';
import { Dealer, User, Game, PrizeRates, LedgerEntry, Bet, NumberLimit, SubGameType, Admin } from '../types';
// Import GAME_LOGOS to provide fallback icons for games
import { Icons, GAME_LOGOS } from '../constants';
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

type SortKey = 'name' | 'wallet' | 'status';
type SortDirection = 'asc' | 'desc';

const getTodayDateString = () => new Date().toISOString().split('T')[0];

const SortableHeader: React.FC<{
    label: string;
    sortKey: SortKey;
    currentSortKey: SortKey;
    sortDirection: SortDirection;
    onSort: (key: SortKey) => void;
    className?: string;
}> = ({ label, sortKey, currentSortKey, sortDirection, onSort, className }) => {
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
                     {entries.length === 0 && (
                        <tr>
                            <td colSpan={5} className="p-8 text-center text-slate-500">
                                No ledger entries found for the selected date range.
                            </td>
                        </tr>
                    )}
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