
import React, { useState, useEffect } from 'react';
import { Game } from '../types';
import { useCountdown } from '../hooks/useCountdown';
import { Icons, GAME_LOGOS } from '../constants';
import { useAuth } from '../hooks/useAuth';

const formatTime12h = (time24: string) => {
    const [hours, minutes] = time24.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
};

const InstructionCard: React.FC<{ title: string; desc: string; icon: React.ReactNode; color: string }> = ({ title, desc, icon, color }) => (
    <div className={`bg-slate-800/40 p-6 border-l-4 ${color} rounded-r-lg hover:bg-slate-800/60 transition-all`}>
        <div className="flex items-center gap-3 mb-2">
            {icon}
            <h4 className="text-lg font-bold text-white uppercase tracking-wider">{title}</h4>
        </div>
        <p className="text-sm text-slate-400 font-sans leading-relaxed">{desc}</p>
    </div>
);

const GameDisplayCard: React.FC<{ game: Game; onClick: () => void }> = ({ game, onClick }) => {
    const { status, text: countdownText } = useCountdown(game.drawTime);
    const hasWinner = !!game.winningNumber;
    const isMarketClosedForDisplay = !game.isMarketOpen || status === 'CLOSED';
    const themeColor = hasWinner ? 'emerald' : 'cyan';
    const logo = GAME_LOGOS[game.name] || '';

    return (
        <button
            onClick={onClick}
            className={`relative group bg-slate-800/50 p-6 flex flex-col items-center justify-between text-center transition-all duration-300 ease-in-out border border-slate-700 w-full overflow-hidden focus:outline-none`}
            style={{ clipPath: 'polygon(0 15px, 15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%)' }}
        >
            <div className="relative z-10 w-full flex flex-col h-full">
                <div className="flex-grow">
                    <img src={logo} alt={`${game.name} logo`} className="w-20 h-20 rounded-full mb-4 border-2 border-slate-700 group-hover:border-cyan-400 transition-colors mx-auto" />
                    <h3 className="text-xl text-white mb-1 uppercase tracking-wider">{game.name}</h3>
                    <p className="text-slate-400 text-xs">Draw @ {formatTime12h(game.drawTime)}</p>
                </div>
                <div className={`text-center w-full p-2 mt-4 bg-black/30 border-t border-${themeColor}-400/20`}>
                    {hasWinner ? (
                        <>
                            <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">RESULT</div>
                            <div className="text-3xl font-mono font-bold text-emerald-400">{game.winningNumber}</div>
                        </>
                    ) : isMarketClosedForDisplay ? (
                        <div className="text-lg font-mono font-bold text-red-500 py-1 uppercase">CLOSED</div>
                    ) : (
                        <>
                            <div className="text-[10px] uppercase tracking-widest text-slate-500">CLOSING IN</div>
                            <div className="text-2xl font-mono font-bold text-cyan-300">{countdownText}</div>
                        </>
                    )}
                </div>
            </div>
        </button>
    );
};

