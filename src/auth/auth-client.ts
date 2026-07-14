import { ThreatWindsClient } from '../core/client';
import { SessionCreationResponse, SessionVerificationRequest, SessionVerificationResponse } from './auth-types';

export class AuthClient {
  constructor(private client: ThreatWindsClient) {}

  async createSession(email: string): Promise<SessionCreationResponse> {
    return this.client.request('POST', '/api/auth/v1/session/create', {
      body: { email },
    }) as Promise<SessionCreationResponse>;
  }

  async verifySession(request: SessionVerificationRequest): Promise<SessionVerificationResponse> {
    return this.client.request('POST', '/api/auth/v1/session/verify', {
      body: request,
    }) as Promise<SessionVerificationResponse>;
  }

  setBearerToken(token: string): void {
    this.client.setBearerToken(token);
  }
}