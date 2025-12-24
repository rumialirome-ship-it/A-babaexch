
import React, { useState, useEffect, useMemo } from 'react';

interface ResultRevealOverlayProps {
  gameName: string;
  winningNumber: string;
  onClose: () => void;
}

const TENSION_PHRASES = [
    "INITIALIZING DRAW...",
    "ANALYZING TICKETS...",
    "COSMIC LUCK ALIGNING...",
    "CALCULATING JACKPOT...",
    "STABILIZING QUANTUM ODDS...",
    "FATE IS DECIDING...",
    "ALMOST THERE...",
    "PREPARING FINAL RESULT...",
    "LOCKING IN WINNER..."
];

const Confetti: React.FC = () => {
    const pieces = useMemo(() => {
        return Array.from({ length: 60 }).map((_, i) => ({
            left: Math.random() * 100 + '%',
            delay: Math.random() * 3 + 's',
            color: ['#fbbf24', '#fcd34d', '#f59e0b', '#ffffff', '#94a3b8'][Math.floor(Math.random() * 5)],
            size: Math.random() * 10 + 5 + 'px'
        }));
    }, []);

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {pieces.map((p, i) => (
                <div 
                    key={i} 
                    className="confetti-piece" 
                    style={{ 
                        left: p.left, 
                        animationDelay: p.delay, 
                        backgroundColor: p.color,
                        width: p.size,
                        height: p.size,
                        borderRadius: Math.random() > 0.5 ? '50%' : '2px'
                    }} 
                />
            ))}
        </div>
    );
};

