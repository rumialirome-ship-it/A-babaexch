
import React, { useState, useMemo, useEffect } from 'react';
import { Dealer, User, Game, PrizeRates, LedgerEntry, Bet, NumberLimit, SubGameType, Admin } from '../types';
import { Icons } from '../constants';
import { useAuth } from '../hooks/useAuth';

const getTodayDateString = () => new Date().toISOString().split('T')[0];

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

const AdminPanel: React.FC<any> = ({ admin, dealers, users, onRefreshData }) => {
    const [activeTab, setActiveTab] = useState('users');
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importData, setImportData] = useState<any[]>([]);
    const [isImporting, setIsImporting] = useState(false);
    const { fetchWithAuth } = useAuth();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                if (Array.isArray(json)) setImportData(json);
                else alert("Invalid format. Must be a JSON array of users.");
            } catch (err) {
                alert("Error parsing file. Please upload a valid JSON file.");
            }
        };
        reader.readAsText(file);
    };

    const processImport = async () => {
        if (importData.length === 0) return;
        setIsImporting(true);
        try {
            const res = await fetchWithAuth('/api/admin/users/bulk-import', {
                method: 'POST',
                body: JSON.stringify({ users: importData })
            });
            const result = await res.json();
            alert(result.message);
            setIsImportModalOpen(false);
            setImportData([]);
            if (onRefreshData) onRefreshData();
        } catch (err) {
            alert("Import failed.");
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
            <h2 className="text-3xl font-bold text-red-400 mb-6 uppercase tracking-widest">Admin Console</h2>
            
            <div className="flex gap-4 mb-6">
                <button onClick={() => setActiveTab('users')} className={`px-4 py-2 rounded ${activeTab === 'users' ? 'bg-cyan-600' : 'bg-slate-700'}`}>Users</button>
                <button onClick={() => setActiveTab('dealers')} className={`px-4 py-2 rounded ${activeTab === 'dealers' ? 'bg-cyan-600' : 'bg-slate-700'}`}>Dealers</button>
            </div>

            {activeTab === 'users' && (
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-semibold text-white">Manage Users ({users.length})</h3>
                        <button 
                            onClick={() => setIsImportModalOpen(true)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded transition-colors flex items-center gap-2"
                        >
                            {Icons.plus} Bulk Import Users
                        </button>
                    </div>
                    {/* User Table (simplified for brevity) */}
                    <div className="bg-slate-800 rounded p-4 text-slate-400">
                        {users.length} users in database. Use Bulk Import to add thousands at once.
                    </div>
                </div>
            )}

            <Modal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} title="Bulk Import Users" size="lg">
                <div className="space-y-4">
                    <p className="text-slate-400 text-sm">Upload a JSON file containing an array of user objects. Required fields: id, name, password, dealerId, area, contact, prizeRates.</p>
                    <input type="file" accept=".json" onChange={handleFileChange} className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-cyan-600 file:text-white hover:file:bg-cyan-500 cursor-pointer" />
                    
                    {importData.length > 0 && (
                        <div className="bg-slate-900 rounded p-4 max-h-60 overflow-y-auto">
                            <p className="text-emerald-400 font-bold mb-2">Ready to import {importData.length} records:</p>
                            <table className="w-full text-xs text-left">
                                <thead>
                                    <tr className="text-slate-500 border-b border-slate-700">
                                        <th className="pb-1">ID</th>
                                        <th className="pb-1">Name</th>
                                        <th className="pb-1">Dealer</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {importData.slice(0, 10).map((u, i) => (
                                        <tr key={i} className="border-b border-slate-800/50">
                                            <td className="py-1">{u.id}</td>
                                            <td className="py-1">{u.name}</td>
                                            <td className="py-1">{u.dealerId}</td>
                                        </tr>
                                    ))}
                                    {importData.length > 10 && <tr><td colSpan={3} className="pt-2 text-slate-600 italic">...and {importData.length - 10} more</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
                        <button onClick={() => setIsImportModalOpen(false)} className="bg-slate-700 px-4 py-2 rounded">Cancel</button>
                        <button 
                            disabled={importData.length === 0 || isImporting} 
                            onClick={processImport}
                            className="bg-emerald-600 px-4 py-2 rounded disabled:opacity-50"
                        >
                            {isImporting ? 'Importing...' : 'Start Import'}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default AdminPanel;
