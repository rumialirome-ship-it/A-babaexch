import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Role, User, Dealer, Admin, Game, Bet, LedgerEntry, SubGameType, PrizeRates } from './types';
import { Icons, GAME_LOGOS } from './constants';
import LandingPage from './components/LandingPage';
import AdminPanel from './components/AdminPanel';
import DealerPanel from './components/DealerPanel';
import UserPanel from './components/UserPanel';
import ResultRevealOverlay from './components/ResultRevealOverlay';
import { AuthProvider, useAuth } from './hooks/useAuth';

const Header = React.memo<{ isImpersonating?: boolean }>(({ isImpersonating }) => {
    const { role, account, logout } = useAuth();
    if (!role || !account) return null;

    const roleColors: { [key in Role]: string } = {
        [Role.Admin]: 'from-red-500/20 to-red-600/20 text-red-300 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.3)]',
        [Role.Dealer]: 'from-emerald-500/20 to-emerald-600/20 text-emerald-300 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.3)]',
        [Role.User]: 'from-sky-500/20 to-sky-600/20 text-sky-300 border-sky-500/30 shadow-[0_0_15px_rgba(14,165,233,0.3)]',
    };

    return (
        <header className="sticky top-0 z-40 bg-slate-900/40 backdrop-blur-xl border-b border-white/5">
            {isImpersonating && (
                <div className="bg-amber-500 text-slate-950 text-[10px] font-black uppercase tracking-widest py-1 text-center flex items-center justify-center gap-2">
                    <Icons.alertTriangle className="w-3 h-3" />
                    ADMIN IMPERSONATION MODE — VIEWING DEALER DATA
                </div>
            )}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-20">
                <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-4"
                >
                    <div className="relative">
                        {account.avatarUrl ? (
                            <img src={account.avatarUrl} alt={account.name} className="w-12 h-12 rounded-full object-cover border-2 border-cyan-400/30 shadow-lg" />
                        ) : (
                            <div className="w-12 h-12 rounded-full bg-slate-800/80 border-2 border-cyan-400/30 flex items-center justify-center shadow-lg">
                                <span className="font-bold text-xl text-cyan-300">{account.name ? account.name.charAt(0) : '?'}</span>
                            </div>
                        )}
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-slate-900 shadow-sm" />
                    </div>
                    
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-black tracking-tighter text-white hidden md:block group cursor-default">
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">A-BABA</span>
                                <span className="ml-1 opacity-80">EXCHANGE</span>
                            </h1>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border bg-gradient-to-br ${roleColors[role] || 'bg-slate-700'}`}>{role}</span>
                        </div>
                        <span className="text-slate-400 text-sm font-medium tracking-wide">
                            {account.name || 'Account'}
                        </span>
                    </div>
                </motion.div>

                <div className="flex items-center space-x-4">
                    { typeof account.wallet === 'number' && (
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="hidden md:flex items-center bg-white/5 backdrop-blur-md px-4 py-2.5 rounded-xl border border-white/10 shadow-xl"
                        >
                            <div className="p-1.5 bg-cyan-500/10 rounded-lg mr-3">
                                <Icons.wallet className="h-5 w-5 text-cyan-400" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest leading-none mb-1">Balance</span>
                                <span className="font-mono font-bold text-white tracking-tight">
                                    PKR {account.wallet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        </motion.div>
                    )}
                    
                    <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={logout} 
                        className="bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 text-white/90 hover:text-white font-bold py-2 px-5 rounded-xl transition-all duration-300 text-sm tracking-wide"
                    >
                        Sign Out
                    </motion.button>
                </div>
            </div>
            
            {/* Ambient header glow */}
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent shadow-[0_0_20px_rgba(34,211,238,0.2)]" />
        </header>
    );
});

const parseAllDates = (data: any) => {
    if (!data) return data;
    const parseLedger = (ledger: LedgerEntry[]) => {
        if (!Array.isArray(ledger)) return [];
        return ledger.map(e => ({...e, timestamp: new Date(e.timestamp)}));
    };
    if (data.users && Array.isArray(data.users)) data.users = data.users.map((u: User) => u ? ({...u, ledger: parseLedger(u.ledger)}) : null).filter(Boolean);
    if (data.dealers && Array.isArray(data.dealers)) data.dealers = data.dealers.map((d: Dealer) => d ? ({...d, ledger: parseLedger(d.ledger)}) : null).filter(Boolean);
    if (data.bets && Array.isArray(data.bets)) data.bets = data.bets.map((b: Bet) => ({...b, timestamp: new Date(b.timestamp)}));
    if (data.account && data.account.ledger) data.account.ledger = parseLedger(data.account.ledger);
    return data;
};

const AppContent: React.FC = () => {
    const { role, account, loading, fetchWithAuth, verifyData, setAccount, setImpersonationId } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [dealers, setDealers] = useState<Dealer[]>([]);
    const [games, setGames] = useState<Game[]>([]);
    const [bets, setBets] = useState<Bet[]>([]);
    const [hasInitialFetched, setHasInitialFetched] = useState(false);
    const [impersonatingDealerId, setImpersonatingDealerId] = useState<string | null>(null);

    useEffect(() => {
        setImpersonationId(impersonatingDealerId);
    }, [impersonatingDealerId, setImpersonationId]);
    
    const [activeReveal, setActiveReveal] = useState<{ name: string; number: string } | null>(null);
    const lastGamesRef = useRef<Game[]>([]);

    const fetchPublicData = useCallback(async () => {
        try {
            const gamesResponse = await fetch('/api/games');
            if (gamesResponse.ok) {
                const data = await gamesResponse.json();
                setGames(data);
            }
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
                const rawJson = await response.json();
                const parsedData = parseAllDates(rawJson);
                if (parsedData.account) setAccount(parsedData.account);
                if (role === Role.Admin) { 
                    setUsers(parsedData.users); 
                    setDealers(parsedData.dealers); 
                    setBets(parsedData.bets); 
                    setGames(parsedData.games);
                }
                else if (role === Role.Dealer) { 
                    setUsers(parsedData.users); 
                    setBets(parsedData.bets); 
                }
                else { 
                    setBets(parsedData.bets); 
                }
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
    }, [role, fetchPrivateData, hasInitialFetched]);

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

    const placeBet = useCallback(async (d: any) => { 
        try {
            await fetchWithAuth('/api/user/bets', { method: 'POST', body: JSON.stringify(d) }); 
            fetchPrivateData(); 
        } catch (err: any) { alert(err.message); }
    }, [fetchWithAuth, fetchPrivateData]);
    
    const placeBetAsDealer = useCallback(async (d: any) => { 
        try {
            await fetchWithAuth('/api/dealer/bets/bulk', { method: 'POST', body: JSON.stringify(d) }); 
            fetchPrivateData(); 
        } catch (err: any) { alert(err.message); }
    }, [fetchWithAuth, fetchPrivateData]);
    
    const onSaveUser = useCallback(async (u: any, o: any, i: any) => {
        const method = o ? 'PUT' : 'POST';
        const url = o ? `/api/dealer/users/${o}` : '/api/dealer/users';
        const response = await fetchWithAuth(url, { method, body: JSON.stringify(o ? u : { userData: u, initialDeposit: i }) });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || 'Operation failed');
        }
        fetchPrivateData();
    }, [fetchWithAuth, fetchPrivateData]);

    const onDeleteUser = useCallback(async (uId: string) => {
        try {
            const response = await fetchWithAuth(`/api/dealer/users/${uId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error("Failed to delete user");
            fetchPrivateData();
        } catch (err: any) { alert(err.message); }
    }, [fetchWithAuth, fetchPrivateData]);

    const topUpUserWallet = useCallback(async (id: string, amt: number) => { 
        try {
            await fetchWithAuth('/api/dealer/topup/user', { method: 'POST', body: JSON.stringify({ userId: id, amount: amt }) }); 
            fetchPrivateData(); 
        } catch (err: any) { alert(err.message); throw err; }
    }, [fetchWithAuth, fetchPrivateData]);

    const withdrawFromUserWallet = useCallback(async (id: string, amt: number) => { 
        try {
            await fetchWithAuth('/api/dealer/withdraw/user', { method: 'POST', body: JSON.stringify({ userId: id, amount: amt }) }); 
            fetchPrivateData(); 
        } catch (err: any) { alert(err.message); throw err; }
    }, [fetchWithAuth, fetchPrivateData]);

    const toggleAccountRestriction = useCallback(async (id: string, type: 'user' | 'dealer' = 'user') => { 
        try {
            const endpoint = role === Role.Admin 
                ? `/api/admin/accounts/${type}/${id}/toggle-restriction`
                : `/api/dealer/users/${id}/toggle-restriction`;
            await fetchWithAuth(endpoint, { method: 'PUT' }); 
            fetchPrivateData(); 
        } catch (err: any) { alert(err.message); }
    }, [role, fetchWithAuth, fetchPrivateData]);

    const onUpdateDealerProfile = useCallback(async (updates: any) => {
        try {
            await fetchWithAuth('/api/dealer/profile', { method: 'PUT', body: JSON.stringify(updates) });
            fetchPrivateData();
        } catch (err: any) { alert(err.message); }
    }, [fetchWithAuth, fetchPrivateData]);

    const onSaveDealer = useCallback(async (d: any, o?: string) => { 
        try {
            const url = o ? `/api/admin/dealers/${o}` : '/api/admin/dealers'; 
            await fetchWithAuth(url, { method: o ? 'PUT' : 'POST', body: JSON.stringify(d) }); 
            fetchPrivateData(); 
        } catch (err: any) { alert(err.message); }
    }, [fetchWithAuth, fetchPrivateData]);

    const onUpdateAdmin = useCallback(async (a: any) => { 
        try {
            await fetchWithAuth('/api/admin/profile', { method: 'PUT', body: JSON.stringify(a) }); 
            fetchPrivateData(); 
        } catch (err: any) { alert(err.message); }
    }, [fetchWithAuth, fetchPrivateData]);

    const declareWinner = useCallback(async (id: string, num: string) => { 
        try {
            await fetchWithAuth(`/api/admin/games/${id}/declare-winner`, { method: 'POST', body: JSON.stringify({ winningNumber: num }) }); 
            fetchPrivateData(); 
        } catch (err: any) { alert(err.message); }
    }, [fetchWithAuth, fetchPrivateData]);

    const updateWinner = useCallback(async (id: string, num: string) => { 
        try {
            await fetchWithAuth(`/api/admin/games/${id}/update-winner`, { method: 'PUT', body: JSON.stringify({ newWinningNumber: num }) }); 
            fetchPrivateData(); 
        } catch (err: any) { alert(err.message); }
    }, [fetchWithAuth, fetchPrivateData]);

    const approvePayouts = useCallback(async (id: string) => { 
        try {
            await fetchWithAuth(`/api/admin/games/${id}/approve-payouts`, { method: 'POST' }); 
            fetchPrivateData(); 
        } catch (err: any) { alert(err.message); }
    }, [fetchWithAuth, fetchPrivateData]);

    const topUpDealerWallet = useCallback(async (id: string, amt: number) => { 
        try {
            await fetchWithAuth('/api/admin/topup/dealer', { method: 'POST', body: JSON.stringify({ dealerId: id, amount: amt }) }); 
            fetchPrivateData(); 
        } catch (err: any) { alert(err.message); }
    }, [fetchWithAuth, fetchPrivateData]);

    const withdrawFromDealerWallet = useCallback(async (id: string, amt: number) => { 
        try {
            await fetchWithAuth('/api/admin/withdraw/dealer', { method: 'POST', body: JSON.stringify({ dealerId: id, amount: amt }) }); 
            fetchPrivateData(); 
        } catch (err: any) { alert(err.message); }
    }, [fetchWithAuth, fetchPrivateData]);

    const onPlaceAdminBets = useCallback(async (d: any) => { 
        try {
            await fetchWithAuth('/api/admin/bulk-bet', { method: 'POST', body: JSON.stringify(d) }); 
            fetchPrivateData(); 
        } catch (err: any) { alert(err.message); }
    }, [fetchWithAuth, fetchPrivateData]);

    const updateGameDrawTime = useCallback(async (id: string, time: string) => { 
        try {
            await fetchWithAuth(`/api/admin/games/${id}/draw-time`, { method: 'PUT', body: JSON.stringify({ newDrawTime: time }) }); 
            fetchPrivateData(); 
        } catch (err: any) { alert(err.message); }
    }, [fetchWithAuth, fetchPrivateData]);

    if (loading) return <div className="min-h-screen flex items-center justify-center text-cyan-400 text-xl font-bold">Synchronizing Session...</div>;

    return (
        <div className="min-h-screen flex flex-col">
            {!role || !account ? (
                <LandingPage games={games} />
            ) : (
                <>
                    <Header isImpersonating={!!impersonatingDealerId} />
                    <main className="flex-grow">
                        {role === Role.User && <UserPanel user={account as User} games={games} bets={bets} placeBet={placeBet} />}
                        {role === Role.Dealer && (
                            <DealerPanel 
                                dealer={account as Dealer} users={users} 
                                onSaveUser={onSaveUser} 
                                onDeleteUser={onDeleteUser}
                                topUpUserWallet={topUpUserWallet} 
                                withdrawFromUserWallet={withdrawFromUserWallet} 
                                toggleAccountRestriction={toggleAccountRestriction} 
                                bets={bets} games={games} placeBetAsDealer={placeBetAsDealer} isLoaded={hasInitialFetched}
                                onUpdateDealerProfile={onUpdateDealerProfile}
                            />
                        )}
                        {role === Role.Admin && !impersonatingDealerId && (
                            <AdminPanel 
                                admin={account as Admin} dealers={dealers} 
                                onSaveDealer={onSaveDealer} 
                                onUpdateAdmin={onUpdateAdmin}
                                users={users} setUsers={setUsers} games={games} bets={bets} 
                                declareWinner={declareWinner}
                                updateWinner={updateWinner}
                                approvePayouts={approvePayouts}
                                topUpDealerWallet={topUpDealerWallet}
                                withdrawFromDealerWallet={withdrawFromDealerWallet}
                                toggleAccountRestriction={toggleAccountRestriction}
                                onPlaceAdminBets={onPlaceAdminBets}
                                updateGameDrawTime={updateGameDrawTime}
                                onRefreshData={fetchPrivateData} 
                                onImpersonateDealer={setImpersonatingDealerId}
                            />
                        )}
                        {role === Role.Admin && impersonatingDealerId && (() => {
                            const dealer = dealers.find(d => d.id === impersonatingDealerId);
                            if (!dealer) { 
                                setImpersonatingDealerId(null);
                                return null;
                            }
                            // Filter users and bets for this dealer
                            const dealerUsers = users.filter(u => u.dealerId === dealer.id);
                            const dealerBets = bets.filter(b => b.dealerId === dealer.id);

                            return (
                                <div className="relative">
                                    <div className="sticky top-20 z-30 flex justify-center pointer-events-none">
                                        <button 
                                            onClick={() => { setImpersonatingDealerId(null); }}
                                            className="mt-4 pointer-events-auto bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[10px] uppercase tracking-[0.2em] px-8 py-3 rounded-2xl shadow-2xl shadow-amber-500/20 transition-all flex items-center gap-2"
                                        >
                                            <Icons.x className="w-4 h-4" /> Exit Dealer View
                                        </button>
                                    </div>
                                    <DealerPanel 
                                        dealer={dealer} 
                                        users={dealerUsers} 
                                        onSaveUser={onSaveUser} 
                                        onDeleteUser={onDeleteUser}
                                        topUpUserWallet={topUpUserWallet} 
                                        withdrawFromUserWallet={withdrawFromUserWallet} 
                                        toggleAccountRestriction={toggleAccountRestriction} 
                                        bets={dealerBets} 
                                        games={games} 
                                        placeBetAsDealer={placeBetAsDealer} 
                                        isLoaded={hasInitialFetched}
                                        onUpdateDealerProfile={onUpdateDealerProfile}
                                    />
                                </div>
                            );
                        })()}
                    </main>
                </>
            )}
            {activeReveal && <ResultRevealOverlay gameName={activeReveal.name} winningNumber={activeReveal.number} onClose={() => setActiveReveal(null)} />}
        </div>
    );
};

function App() { 
    return (
        <div className="App bg-transparent text-slate-200 h-full">
            <AuthProvider>
                <AppContent />
            </AuthProvider>
        </div>
    ); 
}
export default App;