
import React from 'react';
import { Role } from './types';
import { useAuth } from './hooks/useAuth';
import LandingPage from './components/LandingPage';
import AdminPanel from './components/AdminPanel';
import DealerPanel from './components/DealerPanel';
import UserPanel from './components/UserPanel';

const App: React.FC = () => {
  const { role, account, loading, logout } = useAuth();

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
                <h1 className="font-black text-cyan-400 tracking-tighter text-xl">A-BABA</h1>
                <div className="flex items-center gap-6">
                    <div className="text-right hidden sm:block">
                        <p className="text-xs text-slate-400 uppercase">{role}</p>
                        <p className="font-bold text-sm">{account.name}</p>
                    </div>
                    <button onClick={logout} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold px-4 py-2 rounded-lg border border-red-500/20 transition-all">
                        LOGOUT
                    </button>
                </div>
            </div>
        </nav>
        
        <main>
            {role === Role.Admin && <AdminPanel admin={account as any} dealers={[]} users={[]} games={[]} bets={[]} declareWinner={()=>{}} updateWinner={()=>{}} approvePayouts={()=>{}} topUpDealerWallet={()=>{}} withdrawFromDealerWallet={()=>{}} toggleAccountRestriction={()=>{}} onPlaceAdminBets={async ()=>{}} updateGameDrawTime={async ()=>{}} onSaveDealer={async ()=>{}} setUsers={()=>{}} />}
            {role === Role.Dealer && <DealerPanel dealer={account as any} users={[]} bets={[]} games={[]} onSaveUser={async ()=>{}} topUpUserWallet={async ()=>{}} withdrawFromUserWallet={async ()=>{}} toggleAccountRestriction={async ()=>{}} placeBetAsDealer={async ()=>{}} />}
            {role === Role.User && <UserPanel user={account as any} games={[]} bets={[]} placeBet={async ()=>{}} />}
        </main>
    </div>
  );
};

export default App;
