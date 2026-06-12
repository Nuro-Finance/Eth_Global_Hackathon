/**
 * 📊 Preliminary Database Schema for Nuro Finance
 * This file defines the core data models for Richard's backend integration.
 */

export interface NuroUser {
  /** Uniquely identifying DID (e.g. did:privy:...) */
  id: string;
  /** Branded Member ID (e.g. Nuro User 1234567890) */
  memberId: string;
  /** Primary display name (Social or Generated) */
  displayName: string;
  /** Primary contact email */
  email: string;
  /** Profile avatar URL string */
  avatar?: string;
  /** User role for permissions (user, admin) */
  role: 'user' | 'admin';
  /** Account creation timestamp */
  createdAt: string;
  /** List of linked blockchain wallets */
  wallets: NuroWallet[];
  /** Subscription details */
  subscription: NuroSubscription;
}

export interface NuroWallet {
  address: string;
  chain: 'base' | 'solana' | 'ethereum';
  nickname?: string;
  isManaged: boolean; // True if it's a Nuro-hosted smart wallet
  balance_usd: number;
}

export interface NuroSubscription {
  type: 'free' | 'pro' | 'elite';
  status: 'active' | 'expired' | 'canceled';
  expiresAt?: string;
}

/** 
 * 🛠️ Preliminary API Responses
 */
export interface UserProfileResponse {
  user: NuroUser;
  meta: {
    lastUpdated: string;
    version: string;
  };
}
