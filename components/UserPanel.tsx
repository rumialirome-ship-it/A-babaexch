
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, Game, SubGameType, LedgerEntry, Bet, PrizeRates, BetLimits } from '../types';
import { Icons } from '../constants';
import { useCountdown } from '../hooks/useCountdown';

const getTodayDateString = () => new Date().toISOString().split('T')[0];

const GameSkeleton = () => (
    <div className="bg-slate-800/50 rounded-lg p-4 flex flex-col border border-slate-700 h-48">
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

const TableSkeleton = () => (
    <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
        <table className="w-full text-left">
            <tbody className="divide-y divide-slate-800">
                {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                        {Array.from({ length: 5 }).map((_, j) => (
                            <td key={j} className="p-4"><div className="h-4 w-20 skeleton rounded"></div></td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
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
            <h3 className="text-2xl font-bold mb-4 text-sky-400 uppercase tracking-widest">My Ledger</h3>

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
                        <button onClick={handleClearFilters} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-md transition-colors">Show All History</button>
                    </div>
                </div>
            </div>

            {entries.length === 0 ? <TableSkeleton /> : (
                <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                    <div className="overflow-x-auto max-h-[30rem] mobile-scroll-x">
                        <table className="w-full text-left min-w-[700px]">
                            <thead className="bg-slate-800/50 sticky top-0 backdrop-blur-sm">
                                <tr>
                                    <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                                    <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Description</th>
                                    <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Debit</th>
                                    <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Credit</th>
                                    <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Balance</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {[...filteredEntries].reverse().map(entry => (
                                    <tr key={entry.id} className="hover:bg-sky-500/10 transition-colors">
                                        <td className="p-4 text-sm text-slate-400 whitespace-nowrap">{entry.timestamp.toLocaleString()}</td>
                                        <td className="p-4 text-white">{entry.description}</td>
                                        <td className="p-4 text-right text-red-400 font-mono">{entry.debit > 0 ? entry.debit.toFixed(2) : '-'}</td>
                                        <td className="p-4 text-right text-green-400 font-mono">{entry.credit > 0 ? entry.credit.toFixed(2) : '-'}</td>
                                        <td className="p-4 text-right font-semibold text-white font-mono">{entry.balance.toFixed(2)}</td>
                                    </tr>
                                ))}
                                {filteredEntries.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-slate-500">
                                            No ledger entries found for the selected date range.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};


const BetHistoryView: React.FC<{ bets: Bet[], games: Game[], user: User }> = ({ bets, games, user }) => {
    const [startDate, setStartDate] = useState(getTodayDateString());
    const [endDate, setEndDate] = useState(getTodayDateString());
    const [searchTerm, setSearchTerm] = useState('');

    const getBetOutcome = (bet: Bet) => {
        const game = games.find(g => g.id === bet.gameId);
        if (!game || !user || !game.winningNumber || game.winningNumber.includes('_')) return { status: 'Pending', payout: 0, color: 'text-amber-400' };

        const winningNumber = game.winningNumber;
        let winningNumbersCount = 0;

        bet.numbers.forEach(num => {
            let isWin = false;
            switch (bet.subGameType) {
                case SubGameType.OneDigitOpen:
                    if (winningNumber.length === 2) { isWin = num === winningNumber[0]; }
                    break;
                case SubGameType.OneDigitClose:
                    if (game.name === 'AKC') { isWin = num === winningNumber; } 
                    else if (winningNumber.length === 2) { isWin = num === winningNumber[1]; }
                    break;
                default: // Covers TwoDigit, Bulk, Combo
                    isWin = num === winningNumber;
                    break;
            }
            if (isWin) winningNumbersCount++;
        });

        if (winningNumbersCount > 0) {
            const getPrizeMultiplier = (rates: PrizeRates, subGameType: SubGameType) => {
                switch (subGameType) {
                    case SubGameType.OneDigitOpen: return rates.oneDigitOpen;
                    case SubGameType.OneDigitClose: return rates.oneDigitClose;
                    default: return rates.twoDigit;
                }
            };
            const payout = winningNumbersCount * bet.amountPerNumber * getPrizeMultiplier(user.prizeRates, bet.subGameType);
            return { status: 'Win', payout, color: 'text-green-400' };
        }
        return { status: 'Lost', payout: 0, color: 'text-red-400' };
    };

    const filteredBets = useMemo(() => {
        return bets.filter(bet => {
            const betDateStr = bet.timestamp.toISOString().split('T')[0];
            if (startDate && betDateStr < startDate) return false;
            if (endDate && betDateStr > endDate) return false;

            if (searchTerm.trim()) {
                const game = games.find(g => g.id === bet.gameId);
                const lowerSearchTerm = searchTerm.trim().toLowerCase();
                const gameNameMatch = game?.name.toLowerCase().includes(lowerSearchTerm);
                const subGameTypeMatch = bet.subGameType.toLowerCase().includes(lowerSearchTerm);
                if (!gameNameMatch && !subGameTypeMatch) return false;
            }
            return true;
        });
    }, [bets, games, startDate, endDate, searchTerm]);

    const handleClearFilters = () => {
        setStartDate('');
        setEndDate('');
        setSearchTerm('');
    };
    
    const inputClass = "w-full bg-slate-800 p-2 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none text-white";

    return (
        <div className="mt-12">
            <h3 className="text-2xl font-bold mb-4 text-sky-400 uppercase tracking-widest">My Bet History</h3>
            
            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                    <div>
                        <label htmlFor="start-date" className="block text-sm font-medium text-slate-400 mb-1">From Date</label>
                        <input id="start-date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={`${inputClass} font-sans`} />
                    </div>
                    <div>
                        <label htmlFor="end-date" className="block text-sm font-medium text-slate-400 mb-1">To Date</label>
                        <input id="end-date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={`${inputClass} font-sans`} />
                    </div>
                    <div className="md:col-span-2 lg:col-span-1">
                        <label htmlFor="search-term" className="block text-sm font-medium text-slate-400 mb-1">Game / Type</label>
                        <input id="search-term" type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="e.g., AK, 1 digit, LS3" className={inputClass} />
                    </div>
                    <div className="flex items-center">
                        <button onClick={handleClearFilters} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-md transition-colors">Clear Filters</button>
                    </div>
                </div>
            </div>

            {bets.length === 0 ? <TableSkeleton /> : (
                <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                    <div className="overflow-x-auto max-h-[30rem] mobile-scroll-x">
                        <table className="w-full text-left min-w-[700px]">
                            <thead className="bg-slate-800/50 sticky top-0 backdrop-blur-sm">
                                <tr>
                                    <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                                    <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Game</th>
                                    <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Bet Details</th>
                                    <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Stake (PKR)</th>
                                    <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Payout (PKR)</th>
                                    <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                            {[...filteredBets].reverse().map(bet => {
                                    const game = games.find(g => g.id === bet.gameId);
                                    const outcome = getBetOutcome(bet);
                                    return (
                                    <tr key={bet.id} className="hover:bg-sky-500/10 transition-colors">
                                        <td className="p-4 text-sm text-slate-400 whitespace-nowrap">{bet.timestamp.toLocaleString()}</td>
                                        <td className="p-4 text-white font-medium">{game?.name || 'Unknown'}</td>
                                        <td className="p-4 text-slate-300">
                                            <div className="font-semibold">{bet.subGameType}</div>
                                            <div className="text-xs text-slate-400 break-words" title={bet.numbers.join(', ')}>{bet.numbers.join(', ')}</div>
                                        </td>
                                        <td className="p-4 text-right text-red-400 font-mono">{bet.totalAmount.toFixed(2)}</td>
                                        <td className="p-4 text-right text-green-400 font-mono">{outcome.payout > 0 ? outcome.payout.toFixed(2) : '-'}</td>
                                        <td className="p-4 text-right font-semibold"><span className={outcome.color}>{outcome.status}</span></td>
                                    </tr>);
                            })}
                            {filteredBets.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-slate-500">
                                            No bets found matching your filters.
                                        </td>
                                    </tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
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
                        <>
                            <div className="text-xs uppercase tracking-widest text-slate-400">STATUS</div>
                            <div className="text-2xl font-mono font-bold text-red-400">MARKET CLOSED</div>
                        </>
                    ) : status === 'OPEN' ? (
                        <>
                            <div className="text-xs uppercase tracking-widest text-slate-400">TIME LEFT</div>
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
             {game.winningNumber && <div className="text-center font-bold text-lg text-emerald-400 mt-2">Winner: {game.winningNumber}</div>}
            <button onClick={() => onPlay(game)} disabled={!isPlayable} className="w-full mt-2 bg-sky-600 text-white font-bold py-2.5 px-4 rounded-md transition-all duration-300 enabled:hover:bg-sky-500 enabled:hover:shadow-lg enabled:hover:shadow-sky-500/30 disabled:bg-slate-700 disabled:cursor-not-allowed">
                PLAY NOW
            </button>
        </div>
    );
};

interface UserPanelProps {
  user: User;
  games: Game[];
  bets: Bet[];
  placeBet: (details: any) => Promise<void>;
}

const UserPanel: React.FC<UserPanelProps> = ({ user, games, bets, placeBet }) => {
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [isLoadingMain, setIsLoadingMain] = useState(games.length === 0);

  useEffect(() => {
      if (games.length > 0) setIsLoadingMain(false);
  }, [games]);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-800/50 p-4 rounded-lg mb-8 border border-slate-700 gap-4">
        <div className="flex items-center">
            {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="w-16 h-16 rounded-full mr-5 border-2 border-sky-400 object-cover"/>
            ) : (
                <div className="w-16 h-16 rounded-full mr-5 border-2 border-sky-400 bg-slate-700 flex items-center justify-center">
                    <span className="text-3xl font-bold">{user.name.charAt(0)}</span>
                </div>
            )}
            <div>
              <h2 className="text-2xl font-bold text-white uppercase tracking-wider">{user.name}</h2>
              <p className="text-slate-400">Welcome back! Ready to play?</p>
            </div>
        </div>
        <div className="flex items-center gap-4 w-full md:w-auto self-stretch">
            <div className="bg-slate-900/50 p-3 rounded-md text-center flex-1 border border-slate-700 flex flex-col justify-center">
                <p className="text-xs text-slate-400 uppercase">Balance</p>
                <p className="font-mono font-bold text-lg text-emerald-400">PKR {user.wallet.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            </div>
        </div>
      </div>

      <h2 className="text-3xl font-bold text-sky-400 mb-6 uppercase tracking-widest">Available Games</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {isLoadingMain ? (
            Array.from({ length: 8 }).map((_, i) => <GameSkeleton key={i} />)
        ) : (
            games.map(game => (
                <GameCard key={game.id} game={game} onPlay={setSelectedGame} isRestricted={user.isRestricted} />
            ))
        )}
      </div>
      
      <BetHistoryView bets={bets.filter(b => b.userId === user.id)} games={games} user={user} />
      <LedgerView entries={user.ledger} />
    </div>
  );
};

export default UserPanel;
