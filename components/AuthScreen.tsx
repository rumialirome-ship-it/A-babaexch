
import React from 'react';
import { motion } from 'motion/react';
import { Role, User, Dealer, Admin } from '../types';
import { Icons } from '../constants';

interface AuthScreenProps {
  onLogin: (role: Role, account: User | Dealer | Admin) => void;
  users: User[];
  dealers: Dealer[];
  admin: Admin;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin, users, dealers, admin }) => {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-500/10 blur-[120px] rounded-full animate-pulse" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl relative z-10"
      >
        <div className="text-center mb-12">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-500 to-cyan-500 shadow-2xl shadow-emerald-500/20 mb-6"
          >
            <Icons.activity className="w-10 h-10 text-slate-950" />
          </motion.div>
          <h1 className="text-5xl font-black text-white uppercase tracking-tighter mb-2">
            A-Baba <span className="text-emerald-500">Exchange</span>
          </h1>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Integrated Asset Velocity Protocol</p>
        </div>

        <div className="glass-morphism rounded-[2.5rem] p-8 sm:p-12 shadow-2xl border border-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-3xl rounded-full -mr-32 -mt-32" />
          
          <div className="relative z-10 space-y-8">
            <div className="flex items-center gap-4">
               <div className="h-px flex-grow bg-white/5" />
               <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Authorized Access Selection</h2>
               <div className="h-px flex-grow bg-white/5" />
            </div>
            
            <div className="grid grid-cols-1 gap-4 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
              {/* Admin Node */}
              <motion.button
                whileHover={{ scale: 1.01, x: 5 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => onLogin(Role.Admin, admin)}
                className="w-full text-left p-6 bg-white/[0.02] hover:bg-red-500/10 rounded-3xl transition-all border border-white/5 hover:border-red-500/30 group relative overflow-hidden"
              >
                <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-4 group-hover:translate-x-0">
                  <Icons.moveUpRight className="w-6 h-6 text-red-400" />
                </div>
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 rounded-2xl bg-red-500/20 flex items-center justify-center border border-red-500/30">
                    <Icons.shield className="w-6 h-6 text-red-400" />
                  </div>
                  <div>
                    <p className="font-black text-xs text-red-400 uppercase tracking-widest mb-1">Central Authority</p>
                    <p className="text-white font-bold text-lg tracking-tight">{admin.name}</p>
                  </div>
                </div>
              </motion.button>

              {/* Dealer Nodes */}
              {dealers.map((dealer, idx) => (
                <motion.button
                  key={dealer.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  whileHover={{ scale: 1.01, x: 5 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => onLogin(Role.Dealer, dealer)}
                  className="w-full text-left p-6 bg-white/[0.02] hover:bg-emerald-500/10 rounded-3xl transition-all border border-white/5 hover:border-emerald-500/30 group relative overflow-hidden"
                >
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-4 group-hover:translate-x-0">
                    <Icons.moveUpRight className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                      <Icons.userGroup className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                      <p className="font-black text-[10px] text-emerald-400 uppercase tracking-widest mb-1">Regional Dealer Node</p>
                      <p className="text-white font-bold text-lg tracking-tight">{dealer.name}</p>
                    </div>
                  </div>
                </motion.button>
              ))}

              {/* User Nodes */}
              {users.map((user, idx) => (
                 <motion.button
                  key={user.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: (dealers.length + idx) * 0.1 }}
                  whileHover={{ scale: 1.01, x: 5 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => onLogin(Role.User, user)}
                  className="w-full text-left p-6 bg-white/[0.02] hover:bg-cyan-500/10 rounded-3xl transition-all border border-white/5 hover:border-cyan-500/30 group relative overflow-hidden"
                >
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-4 group-hover:translate-x-0">
                    <Icons.moveUpRight className="w-6 h-6 text-cyan-400" />
                  </div>
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 flex items-center justify-center border border-cyan-500/30">
                      <Icons.user className="w-6 h-6 text-cyan-400" />
                    </div>
                    <div>
                      <p className="font-black text-[10px] text-cyan-400 uppercase tracking-widest mb-1">Terminal User Node</p>
                      <p className="text-white font-bold text-lg tracking-tight">{user.name}</p>
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
            
            <p className="text-center text-[8px] font-black text-slate-600 uppercase tracking-[0.2em]">Secure Session End-to-End Encrypted</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default AuthScreen;
