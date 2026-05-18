import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Game } from '../types';
import { useCountdown } from '../hooks/useCountdown';
import { Icons, GAME_LOGOS } from '../constants';
import { useAuth } from '../hooks/useAuth';

// Helper function to format time to 12-hour AM/PM format
const formatTime12h = (time24: string) => {
    if (!time24 || typeof time24 !== 'string' || !time24.includes(':')) return '--:--';
    const parts = time24.split(':');
    const hours = parseInt(parts[0]);
    const minutes = parseInt(parts[1]);
    if (isNaN(hours) || isNaN(minutes)) return '--:--';
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
};

const GameDisplayCard = React.memo<{ game: Game; onClick: () => void }>(({ game, onClick }) => {
    const { status, text: countdownText } = useCountdown(game.drawTime);
    const hasFinalWinner = !!game.winningNumber && !game.winningNumber.endsWith('_');
    const isMarketClosedForDisplay = !game.isMarketOpen;
    const logo = (game && game.name) ? (GAME_LOGOS[game.name] || game.logo || '') : '';

    if (!game || !game.drawTime) return null;

    return (
        <motion.button
            whileHover={{ y: -5, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClick}
            className="glass-card group p-6 rounded-2xl flex flex-col items-center justify-between text-center transition-all duration-500 overflow-hidden relative"
        >
            <div className="absolute top-0 right-0 p-2 opacity-10">
                <Icons.sparkles className="w-8 h-8 text-cyan-400" />
            </div>
            
            <div className="relative z-10 w-full flex flex-col h-full">
                <div className="flex-grow">
                    <div className="relative inline-block mb-6">
                        <motion.div 
                            animate={{ rotate: 360 }}
                            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                            className="absolute -inset-2 bg-gradient-to-tr from-cyan-500 to-blue-500 rounded-full blur-md opacity-20 group-hover:opacity-40 transition-opacity"
                        />
                        <img src={logo} alt={`${game.name} logo`} className="relative w-20 h-20 rounded-full border-2 border-slate-700 group-hover:border-cyan-400 transition-colors bg-slate-900 object-cover" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-1 uppercase tracking-tighter group-hover:text-cyan-400 transition-colors">{game.name}</h3>
                    <p className="text-slate-500 text-xs font-medium">Draw @ {formatTime12h(game.drawTime)}</p>
                </div>
                
                <div className="mt-6 flex flex-col items-center bg-black/40 rounded-xl p-3 border border-white/5 backdrop-blur-sm min-h-[80px] justify-center">
                    {hasFinalWinner ? (
                        <>
                            <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-black mb-1">Result</div>
                            <div className="text-4xl font-mono font-bold text-white tracking-widest drop-shadow-glow-emerald">
                                {game.winningNumber}
                            </div>
                        </>
                    ) : isMarketClosedForDisplay ? (
                        <>
                            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Status</div>
                            <div className="text-lg font-bold text-red-500/80">MARKET CLOSED</div>
                        </>
                    ) : (
                        <>
                            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">
                                {status === 'OPEN' ? 'Closes In' : 'Starts In'}
                            </div>
                            <div className={`text-2xl font-mono font-bold ${status === 'OPEN' ? 'text-cyan-400' : 'text-slate-400'}`}>
                                {countdownText}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </motion.button>
    );
});

type LoginRole = 'User' | 'Dealer';

const LoginPanel = React.memo<{ onForgotPassword: () => void }>(({ onForgotPassword }) => {
    const { login } = useAuth();
    const [activeTab, setActiveTab] = useState<LoginRole>('User');
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isAuthenticating, setIsAuthenticating] = useState(false);

    // Clear credentials on tab switch
    React.useEffect(() => {
        setLoginId('');
        setPassword('');
        setError(null);
    }, [activeTab]);

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!loginId.trim() || !password.trim()) { setError("ID and Password are required."); return; }
        setError(null);
        setIsAuthenticating(true);
        
        // Save values to use for login attempt
        const idToTry = loginId;
        const passToTry = password;

        // Reset fields immediately upon clicking login as requested
        setLoginId('');
        setPassword('');

        try { 
            await login(idToTry, passToTry); 
        } catch (err) { 
            setError(err instanceof Error ? err.message : "An unknown login error occurred."); 
            setIsAuthenticating(false);
            // Optionally restore if failed? Use says "remove", so I won't restore.
        }
    };

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-morphism rounded-3xl overflow-hidden shadow-2xl relative"
        >
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50" />
            
            <div className="flex bg-slate-950/50 p-2 m-4 rounded-xl border border-white/5">
                {(['User', 'Dealer'] as LoginRole[]).map(role => (
                    <button 
                        key={role}
                        onClick={() => setActiveTab(role)}
                        className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-widest rounded-lg transition-all duration-300 ${activeTab === role ? 'bg-cyan-500 text-slate-950 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        {role}
                    </button>
                ))}
            </div>

            <div className="p-8 pt-4">
                <form onSubmit={handleLoginSubmit} className="space-y-6">
                    <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-400 mb-2 tracking-widest ml-1">Account ID</label>
                        <input 
                            type="text" 
                            value={loginId} 
                            onChange={(e) => setLoginId(e.target.value)} 
                            className="w-full bg-slate-950/50 border border-white/10 rounded-xl p-3.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all font-mono"
                            placeholder={`Enter ${activeTab} ID`}
                        />
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-2 px-1">
                            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Password</label>
                            <button type="button" onClick={onForgotPassword} className="text-[10px] uppercase font-bold text-cyan-400 hover:text-cyan-300">Forgot?</button>
                        </div>
                        <div className="relative">
                            <input 
                                type={isPasswordVisible ? 'text' : 'password'} 
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)} 
                                className="w-full bg-slate-950/50 border border-white/10 rounded-xl p-3.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all font-mono pr-12"
                                placeholder="••••••••"
                            />
                            <button 
                                type="button" 
                                onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                            >
                                {isPasswordVisible ? <Icons.eyeOff className="w-5 h-5" /> : <Icons.eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>

                    <AnimatePresence>
                        {error && (
                            <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium text-center"
                            >
                                {error}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <motion.button 
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        type="submit" 
                        disabled={isAuthenticating}
                        className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-sm uppercase py-4 rounded-xl shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                        {isAuthenticating ? (
                            <div className="w-5 h-5 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
                        ) : (
                            <>Sign In <Icons.checkCircle className="w-4 h-4" /></>
                        )}
                    </motion.button>
                </form>
            </div>
        </motion.div>
    );
});

const ModalWrapper = React.memo<{ isOpen: boolean; onClose: () => void; children: React.ReactNode; color?: string }>(({ isOpen, onClose, children, color = "cyan" }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className={`relative w-full max-w-md glass-morphism rounded-3xl overflow-hidden border-${color}-400/20`}
                    >
                        <div className={`absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-${color}-500 to-transparent opacity-50`} />
                        {children}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
});

const AdminLoginModal: React.FC<{ isOpen: boolean; onClose: () => void; onForgotPassword: () => void }> = ({ isOpen, onClose, onForgotPassword }) => {
    const { login } = useAuth();
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isAuthenticating, setIsAuthenticating] = useState(false);

    // Clear credentials when modal opens/closes
    React.useEffect(() => {
        if (!isOpen) {
            setLoginId('');
            setPassword('');
            setError(null);
        }
    }, [isOpen]);

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!loginId.trim() || !password.trim()) { setError("Access credentials required."); return; }
        setError(null);
        setIsAuthenticating(true);

        const idToTry = loginId;
        const passToTry = password;
        
        // Reset fields immediately upon clicking login as requested
        setLoginId('');
        setPassword('');

        try { 
            await login(idToTry, passToTry); 
        } catch (err) { 
            setError(err instanceof Error ? err.message : "Authentication failed."); 
            setIsAuthenticating(false);
        }
    };

    return (
        <ModalWrapper isOpen={isOpen} onClose={onClose} color="red">
            <div className="p-8">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h3 className="text-xl font-bold text-white uppercase tracking-tighter">Admin Access</h3>
                        <p className="text-xs text-slate-500 font-medium tracking-wide">Enter root terminal credentials</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                        <Icons.close className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                <form onSubmit={handleLoginSubmit} className="space-y-6">
                    <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-400 mb-2 tracking-widest ml-1">Terminal ID</label>
                        <input 
                            type="text" 
                            value={loginId} 
                            onChange={(e) => setLoginId(e.target.value)} 
                            className="w-full bg-slate-950/50 border border-white/10 rounded-xl p-3.5 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all font-mono"
                            placeholder="ADMIN_ID"
                        />
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-2 px-1">
                            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Secret Key</label>
                            <button type="button" onClick={onForgotPassword} className="text-[10px] uppercase font-bold text-red-400 hover:text-red-300">Lost Key?</button>
                        </div>
                        <div className="relative">
                            <input 
                                type={isPasswordVisible ? 'text' : 'password'} 
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)} 
                                className="w-full bg-slate-950/50 border border-white/10 rounded-xl p-3.5 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all font-mono pr-12"
                                placeholder="••••••••"
                            />
                            <button 
                                type="button" 
                                onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                            >
                                {isPasswordVisible ? <Icons.eyeOff className="w-5 h-5" /> : <Icons.eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>

                    <AnimatePresence>
                        {error && (
                            <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium text-center"
                            >
                                {error}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <motion.button 
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        type="submit" 
                        disabled={isAuthenticating}
                        className="w-full bg-red-500 hover:bg-red-400 text-slate-950 font-black text-sm uppercase py-4 rounded-xl shadow-lg shadow-red-500/20 transition-all"
                    >
                        {isAuthenticating ? "Verifying..." : "Authorize Access"}
                    </motion.button>
                </form>
            </div>
        </ModalWrapper>
    );
};

const ResetPasswordModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
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
        if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }
        if (!loginId || !contact || !newPassword) { setError("All fields required."); return; }
        setIsLoading(true);
        try {
            const msg = await resetPassword(loginId, contact, newPassword);
            setSuccess(msg);
        } catch (err) { 
            setError(err instanceof Error ? err.message : "Reset failed."); 
        } finally { 
            setIsLoading(false); 
        }
    };

    return (
        <ModalWrapper isOpen={isOpen} onClose={onClose}>
            <div className="p-8">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-white uppercase tracking-tighter">Security Reset</h3>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full">
                        <Icons.close className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                {success ? (
                    <div className="space-y-6">
                        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium text-center">
                            {success}
                        </div>
                        <button onClick={onClose} className="w-full bg-cyan-500 text-slate-950 font-black text-sm uppercase py-4 rounded-xl shadow-lg">Done</button>
                    </div>
                ) : (
                    <form onSubmit={handleResetSubmit} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-2 tracking-widest ml-1">Account ID</label>
                                <input type="text" value={loginId} onChange={(e) => setLoginId(e.target.value)} className="w-full bg-slate-950/50 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:ring-1 focus:ring-cyan-500" />
                            </div>
                            <div>
                                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-2 tracking-widest ml-1">Contact</label>
                                <input type="text" value={contact} onChange={(e) => setContact(e.target.value)} className="w-full bg-slate-950/50 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:ring-1 focus:ring-cyan-500" placeholder="03XXXXXXXXX" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-2 tracking-widest ml-1">New Password</label>
                            <input type={isNewPasswordVisible ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full bg-slate-950/50 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:ring-1 focus:ring-cyan-500" />
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-2 tracking-widest ml-1">Confirm Password</label>
                            <input type={isNewPasswordVisible ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full bg-slate-950/50 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:ring-1 focus:ring-cyan-500" />
                        </div>

                        {error && <div className="text-red-400 text-[11px] text-center font-bold tracking-tight">{error}</div>}

                        <motion.button 
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            type="submit" 
                            disabled={isLoading}
                            className="w-full mt-4 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-sm uppercase py-4 rounded-xl shadow-lg transition-all"
                        >
                            {isLoading ? "Processing..." : "Update Security"}
                        </motion.button>
                    </form>
                )}
            </div>
        </ModalWrapper>
    );
};

const AdminResetInfoModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    return (
        <ModalWrapper isOpen={isOpen} onClose={onClose} color="red">
            <div className="p-8 flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20">
                    <Icons.sparkles className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-xl font-bold text-white uppercase tracking-tighter mb-4">Manual Override Required</h3>
                <p className="text-slate-400 text-sm font-medium leading-relaxed mb-8">
                    Administrator security keys cannot be reset via the client terminal. Contact global support at <span className="text-cyan-400">admin-support@ababa.exchange</span> for identity verification.
                </p>
                <button onClick={onClose} className="w-full bg-slate-800 text-white font-bold text-xs uppercase tracking-widest py-4 rounded-xl border border-white/10 hover:bg-slate-700 transition-colors">Acknowledge</button>
            </div>
        </ModalWrapper>
    );
};

