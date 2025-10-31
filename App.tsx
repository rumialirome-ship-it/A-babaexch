

import React, { useState, useEffect, useCallback } from 'react';
import { Role, User, Dealer, Admin, Game, Bet, LedgerEntry, SubGameType, PrizeRates } from './types';
import { Icons, GAME_LOGOS } from './constants';
import LandingPage from './components/LandingPage';
import AdminPanel from './components/AdminPanel';
import DealerPanel from './components/DealerPanel';
import UserPanel from './components/UserPanel';
import { AuthProvider, useAuth } from './hooks/useAuth';

const Header: React.FC = () => {
    const { role, account, logout } = useAuth();
    if (!role || !account) return null;

    const roleColors: { [key in Role]: string } = {
        [Role.Admin]: 'bg-red-500/20 text-red-300 border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.5)]',
        [Role.Dealer]: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.5)]',
        [Role.User]: 'bg-sky-500/20 text-sky-300 border-sky-500/30 shadow-[0_0_10px_rgba(14,165,233,0.5)]',
    };

    return (
        <header className="sticky top-0 z-40 bg-slate-900/50 backdrop-blur-lg border-b border-cyan-400/20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-20">
                <div className="flex items-center gap-4">
                    {account.avatarUrl ? (
                        <img src={account.avatarUrl} alt={account.name} className="w-12 h-12 rounded-full object-cover border-2 border-cyan-400/50" />
                    ) : (
                        <div className="w-12 h-12 rounded-full bg-slate-800 border-2 border-cyan-400/50 flex items-center justify-center">
                            <span className="font-bold text-xl text-cyan-300">{account.name.charAt(0)}</span>
                        </div>
                    )}
                    <div>
                        <h1 className="text-xl font-bold glitch-text hidden md:block" data-text="A-BABA EXCHANGE">A-BABA EXCHANGE</h1>
                         <div className="flex items-center text-sm">
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold mr-2 ${roleColors[role]}`}>{role}</span>
                            <span className="text-slate-300 font-semibold tracking-wider">{account.name}</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center space-x-4">
                     { 'wallet' in account && (
                        <div className="hidden md:flex items-center bg-slate-800/50 px-4 py-2 rounded-md border border-slate-700 shadow-inner">
                            {React.cloneElement(Icons.wallet, { className: "h-6 w-6 mr-3 text-cyan-400" })}
                            <span className="font-semibold text-white text-lg tracking-wider">PKR {account.wallet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                    )}
                    <button onClick={logout} className="bg-slate-700/50 border border-slate-600 hover:bg-red-500/30 hover:border-red-500/50 text-white font-bold py-2 px-4 rounded-md transition-all duration-300">Logout</button>
                </div>
            </div>
        </header>
    );
};

const AppContent: React.FC = () => {
    const { role, account, loading, fetchWithAuth } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [dealers, setDealers] = useState<Dealer[]>([]);
    const [games, setGames] = useState<Game[]>([]);
    const [bets, setBets] = useState<Bet[]>([]);

    const parseAllDates = (data: any) => {
        const parseLedger = (ledger: LedgerEntry[] = []) => ledger.map(e => ({...e, timestamp: new Date(e.timestamp)}));
        if (data.users) data.users = data.users.map((u: User) => ({...u, ledger: parseLedger(u.ledger)}));
        if (data.dealers) data.dealers = data.dealers.map((d: Dealer) => ({...d, ledger: parseLedger(d.ledger)}));
        if (data.bets) data.bets = data.bets.map((b: Bet) => ({...b, timestamp: new Date(b.timestamp)}));
        return data;
    };

    const fetchData = useCallback(async () => {
        if (!role || !account) return;
        try {
            let data;
            if (role === Role.Admin) {
                const response = await fetchWithAuth('/api/admin/data');
                if (!response.ok) throw new Error('Failed to fetch admin data');
                data = await response.json();
                const parsedData = parseAllDates(data);
                setUsers(parsedData.users);
                setDealers(parsedData.dealers);
                setGames(parsedData.games);
                setBets(parsedData.bets);
            } else if (role === Role.Dealer) {
                const response = await fetchWithAuth('/api/dealer/data');
                if (!response.ok) throw new Error('Failed to fetch dealer data');
                data = await response.json();
                const parsedData = parseAllDates(data);
                setUsers(parsedData.users);
                setBets(parsedData.bets);
                const gamesResponse = await fetchWithAuth('/api/games');
                const gamesData = await gamesResponse.json();
                setGames(gamesData);
            } else if (role === Role.User) {
                const response = await fetchWithAuth('/api/user/data');
                if (!response.ok) throw new Error('Failed to fetch user data');
                data = await response.json();
                const parsedData = parseAllDates(data);
                setGames(parsedData.games);
                setBets(parsedData.bets);
            }
        } catch (error) {
            console.error("Failed to fetch data:", error);
        }
    }, [role, account, fetchWithAuth]);

    useEffect(() => {
        let intervalId: ReturnType<typeof setInterval> | undefined;
    
        if (account) {
            fetchData(); // Initial fetch on login/account change
    
            if (role === Role.User || role === Role.Dealer) {
                intervalId = setInterval(fetchData, 1000); // Poll every second
            }
        } else {
            // Clear data on logout
            setUsers([]);
            setDealers([]);
            setGames([]);
            setBets([]);
        }
    
        // Cleanup interval on component unmount or when dependencies change
        return () => {
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [account, role, fetchData]);

    const placeBet = useCallback(async (details: {
        userId: string;
        gameId: string;
        betGroups: { subGameType: SubGameType; numbers: string[]; amountPerNumber: number }[];
    }): Promise<void> => {
        const response = await fetchWithAuth('/api/user/bets', {
            method: 'POST',
            body: JSON.stringify({
                gameId: details.gameId,
                betGroups: details.betGroups,
            })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message);
        }
        await fetchData();
    }, [fetchWithAuth, fetchData]);

    const placeBetAsDealer = useCallback(async (details: {
        userId: string;
        gameId: string;
        betGroups: { subGameType: SubGameType; numbers: string[]; amountPerNumber: number }[];
    }) => {
        const response = await fetchWithAuth('/api/dealer/bets/bulk', {
            method: 'POST',
            body: JSON.stringify(details)
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message);
        }
        await fetchData();
    }, [fetchWithAuth, fetchData]);

    const onPlaceAdminBets = useCallback(async (details: {
        userId: string;
        gameId: string;
        betGroups: any[];
    }) => {
        const response = await fetchWithAuth('/api/admin/bulk-bet', {
            method: 'POST',
            body: JSON.stringify(details),
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || 'Failed to place bets.');
        }
        await fetchData();
    }, [fetchWithAuth, fetchData]);

    const onSaveUser = useCallback(async (userData: User, originalId: string | undefined, initialDeposit?: number) => {
        let response;
        if (originalId) {
            response = await fetchWithAuth(`/api/dealer/users/${originalId}`, { method: 'PUT', body: JSON.stringify(userData) });
        } else {
            response = await fetchWithAuth('/api/dealer/users', { method: 'POST', body: JSON.stringify({ userData, initialDeposit }) });
        }
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message);
        }
        await fetchData();
    }, [fetchWithAuth, fetchData]);

    const onSaveDealer = useCallback(async (dealerData: Dealer, originalId?: string) => {
        let response;
        if (originalId) {
            response = await fetchWithAuth(`/api/admin/dealers/${originalId}`, { method: 'PUT', body: JSON.stringify(dealerData) });
        } else {
            response = await fetchWithAuth('/api/admin/dealers', { method: 'POST', body: JSON.stringify(dealerData) });
        }
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message);
        }
        await fetchData();
    }, [fetchWithAuth, fetchData]);

    const topUpUserWallet = useCallback(async (userId: string, amount: number) => {
        const response = await fetchWithAuth('/api/dealer/topup/user', { method: 'POST', body: JSON.stringify({ userId, amount }) });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message);
        }
        await fetchData();
    }, [fetchWithAuth, fetchData]);
    
    const withdrawFromUserWallet = useCallback(async (userId: string, amount: number) => {
        const response = await fetchWithAuth('/api/dealer/withdraw/user', { method: 'POST', body: JSON.stringify({ userId, amount }) });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message);
        }
        await fetchData();
    }, [fetchWithAuth, fetchData]);


    const declareWinner = useCallback(async (gameId: string, winningNumber: string) => {
        const response = await fetchWithAuth(`/api/admin/games/${gameId}/declare-winner`, { method: 'POST', body: JSON.stringify({ winningNumber }) });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message);
        }
        await fetchData();
    }, [fetchWithAuth, fetchData]);

    const updateWinner = useCallback(async (gameId: string, newWinningNumber: string) => {
        const response = await fetchWithAuth(`/api/admin/games/${gameId}/update-winner`, { method: 'PUT', body: JSON.stringify({ newWinningNumber }) });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message);
        }
        await fetchData();
    }, [fetchWithAuth, fetchData]);


    const approvePayouts = useCallback(async (gameId: string) => {
        const response = await fetchWithAuth(`/api/admin/games/${gameId}/approve-payouts`, { method: 'POST' });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message);
        }
        await fetchData();
    }, [fetchWithAuth, fetchData]);

    const topUpDealerWallet = useCallback(async (dealerId: string, amount: number) => {
        const response = await fetchWithAuth('/api/admin/topup/dealer', { method: 'POST', body: JSON.stringify({ dealerId, amount }) });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message);
        }
        await fetchData();
    }, [fetchWithAuth, fetchData]);

    const withdrawFromDealerWallet = useCallback(async (dealerId: string, amount: number) => {
        const response = await fetchWithAuth('/api/admin/withdraw/dealer', { method: 'POST', body: JSON.stringify({ dealerId, amount }) });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message);
        }
        await fetchData();
    }, [fetchWithAuth, fetchData]);


    const toggleAccountRestriction = useCallback(async (accountId: string, accountType: 'user' | 'dealer') => {
        let url;
        if (role === Role.Admin) {
            url = `/api/admin/accounts/${accountType}/${accountId}/toggle-restriction`;
        } else if (role === Role.Dealer && accountType === 'user') {
            url = `/api/dealer/users/${accountId}/toggle-restriction`;
        } else {
            throw new Error("You don't have permission for this action.");
        }
        const response = await fetchWithAuth(url, { method: 'PUT' });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message);
        }
        await fetchData();
    }, [fetchWithAuth, fetchData, role]);
    
    if (loading) {
       return <div className="min-h-screen flex items-center justify-center text-cyan-400 text-xl">Loading Session...</div>;
    }

    if (!role || !account) {
        return <LandingPage />;
    }

    return (
        <div className="min-h-screen flex flex-col">
            <Header />
            <main className="flex-grow">
                {role === Role.User && <UserPanel user={account as User} games={games} bets={bets} placeBet={placeBet} />}
                {role === Role.Dealer && <DealerPanel dealer={account as Dealer} users={users} onSaveUser={onSaveUser} topUpUserWallet={topUpUserWallet} withdrawFromUserWallet={withdrawFromUserWallet} toggleAccountRestriction={toggleAccountRestriction} bets={bets} games={games} placeBetAsDealer={placeBetAsDealer} />}
                {role === Role.Admin && <AdminPanel admin={account as Admin} dealers={dealers} onSaveDealer={onSaveDealer} users={users} setUsers={setUsers} games={games} bets={bets} declareWinner={declareWinner} updateWinner={updateWinner} approvePayouts={approvePayouts} topUpDealerWallet={topUpDealerWallet} withdrawFromDealerWallet={withdrawFromDealerWallet} toggleAccountRestriction={toggleAccountRestriction} onPlaceAdminBets={onPlaceAdminBets} />}
            </main>
        </div>
    );
};

function App() {
  return (
    // FIX: Removed redundant AuthProvider as it's already in index.tsx
    <div className="App bg-transparent text-slate-200 h-full">
        <AppContent />
    </div>
  );
}

export default App;
