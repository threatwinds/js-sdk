/**
 * Types for the ThreatWinds Auth API (`/api/auth/v2`).
 *
 * Authentication is a two-step email flow: create a session (or register a
 * user), which emails a one-time code, then verify that code. The bearer token
 * is issued up front but only becomes usable once verification succeeds.
 *
 * Note the API spells the field `verificationCodeID` (capital D); earlier SDK
 * versions declared `verificationCodeId`, which never matched the wire format.
 */

/** `standard` is the normal interactive session kind. */
export type SessionKind = 'standard' | (string & {});

export interface SessionCreationRequest {
  email: string;
  kind?: SessionKind;
}

export interface SignUpRequest {
  email: string;
  fullName: string;
  alias: string;
}

/** Returned by both session creation and self-registration. */
export interface SessionCreationResponse {
  bearer: string;
  sessionID: string;
  /** Unix seconds. */
  expireAt: number;
  /** Pair this with the emailed code to complete verification. */
  verificationCodeID: string;
  kind?: SessionKind;
  ip?: string;
  userAgent?: string;
}

export interface SessionVerificationRequest {
  verificationCodeID: string;
  code: string;
}

export interface Acknowledgement {
  message: string;
}

/** The authenticated user behind the current bearer token. */
export interface SessionInfo {
  sessionID: string;
  userID: string;
  alias: string;
  fullName: string;
  expireAt: number;
  verified: boolean;
  kind?: SessionKind;
  ip?: string;
  roles: string[];
  groups: string[];
}

export interface SessionSummary {
  sessionID: string;
  ip?: string;
  userAgent?: string;
  expireAt: number;
  current: boolean;
  kind?: SessionKind;
}

export interface KeyPairRequest {
  name: string;
  /** Lifetime in days. */
  days: number;
}

/** `apiSecret` is only returned at creation time and cannot be retrieved later. */
export interface KeyPair {
  apiKey: string;
  apiSecret?: string;
  keyID: string;
  keyName: string;
  expireAt: number;
  verified: boolean;
  verificationCodeID?: string;
}

export interface UserLookupResponse {
  userID: string;
}

/**
 * Identity verification (KYC) state.
 *
 * `pending` means only that a verification session exists — NOT that a document
 * was submitted or that screening is running. Distinguishing the two requires
 * watching `attempts` increment.
 */
export type VerificationStatus = 'passed' | 'pending' | 'failed' | 'expired' | (string & {});

export interface VerificationAttempt {
  createdAt: string;
  status: string;
  failedReason?: string;
}

export interface VerificationState {
  status: VerificationStatus;
  attempts: number;
  maxAttempts: number;
  /** Populated from the verified document once screening passes. */
  country?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  nationality?: string;
  attemptsLog?: VerificationAttempt[];
}

/** Result of starting verification; `url` points at the identity provider. */
export interface VerificationSession extends Partial<VerificationState> {
  status: VerificationStatus;
  url?: string;
}

/** One address attached to an account. `id` is what delete and set-preferred take. */
export interface Email {
  id: string;
  address: string;
  verified: boolean;
  preferred: boolean;
}

/** `POST /email` confirms nothing by itself — the address is pending until verified. */
export interface CreateEmailResponse {
  verificationCodeID: string;
}

/**
 * Confirms a pending email or key pair.
 *
 * The `verificationCodeID` is issued once by the create call and cannot be
 * re-requested; there is no resend endpoint.
 */
export interface VerificationCodeRequest {
  verificationCodeID: string;
  code: string;
}
