/**
 * Types for the ThreatWinds Billing API (`/api/billing/v1`).
 *
 * Two related but distinct concepts:
 * - **Limits** are rate/volume ceilings per tier, scoped to a time window
 *   (e.g. 60 model listings per minute, N chat completions per month).
 * - **Quotas** are stateful resource caps with no window (e.g. 6 compute
 *   instances), where `currentUsage` is a live count rather than a rolling one.
 */

export interface Customer {
  id: string
  /** Payment-provider customer id (Stripe). */
  gcid?: string
}

export interface LimitDefinition {
  value: number
  /** e.g. "minute", "month". */
  window: string
  description: string
}

/** Limit definitions keyed by feature, grouped by service. */
export interface TierLimits {
  customerId: string
  tierName: string
  limits: Record<string, Record<string, LimitDefinition>>
}

export interface ServiceLimits {
  customerId: string
  tierName: string
  serviceName: string
  limits: Record<string, LimitDefinition>
}

export interface FeatureUsage {
  featureKey: string
  currentUsage: number
  limit: number
  remaining: number
  tierName?: string
  window?: string
  description?: string
  /** Unix seconds; 0 when the window does not reset. */
  resetAt?: number
  /** True once the limit is exhausted and requests are being rejected. */
  isLocked?: boolean
  identifier?: string
  identifierType?: string
}

export interface ServiceUsage {
  serviceName: string
  features: FeatureUsage[]
}

export interface UsageReport {
  identifier: string
  /** "user" for an authenticated caller, "ip" for anonymous. */
  identifierType: string
  services: Record<string, ServiceUsage>
  totalFeatures: number
  fetchedAt: number
}

export interface QuotaReport {
  customerId: string
  services: Record<string, ServiceUsage>
  totalFeatures: number
  fetchedAt?: number
}

export interface AddMemberRequest {
  email: string
}

export interface TransferOwnershipRequest {
  email: string
}
