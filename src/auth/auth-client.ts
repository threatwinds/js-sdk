import { ThreatWindsClient, RequestOptions } from '../core/client';
import { APIError } from '../core/errors';
import {
  Acknowledgement,
  CreateEmailResponse,
  Email,
  KeyPair,
  KeyPairRequest,
  SessionCreationRequest,
  SessionCreationResponse,
  SessionInfo,
  SessionSummary,
  SessionVerificationRequest,
  SignUpRequest,
  UserLookupResponse,
  VerificationCodeRequest,
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

  /**
   * Confirms a key pair with the code emailed at creation. Until this
   * succeeds the pair exists but is not usable.
   */
  async verifyKeyPair(
    request: VerificationCodeRequest,
    options: RequestOptions = {},
  ): Promise<Acknowledgement> {
    return this.client.request('PUT', `${BASE}/keypair/verification`, {
      ...options,
      body: request,
    }) as Promise<Acknowledgement>;
  }

  /**
   * Addresses attached to the account, including unverified ones.
   *
   * The API answers 404 rather than an empty list when there are none, and
   * caps the result at ten with no pagination.
   */
  async listEmails(options: RequestOptions = {}): Promise<Email[]> {
    try {
      const raw = (await this.client.request('GET', `${BASE}/emails`, options)) as {
        emails?: Email[];
      };
      return raw?.emails ?? [];
    } catch (err) {
      if (err instanceof APIError && err.isNotFound()) return [];
      throw err;
    }
  }

  /** Adds an address. It is pending until `verifyEmail` succeeds. */
  async createEmail(
    address: string,
    options: RequestOptions = {},
  ): Promise<CreateEmailResponse> {
    return this.client.request('POST', `${BASE}/email`, {
      ...options,
      body: { address },
    }) as Promise<CreateEmailResponse>;
  }

  async verifyEmail(
    request: VerificationCodeRequest,
    options: RequestOptions = {},
  ): Promise<Acknowledgement> {
    return this.client.request('PUT', `${BASE}/email/verification`, {
      ...options,
      body: request,
    }) as Promise<Acknowledgement>;
  }

  async setPreferredEmail(
    emailID: string,
    options: RequestOptions = {},
  ): Promise<Acknowledgement> {
    return this.client.request('PUT', `${BASE}/email/preferred`, {
      ...options,
      body: { emailID },
    }) as Promise<Acknowledgement>;
  }

  /** The API refuses to delete the preferred address. Reassign preferred first. */
  async deleteEmail(emailID: string, options: RequestOptions = {}): Promise<Acknowledgement> {
    return this.client.request(
      'DELETE',
      `${BASE}/email/${encodeURIComponent(emailID)}`,
      options,
    ) as Promise<Acknowledgement>;
  }

  /**
   * Resolves a user id to their alias — the only human-readable identifier the
   * platform exposes for an author.
   *
   * Comment and entity-history records carry a bare `userID`, so this is the
   * join that turns `ea04845b-…` into `osmany`. The route is deliberately
   * public and deliberately minimal: it returns the alias and nothing else.
   *
   * Returns null when the user cannot be resolved, which the API signals two
   * different ways — both verified live:
   *
   * - **404** "the user account was not found" — no such account.
   * - **400** — the account exists but carries no alias
   *   (`auth-api/controllers/user.go` raises ErrorNoUserWithID for an empty
   *   alias, which is a 400 rather than the 404 you would expect).
   *
   * Both fold to null. Every other status still throws, so an outage cannot
   * quietly render every author as unknown.
   *
   * Callers choose how to present an unresolved author. The console renders
   * null as "Nemo".
   */
  async getUserAlias(userID: string, options: RequestOptions = {}): Promise<string | null> {
    try {
      const raw = (await this.client.request(
        'GET',
        `${BASE}/user/${encodeURIComponent(userID)}`,
        options,
      )) as { alias?: string } | null;
      const alias = raw?.alias;
      return typeof alias === 'string' && alias !== '' ? alias : null;
    } catch (err) {
      if (err instanceof APIError && (err.statusCode === 400 || err.statusCode === 404)) {
        return null;
      }
      throw err;
    }
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
