
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
                     { 'wallet' in account && (
                        <div className="hidden md:flex items-center bg-slate-800/50 px-4 py-2 rounded-md border border-slate-700 shadow-inner">
                            {React.cloneElement(Icons.wallet, { className: "h-5 w-5 mr-2 text-cyan-400" })}
                            <span className="font-semibold text-white tracking-wider text-sm">PKR {account.wallet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                    )}
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
            if (role === Role.Admin) {
                const res = await fetchWithAuth('/api/admin/data');
                const data = await res.json();
                const parsed = parseAllDates(data);
                setUsers(parsed.users);
                setDealers(parsed.dealers);
                setGames(parsed.games);
                setBets(parsed.bets);
            } else if (role === Role.Dealer) {
                const res = await fetchWithAuth('/api/dealer/data');
                const data = await res.json();
                const parsed = parseAllDates(data);
                setUsers(parsed.users);
                setBets(parsed.bets);
                const gRes = await fetchWithAuth('/api/games');
                setGames(await gRes.json());
            } else if (role === Role.User) {
                const res = await fetchWithAuth('/api/user/data');
                const data = await res.json();
                const parsed = parseAllDates(data);
                setGames(parsed.games);
                setBets(parsed.bets);
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

    // Implementation of callbacks for panels
    const onSaveUser = useCallback(async (userData: User, originalId: string | undefined, initialDeposit?: number) => {
        const method = originalId ? 'PUT' : 'POST';
        const url = originalId ? `/api/dealer/users/${originalId}` : '/api/dealer/users';
        const res = await fetchWithAuth(url, { method, body: JSON.stringify(originalId ? userData : { userData, initialDeposit }) });
        if (!res.ok) throw new Error((await res.json()).message);
        await fetchData();
    }, [fetchWithAuth, fetchData]);

    const topUpUserWallet = useCallback(async (userId: string, amount: number) => {
        const res = await fetchWithAuth('/api/dealer/topup/user', { method: 'POST', body: JSON.stringify({ userId, amount }) });
        if (!res.ok) throw new Error((await res.json()).message);
        await fetchData();
    }, [fetchWithAuth, fetchData]);

    const withdrawFromUserWallet = useCallback(async (userId: string, amount: number) => {
        const res = await fetchWithAuth('/api/dealer/withdraw/user', { method: 'POST', body: JSON.stringify({ userId, amount }) });
        if (!res.ok) throw new Error((await res.json()).message);
        await fetchData();
    }, [fetchWithAuth, fetchData]);

    const toggleAccountRestriction = useCallback(async (accountId: string, accountType: 'user' | 'dealer') => {
        let url = role === Role.Admin ? `/api/admin/accounts/${accountType}/${accountId}/toggle-restriction` : `/api/dealer/users/${accountId}/toggle-restriction`;
        const res = await fetchWithAuth(url, { method: 'PUT' });
        if (!res.ok) throw new Error((await res.json()).message);
        await fetchData();
    }, [role, fetchWithAuth, fetchData]);

    const placeBetAsDealer = useCallback(async (details: any) => {
        const res = await fetchWithAuth('/api/dealer/bets/bulk', { method: 'POST', body: JSON.stringify(details) });
        if (!res.ok) throw new Error((await res.json()).message);
        await fetchData();
    }, [fetchWithAuth, fetchData]);

    const placeBet = useCallback(async (details: any) => {
        const res = await fetchWithAuth('/api/user/bets', { method: 'POST', body: JSON.stringify(details) });
        if (!res.ok) throw new Error((await res.json()).message);
        await fetchData();
    }, [fetchWithAuth, fetchData]);

    const declareWinner = useCallback(async (gameId: string, winningNumber: string) => {
        const res = await fetchWithAuth(`/api/admin/games/${gameId}/declare-winner`, { method: 'POST', body: JSON.stringify({ winningNumber }) });
        if (!res.ok) throw new Error((await res.json()).message);
        await fetchData();
    }, [fetchWithAuth, fetchData]);

    const updateWinner = useCallback(async (gameId: string, newWinningNumber: string) => {
        const res = await fetchWithAuth(`/api/admin/games/${gameId}/update-winner`, { method: 'PUT', body: JSON.stringify({ newWinningNumber }) });
        if (!res.ok) throw new Error((await res.json()).message);
        await fetchData();
    }, [fetchWithAuth, fetchData]);

    const onPlaceAdminBets = useCallback(async (details: any) => {
        const res = await fetchWithAuth('/api/admin/bulk-bet', { method: 'POST', body: JSON.stringify(details) });
        if (!res.ok) throw new Error((await res.json()).message);
        await fetchData();
    }, [fetchWithAuth, fetchData]);

    const updateGameDrawTime = useCallback(async (gameId: string, newDrawTime: string) => {
        const res = await fetchWithAuth(`/api/admin/games/${gameId}/draw-time`, { method: 'PUT', body: JSON.stringify({ newDrawTime }) });
        if (!res.ok) throw new Error((await res.json()).message);
        await fetchData();
    }, [fetchWithAuth, fetchData]);

    const approvePayouts = useCallback(async (gameId: string) => {
        const res = await fetchWithAuth(`/api/admin/games/${gameId}/approve-payouts`, { method: 'POST' });
        if (!res.ok) throw new Error((await res.json()).message);
        await fetchData();
    }, [fetchWithAuth, fetchData]);

    const onSaveDealer = useCallback(async (dealerData: Dealer, originalId?: string) => {
        const method = originalId ? 'PUT' : 'POST';
        const url = originalId ? `/api/admin/dealers/${originalId}` : '/api/admin/dealers';
        const res = await fetchWithAuth(url, { method, body: JSON.stringify(dealerData) });
        if (!res.ok) throw new Error((await res.json()).message);
        await fetchData();
    }, [fetchWithAuth, fetchData]);

    const topUpDealerWallet = useCallback(async (dealerId: string, amount: number) => {
        const res = await fetchWithAuth('/api/admin/topup/dealer', { method: 'POST', body: JSON.stringify({ dealerId, amount }) });
        if (!res.ok) throw new Error((await res.json()).message);
        await fetchData();
    }, [fetchWithAuth, fetchData]);

    const withdrawFromDealerWallet = useCallback(async (dealerId: string, amount: number) => {
        const res = await fetchWithAuth('/api/admin/withdraw/dealer', { method: 'POST', body: JSON.stringify({ dealerId, amount }) });
        if (!res.ok) throw new Error((await res.json()).message);
        await fetchData();
    }, [fetchWithAuth, fetchData]);

    if (loading) {
       return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950">
            <div className="relative w-24 h-24 mb-8">
                <div className="absolute inset-0 rounded-full border-4 border-cyan-500/10"></div>
                <div className="absolute inset-0 rounded-full border-4 border-t-cyan-500 animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center font-bold text-cyan-400 text-2xl tracking-tighter">AB</div>
            </div>
            <div className="text-cyan-400/80 font-bold tracking-[0.4em] animate-pulse uppercase text-xs">Authenticating Session</div>
            <div className="mt-6 flex gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/60 animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/60 animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/60 animate-bounce"></div>
            </div>
        </div>
       );
    }

    if (!role || !account) return <LandingPage />;

    return (
        <div className="min-h-screen flex flex-col bg-slate-950">
            <Header />
            <main className="flex-grow">
                {role === Role.User && <UserPanel user={account as User} games={games} bets={bets} placeBet={placeBet} />}
                {role === Role.Dealer && <DealerPanel dealer={account as Dealer} users={users} onSaveUser={onSaveUser} topUpUserWallet={topUpUserWallet} withdrawFromUserWallet={withdrawFromUserWallet} toggleAccountRestriction={toggleAccountRestriction} bets={bets} games={games} placeBetAsDealer={placeBetAsDealer} />}
                {role === Role.Admin && <AdminPanel admin={account as Admin} dealers={dealers} onSaveDealer={onSaveDealer} users={users} setUsers={setUsers} games={games} bets={bets} declareWinner={declareWinner} updateWinner={updateWinner} approvePayouts={approvePayouts} topUpDealerWallet={topUpDealerWallet} withdrawFromDealerWallet={withdrawFromDealerWallet} toggleAccountRestriction={toggleAccountRestriction} onPlaceAdminBets={onPlaceAdminBets} updateGameDrawTime={updateGameDrawTime} />}
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
