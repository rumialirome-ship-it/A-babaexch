
import React, { useState, useEffect } from 'react';
import { Game } from '../types';
import { useCountdown } from '../hooks/useCountdown';
import { Icons, GAME_LOGOS } from '../constants';
import { useAuth } from '../hooks/useAuth';

// Helper function to format time to 12-hour AM/PM format
const formatTime12h = (time24: string) => {
    const [hours, minutes] = time24.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12; // Convert 0 to 12
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
            style={{
                clipPath: 'polygon(0 15px, 15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%)',
            }}
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

type LoginRole = 'User' | 'Dealer';

const LoginPanel: React.FC<{ onForgotPassword: () => void }> = ({ onForgotPassword }) => {
    const { login } = useAuth();
    const [activeTab, setActiveTab] = useState<LoginRole>('User');
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const roles: { name: LoginRole; theme: { text: string; ring: string; button: string; buttonHover: string; } }[] = [
        { name: 'User', theme: { text: 'text-cyan-400', ring: 'focus:ring-cyan-500', button: 'from-cyan-500 to-blue-500', buttonHover: 'hover:from-cyan-400 hover:to-blue-400' } },
        { name: 'Dealer', theme: { text: 'text-emerald-400', ring: 'focus:ring-emerald-500', button: 'from-emerald-500 to-green-500', buttonHover: 'hover:from-emerald-400 hover:to-green-400' } }
    ];

    const activeRole = roles.find(r => r.name === activeTab)!;

    const handleTabClick = (role: LoginRole) => {
        setActiveTab(role);
        setLoginId(''); setPassword(''); setError(null); setIsPasswordVisible(false);
    };
    
    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!loginId.trim() || !password.trim()) { setError("Account ID and Password are required."); return; }
        setError(null);
        try { 
            await login(loginId, password); 
        } catch (err) { 
            setError(err instanceof Error ? err.message : "An unknown login error occurred."); 
        }
    };

    return (
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg shadow-2xl border border-slate-700 overflow-hidden">
            <div className="p-1.5 flex items-center space-x-2 bg-black/20">
                {roles.map(role => (
                    <button key={role.name} onClick={() => handleTabClick(role.name)} className={`flex-1 py-2 px-4 text-sm uppercase tracking-widest rounded-md transition-all duration-300 ${activeTab === role.name ? `bg-slate-700 ${activeRole.theme.text} shadow-lg` : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`} aria-pressed={activeTab === role.name}>
                        {role.name}
                    </button>
                ))}
            </div>
            <div className="p-8">
                <form onSubmit={handleLoginSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="loginId" className="block text-sm font-medium text-slate-300 mb-1 uppercase tracking-wider">Account ID</label>
                        <input type="text" id="loginId" value={loginId} onChange={(e) => setLoginId(e.target.value)} className={`w-full bg-slate-900/50 p-3 rounded-md border border-slate-600 focus:ring-2 ${activeRole.theme.ring} focus:outline-none text-white placeholder-slate-500 transition-shadow duration-300 shadow-inner`} placeholder={`Enter ${activeTab} ID`} />
                    </div>
                    <div>
                         <div className="flex justify-between items-center mb-1">
                            <label htmlFor="password" className="block text-sm font-medium text-slate-300 uppercase tracking-wider">Password</label>
                            <button type="button" onClick={onForgotPassword} className="text-xs text-slate-400 hover:text-cyan-400 transition-colors">Forgot?</button>
                        </div>
                        <div className="relative">
                            <input type={isPasswordVisible ? 'text' : 'password'} id="password" value={password} onChange={(e) => setPassword(e.target.value)} className={`w-full bg-slate-900/50 p-3 rounded-md border border-slate-600 focus:ring-2 ${activeRole.theme.ring} focus:outline-none text-white placeholder-slate-500 transition-shadow duration-300 shadow-inner pr-10`} placeholder="Enter password" />
                             <button type="button" onClick={() => setIsPasswordVisible(!isPasswordVisible)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white" aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}>
                                {isPasswordVisible ? Icons.eyeOff : Icons.eye}
                            </button>
                        </div>
                    </div>
                    {error && <p role="alert" className="text-sm text-red-300 bg-red-500/20 p-3 rounded-md border border-red-500/30">{error}</p>}
                    <button type="submit" className={`w-full text-white font-bold py-3 px-4 rounded-md transition-all duration-300 transform hover:scale-105 hover:shadow-lg hover:shadow-cyan-500/20 bg-gradient-to-r ${activeRole.theme.button} ${activeRole.theme.buttonHover}`}>
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

const AdminLoginModal: React.FC<{ isOpen: boolean; onClose: () => void; onForgotPassword: () => void; }> = ({ isOpen, onClose, onForgotPassword }) => {
    const { login } = useAuth();
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const theme = { text: 'text-red-400', ring: 'focus:ring-red-500', button: 'from-red-600 to-rose-600', buttonHover: 'hover:from-red-500 hover:to-rose-500' };

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!loginId.trim() || !password.trim()) { setError("Admin ID and Password are required."); return; }
        setError(null);
        try { 
            await login(loginId, password);
        } catch (err) { 
            setError(err instanceof Error ? err.message : "An unknown login error occurred."); 
        }
    };
    
    return (
        <ModalWrapper isOpen={isOpen} onClose={onClose}>
            <div className="bg-slate-900/70 rounded-lg shadow-2xl w-full max-w-md border border-red-500/30">
                <div className="flex justify-between items-center p-5 border-b border-slate-700">
                    <h3 className={`text-lg font-bold ${theme.text} uppercase tracking-widest`}>Admin Access</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close modal">{Icons.close}</button>
                </div>
                <div className="p-8">
                    <form onSubmit={handleLoginSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1 uppercase tracking-wider">Admin ID</label>
                            <input type="text" value={loginId} onChange={(e) => setLoginId(e.target.value)} className={`w-full bg-slate-800/50 p-3 rounded-md border border-slate-600 focus:ring-2 ${theme.ring} focus:outline-none text-white`} />
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-sm font-medium text-slate-300 uppercase tracking-wider">Password</label>
                                <button type="button" onClick={onForgotPassword} className="text-xs text-slate-400 hover:text-red-400 transition-colors">Forgot?</button>
                            </div>
                            <div className="relative">
                                <input type={isPasswordVisible ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className={`w-full bg-slate-800/50 p-3 rounded-md border border-slate-600 focus:ring-2 ${theme.ring} focus:outline-none text-white pr-10`} />
                                <button type="button" onClick={() => setIsPasswordVisible(!isPasswordVisible)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white">
                                    {isPasswordVisible ? Icons.eyeOff : Icons.eye}
                                </button>
                            </div>
                        </div>
                        {error && <p className="text-sm text-red-300 bg-red-500/20 p-3 rounded-md border border-red-500/30">{error}</p>}
                        <button type="submit" className={`w-full text-white font-bold py-3 px-4 rounded-md transition-all duration-300 transform hover:scale-105 bg-gradient-to-r ${theme.button} ${theme.buttonHover}`}>
                            Authenticate
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
    const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleResetSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null); setSuccess(null);
        if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }
        if (!loginId || !contact || !newPassword) { setError("All fields are required."); return; }
        setIsLoading(true);
        try {
            const successMessage = await resetPassword(loginId, contact, newPassword);
            setSuccess(successMessage);
            setLoginId(''); setContact(''); setNewPassword(''); setConfirmPassword('');
        } catch (err) { setError(err instanceof Error ? err.message : "An unknown error occurred."); } 
        finally { setIsLoading(false); }
    };
    
    return (
        <ModalWrapper isOpen={isOpen} onClose={onClose}>
            <div className="bg-slate-900/70 rounded-lg shadow-2xl w-full max-w-md border border-cyan-500/30">
                <div className="flex justify-between items-center p-5 border-b border-slate-700">
                    <h3 className="text-lg font-bold text-white uppercase tracking-widest">Reset Password</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">{Icons.close}</button>
                </div>
                <div className="p-8">
                    {success ? (
                        <div className="text-center">
                            <p className="text-green-300 bg-green-500/20 p-4 rounded-md mb-4 border border-green-500/30">{success}</p>
                            <button onClick={onClose} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 px-4 rounded-md">CLOSE</button>
                        </div>
                    ) : (
                        <form onSubmit={handleResetSubmit} className="space-y-4">
                            <p className="text-sm text-slate-400 mb-2">Enter your Account ID and registered Contact to proceed.</p>
                             <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Account ID</label>
                                <input type="text" value={loginId} onChange={(e) => setLoginId(e.target.value)} className="w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500 text-white" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Contact Number</label>
                                <input type="text" value={contact} onChange={(e) => setContact(e.target.value)} className="w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500 text-white" placeholder="e.g. 03323022123" />
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">New Password</label>
                                <div className="relative">
                                    <input type={isNewPasswordVisible ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500 pr-10 text-white" />
                                    <button type="button" onClick={() => setIsNewPasswordVisible(!isNewPasswordVisible)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white">
                                        {isNewPasswordVisible ? Icons.eyeOff : Icons.eye}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Confirm New Password</label>
                                <div className="relative">
                                    <input type={isConfirmPasswordVisible ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500 pr-10 text-white" />
                                     <button type="button" onClick={() => setIsConfirmPasswordVisible(!isConfirmPasswordVisible)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white">
                                        {isConfirmPasswordVisible ? Icons.eyeOff : Icons.eye}
                                    </button>
                                </div>
                            </div>
                            {error && <p className="text-sm text-red-300 bg-red-500/20 p-3 rounded-md border border-red-500/30">{error}</p>}
                            <div className="pt-4">
                                <button type="submit" disabled={isLoading} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 px-4 rounded-md disabled:bg-slate-600 disabled:cursor-wait">
                                    {isLoading ? 'PROCESSING...' : 'RESET PASSWORD'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </ModalWrapper>
    );
};

const AdminResetInfoModal: React.FC<{ isOpen: boolean; onClose: () => void; }> = ({ isOpen, onClose }) => {
    return (
        <ModalWrapper isOpen={isOpen} onClose={onClose}>
            <div className="bg-slate-900/70 rounded-lg shadow-2xl w-full max-w-md border border-red-500/30">
                <div className="flex justify-between items-center p-5 border-b border-slate-700">
                    <h3 className="text-lg font-bold text-red-400 uppercase tracking-widest">Admin Recovery</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close modal">{Icons.close}</button>
                </div>
                <div className="p-8">
                    <p className="text-slate-300 text-center">For security, administrator password cannot be reset automatically. Please contact system support at <strong className="text-cyan-400">support@ababa.exchange</strong> to initiate recovery.</p>
                    <div className="mt-6">
                        <button onClick={onClose} className="w-full bg-slate-600 hover:bg-slate-500 text-white font-bold py-2.5 px-4 rounded-md">CLOSE</button>
                    </div>
                </div>
            </div>
        </ModalWrapper>
    );
};


const LandingPage: React.FC = () => {
    const [games, setGames] = useState<Game[]>([]);
    const [apiErrorInfo, setApiErrorInfo] = useState<{ error: string; details?: string; fix?: string } | null>(null);
    const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
    const [isResetModalOpen, setIsResetModalOpen] = useState(false);
    const [isAdminResetModalOpen, setIsAdminResetModalOpen] = useState(false);
    const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
    const [isRetrying, setIsRetrying] = useState(false);
    
    const fetchGames = async () => {
        setIsRetrying(true);
        try {
            const response = await fetch('/api/games');
            const data = await response.json();
            if (Array.isArray(data)) {
                setGames(data);
                setApiErrorInfo(null);
            } else if (data.error) {
                setApiErrorInfo({ error: data.error, details: data.details, fix: data.fix });
                setGames([]);
            } else {
                console.error("Games API did not return an array:", data);
                setGames([]);
            }
        } catch (error) {
            console.error("Failed to fetch games:", error);
            setApiErrorInfo({ error: "Network Error", details: "The connection to the backend was refused. Ensure PM2 is running." });
            setGames([]);
        } finally {
            setIsRetrying(false);
        }
    };

    useEffect(() => {
        fetchGames();
    }, []);

    const handleGameClick = () => {
        document.getElementById('login')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
                                    <h3 className="text-lg font-bold text-red-100 uppercase tracking-widest">System Integrity Warning</h3>
                                </div>
                                <button 
                                    onClick={fetchGames} 
                                    disabled={isRetrying}
                                    className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold py-1 px-4 rounded transition-all disabled:opacity-50"
                                >
                                    {isRetrying ? 'RE-INITIALIZING...' : 'RETRY CONNECTION'}
                                </button>
                            </div>

                            <div className="p-8 text-center">
                                <div className="text-red-400 mb-6 flex justify-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <h4 className="text-3xl font-bold text-white mb-2">{apiErrorInfo.error}</h4>
                                <p className="text-slate-300 text-lg mb-8 max-w-xl mx-auto">The database kernel failed to load. This is usually caused by a Node.js version mismatch after a system update.</p>

                                {apiErrorInfo.fix && (
                                    <div className="bg-emerald-500/10 border border-emerald-500/30 p-6 rounded-md mb-8 text-left relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 p-2 opacity-20 group-hover:opacity-100 transition-opacity">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                        </div>
                                        <h5 className="text-emerald-400 font-bold mb-3 uppercase text-xs tracking-widest flex items-center gap-2">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0l-1.4 5.76a1 1 0 01-1.03.77L.31 9.47c-1.62.14-2.18 2.21-.76 3.15l4.63 3.03a1 1 0 01.37 1.13l-1.4 5.76c-.38 1.56 1.8 3.14 3.23 2.19l4.63-3.03a1 1 0 011.1 0l4.63 3.03c1.43.95 3.61-.63 3.23-2.19l-1.4-5.76a1 1 0 01.37-1.13l4.63-3.03c1.42-.94.86-3.01-.76-3.15l-5.77-.23a1 1 0 01-1.03-.77l-1.4-5.76z" clipRule="evenodd" /></svg>
                                            RECOVERY PROCEDURE (Run in Server Terminal)
                                        </h5>
                                        <div className="bg-black/60 p-4 rounded font-mono text-sm border border-emerald-500/20 group-hover:border-emerald-500/50 transition-colors">
                                            <p className="text-emerald-300 leading-relaxed">$ cd backend</p>
                                            <p className="text-emerald-300 leading-relaxed">$ rm -rf node_modules package-lock.json</p>
                                            <p className="text-emerald-300 leading-relaxed">$ npm install</p>
                                            <p className="text-emerald-300 leading-relaxed">$ pm2 restart ababa-backend</p>
                                        </div>
                                    </div>
                                )}

                                {apiErrorInfo.details && (
                                    <div className="text-left">
                                        <button 
                                            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                                            className="text-slate-500 text-xs hover:text-slate-300 transition-colors uppercase tracking-widest font-bold flex items-center gap-1 mx-auto py-2"
                                        >
                                            {showTechnicalDetails ? '[-] HIDE' : '[+] SHOW'} DIAGNOSTIC LOGS
                                        </button>
                                        {showTechnicalDetails && (
                                            <div className="mt-4 p-5 bg-black/80 rounded border border-slate-800 shadow-inner font-mono text-xs text-red-300/80 leading-relaxed max-h-48 overflow-y-auto custom-scrollbar">
                                                <div className="mb-2 text-slate-500 uppercase tracking-tighter">[INITIALIZING STACK TRACE...]</div>
                                                {apiErrorInfo.details}
                                                <div className="mt-2 text-slate-500 uppercase tracking-tighter">[END OF LOG]</div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="bg-black/40 p-3 text-center border-t border-slate-800">
                                <p className="text-[10px] text-slate-600 uppercase tracking-[0.2em]">Service Status: <span className="text-red-900 font-bold">DEGRADED</span> | System ID: {window.location.hostname}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8">
                            {games.length > 0 ? games.map(game => (
                                <GameDisplayCard key={game.id} game={game} onClick={handleGameClick} />
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
                        <button onClick={() => setIsAdminModalOpen(true)} className="w-full text-white font-bold py-3 px-4 rounded-md transition-all duration-300 transform hover:scale-105 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 shadow-lg shadow-red-900/20">
                            ADMINISTRATOR ACCESS
                        </button>
                    </div>
                </section>

                <footer className="text-center py-8 mt-12 text-slate-500 font-sans">
                    <p>&copy; {new Date().getFullYear()} A-Baba Exchange. All rights reserved.</p>
                </footer>
            </div>
            
            <AdminLoginModal isOpen={isAdminModalOpen} onClose={() => setIsAdminModalOpen(false)} onForgotPassword={() => { setIsAdminModalOpen(false); setIsAdminResetModalOpen(true); }} />
            <ResetPasswordModal isOpen={isResetModalOpen} onClose={() => setIsResetModalOpen(false)} />
            <AdminResetInfoModal isOpen={isAdminResetModalOpen} onClose={() => setIsAdminResetModalOpen(false)} />
        </div>
    );
};

export default LandingPage;
