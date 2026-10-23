/** Boundary for a future regulated Open Finance provider. No bank credentials are collected. */
export interface BankConnection {
  id: string;
  institution: string;
  consentExpiresAt: string;
  scopes: string[];
}
export interface BankTransaction {
  externalId: string;
  accountExternalId: string;
  date: string;
  description: string;
  signedAmount: number;
  currency: "BRL";
}
export interface OpenFinanceProvider {
  beginConsent(redirectUri: string): Promise<{ authorizationUrl: string }>;
  connections(): Promise<BankConnection[]>;
  transactions(connectionId: string, since: string): Promise<BankTransaction[]>;
  revokeConsent(connectionId: string): Promise<void>;
}
