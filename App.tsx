
import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { Role, User, Dealer, Admin, Game, Bet, DailyResult } from './types';
import { AuthProvider, useAuth } from './hooks/useAuth';

const LandingPage = lazy(() => import('./components/LandingPage'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const UserPanel = lazy(() => import('./components/UserPanel'));
const DealerPanel = lazy(() => import('./components/DealerPanel').then(m => ({ default: m.DealerPanel })));

const Header: React.FC = () => {
    const { role, account, logout } = useAuth();
    if (!role || !account) return null;
    return (
        <header className="bg-slate-900 border-b border-slate-700 p-4 sticky top-0 z-50 shadow-md">
            <div className="max-w-7xl mx-auto flex justify-between items-center">
                <div className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent uppercase tracking-wider">A-BABA EXCHANGE</div>
                <div className="flex items-center space-x-4">
                    <div className="text-right hidden sm:block">
                        <div className="text-sm font-bold text-white">{account.name}</div>
                        <div className="text-xs text-slate-400">{'wallet' in account ? `PKR ${account.wallet.toFixed(2)}` : 'Admin'}</div>
                    </div>
                    <button onClick={logout} className="bg-red-600/20 hover:bg-red-600/40 text-red-400 p-2 rounded-full transition-colors">
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" /></svg>
                    </button>
                </div>
            </div>
        </header>
    );
};

const App: React.FC = () => {
    const { role, account, loading, fetchWithAuth } = useAuth();
    const [games, setGames] = useState<Game[]>([]);
    const [bets, setBets] = useState<Bet[]>([]);
    const [dailyResults, setDailyResults] = useState<DailyResult[]>([]);
    // FIX: Added missing state for users and dealers to pass to panels
    const [users, setUsers] = useState<User[]>([]);
    const [dealers, setDealers] = useState<Dealer[]>([]);

    const fetchData = useCallback(async () => {
        if (!role) return;
        try {
            const endpoint = role === Role.Admin ? '/api/admin/data' : role === Role.Dealer ? '/api/dealer/data' : '/api/user/data';
            const res = await fetchWithAuth(endpoint);
            const data = await res.json();
            setGames(data.games || []);
            setBets(data.bets || []);
            setDailyResults(data.daily_results || []);
            // FIX: Populate users and dealers state from fetched data
            setUsers(data.users || []);
            setDealers(data.dealers || []);
        } catch (error) { console.error(error); }
    }, [role, fetchWithAuth]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 15000); // 15s for better battery/speed
        return () => clearInterval(interval);
    }, [fetchData]);

    // FIX: Implement handler functions required by Admin, Dealer, and User panels
    const handleSaveDealer = async (dealer: Dealer, originalId?: string) => {
        const method = originalId ? 'PUT' : 'POST';
        const url = originalId ? `/api/admin/dealers/${originalId}` : '/api/admin/dealers';
        const res = await fetchWithAuth(url, {
            method,
            body: JSON.stringify(dealer)
        });
        if (!res.ok) throw new Error(await res.text());
        await fetchData();
    };

    const handleDeclareWinner = async (gameId: string, winningNumber: string) => {
        await fetchWithAuth(`/api/admin/games/${gameId}/declare`, {
            method: 'POST',
            body: JSON.stringify({ winningNumber })
        });
        await fetchData();
    };

    const handleUpdateWinner = async (gameId: string, winningNumber: string) => {
        await fetchWithAuth(`/api/admin/games/${gameId}/update-winner`, {
            method: 'PUT',
            body: JSON.stringify({ winningNumber })
        });
        await fetchData();
    };

    const handleApprovePayouts = async (gameId: string) => {
        await fetchWithAuth(`/api/admin/games/${gameId}/approve`, { method: 'POST' });
        await fetchData();
    };

    const handleTopUpDealerWallet = async (dealerId: string, amount: number) => {
        await fetchWithAuth(`/api/admin/dealers/${dealerId}/top-up`, {
            method: 'POST',
            body: JSON.stringify({ amount })
        });
        await fetchData();
    };

    const handleWithdrawFromDealerWallet = async (dealerId: string, amount: number) => {
        await fetchWithAuth(`/api/admin/dealers/${dealerId}/withdraw`, {
            method: 'POST',
            body: JSON.stringify({ amount })
        });
        await fetchData();
    };

    const handleToggleAccountRestriction = async (accountId: string, accountType: 'user' | 'dealer') => {
        await fetchWithAuth(`/api/admin/${accountType}s/${accountId}/toggle-restriction`, { method: 'POST' });
        await fetchData();
    };

    const handlePlaceAdminBets = async (details: any) => {
        await fetchWithAuth('/api/admin/place-bets', {
            method: 'POST',
            body: JSON.stringify(details)
        });
        await fetchData();
    };

    const handleUpdateGameDrawTime = async (gameId: string, newDrawTime: string) => {
        await fetchWithAuth(`/api/admin/games/${gameId}/draw-time`, {
            method: 'PUT',
            body: JSON.stringify({ drawTime: newDrawTime })
        });
        await fetchData();
    };

    const handleSaveUser = async (user: User, originalId?: string, initialDeposit?: number) => {
        const method = originalId ? 'PUT' : 'POST';
        const url = originalId ? `/api/dealer/users/${originalId}` : '/api/dealer/users';
        const res = await fetchWithAuth(url, {
            method,
            body: JSON.stringify({ ...user, initialDeposit })
        });
        if (!res.ok) throw new Error(await res.text());
        await fetchData();
    };

    const handleTopUpUserWallet = async (userId: string, amount: number) => {
        await fetchWithAuth(`/api/dealer/users/${userId}/top-up`, {
            method: 'POST',
            body: JSON.stringify({ amount })
        });
        await fetchData();
    };

    const handleWithdrawFromUserWallet = async (userId: string, amount: number) => {
        await fetchWithAuth(`/api/dealer/users/${userId}/withdraw`, {
            method: 'POST',
            body: JSON.stringify({ amount })
        });
        await fetchData();
    };

    const handlePlaceBetAsDealer = async (details: any) => {
        await fetchWithAuth('/api/dealer/place-bets', {
            method: 'POST',
            body: JSON.stringify(details)
        });
        await fetchData();
    };

    const handlePlaceBet = async (details: any) => {
        await fetchWithAuth('/api/user/bets', {
            method: 'POST',
            body: JSON.stringify(details)
        });
        await fetchData();
    };

    if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-cyan-500 font-bold">Loading...</div>;
    if (!role) return <Suspense fallback={null}><LandingPage /></Suspense>;

    return (
        <div className="min-h-screen bg-slate-900 text-slate-200 font-sans">
            <Header />
            <main>
                <Suspense fallback={<div className="p-8 text-center">Loading module...</div>}>
                    {role === Role.Admin && (
                        <AdminPanel 
                            admin={account as Admin} 
                            dealers={dealers}
                            onSaveDealer={handleSaveDealer}
                            users={users}
                            setUsers={setUsers}
                            games={games} 
                            dailyResults={dailyResults} 
                            declareWinner={handleDeclareWinner}
                            updateWinner={handleUpdateWinner}
                            approvePayouts={handleApprovePayouts}
                            topUpDealerWallet={handleTopUpDealerWallet}
                            withdrawFromDealerWallet={handleWithdrawFromDealerWallet}
                            toggleAccountRestriction={handleToggleAccountRestriction}
                            onPlaceAdminBets={handlePlaceAdminBets}
                            updateGameDrawTime={handleUpdateGameDrawTime}
                            fetchData={fetchData} 
                        />
                    )}
                    {role === Role.Dealer && (
                        <DealerPanel 
                            dealer={account as Dealer} 
                            users={users}
                            onSaveUser={handleSaveUser}
                            topUpUserWallet={handleTopUpUserWallet}
                            withdrawFromUserWallet={handleWithdrawFromUserWallet}
                            toggleAccountRestriction={handleToggleAccountRestriction}
                            games={games} 
                            dailyResults={dailyResults} 
                            bets={bets} 
                            placeBetAsDealer={handlePlaceBetAsDealer}
                        />
                    )}
                    {role === Role.User && (
                        <UserPanel 
                            user={account as User} 
                            games={games} 
                            bets={bets} 
                            dailyResults={dailyResults} 
                            placeBet={handlePlaceBet}
                        />
                    )}
                </Suspense>
            </main>
        </div>
    );
};

export default App;
