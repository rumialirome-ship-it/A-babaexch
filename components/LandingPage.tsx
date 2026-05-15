import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
    const themeColor = hasFinalWinner ? 'emerald' : 'sky';
    const logo = GAME_LOGOS[game.name] || '';

    return (
        <motion.button
            whileHover={{ y: -5, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClick}
            className={`relative flex flex-col items-center p-6 text-center elite-card w-full overflow-hidden rounded-2xl group`}
        >
            <div className={`absolute inset-0 bg-gradient-to-b from-${themeColor}-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
            
            <div className="relative z-10 w-full flex flex-col h-full items-center">
                <div className="relative mb-6">
                    <img 
                        src={logo} 
                        alt={`${game.name} logo`} 
                        className="w-24 h-24 rounded-full border-2 border-slate-700/50 group-hover:border-sky-400/50 transition-all duration-500 shadow-2xl relative z-10 object-cover" 
                    />
                    <div className={`absolute -inset-2 bg-${themeColor}-400/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                </div>
                
                <h3 className="text-xl font-bold text-slate-100 mb-1 tracking-tight group-hover:text-sky-300 transition-colors">{game.name}</h3>
                <p className="text-slate-400 text-xs font-medium uppercase tracking-[0.2em]">Draw @ {formatTime12h(game.drawTime)}</p>

                <div className="mt-6 w-full pt-6 border-t border-slate-700/50 flex flex-col justify-center min-h-[90px]">
                    {hasFinalWinner ? (
                        <div className="animate-in fade-in zoom-in duration-700">
                            <span className="text-[10px] font-black text-emerald-400 tracking-[0.4em] uppercase block mb-2">Authenticated Result</span>
                            <span className="text-5xl font-mono font-bold text-white tracking-tighter drop-shadow-[0_0_15px_rgba(16,185,129,0.4)]">
                                {game.winningNumber}
                            </span>
                        </div>
                    ) : isMarketClosedForDisplay ? (
                        <div>
                            <span className="text-[10px] font-bold text-slate-500 tracking-widest uppercase block mb-1">Status</span>
                            <span className="text-xl font-bold text-rose-400/80">MARKET CLOSED</span>
                        </div>
                    ) : status === 'OPEN' ? (
                        <div>
                            <span className="text-[10px] font-bold text-sky-400/80 tracking-widest uppercase block mb-1">Entry Ends In</span>
                            <span className="text-3xl font-mono font-bold text-slate-100 tracking-tight">{countdownText}</span>
                        </div>
                    ) : (
                        <div>
                            <span className="text-[10px] font-bold text-slate-500 tracking-widest uppercase block mb-1">Wait for Entry</span>
                            <span className="text-xl font-mono font-bold text-slate-500">{countdownText}</span>
                        </div>
                    )}
                </div>
            </div>
        </motion.button>
    );
};

const LoginPanel: React.FC<{ onForgotPassword: () => void }> = ({ onForgotPassword }) => {
    const { login } = useAuth();
    const [activeTab, setActiveTab] = useState<'User' | 'Dealer'>('User');
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isAuthenticating, setIsAuthenticating] = useState(false);

    const isUser = activeTab === 'User';

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!loginId.trim() || !password.trim()) { setError("Fields required."); return; }
        setError(null);
        setIsAuthenticating(true);
        try { 
            await login(loginId, password); 
        } catch (err) { 
            setError(err instanceof Error ? err.message : "Error"); 
            setIsAuthenticating(false);
        }
    };

    return (
        <div className="glass-panel rounded-3xl overflow-hidden">
            <div className="flex p-2 bg-black/20 border-b border-white/5">
                <button 
                    onClick={() => setActiveTab('User')}
                    className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest rounded-2xl transition-all ${isUser ? 'bg-sky-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    User Portal
                </button>
                <button 
                    onClick={() => setActiveTab('Dealer')}
                    className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest rounded-2xl transition-all ${!isUser ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    Dealer Access
                </button>
            </div>
            
            <div className="p-10">
                <form onSubmit={handleLoginSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Terminal ID</label>
                        <input 
                            type="text" 
                            value={loginId} 
                            onChange={(e) => setLoginId(e.target.value)} 
                            className="w-full bg-black/40 border border-white/10 p-4 rounded-xl text-white focus:border-sky-500/50 outline-none transition-all"
                            placeholder="A-00000"
                        />
                    </div>
                    
                    <div className="space-y-2">
                        <div className="flex justify-between items-center ml-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Master Key</label>
                            <button type="button" onClick={onForgotPassword} className="text-[10px] font-bold text-sky-500 hover:text-sky-400">Recovery?</button>
                        </div>
                        <div className="relative">
                            <input 
                                type={isPasswordVisible ? 'text' : 'password'} 
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)} 
                                className="w-full bg-black/40 border border-white/10 p-4 rounded-xl text-white focus:border-sky-500/50 outline-none transition-all pr-12"
                                placeholder="••••••••"
                            />
                            <button type="button" onClick={() => setIsPasswordVisible(!isPasswordVisible)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                                {isPasswordVisible ? Icons.eyeOff : Icons.eye}
                            </button>
                        </div>
                    </div>

                    {error && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-rose-400 bg-rose-500/10 p-4 rounded-xl border border-rose-500/20 text-center">
                            {error}
                        </motion.div>
                    )}

                    <button 
                        type="submit" 
                        disabled={isAuthenticating}
                        className={`w-full py-4 rounded-xl font-bold text-white tracking-[0.2em] transition-all shadow-xl hover:shadow-sky-500/10 active:scale-[0.98] disabled:opacity-50 ${isUser ? 'bg-sky-600 hover:bg-sky-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}
                    >
                        {isAuthenticating ? 'VERIFYING...' : 'LOGIN TO TERMINAL'}
                    </button>
                </form>
            </div>
        </div>
    );
};

const ModalWrapper: React.FC<{ isOpen: boolean; onClose: () => void; children: React.ReactNode;}> = ({isOpen, onClose, children}) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/90 backdrop-blur-md flex justify-center items-center z-50 p-6"
                    onClick={(e) => e.target === e.currentTarget && onClose()}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        className="w-full max-w-md"
                    >
                        {children}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

const AdminLoginModal: React.FC<{ isOpen: boolean; onClose: () => void; onForgotPassword: () => void; }> = ({ isOpen, onClose, onForgotPassword }) => {
    const { login } = useAuth();
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isAuthenticating, setIsAuthenticating] = useState(false);

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!loginId.trim() || !password.trim()) { setError("Fields required."); return; }
        setError(null);
        setIsAuthenticating(true);
        try { 
            await login(loginId, password);
        } catch (err) { 
            setError(err instanceof Error ? err.message : "Error"); 
            setIsAuthenticating(false);
        }
    };
    
    return (
        <ModalWrapper isOpen={isOpen} onClose={onClose}>
            <div className="glass-panel rounded-3xl overflow-hidden border-rose-500/20">
                <div className="flex justify-between items-center p-6 border-b border-white/5 bg-rose-500/5">
                    <h3 className="text-xs font-bold text-rose-400 uppercase tracking-[0.3em]">Restricted Access</h3>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">{Icons.close}</button>
                </div>
                <div className="p-10">
                    <form onSubmit={handleLoginSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Admin Identity</label>
                            <input type="text" value={loginId} onChange={(e) => setLoginId(e.target.value)} className="w-full bg-black/40 border border-white/10 p-4 rounded-xl text-white outline-none focus:border-rose-500/50 transition-all" />
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between items-center ml-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Security Token</label>
                                <button type="button" onClick={onForgotPassword} className="text-[10px] font-bold text-rose-500">Recovery?</button>
                            </div>
                            <div className="relative">
                                <input type={isPasswordVisible ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-black/40 border border-white/10 p-4 rounded-xl text-white outline-none focus:border-rose-500/50 transition-all pr-12" />
                                <button type="button" onClick={() => setIsPasswordVisible(!isPasswordVisible)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                                    {isPasswordVisible ? Icons.eyeOff : Icons.eye}
                                </button>
                            </div>
                        </div>
                        {error && <div className="text-xs text-rose-400 bg-rose-500/10 p-4 rounded-xl border border-rose-500/20 text-center">{error}</div>}
                        <button type="submit" disabled={isAuthenticating} className="w-full py-4 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl tracking-[0.2em] transition-all shadow-xl shadow-rose-500/10">
                            {isAuthenticating ? 'VERIFYING...' : 'AUTHORIZE ACCESS'}
                        </button>
                    </form>
                </div>
            </div>
        </ModalWrapper>
    );
};

const ResetPasswordModal: React.FC<{ isOpen: boolean; onClose: () => void; }> = ({ isOpen, onClose }) => {
    const { resetPassword } = useAuth();
    const [loginId, setLoginId] = useState('');
    const [contact, setContact] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isNewPasswordVisible, setIsNewPasswordVisible] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleResetSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null); setSuccess(null);
        if (newPassword !== confirmPassword) { setError("Keys mismatch."); return; }
        if (!loginId || !contact || !newPassword) { setError("All data required."); return; }
        setIsLoading(true);
        try {
            const msg = await resetPassword(loginId, contact, newPassword);
            setSuccess(msg);
        } catch (err) { setError(err instanceof Error ? err.message : "Error"); } 
        finally { setIsLoading(false); }
    };
    
    return (
        <ModalWrapper isOpen={isOpen} onClose={onClose}>
            <div className="glass-panel rounded-3xl overflow-hidden">
                <div className="p-10 text-center">
                    <h3 className="text-xl font-bold text-white mb-2">Credential Recovery</h3>
                    <p className="text-slate-500 text-sm mb-8">Enter your terminal ID and contact signature to regenerate your key.</p>
                    
                    {success ? (
                        <div className="space-y-4">
                            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm">{success}</div>
                            <button onClick={onClose} className="w-full py-4 bg-sky-600 text-white font-bold rounded-xl tracking-widest">RETURN TO LOGIN</button>
                        </div>
                    ) : (
                        <form onSubmit={handleResetSubmit} className="space-y-4 text-left">
                            <input type="text" placeholder="Terminal ID" value={loginId} onChange={(e) => setLoginId(e.target.value)} className="w-full bg-black/40 border border-white/10 p-4 rounded-xl text-white outline-none focus:border-sky-500/50" />
                            <input type="text" placeholder="Contact Signature" value={contact} onChange={(e) => setContact(e.target.value)} className="w-full bg-black/40 border border-white/10 p-4 rounded-xl text-white outline-none focus:border-sky-500/50" />
                            <div className="relative">
                                <input type={isNewPasswordVisible ? 'text' : 'password'} placeholder="New Master Key" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full bg-black/40 border border-white/10 p-4 rounded-xl text-white outline-none focus:border-sky-500/50 pr-12" />
                            </div>
                            <input type={isNewPasswordVisible ? 'text' : 'password'} placeholder="Confirm Key" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full bg-black/40 border border-white/10 p-4 rounded-xl text-white outline-none focus:border-sky-500/50" />
                            
                            {error && <div className="text-xs text-rose-400 text-center">{error}</div>}
                            
                            <button type="submit" disabled={isLoading} className="w-full py-4 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl tracking-[0.2em] mt-4">
                                {isLoading ? 'REGENERATING...' : 'UPDATE MASTER KEY'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </ModalWrapper>
    );
};

const LandingPage: React.FC<{ games: Game[] }> = ({ games }) => {
    const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
    const [isResetModalOpen, setIsResetModalOpen] = useState(false);
    
    return (
        <div className="relative min-h-screen">
            <div className="animated-bg">
                <div className="grid-overlay" />
            </div>

            <main className="relative z-10 max-w-7xl mx-auto px-6 py-12 md:py-24">
                <motion.header 
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-24"
                >
                    <div className="inline-block px-4 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[10px] font-bold uppercase tracking-[0.3em] mb-6">
                        Distributed Exchange Node v4.0.2
                    </div>
                    <h1 className="text-6xl md:text-9xl font-black text-white mb-8 tracking-tighter">
                        A-BABA <br className="md:hidden" />
                        <span className="text-sky-500 drop-shadow-[0_0_30px_rgba(14,165,233,0.3)]">EXCHANGE</span>
                    </h1>
                    <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto font-medium leading-relaxed">
                        The ultimate high-fidelity digital lottery node. 
                        Live results, instant verification, and secure terminal management.
                    </p>
                </motion.header>

                <section className="mb-32">
                    <div className="flex justify-between items-end mb-12 border-l-4 border-sky-500 pl-6">
                        <div>
                            <h2 className="text-3xl font-bold text-white tracking-tight mb-2 uppercase">Live Market Feed</h2>
                            <p className="text-slate-500 text-sm font-mono tracking-wider">STATUS: ACTIVE | SYNC: OPTIMAL</p>
                        </div>
                    </div>
                    
                    {games.length === 0 ? (
                        <div className="glass-panel rounded-3xl p-24 text-center border-dashed border-white/10">
                            <div className="w-10 h-10 border-2 border-sky-500/20 border-t-sky-500 rounded-full animate-spin mx-auto mb-6"></div>
                            <p className="text-sky-400 font-bold tracking-[0.2em] text-xs uppercase">Syncing with Mainframe...</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {games.map((game, i) => (
                                <motion.div
                                    key={game.id}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: i * 0.05, type: 'spring', stiffness: 100 }}
                                >
                                    <GameDisplayCard 
                                        game={game} 
                                        onClick={() => document.getElementById('terminal')?.scrollIntoView({ behavior: 'smooth' })} 
                                    />
                                </motion.div>
                            ))}
                        </div>
                    )}
                </section>

                <div id="terminal" className="grid grid-cols-1 lg:grid-cols-2 gap-24 items-start scroll-mt-24 mb-32">
                    <motion.div
                        initial={{ opacity: 0, x: -50 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                    >
                        <h2 className="text-4xl md:text-6xl font-black text-white mb-8 leading-tight tracking-tighter">
                            Manage Your <br />
                            <span className="text-sky-500">Assets</span>
                        </h2>
                        <div className="space-y-10">
                            {[
                                { title: 'Encrypted Ledger', desc: 'Every transaction is cryptographically signed and stored on a tamper-proof distributed database.' },
                                { title: 'Instant Draw Audit', desc: 'Winning numbers are verified against multiple data points to ensure fair play and transparency.' },
                                { title: 'Elite Dealer Suite', desc: 'Comprehensive management tools for authorized agents to scale their lottery business.' }
                            ].map((item, i) => (
                                <div key={i} className="flex gap-6 group">
                                    <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                                        <span className="text-sky-500 font-bold text-xs">0{i+1}</span>
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-100 mb-1 text-lg">{item.title}</h4>
                                        <p className="text-slate-400 text-sm leading-relaxed">{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className="relative"
                    >
                        <div className="absolute -inset-10 bg-sky-500/10 blur-[100px] rounded-full pointer-events-none" />
                        <LoginPanel onForgotPassword={() => setIsResetModalOpen(true)} />
                        
                        <button 
                            onClick={() => setIsAdminModalOpen(true)}
                            className="w-full mt-8 py-5 rounded-3xl bg-white/5 border border-white/10 text-slate-400 font-bold tracking-[0.3em] text-[10px] hover:bg-white/10 hover:text-white transition-all uppercase"
                        >
                            <span className="flex items-center justify-center gap-3">
                                <div className="w-1 h-1 rounded-full bg-rose-500 animate-pulse" />
                                Restricted Terminal Access
                            </span>
                        </button>
                    </motion.div>
                </div>

                <footer className="pt-16 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-8 pb-16 opacity-60">
                    <div className="text-2xl font-black text-white tracking-widest">A-BABA.E</div>
                    <div className="flex gap-12">
                        <div className="text-[10px] text-slate-500 uppercase tracking-widest text-center md:text-left">
                            <span className="block text-sky-500 font-bold mb-1">Network Status</span>
                            Operational / 14ms
                        </div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-widest text-center md:text-left">
                            <span className="block text-sky-500 font-bold mb-1">Version</span>
                            4.0.2 Stable
                        </div>
                    </div>
                </footer>
            </main>

            <AdminLoginModal isOpen={isAdminModalOpen} onClose={() => setIsAdminModalOpen(false)} onForgotPassword={() => { setIsAdminModalOpen(false); setIsResetModalOpen(true); }} />
            <ResetPasswordModal isOpen={isResetModalOpen} onClose={() => setIsResetModalOpen(false)} />
        </div>
    );
};

export default LandingPage;