const LandingPage: React.FC<{ games: Game[] }> = ({ games }) => {
    const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
    const [isResetModalOpen, setIsResetModalOpen] = useState(false);
    const [isAdminResetModalOpen, setIsAdminResetModalOpen] = useState(false);
    
    return (
        <div className="min-h-screen bg-mesh text-slate-200 overflow-x-hidden">
            <AdminLoginModal isOpen={isAdminModalOpen} onClose={() => setIsAdminModalOpen(false)} onForgotPassword={() => { setIsAdminModalOpen(false); setIsAdminResetModalOpen(true); }} />
            <ResetPasswordModal isOpen={isResetModalOpen} onClose={() => setIsResetModalOpen(false)} />
            <AdminResetInfoModal isOpen={isAdminResetModalOpen} onClose={() => setIsAdminResetModalOpen(false)} />

            {/* Nav */}
            <nav className="h-24 flex items-center justify-between max-w-7xl mx-auto px-6 relative z-50">
                <div className="flex items-center gap-3 group cursor-pointer">
                    <div className="w-10 h-10 bg-cyan-500 rounded-lg flex items-center justify-center transform group-hover:rotate-12 transition-transform">
                        <span className="text-slate-950 font-black text-xl">A</span>
                    </div>
                    <span className="text-xl font-bold tracking-tighter text-white">BABA <span className="text-cyan-400">EXCHANGE</span></span>
                </div>
                
                <button 
                    onClick={() => setIsAdminModalOpen(true)}
                    className="glass px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-red-400 transition-colors flex items-center gap-2 border border-white/5"
                >
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    Admin Terminal
                </button>
            </nav>

            <main className="max-w-7xl mx-auto px-6 pt-12 pb-24">
                <div className="grid lg:grid-cols-12 gap-16 items-start">
                    {/* Left content: Hero & Games */}
                    <div className="lg:col-span-8 space-y-20">
                        <section>
                            <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.6 }}
                            >
                                <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-white mb-6 leading-none">
                                    THE FUTURE <br /> OF <span className="text-shimmer italic">WINNING.</span>
                                </h1>
                                <p className="text-lg text-slate-400 max-w-xl font-medium leading-relaxed">
                                    The choice of Champions. A-Baba Exchange offers the smoothest digital lottery experience with real-time payouts and hierarchical management.
                                </p>
                            </motion.div>
                        </section>

                        <section className="space-y-8">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold uppercase tracking-widest text-white flex items-center gap-3">
                                    Live Markets
                                    <span className="flex h-2 w-2 relative">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                </h2>
                                <p className="text-xs font-medium text-slate-500">Update every 5s</p>
                            </div>
                            
                            {games.length === 0 ? (
                                <div className="h-64 flex flex-col items-center justify-center glass rounded-3xl border border-white/5">
                                    <div className="w-10 h-10 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mb-4" />
                                    <p className="text-xs font-bold tracking-widest text-slate-500 uppercase">Connecting to Feed...</p>
                                </div>
                            ) : (
                                <motion.div 
                                    className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6"
                                    initial="hidden"
                                    animate="visible"
                                    variants={{
                                        visible: { transition: { staggerChildren: 0.05 } }
                                    }}
                                >
                                    {games.map(game => (
                                        <GameDisplayCard 
                                            key={game.id} 
                                            game={game} 
                                            onClick={() => document.getElementById('login-panel-container')?.scrollIntoView({ behavior: 'smooth' })} 
                                        />
                                    ))}
                                </motion.div>
                            )}
                        </section>
                    </div>

                    {/* Right content: Sticky Login */}
                    <aside className="lg:col-span-4 sticky top-12" id="login-panel-container">
                        <LoginPanel onForgotPassword={() => setIsResetModalOpen(true)} />
                        
                        <div className="mt-12 p-6 glass rounded-2xl border border-white/5 space-y-4">
                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-300">New around here?</h4>
                            <p className="text-[11px] text-slate-500 leading-relaxed font-medium">To create an account and start playing, please contact your nearest authorized Dealer for registration and wallet top-ups.</p>
                            <div className="flex items-center gap-2 text-[10px] font-bold text-cyan-400 uppercase tracking-widest">
                                <Icons.checkCircle className="w-3.5 h-3.5" /> Secure & Verified
                            </div>
                        </div>
                    </aside>
                </div>
            </main>

            <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6 opacity-40">
                <p className="text-xs font-medium">&copy; {new Date().getFullYear()} A-BABA EXCHANGE. AUTHORIZED PLATFORM.</p>
                <div className="flex items-center gap-8">
                    {['Terms', 'Privacy', 'Compliance'].map(link => (
                        <a key={link} href="#" className="text-[10px] font-bold uppercase tracking-widest hover:text-white transition-colors">{link}</a>
                    ))}
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