const ResultRevealOverlay: React.FC<ResultRevealOverlayProps> = ({ gameName, winningNumber, onClose }) => {
  const [phase, setPhase] = useState<'ROLLING' | 'REVEAL'>('ROLLING');
  const [displayNum, setDisplayNum] = useState('00');
  const [isShaking, setIsShaking] = useState(false);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // Total duration: 48.5 seconds (Original 3.5 + 45)
  const TOTAL_ROLL_TIME = 48500;

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    let phraseInterval: ReturnType<typeof setInterval>;
    let progressInterval: ReturnType<typeof setInterval>;

    if (phase === 'ROLLING') {
      // Numbers roll speed (changes based on elapsed time for tension)
      interval = setInterval(() => {
        const randomNum = winningNumber.length === 1 
          ? Math.floor(Math.random() * 10).toString()
          : Math.floor(Math.random() * 100).toString().padStart(2, '0');
        setDisplayNum(randomNum);
      }, 50);

      // Cycle phrases every 5 seconds
      phraseInterval = setInterval(() => {
        setPhraseIndex(prev => (prev + 1) % TENSION_PHRASES.length);
      }, 5000);

      // Track progress for visual effects
      progressInterval = setInterval(() => {
        setElapsed(prev => prev + 100);
      }, 100);

      const timer = setTimeout(() => {
        setPhase('REVEAL');
        setDisplayNum(winningNumber);
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500);
      }, TOTAL_ROLL_TIME);

      return () => {
        clearInterval(interval);
        clearInterval(phraseInterval);
        clearInterval(progressInterval);
        clearTimeout(timer);
      };
    }
  }, [phase, winningNumber]);

  const intensity = elapsed / TOTAL_ROLL_TIME; // 0 to 1

  return (
    <div className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950 transition-all duration-700 ${isShaking ? 'animate-shake' : ''}`}>
      
      {/* Dynamic Background Effects */}
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
        <div 
            className="w-[250vw] h-[250vw] opacity-30 animate-spotlight"
            style={{ 
                animationDuration: `${10 - (intensity * 8)}s`,
                background: `conic-gradient(from 0deg, transparent 0deg, transparent 40deg, ${intensity > 0.8 ? 'rgba(251,191,36,0.5)' : 'rgba(6,182,212,0.4)'} 45deg, transparent 50deg, transparent 90deg, ${intensity > 0.8 ? 'rgba(251,191,36,0.5)' : 'rgba(6,182,212,0.4)'} 95deg, transparent 100deg)`
            }}
        ></div>
        
        {/* Intense heat blur effect in final 10 seconds */}
        {phase === 'ROLLING' && intensity > 0.8 && (
            <div className="absolute inset-0 backdrop-blur-[2px] opacity-50 animate-pulse bg-red-500/5"></div>
        )}

        {phase === 'REVEAL' && (
            <div className="absolute inset-0 bg-gradient-to-t from-amber-500/30 via-transparent to-transparent animate-pulse"></div>
        )}
      </div>

      {phase === 'REVEAL' && <Confetti />}

      <div className="relative z-10 text-center px-4">
        {/* Header Section */}
        <div className="mb-8">
            <h2 className={`text-lg md:text-2xl font-bold tracking-[0.4em] uppercase transition-all duration-1000 ${phase === 'REVEAL' ? 'text-amber-400' : 'text-cyan-400/60'}`}>
                {phase === 'REVEAL' ? '★ WINNING RESULT ★' : TENSION_PHRASES[phraseIndex]}
            </h2>
            <div className={`h-1 w-48 mx-auto mt-2 transition-all duration-500 ${phase === 'REVEAL' ? 'bg-amber-500' : 'bg-slate-700'}`}>
                <div 
                    className="h-full bg-cyan-400 transition-all duration-100 ease-linear" 
                    style={{ width: phase === 'REVEAL' ? '100%' : `${intensity * 100}%` }}
                ></div>
            </div>
        </div>

        <h1 className={`text-5xl md:text-8xl font-black uppercase tracking-tighter mb-10 transition-all duration-1000 ${phase === 'REVEAL' ? 'text-white scale-110 drop-shadow-[0_0_20px_rgba(255,255,255,0.5)]' : 'text-slate-500'}`}>
          {gameName}
        </h1>

        {/* The 3D Lottery Ball */}
        <div className="relative inline-block group">
            {/* Inner Glow / Core */}
            <div className={`absolute inset-0 rounded-full blur-3xl transition-all duration-1000 ${phase === 'REVEAL' || intensity > 0.8 ? 'bg-amber-500/40 scale-150' : 'bg-cyan-500/20'}`}></div>
            
            {/* The Main Ball Container */}
            <div className={`
                w-56 h-56 md:w-80 md:h-80 rounded-full border-[12px] relative flex items-center justify-center transition-all duration-700
                ${phase === 'REVEAL' 
                    ? 'border-amber-400 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 shadow-[0_0_80px_rgba(251,191,36,0.6)]' 
                    : intensity > 0.8 
                    ? 'border-orange-500 bg-slate-900 shadow-[0_0_60px_rgba(249,115,22,0.4)] animate-pulse'
                    : 'border-cyan-500 bg-slate-900 shadow-[0_0_40px_rgba(6,182,212,0.3)]'}
            `}>
                {/* Gloss Effect */}
                <div className="absolute top-[10%] left-[15%] w-[40%] h-[30%] bg-gradient-to-b from-white/20 to-transparent rounded-[50%] rotate-[-30deg]"></div>
                
                <div className={`
                    text-8xl md:text-[10rem] font-black font-mono tracking-tighter transition-all
                    ${phase === 'REVEAL' ? 'text-white animate-reveal-slam-intense' : 'text-cyan-400/80'}
                `}>
                    {displayNum}
                </div>
                
                {/* Secondary ring for 3D depth */}
                <div className="absolute inset-2 border-2 border-white/5 rounded-full"></div>
            </div>

            {/* Eruption Sparks on Reveal */}
            {(phase === 'REVEAL' || intensity > 0.9) && (
                <>
                    <div className="absolute -inset-10 border-4 border-amber-400/20 rounded-full animate-ping"></div>
                    <div className="absolute -inset-20 border border-white/10 rounded-full animate-[ping_1.5s_linear_infinite]"></div>
                </>
            )}
        </div>

        {/* Action / Celebration Text */}
        <div className="mt-12 h-32 flex flex-col items-center justify-center">
          {phase === 'REVEAL' ? (
            <div className="animate-[bounce_2s_infinite]">
              <div className="text-3xl md:text-5xl font-black text-amber-400 uppercase italic tracking-widest drop-shadow-lg mb-6">
                JACKPOT!
              </div>
              <button 
                onClick={onClose}
                className="group relative bg-white text-slate-900 font-black py-4 px-16 rounded-full overflow-hidden transition-all transform hover:scale-110 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.4)]"
              >
                <span className="relative z-10 text-xl tracking-widest">COLLECT WINNINGS</span>
                <div className="absolute inset-0 bg-gradient-to-r from-amber-400 to-orange-500 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-300"></div>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
                <p className={`text-xl font-bold uppercase tracking-[0.8em] transition-colors duration-500 ${intensity > 0.8 ? 'text-orange-500 animate-pulse' : 'text-cyan-400'}`}>
                    {intensity > 0.8 ? 'FINALIZING' : 'GENERATING'}
                </p>
                <div className="flex gap-2 justify-center">
                    <div className={`w-2 h-2 rounded-full animate-bounce ${intensity > 0.8 ? 'bg-orange-500' : 'bg-cyan-500'}`} style={{animationDelay: '0s'}}></div>
                    <div className={`w-2 h-2 rounded-full animate-bounce ${intensity > 0.8 ? 'bg-orange-500' : 'bg-cyan-500'}`} style={{animationDelay: '0.2s'}}></div>
                    <div className={`w-2 h-2 rounded-full animate-bounce ${intensity > 0.8 ? 'bg-orange-500' : 'bg-cyan-500'}`} style={{animationDelay: '0.4s'}}></div>
                </div>
                <div className="text-slate-500 text-xs font-mono uppercase tracking-widest opacity-50">
                    Confidence Level: {(intensity * 100).toFixed(0)}%
                </div>
            </div>
          )}
        </div>
      </div>

      {/* Futuristic Frame Corners */}
      <div className={`absolute top-10 left-10 w-20 h-20 border-t-4 border-l-4 rounded-tl-3xl transition-colors duration-500 ${intensity > 0.8 ? 'border-orange-500/50' : 'border-cyan-500/30'}`}></div>
      <div className={`absolute top-10 right-10 w-20 h-20 border-t-4 border-r-4 rounded-tr-3xl transition-colors duration-500 ${intensity > 0.8 ? 'border-orange-500/50' : 'border-cyan-500/30'}`}></div>
      <div className={`absolute bottom-10 left-10 w-20 h-20 border-b-4 border-l-4 rounded-bl-3xl transition-colors duration-500 ${intensity > 0.8 ? 'border-orange-500/50' : 'border-cyan-500/30'}`}></div>
      <div className={`absolute bottom-10 right-10 w-20 h-20 border-b-4 border-r-4 rounded-br-3xl transition-colors duration-500 ${intensity > 0.8 ? 'border-orange-500/50' : 'border-cyan-500/30'}`}></div>
    </div>
  );
};

export default ResultRevealOverlay;
