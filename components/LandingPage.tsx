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
            whileHover={{ y: -8, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClick}
            className="relative flex flex-col items-center p-8 text-center elite-card w-full overflow-hidden rounded-[2.5rem] group"
        >
            <div className={`absolute inset-0 bg-gradient-to-br from-${themeColor}-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700`} />
            
            <div className="relative z-10 w-full flex flex-col h-full items-center">
                <div className="relative mb-8 pt-2">
                    <div className="absolute -inset-4 bg-white/5 rounded-full blur-xl scale-90 group-hover:scale-110 transition-transform duration-700" />
                    <img 
                        src={logo} 
                        alt={`${game.name} logo`} 
                        className="w-28 h-28 rounded-full border border-white/10 group-hover:border-sky-400/30 transition-all duration-700 shadow-2xl relative z-10 object-cover p-1 bg-[#020617]" 
                    />
                    <div className={`absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-[#020617] border border-white/10 flex items-center justify-center z-20`}>
                        <div className={`w-2.5 h-2.5 rounded-full ${status === 'OPEN' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                    </div>
                </div>
                
                <h3 className="text-2xl font-display font-black text-white mb-1 tracking-tight group-hover:text-sky-300 transition-colors uppercase">{game.name}</h3>
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em]">Market Close: {formatTime12h(game.drawTime)}</p>

                <div className="mt-8 w-full pt-8 border-t border-white/5 flex flex-col justify-center min-h-[110px]">
                    {hasFinalWinner ? (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-700">
                            <span className="text-[9px] font-black text-emerald-400 tracking-[0.4em] uppercase block mb-3 opacity-60">Final Outcome</span>
                            <span className="text-6xl font-mono font-black text-white tracking-tighter text-gradient-cyan">
                                {game.winningNumber}
                            </span>
                        </div>
                    ) : isMarketClosedForDisplay ? (
                        <div className="space-y-1">
                            <span className="text-[9px] font-black text-slate-500 tracking-[0.4em] uppercase block">Operations status</span>
                            <span className="text-xl font-display font-black text-rose-500/80 uppercase">Access Restricted</span>
                        </div>
                    ) : status === 'OPEN' ? (
                        <div>
                            <span className="text-[9px] font-black text-sky-400/80 tracking-[0.4em] uppercase block mb-3">Time to Entry</span>
                            <span className="text-4xl font-mono font-black text-slate-100 tracking-tighter">{countdownText}</span>
                        </div>
                    ) : (
                        <div>
                            <span className="text-[9px] font-black text-slate-500 tracking-[0.4em] uppercase block mb-2">Market Opening</span>
                            <span className="text-2xl font-mono font-black text-slate-600">{countdownText}</span>
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
        <div className="glass-panel rounded-[2.5rem] overflow-hidden shadow-2xl shadow-black/50 border-white/10">
            <div className="flex p-3 bg-black/40 border-b border-white/5 gap-2">
                <button 
                    onClick={() => setActiveTab('User')}
                    className={`flex-1 py-4 text-[10px] font-black uppercase tracking-[0.25em] rounded-2xl transition-all ${isUser ? 'bg-sky-600 text-white shadow-xl shadow-sky-500/20' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                >
                    Citizen Node
                </button>
                <button 
                    onClick={() => setActiveTab('Dealer')}
                    className={`flex-1 py-4 text-[10px] font-black uppercase tracking-[0.25em] rounded-2xl transition-all ${!isUser ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-500/20' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                >
                    Authorized Agent
                </button>
            </div>
            
            <div className="p-12">
                <form onSubmit={handleLoginSubmit} className="space-y-8">
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1">Terminal Identity</label>
                        <input 
                            type="text" 
                            value={loginId} 
                            onChange={(e) => setLoginId(e.target.value)} 
                            className="w-full bg-black/60 border border-white/10 p-5 rounded-2xl text-white focus:border-sky-500/50 outline-none transition-all font-mono"
                            placeholder="A-00000"
                        />
                    </div>
                    
                    <div className="space-y-3">
                        <div className="flex justify-between items-center ml-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Master Passkey</label>
                            <button type="button" onClick={onForgotPassword} className="text-[10px] font-black text-sky-500 hover:text-sky-400 tracking-widest uppercase">Recovery</button>
                        </div>
                        <div className="relative">
                            <input 
                                type={isPasswordVisible ? 'text' : 'password'} 
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)} 
                                className="w-full bg-black/60 border border-white/10 p-5 rounded-2xl text-white focus:border-sky-500/50 outline-none transition-all pr-14 font-mono"
                                placeholder="••••••••"
                            />
                            <button type="button" onClick={() => setIsPasswordVisible(!isPasswordVisible)} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                                {isPasswordVisible ? Icons.eyeOff : Icons.eye}
                            </button>
                        </div>
                    </div>

                    {error && (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-[10px] font-black uppercase tracking-[0.15em] text-rose-400 bg-rose-500/10 p-5 rounded-2xl border border-rose-500/20 text-center">
                            {error}
                        </motion.div>
                    )}

                    <button 
                        type="submit" 
                        disabled={isAuthenticating}
                        className={`w-full py-5 rounded-[1.5rem] font-black text-white tracking-[0.35em] text-xs transition-all shadow-2xl disabled:opacity-50 active:scale-[0.98] ${isUser ? 'bg-sky-600 hover:bg-sky-500 shadow-sky-500/20' : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20'}`}
                    >
                        {isAuthenticating ? 'AUTHENTICATING...' : 'ESTABLISH LINK'}
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
            <div className="glass-panel rounded-[2.5rem] overflow-hidden border-rose-500/20">
                <div className="flex justify-between items-center p-8 border-b border-white/5 bg-rose-500/5">
                    <h3 className="text-[10px] font-black text-rose-400 uppercase tracking-[0.4em]">Restricted Protocol</h3>
                    <button onClick={onClose} className="p-2 rounded-lg bg-white/5 text-slate-500 hover:text-white transition-colors">{Icons.close}</button>
                </div>
                <div className="p-12">
                    <form onSubmit={handleLoginSubmit} className="space-y-8">
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1">Admin Proxy ID</label>
                            <input type="text" value={loginId} onChange={(e) => setLoginId(e.target.value)} className="w-full bg-black/40 border border-white/10 p-5 rounded-2xl text-white outline-none focus:border-rose-500/50 transition-all font-mono" />
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center ml-1">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Security Matrix</label>
                                <button type="button" onClick={onForgotPassword} className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Recovery</button>
                            </div>
                            <div className="relative">
                                <input type={isPasswordVisible ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-black/40 border border-white/10 p-5 rounded-2xl text-white outline-none focus:border-rose-500/50 transition-all pr-14 font-mono" />
                                <button type="button" onClick={() => setIsPasswordVisible(!isPasswordVisible)} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                                    {isPasswordVisible ? Icons.eyeOff : Icons.eye}
                                </button>
                            </div>
                        </div>
                        {error && <div className="text-[10px] font-black uppercase tracking-widest text-rose-400 bg-rose-500/10 p-5 rounded-2xl border border-rose-500/20 text-center">{error}</div>}
                        <button type="submit" disabled={isAuthenticating} className="w-full py-5 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-[1.5rem] tracking-[0.35em] text-xs transition-all shadow-2xl shadow-rose-500/20 active:scale-[0.98]">
                            {isAuthenticating ? 'VERIFYING...' : 'AUTHORIZE LOGIN'}
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
            <div className="glass-panel rounded-[2.5rem] overflow-hidden">
                <div className="p-12 text-center text-slate-200">
                    <h3 className="text-2xl font-display font-black text-white mb-3 uppercase tracking-tight">Key Regeneration</h3>
                    <p className="text-slate-500 text-xs font-semibold mb-10 max-w-[280px] mx-auto uppercase tracking-widest leading-relaxed">Enter your node ID and contact signature to authorize key reset.</p>
                    
                    {success ? (
                        <div className="space-y-6 animate-in fade-in zoom-in duration-500">
                            <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 text-[10px] font-black uppercase tracking-widest leading-loose">{success}</div>
                            <button onClick={onClose} className="w-full py-5 bg-sky-600 text-white font-black rounded-2xl tracking-[0.3em] uppercase text-xs shadow-xl shadow-sky-500/20">RETURN TO TERMINAL</button>
                        </div>
                    ) : (
                        <form onSubmit={handleResetSubmit} className="space-y-5 text-left">
                            <input type="text" placeholder="Terminal ID" value={loginId} onChange={(e) => setLoginId(e.target.value)} className="w-full bg-black/40 border border-white/10 p-5 rounded-2xl text-white outline-none focus:border-sky-500/50 font-mono" />
                            <input type="text" placeholder="Contact Signature" value={contact} onChange={(e) => setContact(e.target.value)} className="w-full bg-black/40 border border-white/10 p-5 rounded-2xl text-white outline-none focus:border-sky-500/50 font-mono" />
                            <div className="relative">
                                <input type={isNewPasswordVisible ? 'text' : 'password'} placeholder="New Master Pass" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full bg-black/40 border border-white/10 p-5 rounded-2xl text-white outline-none focus:border-sky-500/50 pr-14 font-mono" />
                                <button type="button" onClick={() => setIsNewPasswordVisible(!isNewPasswordVisible)} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">{isNewPasswordVisible ? Icons.eyeOff : Icons.eye}</button>
                            </div>
                            <input type={isNewPasswordVisible ? 'text' : 'password'} placeholder="Confirm Pass" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full bg-black/40 border border-white/10 p-5 rounded-2xl text-white outline-none focus:border-sky-500/50 font-mono" />
                            
                            {error && <div className="text-[10px] font-black uppercase text-rose-400 text-center tracking-widest">{error}</div>}
                            
                            <button type="submit" disabled={isLoading} className="w-full py-5 bg-sky-600 hover:bg-sky-500 text-white font-black rounded-2xl tracking-[0.3em] uppercase text-xs shadow-xl shadow-sky-500/20 mt-4 active:scale-95 transition-all">
                                {isLoading ? 'PROCESSING...' : 'INITIALIZE RESET'}
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

            <main className="relative z-10 max-w-7xl mx-auto px-8 py-16 md:py-32">
                <motion.header 
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    className="text-center mb-32"
                >
                    <div className="inline-flex items-center gap-3 px-6 py-2 rounded-full bg-white/5 border border-white/10 text-sky-400 text-[10px] font-black uppercase tracking-[0.4em] mb-10 shadow-2xl">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                        A-BABA PROTOCOL V4.0.5
                    </div>
                    <h1 className="text-7xl md:text-[8rem] font-display font-black text-white mb-10 tracking-tighter leading-[0.85] uppercase">
                        Master <br className="hidden md:block" />
                        <span className="text-gradient-cyan drop-shadow-[0_0_50px_rgba(56,189,248,0.2)]">Exchange</span>
                    </h1>
                    <p className="text-xl md:text-2xl text-slate-400 max-w-3xl mx-auto font-medium leading-relaxed tracking-tight">
                        The elite distributed lottery terminal. 
                        Live cryptographic results, instant verification, and next-gen market management.
                    </p>
                </motion.header>

                <section className="mb-48">
                    <div className="flex flex-col md:flex-row justify-between items-center mb-16 gap-8">
                        <div className="border-l-4 border-sky-600 pl-8">
                            <h2 className="text-4xl font-display font-black text-white tracking-tighter uppercase mb-2">Live Markets</h2>
                            <div className="flex items-center gap-4">
                                <span className="text-emerald-400 text-[10px] font-black uppercase tracking-[0.3em]">Status: Operational</span>
                                <div className="w-1 h-1 rounded-full bg-slate-700" />
                                <span className="text-slate-500 text-[10px] font-mono tracking-widest">LATENCY: 8ms</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 bg-black/40 px-6 py-3 rounded-2xl border border-white/5">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Global Sync Enabled</span>
                        </div>
                    </div>
                    
                    {games.length === 0 ? (
                        <div className="elite-card rounded-[3rem] p-32 text-center border-dashed border-white/10 bg-black/20">
                            <div className="w-12 h-12 border-4 border-sky-500/20 border-t-sky-500 rounded-full animate-spin mx-auto mb-8 shadow-2xl shadow-sky-500/20"></div>
                            <p className="text-sky-400 font-black tracking-[0.4em] text-[10px] uppercase">Retrieving Market Data...</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-10">
                            {games.map((game, i) => (
                                <motion.div
                                    key={game.id}
                                    initial={{ opacity: 0, y: 30 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: i * 0.1, duration: 0.6 }}
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

                <div id="terminal" className="grid grid-cols-1 lg:grid-cols-2 gap-32 items-start scroll-mt-32 mb-48">
                    <motion.div
                        initial={{ opacity: 0, x: -60 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8 }}
                    >
                        <h2 className="text-5xl md:text-8xl font-display font-black text-white mb-12 leading-[0.9] tracking-tighter uppercase">
                            Secure <br />
                            <span className="text-gradient-cyan">Assets</span>
                        </h2>
                        <div className="space-y-12">
                            {[
                                { title: 'Encrypted Integrity', desc: 'Every stake is cryptographically signed and archived on a high-frequency immutable ledger.' },
                                { title: 'Quantum Audit', desc: 'Real-time result verification with millisecond latency across the entire exchange network.' },
                                { title: 'Authorized Node Suite', desc: 'The most advanced terminal management interface for elite agents and regional controllers.' }
                            ].map((item, i) => (
                                <div key={i} className="flex gap-8 group">
                                    <div className="w-16 h-16 rounded-[1.5rem] bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-sky-500/20 transition-all duration-500 shadow-xl shadow-sky-500/5">
                                        <span className="text-sky-500 font-black text-base font-display">0{i+1}</span>
                                    </div>
                                    <div className="pt-2">
                                        <h4 className="font-display font-black text-white mb-2 text-2xl uppercase tracking-tight">{item.title}</h4>
                                        <p className="text-slate-400 text-base leading-relaxed tracking-tight">{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className="relative"
                    >
                        <div className="absolute -inset-20 bg-sky-500/5 blur-[120px] rounded-full pointer-events-none animate-pulse" />
                        <LoginPanel onForgotPassword={() => setIsResetModalOpen(true)} />
                        
                        <button 
                            onClick={() => setIsAdminModalOpen(true)}
                            className="w-full mt-10 py-6 rounded-[2rem] bg-white/5 border border-white/10 text-slate-500 font-black tracking-[0.4em] text-[10px] hover:bg-rose-500/5 hover:text-rose-400 hover:border-rose-500/30 transition-all uppercase shadow-2xl"
                        >
                            <span className="flex items-center justify-center gap-4">
                                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shadow-[0_0_10px_rgba(244,63,94,0.5)]" />
                                Restricted Root Access
                            </span>
                        </button>
                    </motion.div>
                </div>

                <footer className="pt-24 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-12 pb-24">
                    <div className="text-3xl font-display font-black text-white tracking-widest opacity-80 uppercase">A-BABA.E</div>
                    <div className="flex gap-16">
                        <div className="text-[10px] text-slate-500 uppercase tracking-[0.4em] text-center md:text-left font-black">
                            <span className="block text-sky-500 mb-2">Protocol Status</span>
                            Operational / 6ms
                        </div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-[0.4em] text-center md:text-left font-black">
                            <span className="block text-sky-500 mb-2">Current release</span>
                            v4.0.5 / Stable
                        </div>
                    </div>
                    <div className="text-[9px] text-slate-600 font-black uppercase tracking-[0.4em]">
                        &copy; 2026 Core Mainframe
                    </div>
                </footer>
            </main>

            <AdminLoginModal isOpen={isAdminModalOpen} onClose={() => setIsAdminModalOpen(false)} onForgotPassword={() => { setIsAdminModalOpen(false); setIsResetModalOpen(true); }} />
            <ResetPasswordModal isOpen={isResetModalOpen} onClose={() => setIsResetModalOpen(false)} />
        </div>
    );
};

export default LandingPage;