const LoginPanel: React.FC<{ onForgotPassword: () => void }> = ({ onForgotPassword }) => {
    const { login } = useAuth();
    const [activeTab, setActiveTab] = useState<'User' | 'Dealer'>('User');
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try { await login(loginId, password); } 
        catch (err) { setError(err instanceof Error ? err.message : "Login failed"); }
    };

    return (
        <div className="bg-slate-800/80 backdrop-blur-md rounded-lg shadow-2xl border border-slate-700 overflow-hidden" id="login">
            <div className="p-1 flex bg-black/40">
                {['User', 'Dealer'].map((t: any) => (
                    <button key={t} onClick={() => setActiveTab(t)} className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-all ${activeTab === t ? 'bg-slate-700 text-cyan-400' : 'text-slate-500 hover:text-white'}`}>{t} Login</button>
                ))}
            </div>
            <div className="p-8">
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                    <input type="text" placeholder="Account ID" value={loginId} onChange={e => setLoginId(e.target.value)} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-md text-white focus:ring-2 focus:ring-cyan-500 outline-none transition-all" />
                    <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-md text-white focus:ring-2 focus:ring-cyan-500 outline-none transition-all" />
                    {error && <p className="text-xs text-red-400 bg-red-500/10 p-2 rounded">{error}</p>}
                    <button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-md shadow-lg transition-transform active:scale-95">LOG IN</button>
                    <button type="button" onClick={onForgotPassword} className="w-full text-xs text-slate-500 hover:text-cyan-400 uppercase font-bold tracking-tighter">Forgot Password?</button>
                </form>
            </div>
        </div>
    );
};

const LandingPage: React.FC = () => {
    const [games, setGames] = useState<Game[]>([]);
    const [isResetModalOpen, setIsResetModalOpen] = useState(false);
    
    useEffect(() => {
        fetch('/api/games').then(r => r.json()).then(setGames);
    }, []);

    return (
        <div className="min-h-screen bg-transparent text-slate-200 p-4">
            <div className="max-w-7xl mx-auto py-12">
                <header className="text-center mb-16">
                    <h1 className="text-5xl md:text-8xl font-black mb-4 tracking-tighter glitch-text" data-text="A-BABA EXCHANGE">A-BABA EXCHANGE</h1>
                    <p className="text-cyan-400/60 font-bold uppercase tracking-[0.5em] text-sm">Digital Gaming Authority</p>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 mb-20">
                    <div className="lg:col-span-2 space-y-12">
                        <section>
                            <h2 className="text-2xl font-bold text-white mb-6 uppercase tracking-widest border-b border-slate-800 pb-2">Live Markets</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                                {games.map(game => (
                                    <GameDisplayCard key={game.id} game={game} onClick={() => document.getElementById('login')?.scrollIntoView({ behavior: 'smooth' })} />
                                ))}
                            </div>
                        </section>

                        <section className="space-y-6">
                            <h2 className="text-2xl font-bold text-white uppercase tracking-widest border-b border-slate-800 pb-2">Platform Instructions</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <InstructionCard 
                                    title="Game Cycle" 
                                    color="border-cyan-500"
                                    icon={<div className="text-cyan-400">{Icons.clock}</div>}
                                    desc="Markets open at 4:00 PM PKT daily. Users can place bets until the draw time. Once closed, the Admin declares results for prizes to be distributed." 
                                />
                                <InstructionCard 
                                    title="Prize Hierarchy" 
                                    color="border-emerald-500"
                                    icon={<div className="text-emerald-400">{Icons.star}</div>}
                                    desc="Prizes are tiered. Example: Admin sets 900x for Dealer. Dealer sets 700x for User. If User wins, they get 700x, and Dealer keeps the 200x difference as profit." 
                                />
                                <InstructionCard 
                                    title="Instant Commission" 
                                    color="border-amber-500"
                                    icon={<div className="text-amber-400">{Icons.sparkles}</div>}
                                    desc="Commissions are shared instantly upon betting. User gets their rate (e.g. 5%), and the parent Dealer gets the remaining margin set by the Admin." 
                                />
                                <InstructionCard 
                                    title="Wallet Security" 
                                    color="border-red-500"
                                    icon={<div className="text-red-400">{Icons.wallet}</div>}
                                    desc="Our secure ledger system tracks every single rupee. Users can top-up via their respective Dealers. All winnings are credited instantly after Admin approval." 
                                />
                            </div>
                        </section>
                    </div>

                    <div className="space-y-6">
                        <LoginPanel onForgotPassword={() => setIsResetModalOpen(true)} />
                        <div className="bg-red-500/10 border border-red-500/30 p-6 rounded-lg text-center">
                            <h4 className="text-red-400 font-bold mb-2 uppercase">Restricted Access</h4>
                            <p className="text-xs text-slate-500 mb-4 font-sans">Administrative functions are protected by hardware security keys.</p>
                            <button className="w-full bg-red-600/20 border border-red-600 text-red-100 font-bold py-2 rounded hover:bg-red-600 transition-colors uppercase text-sm tracking-widest">Admin Portal</button>
                        </div>
                    </div>
                </div>

                <footer className="border-t border-slate-800 pt-8 text-center text-slate-600 text-xs tracking-widest uppercase">
                    &copy; 2024 ABABA-EXCHANGE-SYSTEMS // SECURED BY BLOCKCHAIN LEDGER
                </footer>
            </div>
        </div>
    );
};

export default LandingPage;
