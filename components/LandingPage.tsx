
import React, { useState, useEffect, useRef } from 'react';
import { Game } from '../types';
import { useCountdown } from '../hooks/useCountdown';
import { Icons, GAME_LOGOS } from '../constants';

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

const LandingPage: React.FC = () => {
    const [games, setGames] = useState<Game[]>([]);
    const [apiErrorInfo, setApiErrorInfo] = useState<{ error: string; details?: string; fix?: string; raw?: string } | null>(null);
    const [isRetrying, setIsRetrying] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const [showRaw, setShowRaw] = useState(false);
    
    const fetchGames = async (silent = false) => {
        if (!silent) setIsRetrying(true);
        try {
            const response = await fetch('/api/games');
            const data = await response.json();
            
            if (response.ok && Array.isArray(data)) {
                setGames(data);
                setApiErrorInfo(null);
            } else {
                setApiErrorInfo({ 
                    error: data.error || "SQL Link Down", 
                    details: data.details || "The binary SQL driver failed to self-register.", 
                    fix: data.fix || "Run 'npm install' on the server.",
                    raw: data.raw || "Module did not self-register."
                });
                setGames([]);
            }
        } catch (error: any) {
            setApiErrorInfo({ 
                error: "Backend Driver Error", 
                details: "The better-sqlite3 module did not self-register. This is a binary mismatch.", 
                fix: "You must reinstall node_modules on the server.",
                raw: error.toString()
            });
            setGames([]);
        } finally {
            if (!silent) setIsRetrying(false);
        }
    };

    useEffect(() => {
        fetchGames();
    }, []);

    const handleCopyFix = () => {
        const fixCommand = "cd /var/www/html/A-babaexch/backend && pm2 stop ababa-backend && rm -rf node_modules package-lock.json database.sqlite && npm install && npm run db:setup && pm2 start server.js --name ababa-backend";
        navigator.clipboard.writeText(fixCommand).then(() => {
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        });
    };

    return (
        <div className="min-h-screen bg-transparent text-slate-200 p-4 sm:p-6 md:p-8">
            <div className="max-w-7xl mx-auto">
                <header className="text-center my-12 md:my-20">
                    <h1 className="text-5xl md:text-7xl font-extrabold mb-3 tracking-wider glitch-text" data-text="A-BABA EXCHANGE">A-BABA EXCHANGE</h1>
                    <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto font-sans uppercase tracking-[0.2em]">High Performance Gaming Infrastructure</p>
                </header>

                <section id="games" className="mb-20">
                    <h2 className="text-3xl font-bold text-center mb-10 text-white uppercase tracking-widest">Global Markets</h2>
                    
                    {apiErrorInfo ? (
                        <div className="max-w-4xl mx-auto bg-slate-900/90 border border-red-500/50 rounded-xl overflow-hidden backdrop-blur-xl shadow-[0_0_80px_rgba(239,68,68,0.2)]">
                            <div className="bg-red-600/10 p-4 border-b border-red-500/30 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="relative flex items-center justify-center">
                                        <div className="animate-ping absolute inline-flex h-4 w-4 rounded-full bg-red-400 opacity-75"></div>
                                        <div className="relative inline-flex rounded-full h-3 w-3 bg-red-500 shadow-[0_0_10px_#ef4444]"></div>
                                    </div>
                                    <h3 className="text-xs md:text-sm font-bold text-red-100 uppercase tracking-[0.3em]">Critical: Binary Mismatch Detected</h3>
                                </div>
                            </div>

                            <div className="p-10 text-center">
                                <div className="text-red-500 mb-6 flex justify-center opacity-40">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <h4 className="text-4xl font-russo text-white mb-2 uppercase tracking-tighter">Module Did Not Self-Register</h4>
                                <p className="text-slate-400 text-lg mb-8 max-w-2xl mx-auto leading-relaxed">
                                    The SQL driver <span className="text-red-300 font-bold">better-sqlite3</span> is broken. To delete the old data, renew the tables, and fix the binary mismatch, run this command in your SSH terminal:
                                </p>

                                <div className="bg-emerald-500/5 border border-emerald-500/20 p-8 rounded-xl mb-10 text-left relative overflow-hidden group">
                                    <div className="absolute top-6 right-8">
                                        <button 
                                            onClick={handleCopyFix}
                                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] px-5 py-2 rounded-full transition-all uppercase font-bold flex items-center gap-2 shadow-lg shadow-emerald-900/20"
                                        >
                                            {copySuccess ? 'COPIED TO CLIPBOARD' : 'COPY RECREATOR COMMAND'}
                                            {!copySuccess && <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" /><path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" /></svg>}
                                        </button>
                                    </div>
                                    <h5 className="text-emerald-400 font-bold mb-6 uppercase text-[10px] tracking-[0.4em] flex items-center gap-3">
                                        <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse"></div>
                                        SQL RENEWAL & REPAIR COMMAND
                                    </h5>
                                    <div className="bg-black/90 p-6 rounded-lg font-mono text-sm border border-emerald-500/10 shadow-inner group-hover:border-emerald-500/30 transition-colors overflow-x-auto custom-scrollbar">
                                        <p className="text-emerald-400 whitespace-nowrap">cd /var/www/html/A-babaexch/backend && pm2 stop ababa-backend && rm -rf node_modules package-lock.json database.sqlite && npm install && npm run db:setup && pm2 start server.js --name ababa-backend</p>
                                    </div>
                                    <p className="mt-4 text-[11px] text-slate-500 uppercase tracking-widest text-center">Caution: This deletes all data and reinstalls the SQL engine correctly.</p>
                                </div>
                                
                                <button 
                                    onClick={() => setShowRaw(!showRaw)} 
                                    className="text-slate-600 text-[10px] hover:text-slate-400 uppercase tracking-[0.3em] font-bold underline transition-colors"
                                >
                                    {showRaw ? '[-] Hide System Logs' : '[+] View SQL Engine Errors'}
                                </button>
                                
                                {showRaw && (
                                    <div className="mt-6 p-6 bg-black/60 border border-slate-800 rounded-lg text-left font-mono text-[11px] text-red-300/40 overflow-x-auto">
                                        {apiErrorInfo.raw}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8">
                            {games.length > 0 ? games.map(game => (
                                <GameDisplayCard key={game.id} game={game} onClick={() => document.getElementById('login')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
                            )) : (
                                <div className="col-span-full text-center text-slate-600 p-20">
                                    <div className="inline-block animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-cyan-500/50 mb-6"></div>
                                    <p className="uppercase tracking-[0.5em] text-[10px]">Synchronizing with SQL Kernel...</p>
                                </div>
                            )}
                        </div>
                    )}
                </section>

                <section id="login" className="max-w-md mx-auto scroll-mt-20">
                     <div className="bg-slate-800/30 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-700/50 p-10 text-center">
                        <h2 className="text-2xl font-russo text-white mb-6 uppercase tracking-tight">Portal Access</h2>
                        <p className="text-slate-500 mb-8 text-sm leading-relaxed">Secure authentication is offline until the SQL database is restored.</p>
                        <div className="space-y-4">
                            <button disabled className="w-full bg-slate-800/50 text-slate-600 py-4 rounded-lg font-bold cursor-not-allowed border border-slate-700 uppercase tracking-widest text-xs">Waiting for SQL Restoration...</button>
                        </div>
                     </div>
                </section>
                <footer className="text-center py-20 text-slate-700 text-[10px] tracking-[0.4em] uppercase">
                    &copy; {new Date().getFullYear()} A-BABA EXCHANGE &bull; Distributed SQL Infrastructure
                </footer>
            </div>
        </div>
    );
};

export default LandingPage;
