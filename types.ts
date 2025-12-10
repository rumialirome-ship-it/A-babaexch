

export enum Role {
  Admin = 'ADMIN',
  Dealer = 'DEALER',
  User = 'USER',
}

export enum LedgerEntryType {
    INITIAL_BALANCE = 'INITIAL_BALANCE',
    DEPOSIT_ADMIN = 'DEPOSIT_ADMIN',
    WITHDRAWAL_ADMIN = 'WITHDRAWAL_ADMIN',
    DEPOSIT_DEALER = 'DEPOSIT_DEALER',
    WITHDRAWAL_DEALER = 'WITHDRAWAL_DEALER',
    BET_PLACED = 'BET_PLACED',
    BET_WIN = 'BET_WIN',
    COMMISSION_EARNED = 'COMMISSION_EARNED',
    DEALER_PROFIT = 'DEALER_PROFIT',
    MANUAL_ADJUSTMENT = 'MANUAL_ADJUSTMENT',
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
  type: LedgerEntryType;
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
  // FIX: The ledger property is expected by various components.
  ledger: LedgerEntry[]; 
  avatarUrl?: string;
}

export interface BetLimits {
  oneDigit: number;
  twoDigit: number;
}

export interface User extends BaseAccount {
  dealerId: string;
  prizeRates: PrizeRates;
  betLimits?: BetLimits;
}

export interface Dealer extends BaseAccount {
  prizeRates: PrizeRates;
}

export interface Admin {
  id: string;
  name: string;
  password: string;
  wallet: number; // Represents system earnings
  prizeRates: PrizeRates; // System-wide base rates
  avatarUrl?: string;
  // FIX: The ledger property is expected by various components.
  ledger: LedgerEntry[];
}

export interface Game {
  id: string;
  name:string;
  logo: string;
  drawTime: string; // HH:MM
  winningNumber?: string; // two-digit string e.g., "42"
  payoutsApproved?: boolean;
  isMarketOpen?: boolean;
}

export enum SubGameType {
    OneDigitOpen = "1 Digit Open",
    OneDigitClose = "1 Digit Close",
    TwoDigit = "2 Digit",
    Bulk = "Bulk Game",
    Combo = "Combo Game",
}

export interface Bet {
  id: string;
  userId: string;
  dealerId: string;
  gameId: string;
  subGameType: SubGameType;
  numbers: string[]; // e.g., ["14", "25"]
  amountPerNumber: number;
  totalAmount: number;
  timestamp: Date;
}

export interface NumberLimit {
  id: number;
  gameType: '1-open' | '1-close' | '2-digit';
  numberValue: string;
  limitAmount: number;
}

export interface DailyResult {
  id: string;
  gameId: string;
  date: string; // YYYY-MM-DD
  winningNumber: string;
}