
export type UserRole = 'associate' | 'supplier';

export interface Company {
  cnpj: string;
  tradingName: string;
  phone: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface Negotiation {
  id: string;
  companyCnpj: string;
  supplierCnpj: string;
  amount: number | null;
  timestamp: string;
  notes: string;
}

export interface RegistrationSettings {
  allowAssociate: boolean;
  allowSupplier: boolean;
  allowNegotiations: boolean;
  googleSheetsWebhookUrl?: string;
}

export type AppView = 'login' | 'register' | 'dashboard' | 'forgot-password' | 'admin' | 'change-password';
