
import React, { useState, useEffect } from 'react';
import { Game } from '../types';
import { useCountdown } from '../hooks/useCountdown';
import { useAuth } from '../hooks/useAuth';

const formatTime12h = (time24: string) => {
  const [hours, minutes] = time24.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
};

const MarketCard: React.FC<{ game: Game }> = ({ game }) => {
  const { status, text } = useCountdown(game.drawTime);
  const isWinner = !!game.winningNumber;

  return (
    <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700 hover:border-cyan-500/50 transition-all text-center group">
      <h3 className="text-2xl font-bold text-white mb-1 uppercase tracking-tight">{game.name}</h3>
      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-4">
        Draw @ <span className="text-cyan-400/80">{formatTime12h(game.drawTime)} PKT</span>
      </p>
      
      <div className="bg-black/40 p-5 rounded-lg border border-slate-700 group-hover:bg-black/60 transition-colors">
        {isWinner ? (
          <>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Result</p>
            <p className="text-5xl font-black text-emerald-400 font-mono tracking-tighter">{game.winningNumber}</p>
          </>
        ) : (
          <>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Market Closes In</p>
            <p className="text-4xl font-bold text-cyan-400 font-mono">{text}</p>
          </>
        )}
      </div>
    </div>
  );
};

const LandingPage: React.FC = () => {
  const [games, setGames] = useState<Game[]>([]);
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/games');
        const d = await r.json();
        setGames(d);
      } catch (e) {}
    };
    load();
    const itv = setInterval(load, 10000);
    return () => clearInterval(itv);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(loginId, password);
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <header className="text-center mb-20">
          <h1 className="text-7xl font-black text-cyan-500 tracking-tighter mb-4 glitch-text" data-text="A-BABA EXCHANGE">A-BABA EXCHANGE</h1>
          <p className="text-slate-500 uppercase tracking-[0.6em] text-xs font-semibold">Premium Lottery Infrastructure • <span className="text-cyan-400">Pakistani Standard Time</span></p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
          <div className="lg:col-span-3">
            <h2 className="text-2xl font-bold text-white mb-8 uppercase tracking-widest border-l-4 border-cyan-500 pl-4">Live Markets</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {games.length > 0 ? games.map(g => <MarketCard key={g.id} game={g} />) : (
                <div className="col-span-full py-20 text-center animate-pulse text-slate-700 uppercase tracking-[0.3em]">Connecting to PKT Engine...</div>
              )}
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-slate-900/80 backdrop-blur-xl p-8 rounded-2xl border border-slate-800 shadow-2xl sticky top-12">
              <h3 className="text-2xl font-bold text-white mb-8 text-center uppercase tracking-tighter">Secure Portal</h3>
              <form onSubmit={handleLogin} className="space-y-6">
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-2">Login ID</label>
                  <input 
                    type="text" 
                    value={loginId} 
                    onChange={e => setLoginId(e.target.value)} 
                    className="w-full bg-slate-800/50 border border-slate-700 p-4 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:outline-none transition-all placeholder-slate-600"
                    placeholder="Enter ID"
                    required 
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-2">Password</label>
                  <input 
                    type="password" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    className="w-full bg-slate-800/50 border border-slate-700 p-4 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:outline-none transition-all placeholder-slate-600"
                    placeholder="••••••••"
                    required 
                  />
                </div>
                {error && <p className="text-red-400 text-xs font-bold text-center bg-red-500/10 p-3 rounded-lg border border-red-500/20">{error}</p>}
                <button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-black py-5 rounded-xl transition-all shadow-xl shadow-cyan-900/20 uppercase tracking-widest text-sm">
                  Access Terminal
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
