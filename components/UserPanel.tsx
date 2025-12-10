
import React, { useState, useEffect, useMemo } from 'react';
import { User, Game, SubGameType, LedgerEntry, Bet, PrizeRates, DailyResult } from '../types';
import { Icons } from '../constants';
import { useCountdown, getMarketDateForBet } from '../hooks/useCountdown';

const getTodayDateString = () => new Date().toISOString().split('T')[0];

const ProfessionalLedgerView: React.FC<{ entries: LedgerEntry[] }> = ({ entries }) => {
    const [startDate, setStartDate] = useState(getTodayDateString());
    const [endDate, setEndDate] = useState(getTodayDateString());
    const [page, setPage] = useState(1);
    const itemsPerPage = 15;

    const { filteredEntries, summary } = useMemo(() => {
        const filtered = entries.filter(entry => {
            const entryDateStr = new Date(entry.timestamp).toISOString().split('T')[0];
            if (startDate && entryDateStr < startDate) return false;
            if (endDate && entryDateStr > endDate) return false;
            return true;
        });

        const summaryData = filtered.reduce((acc, entry) => {
            acc.totalDebit += entry.debit;
            acc.totalCredit += entry.credit;
            return acc;
        }, { totalDebit: 0, totalCredit: 0 });

        return { filteredEntries: filtered.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()), summary: summaryData };
    }, [entries, startDate, endDate]);

    const paginatedEntries = useMemo(() => {
        const startIndex = (page - 1) * itemsPerPage;
        return filteredEntries.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredEntries, page]);

    const totalPages = Math.ceil(filteredEntries.length / itemsPerPage);

    const inputClass = "w-full bg-slate-800 p-2 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none text-white font-sans";

    return (
        <div className="mt-12">
            <h3 className="text-2xl font-bold mb-4 text-sky-400 uppercase tracking-widest">My Ledger</h3>
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

            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">From</label>
                        <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1); }} className={inputClass} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">To</label>
                        <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1); }} className={inputClass} />
                    </div>
                    <button onClick={() => { setStartDate(''); setEndDate(''); setPage(1); }} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-md h-fit">Show All</button>
                </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                <div className="overflow-x-auto mobile-scroll-x">
                    <table className="w-full text-left min-w-[600px]">
                        <thead className="bg-slate-800/50">
                            <tr>
                                <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                                <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Description</th>
                                <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Debit</th>
                                <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Credit</th>
                                <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Balance</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {paginatedEntries.map(entry => (
                                <tr key={entry.id}>
                                    <td className="p-3 text-slate-400">{new Date(entry.timestamp).toLocaleString()}</td>
                                    <td className="p-3 text-white">{entry.description}</td>
                                    <td className="p-3 text-right text-red-400 font-mono">{entry.debit > 0 ? entry.debit.toFixed(2) : '-'}</td>
                                    <td className="p-3 text-right text-green-400 font-mono">{entry.credit > 0 ? entry.credit.toFixed(2) : '-'}</td>
                                    <td className="p-3 text-right font-semibold text-white font-mono">{entry.balance.toFixed(2)}</td>
                                </tr>
                            ))}
                            {filteredEntries.length === 0 && (
                                <tr><td colSpan={5} className="p-8 text-center text-slate-500">No entries found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                 {totalPages > 1 && (
                    <div className="p-4 flex justify-between items-center text-sm bg-slate-800/50 border-t border-slate-700">
                        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="font-semibold text-white disabled:text-slate-500 disabled:cursor-not-allowed">Previous</button>
                        <span className="text-slate-400">Page {page} of {totalPages}</span>
                        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="font-semibold text-white disabled:text-slate-500 disabled:cursor-not-allowed">Next</button>
                    </div>
                )}
            </div>
        </div>
    );
};


interface UserPanelProps {
  user: User;
  games: Game[];
  bets: Bet[];
  dailyResults: DailyResult[];
  placeBet: (details: {
    userId: string;
    gameId: string;
    betGroups: { subGameType: SubGameType; numbers: string[]; amountPerNumber: number }[];
  }) => Promise<void>;
}

const UserPanel: React.FC<UserPanelProps> = ({ user, games, bets, placeBet, dailyResults }) => {
    // This is a minimal reconstruction to fix the build error.
    // A full implementation of "Play Games" and "Bet History" would be needed.
    const [activeTab, setActiveTab] = useState('games');

    const tabs = [
        { id: 'games', label: 'Play Games' },
        { id: 'ledger', label: 'My Ledger' },
        { id: 'history', label: 'Bet History' },
    ];

    return (
        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
            <div className="flex justify-between items-center bg-slate-800/50 p-4 rounded-lg mb-8 border border-slate-700">
                <div>
                    <h2 className="text-2xl font-bold text-white uppercase tracking-wider">{user.name}</h2>
                    <p className="text-slate-400">Welcome back!</p>
                </div>
                <div className="bg-slate-900/50 p-3 rounded-md text-center border border-slate-700">
                    <p className="text-xs text-slate-400 uppercase">Balance</p>
                    <p className="font-mono font-bold text-lg text-emerald-400">PKR {user.wallet.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
            </div>

            <div className="bg-slate-800/50 p-1.5 rounded-lg flex items-center space-x-2 mb-6 self-start flex-wrap border border-slate-700">
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center space-x-2 py-2 px-4 text-sm font-semibold rounded-md transition-all duration-300 ${activeTab === tab.id ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            {activeTab === 'games' && (
                <div className="text-center p-8 bg-slate-800/50 rounded-lg border border-slate-700">
                    <p className="text-slate-400">Game playing interface coming soon!</p>
                </div>
            )}
            {activeTab === 'ledger' && <ProfessionalLedgerView entries={user.ledger} />}
            {activeTab === 'history' && (
                 <div className="text-center p-8 bg-slate-800/50 rounded-lg border border-slate-700">
                    <p className="text-slate-400">Bet history view coming soon!</p>
                </div>
            )}
        </div>
    );
};

export default UserPanel;
