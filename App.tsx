import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Role, User, Dealer, Admin, Game, Bet, LedgerEntry } from './types';
import { Icons } from './constants';
import LandingPage from './components/LandingPage';
import AdminPanel from './components/AdminPanel';
import DealerPanel from './components/DealerPanel';
import UserPanel from './components/UserPanel';
import ResultRevealOverlay from './components/ResultRevealOverlay';
import { AuthProvider, useAuth } from './hooks/useAuth';

const Header: React.FC = () => {
    const { role, account, logout } = useAuth();
    if (!role || !account) return null;

    const roleConfigs: { [key in Role]: { color: string; label: string } } = {
        [Role.Admin]: { color: 'text-rose-400 bg-rose-500/10 border-rose-500/20', label: 'Systems Root' },
        [Role.Dealer]: { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', label: 'Agent Node' },
        [Role.User]: { color: 'text-sky-400 bg-sky-500/10 border-sky-500/20', label: 'Terminal User' },
    };

    const config = roleConfigs[role];

    return (
        <header className="sticky top-0 z-40 glass-panel border-b border-white/5">
            <div className="max-w-7xl mx-auto px-6 flex justify-between items-center h-20">
                <div className="flex items-center gap-6">
                    <div className="flex flex-col">
                        <span className="text-xl font-black text-white tracking-tighter leading-none">A-BABA.E</span>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Core Exchange</span>
                    </div>
                    
                    <div className="hidden md:flex items-center gap-4 pl-6 border-l border-white/10">
                        <div className="relative">
                            {account.avatarUrl ? (
                                <img src={account.avatarUrl} alt={account.name} className="w-10 h-10 rounded-full object-cover border border-white/10" />
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center font-bold text-sm text-sky-400">
                                    {account.name?.charAt(0)}
                                </div>
                            )}
                            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#05070a]" />
                        </div>
                        <div>
                            <div className="text-sm font-bold text-slate-100">{account.name}</div>
                            <div className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md border ${config.color}`}>
                                {config.label}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    {typeof account.wallet === 'number' && (
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Available Balance</span>
                            <span className="font-mono font-bold text-white tracking-tight">
                                PKR {account.wallet.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                    )}
                    
                    <button 
                        onClick={logout} 
                        className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500 text-slate-400 transition-all"
                    >
                        {Icons.logout || 'Logout'}
                    </button>
                </div>
            </div>
        </header>
    );
};

const AppContent: React.FC = () => {
    const { role, account, loading, fetchWithAuth, verifyData, setAccount } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [dealers, setDealers] = useState<Dealer[]>([]);
    const [games, setGames] = useState<Game[]>([]);
    const [bets, setBets] = useState<Bet[]>([]);
    const [hasInitialFetched, setHasInitialFetched] = useState(false);
    const [activeReveal, setActiveReveal] = useState<{ name: string; number: string } | null>(null);
    const lastGamesRef = useRef<Game[]>([]);

    const parseAllDates = (data: any) => {
        if (!data) return data;
        const parseLedger = (ledger: LedgerEntry[] = []) => ledger.map(e => ({...e, timestamp: new Date(e.timestamp)}));
        if (data.users && Array.isArray(data.users)) data.users = data.users.map((u: User) => u ? ({...u, ledger: parseLedger(u.ledger)}) : null).filter(Boolean);
        if (data.dealers && Array.isArray(data.dealers)) data.dealers = data.dealers.map((d: Dealer) => d ? ({...d, ledger: parseLedger(d.ledger)}) : null).filter(Boolean);
        if (data.bets && Array.isArray(data.bets)) data.bets = data.bets.map((b: Bet) => ({...b, timestamp: new Date(b.timestamp)}));
        if (data.account && data.account.ledger) data.account.ledger = parseLedger(data.account.ledger);
        return data;
    };

    const fetchPublicData = useCallback(async () => {
        try {
            const res = await fetch('/api/games');
            if (res.ok) setGames(await res.json());
        } catch (e) {
            console.error('Games fetch error:', e);
        }
    }, []);

    const fetchPrivateData = useCallback(async () => {
        if (!role) return;
        try {
            const endpoint = role === Role.Admin ? '/api/admin/data' : (role === Role.Dealer ? '/api/dealer/data' : '/api/user/data');
            const response = await fetchWithAuth(endpoint);
            if (response.ok) {
                const parsedData = parseAllDates(await response.json());
                if (parsedData.account) setAccount(parsedData.account);
                if (role === Role.Admin) { setUsers(parsedData.users); setDealers(parsedData.dealers); setBets(parsedData.bets); }
                else if (role === Role.Dealer) { setUsers(parsedData.users); setBets(parsedData.bets); }
                else { setBets(parsedData.bets); }
                setHasInitialFetched(true);
            }
        } catch (error) {
            console.error("Private fetch error", error);
        }
    }, [role, fetchWithAuth, setAccount]);

    useEffect(() => {
        if (!loading && verifyData) {
            const parsed = parseAllDates(verifyData);
            if (parsed.users) setUsers(parsed.users);
            if (parsed.dealers) setDealers(parsed.dealers);
            if (parsed.bets) setBets(parsed.bets);
            setHasInitialFetched(true);
        }
    }, [loading, verifyData]);

    useEffect(() => {
        fetchPublicData();
        const interval = setInterval(fetchPublicData, 5000);
        return () => clearInterval(interval);
    }, [fetchPublicData]);

    useEffect(() => {
        if (role) {
            if (!hasInitialFetched) fetchPrivateData();
            const interval = setInterval(fetchPrivateData, 3000);
            return () => clearInterval(interval);
        } else {
            setHasInitialFetched(false);
            setUsers([]); setBets([]); setDealers([]);
        }
    }, [role, fetchPrivateData]);

    useEffect(() => {
        if (games.length > 0 && lastGamesRef.current.length > 0) {
            games.forEach(newGame => {
                const oldGame = lastGamesRef.current.find(g => g.id === newGame.id);
                if (newGame.winningNumber && !newGame.winningNumber.endsWith('_') && (!oldGame?.winningNumber || oldGame.winningNumber.endsWith('_'))) {
                    setActiveReveal({ name: newGame.name, number: newGame.winningNumber });
                }
            });
        }
        lastGamesRef.current = games;
    }, [games]);

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-[#05070a]">
            <div className="flex flex-col items-center gap-4">
                <div className="w-8 h-8 border-2 border-sky-500/20 border-t-sky-500 rounded-full animate-spin" />
                <span className="text-[10px] font-bold text-sky-500 uppercase tracking-[0.3em] font-mono">Syncing Core...</span>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen flex flex-col relative overflow-x-hidden">
            <div className="animated-bg"><div className="grid-overlay" /></div>
            
            <AnimatePresence mode="wait">
                {!role || !account ? (
                    <motion.div 
                        key="landing"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <LandingPage games={games} />
                    </motion.div>
                ) : (
                    <motion.div 
                        key="app"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col flex-grow"
                    >
                        <Header />
                        <main className="flex-grow">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={role}
                                    initial={{ opacity: 0, scale: 0.98 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    {role === Role.User && (
                                        <UserPanel 
                                            user={account as User} 
                                            games={games} 
                                            bets={bets} 
                                            placeBet={async (d) => {
                                                try {
                                                    await fetchWithAuth('/api/user/bets', { method: 'POST', body: JSON.stringify(d) }); 
                                                    fetchPrivateData(); 
                                                } catch (err: any) { alert(err.message); }
                                            }} 
                                        />
                                    )}
                                    {role === Role.Dealer && (
                                        <DealerPanel 
                                            dealer={account as Dealer} users={users} 
                                            onSaveUser={async (u, o, i) => {
                                                const method = o ? 'PUT' : 'POST';
                                                const url = o ? `/api/dealer/users/${o}` : '/api/dealer/users';
                                                const response = await fetchWithAuth(url, { method, body: JSON.stringify(o ? u : { userData: u, initialDeposit: i }) });
                                                if (!response.ok) throw new Error((await response.json()).message || 'Failed');
                                                fetchPrivateData();
                                            }} 
                                            onDeleteUser={async (uId) => {
                                                try {
                                                    await fetchWithAuth(`/api/dealer/users/${uId}`, { method: 'DELETE' });
                                                    fetchPrivateData();
                                                } catch (err: any) { alert(err.message); }
                                            }}
                                            topUpUserWallet={async (id, amt) => { 
                                                await fetchWithAuth('/api/dealer/topup/user', { method: 'POST', body: JSON.stringify({ userId: id, amount: amt }) }); 
                                                fetchPrivateData(); 
                                            }} 
                                            withdrawFromUserWallet={async (id, amt) => { 
                                                await fetchWithAuth('/api/dealer/withdraw/user', { method: 'POST', body: JSON.stringify({ userId: id, amount: amt }) }); 
                                                fetchPrivateData(); 
                                            }} 
                                            toggleAccountRestriction={async (id) => { 
                                                await fetchWithAuth(`/api/dealer/users/${id}/toggle-restriction`, { method: 'PUT' }); 
                                                fetchPrivateData(); 
                                            }} 
                                            bets={bets} games={games} 
                                            placeBetAsDealer={async (d) => {
                                                await fetchWithAuth('/api/dealer/bets/bulk', { method: 'POST', body: JSON.stringify(d) }); 
                                                fetchPrivateData(); 
                                            }} 
                                            isLoaded={hasInitialFetched}
                                        />
                                    )}
                                    {role === Role.Admin && (
                                        <AdminPanel 
                                            admin={account as Admin} 
                                            dealers={dealers} 
                                            users={users}
                                            games={games}
                                            bets={bets}
                                            onSaveDealer={async (d, o) => { 
                                                const url = o ? `/api/admin/dealers/${o}` : '/api/admin/dealers'; 
                                                await fetchWithAuth(url, { method: o ? 'PUT' : 'POST', body: JSON.stringify(d) }); 
                                                fetchPrivateData(); 
                                            }} 
                                            onUpdateAdmin={async (a) => { 
                                                await fetchWithAuth('/api/admin/profile', { method: 'PUT', body: JSON.stringify(a) }); 
                                                fetchPrivateData(); 
                                            }}
                                            declareWinner={async (id, num) => { 
                                                await fetchWithAuth(`/api/admin/games/${id}/declare-winner`, { method: 'POST', body: JSON.stringify({ winningNumber: num }) }); 
                                                fetchPrivateData(); 
                                            }}
                                            approvePayouts={async (id) => { 
                                                await fetchWithAuth(`/api/admin/games/${id}/approve-payouts`, { method: 'POST' }); 
                                                fetchPrivateData(); 
                                            }}
                                            topUpDealerWallet={async (id, amt) => { 
                                                await fetchWithAuth('/api/admin/topup/dealer', { method: 'POST', body: JSON.stringify({ dealerId: id, amount: amt }) }); 
                                                fetchPrivateData(); 
                                            }}
                                            withdrawFromDealerWallet={async (id, amt) => { 
                                                await fetchWithAuth('/api/admin/withdraw/dealer', { method: 'POST', body: JSON.stringify({ dealerId: id, amount: amt }) }); 
                                                fetchPrivateData(); 
                                            }}
                                            toggleAccountRestriction={async (id, type) => { 
                                                await fetchWithAuth(`/api/admin/accounts/${type}/${id}/toggle-restriction`, { method: 'PUT' }); 
                                                fetchPrivateData(); 
                                            }}
                                            onRefreshData={fetchPrivateData} 
                                        />
                                    )}
                                </motion.div>
                            </AnimatePresence>
                        </main>
                    </motion.div>
                )}
            </AnimatePresence>
            
            {activeReveal && <ResultRevealOverlay gameName={activeReveal.name} winningNumber={activeReveal.number} onClose={() => setActiveReveal(null)} />}
        </div>
    );
};

function App() { return (<AuthProvider><AppContent /></AuthProvider>); }
export default App;

function App() { return (<div className="App bg-transparent text-slate-200 h-full"><AuthProvider><AppContent /></AuthProvider></div>); }
export default App;