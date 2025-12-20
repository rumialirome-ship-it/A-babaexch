
import React, { useState, useEffect, useCallback } from 'react';
import { Role, Game, User, Dealer, Bet } from './types';
import { useAuth } from './hooks/useAuth';
import LandingPage from './components/LandingPage';
import AdminPanel from './components/AdminPanel';
import DealerPanel from './components/DealerPanel';
import UserPanel from './components/UserPanel';

const App: React.FC = () => {
  const { role, account, loading, logout, fetchWithAuth } = useAuth();
  const [data, setData] = useState<{
    games: Game[];
    users: User[];
    dealers: Dealer[];
    bets: Bet[];
  }>({
    games: [],
    users: [],
    dealers: [],
    bets: []
  });

  const loadData = useCallback(async () => {
    if (!role) return;
    const endpoint = role === Role.Admin ? '/api/admin/data' : (role === Role.Dealer ? '/api/dealer/data' : '/api/user/data');
    try {
      const res = await fetchWithAuth(endpoint);
      if (res.ok) {
        const result = await res.json();
        setData({
          games: result.games || [],
          users: result.users || [],
          dealers: result.dealers || [],
          bets: result.bets || []
        });
      }
    } catch (e) {
      console.error("Data load failed", e);
    }
  }, [role, fetchWithAuth]);

  useEffect(() => {
    loadData();
    const itv = setInterval(loadData, 30000);
    return () => clearInterval(itv);
  }, [loadData]);

  // --- HANDLERS ---

  const handleAdminAction = async (endpoint: string, body: any) => {
    const res = await fetchWithAuth(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    if (res.ok) loadData();
    else {
      const err = await res.json();
      alert(err.message || "Action failed");
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin h-10 w-10 border-4 border-cyan-500 border-t-transparent rounded-full"></div>
    </div>
  );

  if (!role || !account) return <LandingPage />;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
        <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                <h1 className="font-black text-cyan-400 tracking-tighter text-xl uppercase">A-BABA EXCHANGE</h1>
                <div className="flex items-center gap-6">
                    <div className="text-right hidden sm:block">
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest">{role}</p>
                        <p className="font-bold text-sm">{account.name}</p>
                    </div>
                    <button onClick={logout} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold px-4 py-2 rounded-lg border border-red-500/20 transition-all uppercase tracking-widest">
                        LOGOUT
                    </button>
                </div>
            </div>
        </nav>
        
        <main>
            {role === Role.Admin && (
              <AdminPanel 
                admin={account as any} 
                dealers={data.dealers} 
                users={data.users} 
                games={data.games} 
                bets={data.bets} 
                // Fix: Correctly implemented placeholders with expected parameters and return types
                declareWinner={(gameId, winningNumber) => handleAdminAction('/api/admin/declare-winner', { gameId, winningNumber })} 
                updateWinner={(gameId, winningNumber) => handleAdminAction('/api/admin/declare-winner', { gameId, winningNumber })} 
                approvePayouts={(gameId) => handleAdminAction('/api/admin/approve-payouts', { gameId })} 
                topUpDealerWallet={(dealerId, amount) => handleAdminAction('/api/admin/topup-dealer', { dealerId, amount })} 
                withdrawFromDealerWallet={(dealerId, amount) => handleAdminAction('/api/admin/withdraw-dealer', { dealerId, amount })} 
                toggleAccountRestriction={(accountId, type) => handleAdminAction('/api/auth/toggle-restriction', { accountId, type })} 
                onPlaceAdminBets={async (details) => handleAdminAction('/api/admin/place-bet', details)} 
                updateGameDrawTime={async (gameId, drawTime) => handleAdminAction('/api/admin/update-draw-time', { gameId, drawTime })} 
                onSaveDealer={(dealer) => handleAdminAction('/api/admin/save-dealer', dealer)} 
                setUsers={(usersOrFn) => setData(prev => ({ 
                    ...prev, 
                    users: typeof usersOrFn === 'function' ? (usersOrFn as any)(prev.users) : usersOrFn 
                }))} 
              />
            )}
            {role === Role.Dealer && (
              <DealerPanel 
                dealer={account as any} 
                users={data.users} 
                bets={data.bets} 
                games={data.games} 
                onSaveUser={(user) => handleAdminAction('/api/dealer/save-user', user)} 
                topUpUserWallet={(userId, amount) => handleAdminAction('/api/dealer/topup-user', { userId, amount })} 
                // Fix: Corrected withdrawFromUserWallet to be an async function matching the required signature to resolve line 116 type error
                withdrawFromUserWallet={async (userId, amount) => handleAdminAction('/api/dealer/withdraw-user', { userId, amount })} 
                toggleAccountRestriction={(accountId) => handleAdminAction('/api/auth/toggle-restriction', { accountId, type: 'user' })} 
                placeBetAsDealer={(details) => handleAdminAction('/api/dealer/place-bet', details)} 
              />
            )}
            {role === Role.User && (
              <UserPanel 
                user={account as any} 
                games={data.games} 
                bets={data.bets} 
                placeBet={(details) => handleAdminAction('/api/user/place-bet', details)} 
              />
            )}
        </main>
    </div>
  );
};

export default App;
