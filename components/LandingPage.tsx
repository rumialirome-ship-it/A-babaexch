
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

const GameDisplayCard: React.FC<{ game: Game; onClick: () => void }> = ({ game, onClick }) => {
    const { status, text: countdownText } = useCountdown(game.drawTime);
    const hasFinalWinner = !!game.winningNumber && !game.winningNumber.endsWith('_');
    const isMarketClosedForDisplay = !game.isMarketOpen;
    const themeColor = hasFinalWinner ? 'emerald' : 'cyan';
    const logo = GAME_LOGOS[game.name] || '';

    return (
        <button
            onClick={onClick}
            className={`relative group bg-slate-800/50 p-6 flex flex-col items-center justify-between text-center transition-all duration-300 ease-in-out border border-slate-700 w-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-${themeColor}-500`}
            style={{ clipPath: 'polygon(0 15px, 15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%)' }}
        >
            <div className={`absolute -inset-0.5 bg-gradient-to-r from-${themeColor}-500 to-blue-500 rounded-lg blur opacity-0 group-hover:opacity-75 transition duration-500`}></div>
            <div className="relative z-10 w-full flex flex-col h-full">
                <div className="flex-grow">
                    <img src={logo} alt={`${game.name} logo`} className="w-24 h-24 rounded-full mb-4 border-4 border-slate-700 group-hover:border-cyan-400 transition-colors mx-auto" />
                    <h3 className="text-2xl text-white mb-1 uppercase tracking-wider">{game.name}</h3>
                    <p className="text-slate-400 text-sm">Draw @ {formatTime12h(game.drawTime)}</p>
                </div>
                <div className={`text-center w-full p-2 mt-4 bg-black/30 border-t border-${themeColor}-400/20 min-h-[80px] flex flex-col justify-center`}>
                    {hasFinalWinner ? (
                        <>
                            <div className="text-[10px] uppercase tracking-[0.3em] text-emerald-400 font-black mb-1">DRAW RESULT</div>
                            <div className="text-5xl font-mono font-bold text-white drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]">{game.winningNumber}</div>
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

const LandingPage: React.FC<{ games: Game[] }> = ({ games }) => {
    const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
    const [isResetModalOpen, setIsResetModalOpen] = useState(false);
    const [connectionTimeout, setConnectionTimeout] = useState(false);
    
    useEffect(() => {
        const timer = setTimeout(() => {
            if (games.length === 0) setConnectionTimeout(true);
        }, 15000); // 15 seconds wait for VPS traffic
        return () => clearTimeout(timer);
    }, [games]);

    return (
        <div className="min-h-screen bg-transparent text-slate-200 p-4 sm:p-6 md:p-8">
            <div className="max-w-7xl mx-auto">
                <header className="text-center my-12 md:my-20">
                    <h1 className="text-5xl md:text-7xl font-extrabold mb-3 tracking-wider glitch-text" data-text="A-BABA EXCHANGE">A-BABA EXCHANGE</h1>
                    <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto font-sans uppercase tracking-widest">Digital Lottery Trading System</p>
                </header>

                <section id="games" className="mb-20">
                    <h2 className="text-3xl font-bold text-center mb-10 text-white uppercase tracking-widest border-b border-slate-800 pb-4">Live Markets</h2>
                    {games.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-16 bg-slate-800/30 rounded-2xl border border-slate-700/50 shadow-2xl">
                            {connectionTimeout ? (
                                <div className="text-center animate-fade-in">
                                    <div className="text-red-500 text-6xl mb-6">⚠️</div>
                                    <p className="text-white text-xl font-black mb-2 uppercase tracking-tighter">System Congestion Detected</p>
                                    <p className="text-slate-400 text-sm max-w-sm mx-auto mb-8 font-sans">The server is currently processing a high volume of transactions. Please re-synchronize your session.</p>
                                    <button onClick={() => window.location.reload()} className="bg-cyan-600 hover:bg-cyan-500 text-white px-10 py-3 rounded-full font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-cyan-900/40">Re-Sync System</button>
                                </div>
                            ) : (
                                <>
                                    <div className="w-16 h-16 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mb-6"></div>
                                    <p className="text-cyan-400 font-black tracking-[0.3em] uppercase animate-pulse text-sm">Synchronizing Market Data...</p>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8">
                            {games.map(game => (
                                <GameDisplayCard key={game.id} game={game} onClick={() => document.getElementById('login')?.scrollIntoView({ behavior: 'smooth' })} />
                            ))}
                        </div>
                    )}
                </section>

                <section id="login" className="max-w-md mx-auto scroll-mt-20">
                    <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg shadow-2xl border border-slate-700 overflow-hidden p-8">
                        <h3 className="text-xl font-bold text-white mb-6 uppercase tracking-widest text-center">Account Access</h3>
                        <p className="text-slate-400 text-center text-sm mb-8">Please enter your credentials to manage your wallet and play.</p>
                        <button onClick={() => window.location.reload()} className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-black py-4 rounded-lg uppercase tracking-widest shadow-xl transition-all hover:scale-105 active:scale-95">Enter Trading Terminal</button>
                    </div>
                     <div className="mt-6">
                        <button onClick={() => setIsAdminModalOpen(true)} className="w-full text-white font-bold py-3 px-4 rounded-md transition-all bg-gradient-to-r from-red-600 to-rose-600 uppercase tracking-widest text-xs">Administrative Login</button>
                    </div>
                </section>

                <footer className="text-center py-8 mt-12 text-slate-500 font-sans text-xs uppercase tracking-[0.2em]">
                    <p>&copy; {new Date().getFullYear()} A-Baba Exchange. Distributed Ledger System.</p>
                </footer>
            </div>
            
            <ResetPasswordModal isOpen={isResetModalOpen} onClose={() => setIsResetModalOpen(false)} />
        </div>
    );
};

const ResetPasswordModal: React.FC<{ isOpen: boolean; onClose: () => void; }> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-slate-900 rounded-lg shadow-2xl w-full max-w-md border border-cyan-500/30 p-8">
                <h3 className="text-lg font-bold text-white uppercase tracking-widest mb-4">Contact Support</h3>
                <p className="text-slate-400 text-sm mb-6">Password resets must be initiated through your authorized system administrator.</p>
                <button onClick={onClose} className="w-full bg-slate-700 text-white font-bold py-2 rounded uppercase text-xs">Close</button>
            </div>
        </div>
    );
};

export default LandingPage;
