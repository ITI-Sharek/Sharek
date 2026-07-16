import { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'owner' | 'contributor' | 'admin';
  status: 'pending' | 'active' | 'suspended' | 'deactivated';
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  authSessionId: string;
}
