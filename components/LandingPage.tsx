
import React, { useState, useEffect, useRef } from 'react';
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

const GameDisplayCard: React.FC<{ game: Game; onClick: () => void }> = ({ game, onClick }) => {
    const { status, text: countdownText } = useCountdown(game.drawTime);
    const hasWinner = !!game.winningNumber;
    const isMarketClosedForDisplay = !game.isMarketOpen || status === 'CLOSED';
    const themeColor = hasWinner ? 'emerald' : 'cyan';
    const logo = GAME_LOGOS[game.name] || '';

    return (
        <button
            onClick={onClick}
            disabled={hasWinner}
            className={`relative group bg-slate-800/50 p-6 flex flex-col items-center justify-between text-center transition-all duration-300 ease-in-out border border-slate-700 w-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-${themeColor}-500`}
            style={{ clipPath: 'polygon(0 15px, 15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%)' }}
        >
            <div className={`absolute -inset-0.5 bg-gradient-to-r from-${themeColor}-500 to-blue-500 rounded-lg blur opacity-0 group-hover:opacity-75 transition duration-500`}></div>
            <div className="relative z-10 w-full flex flex-col h-full">
                <div className="flex-grow">
                    <img src={logo} alt={`${game.name} logo`} className="w-24 h-24 rounded-full mb-4 border-4 border-slate-700 group-hover:border-cyan-400 transition-colors" />
                    <h3 className="text-2xl text-white mb-1 uppercase tracking-wider">{game.name}</h3>
                    <p className="text-slate-400 text-sm">Draw @ {formatTime12h(game.drawTime)}</p>
                </div>
                <div className={`text-center w-full p-2 mt-4 bg-black/30 border-t border-${themeColor}-400/20`}>
                    {hasWinner ? (
                        <>
                            <div className="text-xs uppercase tracking-widest text-slate-400">WINNING NUMBER</div>
                            <div className="text-4xl font-mono font-bold text-emerald-300 flex items-center justify-center gap-2">
                                {React.cloneElement(Icons.star, { className: 'h-6 w-6 text-amber-300' })}
                                <span>{game.winningNumber}</span>
                            </div>
                        </>
                    ) : isMarketClosedForDisplay ? (
                        <>
                            <div className="text-xs uppercase tracking-widest text-slate-400">STATUS</div>
                            <div className="text-2xl font-mono font-bold text-red-400">MARKET CLOSED</div>
                        </>
                    ) : status === 'OPEN' ? (
                        <>
                            <div className="text-xs uppercase tracking-widest text-slate-400">CLOSES IN</div>
                            <div className="text-3xl font-mono font-bold text-cyan-300">{countdownText}</div>
                        </>
                    ) : (
                        <>
                            <div className="text-xs uppercase tracking-widest text-slate-400">MARKET OPENS</div>
                            <div className="text-xl font-mono font-bold text-slate-400">{countdownText}</div>
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
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const roles = {
        User: { text: 'text-cyan-400', ring: 'focus:ring-cyan-500', button: 'from-cyan-500 to-blue-500', hover: 'hover:from-cyan-400 hover:to-blue-400' },
        Dealer: { text: 'text-emerald-400', ring: 'focus:ring-emerald-500', button: 'from-emerald-500 to-green-500', hover: 'hover:from-emerald-400 hover:to-green-400' }
    };

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!loginId.trim() || !password.trim()) { setError("ID and Password required."); return; }
        setError(null);
        try { await login(loginId, password); } catch (err) { setError(err instanceof Error ? err.message : "Login failed."); }
    };

    return (
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg shadow-2xl border border-slate-700 overflow-hidden">
            <div className="p-1.5 flex items-center space-x-2 bg-black/20">
                {(['User', 'Dealer'] as const).map(role => (
                    <button key={role} onClick={() => { setActiveTab(role); setError(null); }} className={`flex-1 py-2 px-4 text-sm uppercase tracking-widest rounded-md transition-all ${activeTab === role ? `bg-slate-700 ${roles[role].text} shadow-lg` : 'text-slate-400 hover:bg-slate-700/50'}`}>
                        {role}
                    </button>
                ))}
            </div>
            <div className="p-8">
                <form onSubmit={handleLoginSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1 uppercase tracking-wider">Account ID</label>
                        <input type="text" value={loginId} onChange={(e) => setLoginId(e.target.value)} className={`w-full bg-slate-900/50 p-3 rounded-md border border-slate-600 focus:ring-2 ${roles[activeTab].ring} text-white`} placeholder={`Enter ${activeTab} ID`} />
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="block text-sm font-medium text-slate-300 uppercase tracking-wider">Password</label>
                            <button type="button" onClick={onForgotPassword} className="text-xs text-slate-400 hover:text-cyan-400">Forgot?</button>
                        </div>
                        <div className="relative">
                            <input type={isPasswordVisible ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className={`w-full bg-slate-900/50 p-3 rounded-md border border-slate-600 focus:ring-2 ${roles[activeTab].ring} text-white pr-10`} />
                             <button type="button" onClick={() => setIsPasswordVisible(!isPasswordVisible)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white">
                                {isPasswordVisible ? Icons.eyeOff : Icons.eye}
                            </button>
                        </div>
                    </div>
                    {error && <p className="text-sm text-red-300 bg-red-500/20 p-3 rounded-md border border-red-500/30">{error}</p>}
                    <button type="submit" className={`w-full text-white font-bold py-3 px-4 rounded-md transition-all transform hover:scale-105 bg-gradient-to-r ${roles[activeTab].button} ${roles[activeTab].hover}`}>
                        LOGIN
                    </button>
                </form>
            </div>
        </div>
    );
};

const ModalWrapper: React.FC<{ isOpen: boolean; onClose: () => void; children: React.ReactNode;}> = ({isOpen, onClose, children}) => {
    if (!isOpen) return null;
    return (
         <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4" aria-modal="true" role="dialog">
            {children}
        </div>
    );
}

const LandingPage: React.FC = () => {
    const [games, setGames] = useState<Game[]>([]);
    const [apiErrorInfo, setApiErrorInfo] = useState<{ error: string; details?: string; fix?: string } | null>(null);
    const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
    const [isResetModalOpen, setIsResetModalOpen] = useState(false);
    const [isAdminResetModalOpen, setIsAdminResetModalOpen] = useState(false);
    const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
    const [isRetrying, setIsRetrying] = useState(false);
    const [countdownToRetry, setCountdownToRetry] = useState(10);
    const pollTimerRef = useRef<number | null>(null);
    
    const fetchGames = async (silent = false) => {
        if (!silent) setIsRetrying(true);
        try {
            const response = await fetch('/api/games');
            const data = await response.json();
            if (Array.isArray(data)) {
                setGames(data);
                setApiErrorInfo(null);
            } else if (data.error) {
                setApiErrorInfo({ error: data.error, details: data.details, fix: data.fix });
                setGames([]);
            }
        } catch (error) {
            setApiErrorInfo({ error: "Network Error", details: "Failed to connect to backend server." });
            setGames([]);
        } finally {
            if (!silent) setIsRetrying(false);
            setCountdownToRetry(10);
        }
    };

    useEffect(() => {
        fetchGames();
        // Auto-refresh when in error state
        pollTimerRef.current = window.setInterval(() => {
            setCountdownToRetry((prev) => {
                if (prev <= 1) {
                    fetchGames(true);
                    return 10;
                }
                return prev - 1;
            });
        }, 1000);
        return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
    }, []);

    const handleCopyFix = () => {
        const fixCommands = "cd /var/www/html/A-babaexch/backend\nrm -rf node_modules package-lock.json\nnpm install\npm2 restart ababa-backend";
        navigator.clipboard.writeText(fixCommands).then(() => {
            alert("Commands copied to clipboard!");
        });
    };

    return (
        <div className="min-h-screen bg-transparent text-slate-200 p-4 sm:p-6 md:p-8">
            <div className="max-w-7xl mx-auto">
                <header className="text-center my-12 md:my-20">
                    <h1 className="text-5xl md:text-7xl font-extrabold mb-3 tracking-wider glitch-text" data-text="A-BABA EXCHANGE">A-BABA EXCHANGE</h1>
                    <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto font-sans">The Premier Digital Lottery Platform. Play daily games, manage your wallet, and win big.</p>
                </header>

                <section id="games" className="mb-20">
                    <h2 className="text-3xl font-bold text-center mb-10 text-white uppercase tracking-widest">Today's Games</h2>
                    
                    {apiErrorInfo ? (
                        <div className="max-w-4xl mx-auto bg-slate-900/60 border border-red-500/50 rounded-lg overflow-hidden backdrop-blur-md shadow-[0_0_50px_rgba(239,68,68,0.2)]">
                            <div className="bg-red-600/20 p-4 border-b border-red-500/30 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="animate-pulse bg-red-500 h-3 w-3 rounded-full shadow-[0_0_10px_#ef4444]"></div>
                                    <h3 className="text-lg font-bold text-red-100 uppercase tracking-widest">System Degraded</h3>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="text-[10px] text-red-400 uppercase tracking-widest hidden sm:block">Auto-reconnect in {countdownToRetry}s</span>
                                    <button onClick={() => fetchGames()} disabled={isRetrying} className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold py-1.5 px-4 rounded transition-all disabled:opacity-50">
                                        {isRetrying ? 'RE-INITIALIZING...' : 'RETRY NOW'}
                                    </button>
                                </div>
                            </div>

                            <div className="p-8 text-center">
                                <div className="text-red-400 mb-6 flex justify-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <h4 className="text-3xl font-bold text-white mb-2">{apiErrorInfo.error}</h4>
                                <p className="text-slate-300 text-lg mb-8 max-w-xl mx-auto">Database binary mismatch detected. The system will recover automatically once you run the terminal fix commands.</p>

                                <div className="bg-emerald-500/10 border border-emerald-500/30 p-6 rounded-md mb-8 text-left relative overflow-hidden group">
                                    <button onClick={handleCopyFix} className="absolute top-4 right-4 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 text-[10px] px-3 py-1 rounded border border-emerald-500/30 transition-all uppercase font-bold">Copy Commands</button>
                                    <h5 className="text-emerald-400 font-bold mb-3 uppercase text-xs tracking-widest flex items-center gap-2">RECOVERY PROCEDURE (Run in Server Terminal)</h5>
                                    <div className="bg-black/60 p-4 rounded font-mono text-sm border border-emerald-500/20 group-hover:border-emerald-500/50 transition-colors">
                                        <p className="text-emerald-300 leading-relaxed">$ cd /var/www/html/A-babaexch/backend</p>
                                        <p className="text-emerald-300 leading-relaxed">$ rm -rf node_modules package-lock.json</p>
                                        <p className="text-emerald-300 leading-relaxed">$ npm install</p>
                                        <p className="text-emerald-300 leading-relaxed">$ pm2 restart ababa-backend</p>
                                    </div>
                                </div>

                                <button onClick={() => setShowTechnicalDetails(!showTechnicalDetails)} className="text-slate-500 text-xs hover:text-slate-300 uppercase tracking-widest font-bold mb-4">
                                    {showTechnicalDetails ? '[-] Hide' : '[+] Show'} Diagnostic Logs
                                </button>
                                {showTechnicalDetails && (
                                    <div className="mt-4 p-5 bg-black/80 rounded border border-slate-800 font-mono text-xs text-red-300/80 leading-relaxed max-h-48 overflow-y-auto text-left">
                                        {apiErrorInfo.details}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8">
                            {games.length > 0 ? games.map(game => (
                                <GameDisplayCard key={game.id} game={game} onClick={() => document.getElementById('login')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
                            )) : (
                                <div className="col-span-full text-center text-slate-500 p-12">
                                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500 mb-4"></div>
                                    <p className="uppercase tracking-[0.3em] text-xs">Querying Global Game Servers...</p>
                                </div>
                            )}
                        </div>
                    )}
                </section>

                <section id="login" className="max-w-md mx-auto scroll-mt-20">
                    <LoginPanel onForgotPassword={() => setIsResetModalOpen(true)} />
                     <div className="mt-6">
                        <button onClick={() => setIsAdminModalOpen(true)} className="w-full text-white font-bold py-3 px-4 rounded-md transition-all duration-300 transform hover:scale-105 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500">
                            ADMINISTRATOR ACCESS
                        </button>
                    </div>
                </section>
                <footer className="text-center py-8 mt-12 text-slate-500">&copy; {new Date().getFullYear()} A-Baba Exchange. All rights reserved.</footer>
            </div>
            {/* Modals placeholders for Admin Login, Reset Password etc. */}
        </div>
    );
};

export default LandingPage;
