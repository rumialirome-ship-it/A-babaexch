
import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { Role, User, Dealer, Admin, Game, Bet, LedgerEntry, SubGameType, PrizeRates, DailyResult } from './types';
import { Icons } from './constants';
import { AuthProvider, useAuth } from './hooks/useAuth';

// Lazy load components
const LandingPage = lazy(() => import('./components/LandingPage'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const UserPanel = lazy(() => import('./components/UserPanel'));
// DealerPanel is a named export, so we need to map it to default for lazy loading
const DealerPanel = lazy(() => import('./components/DealerPanel').then(module => ({ default: module.DealerPanel })));

const Header: React.FC = () => {
    const { role, account, logout } = useAuth();

    if (!role || !account) return null;

    return (
        <header className="bg-slate-900 border-b border-slate-700 p-4 sticky top-0 z-50 shadow-md">
            <div className="max-w-7xl mx-auto flex justify-between items-center">
                <div className="flex items-center space-x-2">
                    <div className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent uppercase tracking-wider">
                        A-Baba Exchange
                    </div>
                    <span className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-400 border border-slate-700 uppercase">
                        {role} Portal
                    </span>
                </div>
                <div className="flex items-center space-x-4">
                    <div className="text-right hidden sm:block">
                        <div className="text-sm font-bold text-white">{account.name}</div>
                        <div className="text-xs text-slate-400 font-mono">
                            {'wallet' in account ? `PKR ${account.wallet.toFixed(2)}` : 'System Admin'}
                        </div>
                    </div>
                    <button 
                        onClick={logout}
                        className="bg-red-600/20 hover:bg-red-600/40 text-red-400 p-2 rounded-full transition-colors"
                        title="Logout"
                    >
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>
            </div>
        </header>
    );
};

const App: React.FC = () => {
    const { role, account, loading, fetchWithAuth } = useAuth();
    
    // Application State
    const [games, setGames] = useState<Game[]>([]);
    const [dealers, setDealers] = useState<Dealer[]>([]);
    const [users, setUsers] = useState<User[]>([]); // For Admin/Dealer views
    const [bets, setBets] = useState<Bet[]>([]);
    const [dailyResults, setDailyResults] = useState<DailyResult[]>([]);

    // Data Fetching Logic
    const fetchData = useCallback(async () => {
        if (!role) return;

        try {
            if (role === Role.Admin) {
                const [dataRes, dealersRes, usersRes] = await Promise.all([
                    fetchWithAuth('/api/admin/data'),
                    fetchWithAuth('/api/admin/dealers?limit=1000'), // Fetch all for now for simpler state management
                    fetchWithAuth('/api/admin/users?limit=1000')
                ]);
                
                const data = await dataRes.json();
                const dealersData = await dealersRes.json();
                const usersData = await usersRes.json();

                setGames(data.games || []);
                setDailyResults(data.daily_results || []);
                setDealers(dealersData.items || []);
                setUsers(usersData.items || []);
                // Admin might need bets for reports, but maybe fetched on demand or via specific endpoints
            } else if (role === Role.Dealer) {
                const res = await fetchWithAuth('/api/dealer/data');
                const data = await res.json();
                setUsers(data.users || []);
                setBets(data.bets || []); // Bets for this dealer's users
                setDailyResults(data.daily_results || []);
                // Fetch games for Dealer view (e.g. for Betting Terminal)
                const gamesRes = await fetch('/api/games'); 
                const gamesData = await gamesRes.json();
                setGames(gamesData);
            } else if (role === Role.User) {
                const res = await fetchWithAuth('/api/user/data');
                const data = await res.json();
                setGames(data.games || []);
                setBets(data.bets || []);
                setDailyResults(data.daily_results || []);
            }
        } catch (error) {
            console.error("Failed to fetch data:", error);
        }
    }, [role, fetchWithAuth]);

    useEffect(() => {
        fetchData();
        // Setup polling
        const interval = setInterval(fetchData, 10000); // Poll every 10s
        return () => clearInterval(interval);
    }, [fetchData]);

    // --- Admin Handlers ---
    const handleSaveDealer = async (dealer: Dealer, originalId?: string) => {
        const url = originalId ? `/api/admin/dealers/${originalId}` : '/api/admin/dealers';
        const method = originalId ? 'PUT' : 'POST';
        await fetchWithAuth(url, { method, body: JSON.stringify(dealer) });
        fetchData();
    };

    const handleDeclareWinner = async (gameId: string, winningNumber: string) => {
        await fetchWithAuth(`/api/admin/games/${gameId}/declare-winner`, {
            method: 'POST', body: JSON.stringify({ winningNumber })
        });
        fetchData();
    };

    const handleUpdateWinner = async (gameId: string, newWinningNumber: string) => {
        await fetchWithAuth(`/api/admin/games/${gameId}/update-winner`, {
            method: 'PUT', body: JSON.stringify({ newWinningNumber })
        });
        fetchData();
    };
    
    const handleApprovePayouts = async (gameId: string) => {
        await fetchWithAuth(`/api/admin/games/${gameId}/approve-payouts`, { method: 'POST' });
        fetchData();
    };

    const handleTopUpDealer = async (dealerId: string, amount: number) => {
        await fetchWithAuth('/api/admin/topup/dealer', {
            method: 'POST', body: JSON.stringify({ dealerId, amount })
        });
        fetchData();
    };

    const handleWithdrawDealer = async (dealerId: string, amount: number) => {
        await fetchWithAuth('/api/admin/withdraw/dealer', {
            method: 'POST', body: JSON.stringify({ dealerId, amount })
        });
        fetchData();
    };

    const handleToggleRestriction = async (accountId: string, type: 'user' | 'dealer') => {
        // Admin toggles both
        if (role === Role.Admin) {
             await fetchWithAuth(`/api/admin/accounts/${type}/${accountId}/toggle-restriction`, { method: 'PUT' });
        } else if (role === Role.Dealer && type === 'user') {
            await fetchWithAuth(`/api/dealer/users/${accountId}/toggle-restriction`, { method: 'PUT' });
        }
        fetchData();
    };

    const handlePlaceAdminBets = async (details: { userId: string; gameId: string; betGroups: any[]; }) => {
        await fetchWithAuth('/api/admin/bulk-bet', {
            method: 'POST', body: JSON.stringify(details)
        });
        fetchData();
    }

    const handleUpdateGameDrawTime = async (gameId: string, newDrawTime: string) => {
        await fetchWithAuth(`/api/admin/games/${gameId}/draw-time`, {
            method: 'PUT', body: JSON.stringify({ newDrawTime })
        });
        fetchData();
    }

    // --- Dealer Handlers ---
    const handleSaveUser = async (user: User, originalId?: string, initialDeposit?: number) => {
         const url = originalId ? `/api/dealer/users/${originalId}` : '/api/dealer/users';
         const method = originalId ? 'PUT' : 'POST';
         const body = originalId ? user : { userData: user, initialDeposit };
         await fetchWithAuth(url, { method, body: JSON.stringify(body) });
         fetchData();
    };

    const handleTopUpUser = async (userId: string, amount: number) => {
        await fetchWithAuth('/api/dealer/topup/user', {
            method: 'POST', body: JSON.stringify({ userId, amount })
        });
        fetchData();
    };

    const handleWithdrawUser = async (userId: string, amount: number) => {
        await fetchWithAuth('/api/dealer/withdraw/user', {
            method: 'POST', body: JSON.stringify({ userId, amount })
        });
        fetchData();
    };
    
    const handlePlaceBetAsDealer = async (details: { userId: string; gameId: string; betGroups: any[]; }) => {
        await fetchWithAuth('/api/dealer/bets/bulk', {
             method: 'POST', body: JSON.stringify(details)
        });
        fetchData();
    };

    // --- User Handlers ---
    const handlePlaceBet = async (details: { userId: string; gameId: string; betGroups: any[]; }) => {
        await fetchWithAuth('/api/user/bets', {
            method: 'POST', body: JSON.stringify(details)
        });
        fetchData();
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="text-cyan-500 text-xl font-bold animate-pulse">Loading Application...</div>
            </div>
        );
    }

    if (!role) {
        return (
            <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
                <LandingPage />
            </Suspense>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 text-slate-200 font-sans selection:bg-cyan-500 selection:text-white">
            <Header />
            <main>
                <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading Module...</div>}>
                    {role === Role.Admin && account && (
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
                            topUpDealerWallet={handleTopUpDealer}
                            withdrawFromDealerWallet={handleWithdrawDealer}
                            toggleAccountRestriction={handleToggleRestriction}
                            onPlaceAdminBets={handlePlaceAdminBets}
                            updateGameDrawTime={handleUpdateGameDrawTime}
                            fetchData={fetchData}
                        />
                    )}
                    {role === Role.Dealer && account && (
                        <DealerPanel 
                            dealer={account as Dealer}
                            users={users}
                            onSaveUser={handleSaveUser}
                            topUpUserWallet={handleTopUpUser}
                            withdrawFromUserWallet={handleWithdrawUser}
                            toggleAccountRestriction={handleToggleRestriction}
                            bets={bets}
                            games={games}
                            dailyResults={dailyResults}
                            placeBetAsDealer={handlePlaceBetAsDealer}
                        />
                    )}
                    {role === Role.User && account && (
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
