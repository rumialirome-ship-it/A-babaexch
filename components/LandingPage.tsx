
import React, { useState, useEffect } from 'react';
import { Game } from '../types';
import { useCountdown } from '../hooks/useCountdown';
import { useAuth } from '../hooks/useAuth';

const GameCard: React.FC<{ game: Game }> = ({ game }) => {
    const { status, text } = useCountdown(game.drawTime);
    const isWinner = !!game.winningNumber;

    return (
        <div className="bg-slate-800/80 p-6 rounded-xl border border-slate-700 shadow-xl hover:border-cyan-500/50 transition-all text-center">
            <h3 className="text-2xl font-bold text-white mb-1 uppercase tracking-tighter">{game.name}</h3>
            <p className="text-slate-400 text-xs mb-4">Market Close: {game.drawTime}</p>
            
            <div className="bg-black/40 p-4 rounded-lg border border-slate-700">
                {isWinner ? (
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Result</p>
                        <p className="text-4xl font-bold text-emerald-400 font-mono">{game.winningNumber}</p>
                    </div>
                ) : (
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Closes In</p>
                        <p className="text-3xl font-bold text-cyan-400 font-mono">{text}</p>
                    </div>
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
        fetch('/api/games').then(r => r.json()).then(setGames);
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
            <div className="max-w-7xl mx-auto px-4 py-12">
                <header className="text-center mb-16">
                    <h1 className="text-6xl font-black text-cyan-500 tracking-tighter mb-2">A-BABA EXCHANGE</h1>
                    <p className="text-slate-500 uppercase tracking-[0.5em] text-xs">Premium Lottery Infrastructure</p>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                    <div className="lg:col-span-2">
                        <h2 className="text-xl font-bold text-white mb-6 uppercase tracking-widest border-l-4 border-cyan-500 pl-4">Live Markets</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            {games.map(g => <GameCard key={g.id} game={g} />)}
                        </div>
                    </div>

                    <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl h-fit sticky top-8">
                        <h3 className="text-2xl font-bold text-white mb-6 text-center">PORTAL LOGIN</h3>
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div>
                                <label className="block text-xs text-slate-500 uppercase mb-1">Login ID</label>
                                <input 
                                    type="text" 
                                    value={loginId} 
                                    onChange={e => setLoginId(e.target.value)} 
                                    className="w-full bg-slate-800 border border-slate-700 p-3 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                                    required 
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500 uppercase mb-1">Password</label>
                                <input 
                                    type="password" 
                                    value={password} 
                                    onChange={e => setPassword(e.target.value)} 
                                    className="w-full bg-slate-800 border border-slate-700 p-3 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                                    required 
                                />
                            </div>
                            {error && <p className="text-red-400 text-xs font-bold text-center">{error}</p>}
                            <button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-4 rounded-lg transition-all shadow-lg shadow-cyan-900/20">
                                ACCESS DASHBOARD
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LandingPage;
