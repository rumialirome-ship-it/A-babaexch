
import React, { useState, useMemo, useEffect } from 'react';
import { Dealer, User, Game, PrizeRates, LedgerEntry, Bet, NumberLimit, SubGameType, Admin } from '../types';
import { Icons } from '../constants';
import { useAuth } from '../hooks/useAuth';

interface FinancialSummary {
  games: any[];
  totals: any;
  totalBets: number;
}

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
                    {Array.isArray(entries) && [...entries].reverse().map(entry => (
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

const SystemSettingsForm: React.FC<{ admin: Admin, onSave: (admin: Admin) => Promise<void> }> = ({ admin, onSave }) => {
    const { token } = useAuth();
    const [isBackingUp, setIsBackingUp] = useState(false);
    const [formData, setFormData] = useState({
        name: admin.name,
        avatarUrl: admin.avatarUrl || '',
        prizeRates: {
            oneDigitOpen: admin.prizeRates.oneDigitOpen.toString(),
            oneDigitClose: admin.prizeRates.oneDigitClose.toString(),
            twoDigit: admin.prizeRates.twoDigit.toString(),
        }
    });

    const handleBackupDownload = async () => {
        if (!window.confirm("Download a live system backup? This file contains all your users, history, and wallet data.")) return;
        setIsBackingUp(true);
        try {
            const response = await fetch('/api/admin/backup/download', { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error("Download failed");
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ababa_data_${new Date().toISOString().split('T')[0]}.sqlite`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (e) { alert("Backup error. Try again."); }
        finally { setIsBackingUp(false); }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        if (name.includes('.')) {
            const [p, c] = name.split('.');
            setFormData(prev => ({ ...prev, [p]: { ...(prev[p as keyof typeof prev] as object), [c]: value } }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    return (
        <div className="space-y-8 max-w-2xl mx-auto">
            <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-xl font-bold text-white mb-6 uppercase tracking-widest border-b border-slate-700 pb-2">Profile Settings</h3>
                <form onSubmit={(e) => { e.preventDefault(); onSave({ ...admin, name: formData.name, avatarUrl: formData.avatarUrl, ledger: [], prizeRates: { oneDigitOpen: Number(formData.prizeRates.oneDigitOpen), oneDigitClose: Number(formData.prizeRates.oneDigitClose), twoDigit: Number(formData.prizeRates.twoDigit) } }); }} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label className="block text-sm text-slate-400 mb-1">Display Name</label><input type="text" name="name" value={formData.name} onChange={handleChange} className="w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 text-white" /></div>
                        <div><label className="block text-sm text-slate-400 mb-1">Avatar URL</label><input type="url" name="avatarUrl" value={formData.avatarUrl} onChange={handleChange} className="w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 text-white" /></div>
                    </div>
                    <button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-black py-3 rounded-md uppercase tracking-widest transition-all">Save Changes</button>
                </form>
            </div>

            <div className="bg-slate-800/50 p-6 rounded-lg border border-emerald-900/30">
                <h3 className="text-xl font-bold text-emerald-400 mb-4 uppercase tracking-widest flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                    System Maintenance
                </h3>
                <p className="text-sm text-slate-400 mb-6">Your data is backed up automatically every day at 4:00 PM PKT. You can also download a manual copy here.</p>
                <button onClick={handleBackupDownload} disabled={isBackingUp} className="flex items-center justify-center gap-3 w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-4 rounded-md transition-all border border-slate-600">
                    {isBackingUp ? "Packing Encrypted Data..." : "DOWNLOAD FULL SYSTEM BACKUP (.SQLITE)"}
                </button>
            </div>
        </div>
    );
};

const AdminPanel: React.FC<any> = (props) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [summaryData, setSummaryData] = useState<FinancialSummary | null>(null);
  const { fetchWithAuth } = useAuth();

  useEffect(() => {
    if (activeTab === 'dashboard') {
        fetchWithAuth('/api/admin/summary').then(r => r.json()).then(setSummaryData).catch(e => console.error(e));
    }
  }, [activeTab, fetchWithAuth]);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: Icons.chartBar },
    { id: 'dealers', label: 'Dealers', icon: Icons.userGroup }, 
    { id: 'games', label: 'Draws', icon: Icons.gamepad },
    { id: 'settings', label: 'Settings', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg> },
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <h2 className="text-3xl font-bold text-red-400 mb-6 uppercase tracking-widest">Admin Control</h2>
      <div className="bg-slate-800/50 p-1.5 rounded-lg flex items-center space-x-2 mb-6 self-start flex-wrap border border-slate-700">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center space-x-2 py-2 px-4 text-sm font-semibold rounded-md transition-all ${activeTab === tab.id ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
            {tab.icon} <span>{tab.label}</span>
          </button>
        ))}
      </div>
      
      {activeTab === 'settings' && <SystemSettingsForm admin={props.admin} onSave={props.onUpdateAdmin} />}
      
      {activeTab === 'dashboard' && summaryData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Total System Liquidity</p>
                <p className="text-2xl font-bold text-cyan-400 font-mono">PKR {props.admin.wallet.toLocaleString()}</p>
            </div>
            <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Active Stakes</p>
                <p className="text-2xl font-bold text-white font-mono">PKR {summaryData.totals.totalStake.toLocaleString()}</p>
            </div>
             <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Total Payouts</p>
                <p className="text-2xl font-bold text-amber-400 font-mono">PKR {summaryData.totals.totalPayouts.toLocaleString()}</p>
            </div>
             <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Net System Growth</p>
                <p className={`text-2xl font-bold font-mono ${summaryData.totals.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>PKR {summaryData.totals.netProfit.toLocaleString()}</p>
            </div>
        </div>
      )}

      {activeTab === 'dealers' && (
        <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
            <table className="w-full text-left">
                <thead className="bg-slate-800/50">
                    <tr><th className="p-4 text-xs font-semibold text-slate-400 uppercase">Dealer</th><th className="p-4 text-xs font-semibold text-slate-400 uppercase">Balance</th><th className="p-4 text-xs font-semibold text-slate-400 uppercase text-center">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                    {props.dealers.map((d: any) => (
                        <tr key={d.id}>
                            <td className="p-4 text-white font-bold">{d.name} <span className="text-xs text-slate-500">({d.id})</span></td>
                            <td className="p-4 font-mono text-emerald-400">PKR {d.wallet.toLocaleString()}</td>
                            <td className="p-4 text-center"><button onClick={() => alert("Check Settings tab for Ledger details.")} className="text-xs bg-slate-700 px-3 py-1 rounded text-cyan-400 uppercase font-bold">Details</button></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
