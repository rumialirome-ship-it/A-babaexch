
export enum Role {
  Admin = 'ADMIN',
  Dealer = 'DEALER',
  User = 'USER',
}

export interface PrizeRates {
  oneDigitOpen: number;
  oneDigitClose: number;
  twoDigit: number;
}

// Added BetLimits interface to resolve errors in DealerPanel and UserPanel
export interface BetLimits {
  oneDigit: number;
  twoDigit: number;
}

export interface LedgerEntry {
  id: string;
  timestamp: Date;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface BaseAccount {
  id: string;
  name: string;
  password: string;
  area: string;
  contact: string;
  wallet: number;
  commissionRate: number;
  isRestricted: boolean;
  ledger: LedgerEntry[];
  avatarUrl?: string;
}

export interface User extends BaseAccount {
  dealerId: string;
  prizeRates: PrizeRates;
  // Added betLimits to resolve errors in DealerPanel where it is accessed and set
  betLimits?: BetLimits;
}

export interface Dealer extends BaseAccount {
  prizeRates: PrizeRates;
}

export interface Admin {
  id: string;
  name: string;
  password: string;
  wallet: number;
  prizeRates: PrizeRates;
  avatarUrl?: string;
  ledger: LedgerEntry[];
}

export interface Game {
  id: string;
  name: string;
  drawTime: string; // HH:MM (24h format)
  winningNumber?: string;
  isMarketOpen: boolean;
  // Added logo and payoutsApproved to resolve errors in AdminPanel templates and logic
  logo?: string;
  payoutsApproved?: boolean;
}

export enum SubGameType {
    OneDigitOpen = "1 Digit Open",
    OneDigitClose = "1 Digit Close",
    TwoDigit = "2 Digit",
    // Added Bulk and Combo types to resolve enum property errors in UserPanel
    Bulk = "Bulk",
    Combo = "Combo",
}

export interface Bet {
  id: string;
  userId: string;
  gameId: string;
  // Added dealerId to resolve errors in AdminPanel where bets are grouped by dealer
  dealerId: string;
  subGameType: SubGameType;
  numbers: string[];
  amountPerNumber: number;
  totalAmount: number;
  timestamp: Date;
}

// Added NumberLimit interface to resolve error in AdminPanel component state and form handling
export interface NumberLimit {
  id: number;
  gameType: '1-open' | '1-close' | '2-digit';
  numberValue: string;
  limitAmount: number;
}
