export interface SessionCreationResponse {
  verificationCodeId: string;
  bearer: string;
}

export interface SessionVerificationRequest {
  verificationCodeId: string;
  code: string;
}

export interface SessionVerificationResponse {
  bearer: string;
}