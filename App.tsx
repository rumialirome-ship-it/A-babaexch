
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
        [Role.Admin]: 'bg-red-500/20 text-red-300 border-red-500/30',
        [Role.Dealer]: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        [Role.User]: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    };

    return (
        <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-xl border-b border-white/5">
            <div className="max-w-7xl mx-auto px-4 md:px-8 flex justify-between items-center h-20">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-800 border-2 border-cyan-400/50 flex items-center justify-center">
                        <span className="font-bold text-cyan-400">{account.name.charAt(0)}</span>
                    </div>
                    <div>
                        <h1 className="text-lg font-bold glitch-text hidden md:block" data-text="A-BABA EXCHANGE">A-BABA EXCHANGE</h1>
                         <div className="flex items-center text-[10px]">
                            <span className={`px-2 py-0.5 rounded-full font-bold mr-2 uppercase ${roleColors[role]}`}>{role}</span>
                            <span className="text-slate-400 font-bold uppercase tracking-tighter">{account.name}</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center space-x-4">
                    <button onClick={logout} className="text-slate-400 hover:text-white font-bold text-xs uppercase px-4 py-2 bg-slate-800/50 rounded-md border border-slate-700 transition-all active:scale-95">LOGOUT</button>
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

    const fetchData = useCallback(async () => {
        if (!role || !account) return;
        try {
            if (role === Role.Admin) {
                const res = await fetchWithAuth('/api/admin/data');
                const data = await res.json();
                setUsers(data.users);
                setDealers(data.dealers);
                setGames(data.games);
                setBets(data.bets);
            } else if (role === Role.Dealer) {
                const res = await fetchWithAuth('/api/dealer/data');
                const data = await res.json();
                setUsers(data.users);
                setBets(data.bets);
                const gRes = await fetchWithAuth('/api/games');
                setGames(await gRes.json());
            } else if (role === Role.User) {
                const res = await fetchWithAuth('/api/user/data');
                const data = await res.json();
                setGames(data.games);
                setBets(data.bets);
            }
        } catch (error) { console.error("Sync error:", error); }
    }, [role, account, fetchWithAuth]);

    useEffect(() => {
        if (account) {
            fetchData();
            const timer = setInterval(fetchData, role === Role.Admin ? 5000 : 2000);
            return () => clearInterval(timer);
        }
    }, [account, role, fetchData]);

    // Implementation of callback functions required by DealerPanelProps
    const handleSaveUser = async (userData: User, originalId: string | undefined, initialDeposit?: number) => {
        const url = originalId ? `/api/dealer/users/${originalId}` : '/api/dealer/users';
        const method = originalId ? 'PUT' : 'POST';
        const response = await fetchWithAuth(url, {
            method,
            body: JSON.stringify(originalId ? userData : { userData, initialDeposit })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || 'Failed to save user');
        }
        await fetchData();
    };

    const handleTopUpUserWallet = async (userId: string, amount: number) => {
        const response = await fetchWithAuth('/api/dealer/topup/user', {
            method: 'POST',
            body: JSON.stringify({ userId, amount })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || 'Failed to top-up wallet');
        }
        await fetchData();
    };

    const handleWithdrawFromUserWallet = async (userId: string, amount: number) => {
        const response = await fetchWithAuth('/api/dealer/withdraw/user', {
            method: 'POST',
            body: JSON.stringify({ userId, amount })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || 'Failed to withdraw funds');
        }
        await fetchData();
    };

    const handleToggleAccountRestriction = async (accountId: string, accountType: 'user' | 'dealer') => {
        let url = '';
        if (role === Role.Admin) {
            url = `/api/admin/accounts/${accountType}/${accountId}/toggle-restriction`;
        } else if (role === Role.Dealer && accountType === 'user') {
            url = `/api/dealer/users/${accountId}/toggle-restriction`;
        }
        
        if (!url) return;

        const response = await fetchWithAuth(url, { method: 'PUT' });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || 'Failed to toggle restriction');
        }
        await fetchData();
    };

    const handlePlaceBetAsDealer = async (details: { userId: string; gameId: string; betGroups: any[]; }) => {
        const response = await fetchWithAuth('/api/dealer/bets/bulk', {
            method: 'POST',
            body: JSON.stringify(details)
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || 'Failed to place bets');
        }
        await fetchData();
    };

    if (loading) {
       return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950">
            <div className="relative w-24 h-24 mb-8">
                <div className="absolute inset-0 rounded-full border-4 border-cyan-500/20"></div>
                <div className="absolute inset-0 rounded-full border-4 border-t-cyan-500 animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center font-bold text-cyan-400 text-2xl">AB</div>
            </div>
            <div className="text-cyan-400 font-bold tracking-[0.5em] animate-pulse uppercase text-sm">Synchronizing Session</div>
            <div className="mt-4 flex gap-1">
                <div className="w-2 h-2 rounded-full bg-cyan-500 animate-bounce delay-100"></div>
                <div className="w-2 h-2 rounded-full bg-cyan-500 animate-bounce delay-200"></div>
                <div className="w-2 h-2 rounded-full bg-cyan-500 animate-bounce delay-300"></div>
            </div>
        </div>
       );
    }

    if (!role || !account) return <LandingPage />;

    return (
        <div className="min-h-screen flex flex-col bg-slate-950">
            <Header />
            <main className="flex-grow">
                {role === Role.User && <UserPanel user={account as User} games={games} bets={bets} />}
                {role === Role.Dealer && (
                    <DealerPanel 
                        dealer={account as Dealer} 
                        users={users} 
                        bets={bets} 
                        games={games}
                        onSaveUser={handleSaveUser}
                        topUpUserWallet={handleTopUpUserWallet}
                        withdrawFromUserWallet={handleWithdrawFromUserWallet}
                        toggleAccountRestriction={handleToggleAccountRestriction}
                        placeBetAsDealer={handlePlaceBetAsDealer}
                    />
                )}
                {role === Role.Admin && <AdminPanel admin={account as Admin} dealers={dealers} users={users} games={games} bets={bets} />}
            </main>
        </div>
    );
};

function App() {
  return (
    <div className="App bg-transparent text-slate-200 h-full">
        <AppContent />
    </div>
  );
}

export default App;
