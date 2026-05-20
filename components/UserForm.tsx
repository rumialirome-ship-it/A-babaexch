import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User, PrizeRates } from '../types';
import { Icons } from '../constants';

export const UserForm = React.memo<{ 
    user?: User; 
    users: User[]; 
    onSave: (user: User, originalId?: string, initialDeposit?: number) => Promise<void>; 
    onCancel: () => void; 
    dealerPrizeRates: PrizeRates, 
    dealerId: string;
    showToast: (msg: string, type: 'success' | 'error') => void 
}>(({ user, users, onSave, onCancel, dealerId, showToast }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [formData, setFormData] = useState(() => {
        if (user) {
            return {
                id: user.id,
                name: user.name,
                contact: user.contact || '',
                area: user.area || '',
                password: '',
                wallet: user.wallet.toString(),
                commissionRate: (user.commissionRate ?? 0).toString(),
                betLimits: {
                    oneDigit: (user.betLimits?.oneDigit ?? 1000).toString(),
                    twoDigit: (user.betLimits?.twoDigit ?? 5000).toString(),
                    perDraw: (user.betLimits?.perDraw ?? 20000).toString(),
                },
                prizeRates: {
                    oneDigitOpen: (user.prizeRates?.oneDigitOpen ?? 9.50).toString(),
                    oneDigitClose: (user.prizeRates?.oneDigitClose ?? 9.50).toString(),
                    twoDigit: (user.prizeRates?.twoDigit ?? 85.00).toString()
                },
                avatarUrl: user.avatarUrl || ''
            };
        }
        return {
            id: '', name: '', area: '', contact: '', 
            commissionRate: '0', 
            prizeRates: { oneDigitOpen: '9.50', oneDigitClose: '9.50', twoDigit: '85.00' }, 
            avatarUrl: '', wallet: '0',
            betLimits: { oneDigit: '1000', twoDigit: '5000', perDraw: '20000' }
        };
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        if (name.includes('.')) {
            const [parent, child] = name.split('.');
            setFormData(prev => ({ 
                ...prev, 
                [parent]: { 
                    ...(prev[parent as keyof typeof prev] as object), 
                    [child]: value 
                } 
            }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const activePass = user ? (password || user.password) : password;
        
        if (!user && !password) { showToast("⚠️ Password is required.", "error"); return; }
        if (password && password !== confirmPassword) { showToast("⚠️ Passwords do not match.", "error"); return; }
        
        const isIdTaken = !user && users.some(u => u.id.toLowerCase() === formData.id.toLowerCase());
        if (isIdTaken) { showToast("⚠️ Username already exists.", "error"); return; }

        setIsLoading(true);
        try {
            const userPayload: User = {
                id: formData.id,
                name: formData.name,
                contact: formData.contact,
                area: formData.area,
                password: activePass,
                dealerId,
                wallet: Number(formData.wallet) || 0,
                commissionRate: Number(formData.commissionRate) || 0,
                isRestricted: user?.isRestricted ?? false,
                ledger: [], 
                avatarUrl: formData.avatarUrl,
                betLimits: {
                    oneDigit: Number(formData.betLimits.oneDigit) || 0,
                    twoDigit: Number(formData.betLimits.twoDigit) || 0,
                    perDraw: Number(formData.betLimits.perDraw) || 0
                },
                prizeRates: {
                    oneDigitOpen: Number(formData.prizeRates.oneDigitOpen) || 0,
                    oneDigitClose: Number(formData.prizeRates.oneDigitClose) || 0,
                    twoDigit: Number(formData.prizeRates.twoDigit) || 0
                }
            };

            await onSave(userPayload, user?.id, user ? undefined : Number(formData.wallet));
            showToast(user ? "✅ User updated successfully!" : "✅ User added successfully!", "success");
            onCancel();
        } catch (err: any) {
            showToast(`⚠️ ${err.message || 'Error processing user'}`, 'error');
        } finally {
            setIsLoading(false); 
        }
    };

    const inputClass = "w-full bg-slate-950/50 p-3.5 rounded-xl border border-white/10 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 text-white text-sm transition-all font-medium placeholder:text-slate-600";
    const labelClass = "block text-[10px] font-black text-slate-500 mb-1.5 uppercase tracking-widest ml-1";

    return (
        <form onSubmit={handleSubmit} className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                    <label className={labelClass}>Account Username</label>
                    <input type="text" name="id" value={formData.id} onChange={handleChange} className={inputClass} required disabled={!!user} placeholder="e.g. player_xyz" />
                </div>
                <div>
                    <label className={labelClass}>Customer Full Name</label>
                    <input type="text" name="name" value={formData.name} onChange={handleChange} className={inputClass} required placeholder="e.g. Muhammad Khan" />
                </div>
                <div>
                    <label className={labelClass}>Registered Contact</label>
                    <input type="tel" name="contact" value={formData.contact} onChange={handleChange} className={inputClass} required placeholder="03XXXXXXXXX" />
                </div>
                <div>
                    <label className={labelClass}>Region / Sector</label>
                    <input type="text" name="area" value={formData.area} onChange={handleChange} className={inputClass} required placeholder="e.g. Lahore / Cantt" />
                </div>
                
                <div className="relative">
                    <label className={labelClass}>{user ? "Change Secret Password" : "Account Password"}</label>
                    <input type={isPasswordVisible ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className={inputClass + " pr-12"} required={!user} />
                    <button type="button" onClick={() => setIsPasswordVisible(!isPasswordVisible)} className="absolute right-4 top-9 text-slate-500 hover:text-slate-300 transition-colors">{isPasswordVisible ? <Icons.eyeOff className="w-5 h-5" /> : <Icons.eye className="w-5 h-5" />}</button>
                </div>
                <div>
                    <label className={labelClass}>Validate Password</label>
                    <input type={isPasswordVisible ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputClass} required={!!password} />
                </div>

                {!user && (
                    <div>
                        <label className={labelClass}>Initial Deposit (PKR)</label>
                        <input type="text" name="wallet" value={formData.wallet} onChange={handleChange} className={inputClass} placeholder="5000" />
                    </div>
                )}
                <div>
                    <label className={labelClass}>Network Commission (%)</label>
                    <input type="text" name="commissionRate" value={formData.commissionRate} onChange={handleChange} className={inputClass} placeholder="0.00" />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 p-6 rounded-3xl bg-white/[0.02] border border-white/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full" />
                <div className="sm:col-span-3">
                    <h4 className="text-xs font-black text-emerald-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                        <Icons.star className="w-3 h-3" />
                        Payout Multipliers
                    </h4>
                    <p className="text-[10px] text-slate-500 font-medium">Define profit ratios for won bets</p>
                </div>
                <div>
                    <label className={labelClass}>2 Digit Payout</label>
                    <input type="text" name="prizeRates.twoDigit" value={formData.prizeRates.twoDigit} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                    <label className={labelClass}>Open/Harf</label>
                    <input type="text" name="prizeRates.oneDigitOpen" value={formData.prizeRates.oneDigitOpen} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                    <label className={labelClass}>Close/Harf</label>
                    <input type="text" name="prizeRates.oneDigitClose" value={formData.prizeRates.oneDigitClose} onChange={handleChange} className={inputClass} />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 p-6 rounded-3xl bg-white/[0.02] border border-white/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-3xl rounded-full" />
                <div className="sm:col-span-3">
                    <h4 className="text-xs font-black text-cyan-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                        <Icons.sparkles className="w-3 h-3" />
                        Stake Thresholds
                    </h4>
                    <p className="text-[10px] text-slate-500 font-medium">Maximum allowed stake amounts</p>
                </div>
                <div>
                    <label className={labelClass}>Max (2 Digit)</label>
                    <input type="text" name="betLimits.twoDigit" value={formData.betLimits.twoDigit} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                    <label className={labelClass}>Max (1 Digit)</label>
                    <input type="text" name="betLimits.oneDigit" value={formData.betLimits.oneDigit} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                    <label className={labelClass}>Market CAP</label>
                    <input type="text" name="betLimits.perDraw" value={formData.betLimits.perDraw} onChange={handleChange} className={inputClass} />
                </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 border-t border-white/5">
                <button type="button" onClick={onCancel} className="px-8 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-sm transition-all border border-white/10">Discard</button>
                <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit" 
                    disabled={isLoading} 
                    className="px-12 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm transition-all flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/20 disabled:opacity-50"
                >
                    {isLoading ? <div className="w-5 h-5 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin"></div> : user ? "Update Account" : "Activate User Account"}
                </motion.button>
            </div>
        </form>
    );
});
