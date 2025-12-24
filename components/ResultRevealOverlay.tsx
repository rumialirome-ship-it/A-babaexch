
import React, { useState, useEffect } from 'react';

interface ResultRevealOverlayProps {
  gameName: string;
  winningNumber: string;
  onClose: () => void;
}

const ResultRevealOverlay: React.FC<ResultRevealOverlayProps> = ({ gameName, winningNumber, onClose }) => {
  const [phase, setPhase] = useState<'ROLLING' | 'REVEAL'>('ROLLING');
  const [displayNum, setDisplayNum] = useState('00');

  useEffect(() => {
    // Rolling phase
    // Fix: replaced NodeJS.Timeout with ReturnType<typeof setInterval> for browser environment compatibility
    let interval: ReturnType<typeof setInterval>;
    if (phase === 'ROLLING') {
      interval = setInterval(() => {
        const randomNum = winningNumber.length === 1 
          ? Math.floor(Math.random() * 10).toString()
          : Math.floor(Math.random() * 100).toString().padStart(2, '0');
        setDisplayNum(randomNum);
      }, 50);

      // Duration of roll
      const timer = setTimeout(() => {
        setPhase('REVEAL');
        setDisplayNum(winningNumber);
      }, 3000);

      return () => {
        clearInterval(interval);
        clearTimeout(timer);
      };
    }
  }, [phase, winningNumber]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-xl">
      {/* Background Glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/10 via-transparent to-red-500/10 animate-pulse pointer-events-none"></div>
      
      <div className="relative z-10 text-center px-4">
        <h2 className="text-xl md:text-3xl font-bold text-slate-400 uppercase tracking-[0.3em] mb-2 animate-pulse">
          Official Draw Result
        </h2>
        <h1 className="text-4xl md:text-6xl font-black text-white uppercase tracking-wider mb-12 glitch-text" data-text={gameName}>
          {gameName}
        </h1>

        <div className="relative inline-block">
          {/* Outer Ring */}
          <div className={`w-48 h-48 md:w-64 md:h-64 rounded-full border-8 ${phase === 'REVEAL' ? 'border-emerald-500 shadow-[0_0_50px_rgba(16,185,129,0.5)]' : 'border-cyan-500 shadow-[0_0_30px_rgba(6,182,212,0.3)]'} flex items-center justify-center transition-all duration-500`}>
            <div className={`text-7xl md:text-9xl font-black font-mono tracking-tighter ${phase === 'REVEAL' ? 'text-emerald-400 animate-reveal-slam' : 'text-cyan-400'}`}>
              {displayNum}
            </div>
          </div>
          
          {/* Decorative Sparks for Reveal */}
          {phase === 'REVEAL' && (
             <div className="absolute -inset-4 border border-emerald-400/30 rounded-full animate-ping"></div>
          )}
        </div>

        <div className="mt-12 h-20">
          {phase === 'REVEAL' ? (
            <div className="space-y-6">
              <p className="text-2xl text-emerald-400 font-bold uppercase tracking-widest animate-bounce">
                Jackpot Winner!
              </p>
              <button 
                onClick={onClose}
                className="bg-white text-slate-900 font-black py-3 px-12 rounded-full hover:bg-emerald-400 hover:text-white transition-all transform hover:scale-110 active:scale-95 shadow-xl"
              >
                CONTINUE
              </button>
            </div>
          ) : (
            <p className="text-lg text-cyan-400/80 font-medium uppercase tracking-[0.5em] animate-pulse">
              Generating...
            </p>
          )}
        </div>
      </div>

      {/* Decorative corners */}
      <div className="absolute top-8 left-8 w-12 h-12 border-t-4 border-l-4 border-cyan-500/50"></div>
      <div className="absolute top-8 right-8 w-12 h-12 border-t-4 border-r-4 border-cyan-500/50"></div>
      <div className="absolute bottom-8 left-8 w-12 h-12 border-b-4 border-l-4 border-cyan-500/50"></div>
      <div className="absolute bottom-8 right-8 w-12 h-12 border-b-4 border-r-4 border-cyan-500/50"></div>
    </div>
  );
};

export default ResultRevealOverlay;
