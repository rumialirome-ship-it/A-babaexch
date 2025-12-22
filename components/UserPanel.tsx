
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, Game, SubGameType, LedgerEntry, Bet, PrizeRates, BetLimits } from '../types';
import { Icons } from '../constants';
import { useCountdown } from '../hooks/useCountdown';

const getTodayDateString = () => new Date().toISOString().split('T')[0];

const GameSkeleton = () => (
    <div className="bg-slate-800/50 rounded-lg p-4 flex flex-col border border-slate-700 h-48 opacity-40">
        <div className="flex items-center mb-3">
            <div className="w-12 h-12 rounded-full skeleton mr-4"></div>
            <div className="space-y-2">
                <div className="h-4 w-24 skeleton rounded"></div>
                <div className="h-3 w-16 skeleton rounded"></div>
            </div>
        </div>
        <div className="flex-grow flex flex-col justify-center items-center">
            <div className="h-2 w-16 skeleton rounded mb-2"></div>
            <div className="h-8 w-32 skeleton rounded"></div>
        </div>
        <div className="h-10 w-full skeleton rounded mt-2"></div>
    </div>
);

const LedgerView: React.FC<{ entries: LedgerEntry[] }> = ({ entries }) => {
    const [startDate, setStartDate] = useState(getTodayDateString());
    const [endDate, setEndDate] = useState(getTodayDateString());

    const filteredEntries = useMemo(() => {
        if (!startDate && !endDate) return entries;
        return entries.filter(entry => {
            const entryDateStr = entry.timestamp.toISOString().split('T')[0];
            if (startDate && entryDateStr < startDate) return false;
            if (endDate && entryDateStr > endDate) return false;
            return true;
        });
    }, [entries, startDate, endDate]);

    const handleClearFilters = () => {
        setStartDate('');
        setEndDate('');
    };

    const inputClass = "w-full bg-slate-800 p-2 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none text-white";

    return (
        <div className="mt-12">
            <h3 className="text-xl md:text-2xl font-bold mb-4 text-sky-400 uppercase tracking-widest">My Ledger</h3>

            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">From Date</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={`${inputClass} font-sans`} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">To Date</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={`${inputClass} font-sans`} />
                    </div>
                    <div className="flex items-center">
                        <button onClick={handleClearFilters} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-md transition-colors text-xs uppercase">Show All History</button>
                    </div>
                </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                <div className="overflow-x-auto max-h-[30rem] mobile-scroll-x">
                    <table className="w-full text-left min-w-[600px]">
                        <thead className="bg-slate-800/50 sticky top-0 backdrop-blur-sm">
                            <tr>
                                <th className="p-4 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                                <th className="p-4 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Description</th>
                                <th className="p-4 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right">Debit</th>
                                <th className="p-4 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right">Credit</th>
                                <th className="p-4 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right">Balance</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {[...filteredEntries].reverse().map(entry => (
                                <tr key={entry.id} className="hover:bg-sky-500/10 transition-colors text-sm">
                                    <td className="p-4 text-slate-400 whitespace-nowrap">{entry.timestamp.toLocaleString()}</td>
                                    <td className="p-4 text-white font-medium">{entry.description}</td>
                                    <td className="p-4 text-right text-red-400 font-mono font-bold">{entry.debit > 0 ? entry.debit.toFixed(2) : '-'}</td>
                                    <td className="p-4 text-right text-green-400 font-mono font-bold">{entry.credit > 0 ? entry.credit.toFixed(2) : '-'}</td>
                                    <td className="p-4 text-right font-bold text-white font-mono">{entry.balance.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const formatTime12h = (time24: string) => {
    const [hours, minutes] = time24.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
};

const GameCard: React.FC<{ game: Game; onPlay: (game: Game) => void; isRestricted: boolean; }> = ({ game, onPlay, isRestricted }) => {
    const { status, text: countdownText } = useCountdown(game.drawTime);
    const isPlayable = !!game.isMarketOpen && !isRestricted && status === 'OPEN';
    const isMarketClosedForDisplay = !game.isMarketOpen || status === 'CLOSED';

    return (
        <div className={`bg-slate-800/50 rounded-lg shadow-lg p-4 flex flex-col justify-between transition-all duration-300 border border-slate-700 ${!isPlayable ? 'opacity-60' : 'hover:shadow-cyan-500/20 hover:-translate-y-1 hover:border-cyan-500/50'}`}>
            <div>
                <div className="flex items-center mb-3">
                    <img src={game.logo} alt={game.name} className="w-12 h-12 rounded-full mr-4 border-2 border-slate-600" />
                    <div>
                        <h3 className="text-xl text-white uppercase tracking-wider">{game.name}</h3>
                        <p className="text-sm text-slate-400">Draw at {formatTime12h(game.drawTime)}</p>
                    </div>
                </div>
                <div className={`text-center my-4 p-2 rounded-lg bg-slate-900/50 border-t border-slate-700`}>
                    {isMarketClosedForDisplay ? (
                        <div className="text-lg font-mono font-bold text-red-400 py-1 uppercase">Closed</div>
                    ) : status === 'OPEN' ? (
                        <>
                            <div className="text-[10px] uppercase tracking-wider text-slate-400">CLOSES IN</div>
                            <div className="text-2xl font-mono font-bold text-cyan-300">{countdownText}</div>
                        </>
                    ) : (
                         <div className="text-sm font-mono font-bold text-slate-400 py-1 uppercase">Opens: {countdownText}</div>
                    )}
                </div>
            </div>
             {game.winningNumber && <div className="text-center font-bold text-lg text-emerald-400 mt-2 mb-2">WINNER: {game.winningNumber}</div>}
            <button onClick={() => onPlay(game)} disabled={!isPlayable} className="w-full mt-2 bg-sky-600 text-white font-bold py-3 px-4 rounded-md transition-all duration-300 enabled:hover:bg-sky-500 enabled:hover:shadow-lg enabled:hover:shadow-sky-500/30 disabled:bg-slate-700 disabled:cursor-not-allowed uppercase text-sm tracking-widest">
                PLAY NOW
            </button>
        </div>
    );
};

const UserPanel: React.FC<any> = ({ user, games, bets, placeBet }) => {
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [isLoading, setIsLoading] = useState(games.length === 0);

  useEffect(() => {
      if (games.length > 0) setIsLoading(false);
  }, [games]);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-800/50 p-6 rounded-lg mb-12 border border-slate-700 gap-6">
        <div className="flex items-center">
            {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="w-16 h-16 rounded-full mr-5 border-2 border-sky-400 object-cover"/>
            ) : (
                <div className="w-16 h-16 rounded-full mr-5 border-2 border-sky-400 bg-slate-700 flex items-center justify-center">
                    <span className="text-3xl font-bold text-white">{user.name.charAt(0)}</span>
                </div>
            )}
            <div>
              <h2 className="text-2xl font-bold text-white uppercase tracking-wider">{user.name}</h2>
              <p className="text-slate-400 text-sm">Welcome back to A-Baba Exchange</p>
            </div>
        </div>
        <div className="bg-slate-950 p-4 rounded-md text-center w-full md:w-auto border border-slate-700 shadow-inner">
            <p className="text-xs text-slate-500 uppercase font-bold tracking-widest mb-1">AVAILABLE BALANCE</p>
            <p className="font-mono font-bold text-2xl text-emerald-400">Rs.{user.wallet.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="mb-20">
        <h2 className="text-2xl font-bold text-sky-400 mb-8 uppercase tracking-widest border-l-4 border-sky-500 pl-4">Today's Markets</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => <GameSkeleton key={i} />)
            ) : (
                games.map((game: Game) => (
                    <GameCard key={game.id} game={game} onPlay={setSelectedGame} isRestricted={user.isRestricted} />
                ))
            )}
        </div>
      </div>
      
      <LedgerView entries={user.ledger} />
    </div>
  );
};

export default UserPanel;
