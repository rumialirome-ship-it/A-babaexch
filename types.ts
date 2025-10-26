

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

export interface User extends BaseAccount {
  dealerId: string;
  prizeRates: PrizeRates;
  betLimit?: number;
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
  ledger: LedgerEntry[];
}

export interface Game {
  id: string;
  name:string;
  logo: string;
  drawTime: string; // HH:MM
  winningNumber?: string; // two-digit string e.g., "42"
  payoutsApproved?: boolean;
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