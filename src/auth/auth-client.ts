import { ThreatWindsClient, RequestOptions } from '../core/client';
import { APIError } from '../core/errors';
import {
  Acknowledgement,
  KeyPair,
  KeyPairRequest,
  SessionCreationRequest,
  SessionCreationResponse,
  SessionInfo,
  SessionSummary,
  SessionVerificationRequest,
  SignUpRequest,
  UserLookupResponse,
  VerificationSession,
  VerificationState,
} from './auth-types';

const BASE = '/api/auth/v2';

/**
 * Client for the ThreatWinds Auth API.
 *
 * Earlier versions targeted `/api/auth/v1` with `session/create` and
 * `session/verify`; the live API is v2 and uses different paths, methods and
 * field casing.
 *
 * Typical login:
 * ```ts
 * const started = await auth.createSession('analyst@example.com');
 * // user receives a one-time code by email
 * await auth.verifySession({ verificationCodeID: started.verificationCodeID, code });
 * auth.setBearerToken(started.bearer); // usable only after verification
 * ```
 */
export class AuthClient {
  constructor(private client: ThreatWindsClient) {}

  /**
   * Starts an email login. Emails a one-time code and returns a bearer that
   * only becomes usable once `verifySession` succeeds.
   */
  async createSession(
    email: string,
    opts: { kind?: SessionCreationRequest['kind'] } & RequestOptions = {},
  ): Promise<SessionCreationResponse> {
    const { kind = 'standard', ...options } = opts;
    return this.client.request('POST', `${BASE}/session`, {
      ...options,
      body: { email, kind },
    }) as Promise<SessionCreationResponse>;
  }

  /**
   * Registers a new user. Throws a 403 APIError when self-registration is
   * disabled server-side.
   */
  async signUp(
    request: SignUpRequest,
    options: RequestOptions = {},
  ): Promise<SessionCreationResponse> {
    return this.client.request('POST', `${BASE}/user`, {
      ...options,
      body: request,
    }) as Promise<SessionCreationResponse>;
  }

  /** Completes login or signup with the emailed code. */
  async verifySession(
    request: SessionVerificationRequest,
    options: RequestOptions = {},
  ): Promise<Acknowledgement> {
    return this.client.request('PUT', `${BASE}/session/verification`, {
      ...options,
      body: request,
    }) as Promise<Acknowledgement>;
  }

  /**
   * Details of the session behind the current bearer token. Returns `null` for
   * an absent, expired or rejected token, so callers can treat "signed out" as
   * an ordinary state rather than an error.
   */
  async getSession(options: RequestOptions = {}): Promise<SessionInfo | null> {
    try {
      return (await this.client.request('GET', `${BASE}/session`, options)) as SessionInfo;
    } catch (err) {
      if (err instanceof APIError && (err.statusCode === 401 || err.statusCode === 403)) {
        return null;
      }
      throw err;
    }
  }

  async extendSession(options: RequestOptions = {}): Promise<Acknowledgement> {
    return this.client.request('PUT', `${BASE}/session/extend`, options) as Promise<Acknowledgement>;
  }

  async closeSession(sessionID: string, options: RequestOptions = {}): Promise<Acknowledgement> {
    return this.client.request(
      'DELETE',
      `${BASE}/session/${encodeURIComponent(sessionID)}`,
      options,
    ) as Promise<Acknowledgement>;
  }

  async listSessions(options: RequestOptions = {}): Promise<SessionSummary[]> {
    const raw = (await this.client.request('GET', `${BASE}/sessions`, options)) as {
      sessions?: SessionSummary[];
    };
    return raw?.sessions ?? [];
  }

  /**
   * Creates a long-lived API key pair for programmatic access. `apiSecret` is
   * returned only here and cannot be recovered later.
   */
  async createKeyPair(request: KeyPairRequest, options: RequestOptions = {}): Promise<KeyPair> {
    return this.client.request('POST', `${BASE}/keypair`, {
      ...options,
      body: request,
    }) as Promise<KeyPair>;
  }

  /** Returns full unredacted API keys — treat the result as a secret. */
  async listKeyPairs(options: RequestOptions = {}): Promise<KeyPair[]> {
    const raw = (await this.client.request('GET', `${BASE}/keypairs`, options)) as {
      keys?: KeyPair[];
    };
    return raw?.keys ?? [];
  }

  async deleteKeyPair(keyID: string, options: RequestOptions = {}): Promise<Acknowledgement> {
    return this.client.request(
      'DELETE',
      `${BASE}/keypair/${encodeURIComponent(keyID)}`,
      options,
    ) as Promise<Acknowledgement>;
  }

  async findUserByEmail(email: string, options: RequestOptions = {}): Promise<string | null> {
    try {
      const raw = (await this.client.request('GET', `${BASE}/user/by-email`, {
        ...options,
        queryParams: { ...options.queryParams, email },
      })) as UserLookupResponse;
      return raw?.userID ?? null;
    } catch (err) {
      if (err instanceof APIError && err.statusCode === 404) return null;
      throw err;
    }
  }

  /**
   * Current identity-verification (KYC) state, including how many attempts
   * remain. Safe to poll.
   */
  async getVerificationStatus(options: RequestOptions = {}): Promise<VerificationState> {
    return this.client.request(
      'GET',
      `${BASE}/verify/status`,
      options,
    ) as Promise<VerificationState>;
  }

  /**
   * Starts identity verification and returns the provider URL the user must
   * visit to submit a document and selfie.
   *
   * Not idempotent in spirit — it consumes an attempt — so check
   * `getVerificationStatus` first and avoid calling it for an already-passed or
   * attempt-exhausted account.
   */
  async initiateVerification(options: RequestOptions = {}): Promise<VerificationSession> {
    return this.client.request('POST', `${BASE}/verify`, options) as Promise<VerificationSession>;
  }

  setBearerToken(token: string): void {
    this.client.setBearerToken(token);
  }
}
