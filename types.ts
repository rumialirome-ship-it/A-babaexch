
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

// Added BetLimits interface to fix missing member error
export interface BetLimits {
  oneDigit: number;
  twoDigit: number;
}

export interface User extends BaseAccount {
  dealerId: string;
  prizeRates: PrizeRates;
  // Updated to use the explicitly defined BetLimits interface
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
  ledger: LedgerEntry[];
}

export interface Game {
  id: string;
  name: string;
  drawTime: string;
  winningNumber?: string;
  isMarketOpen: boolean;
  payoutsApproved?: boolean;
  // Added logo property to resolve access error
  logo?: string;
}

export enum SubGameType {
  OneDigitOpen = "1 Digit Open",
  OneDigitClose = "1 Digit Close",
  TwoDigit = "2 Digit",
  // Added missing enum members to fix UserPanel errors
  Bulk = "Bulk",
  Combo = "Combo",
}

// Added NumberLimit interface to resolve missing member error in AdminPanel
export interface NumberLimit {
  id: number;
  gameType: '1-open' | '1-close' | '2-digit';
  numberValue: string;
  limitAmount: number;
}

export interface Bet {
  id: string;
  userId: string;
  dealerId: string;
  gameId: string;
  subGameType: SubGameType;
  numbers: string[];
  amountPerNumber: number;
  totalAmount: number;
  timestamp: Date;
}
