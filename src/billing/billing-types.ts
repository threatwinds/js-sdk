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

/**
 * Billing address for a customer.
 *
 * Every field is required by the API, and the whole address is forwarded to
 * Stripe as the customer's address — so these are real billing details, not
 * metadata that can be filled with placeholders.
 */
export interface BillingAddress {
  street: string
  city: string
  state: string
  postalCode: string
  /**
   * ISO 3166-1 alpha-2, uppercase. The API validates against its own table and
   * rejects anything else with a 400 naming the `country` field, so a spelled
   * out country name will not be accepted.
   */
  country: string
}

export interface CreateCustomerRequest {
  email: string
  /** Billing entity name, e.g. "Acme Corp". Becomes the Stripe customer name. */
  name: string
  billingAddress: BillingAddress
}

/** `POST /customer` acknowledges; it does not return the created customer. */
export interface CreateCustomerResponse {
  message: string
}

/** Membership role within a customer account. Billing actions require `owner`. */
export type CustomerRole = 'owner' | 'admin' | 'user'

export interface CustomerMember {
  roleID: string
  userID: string
  role: CustomerRole
}

export interface CustomerMembersPage {
  members: CustomerMember[]
  pages: number
  items: number
}

/** The caller's current plan, and whether a trial is still on the table. */
export interface CustomerTier {
  customerId: string
  tierId: string
  tierName: string
  description: string
  isActive: boolean
  /** `active`, `trialing`, `past_due`, `canceled`, `unpaid`, … */
  subscriptionStatus: string
  stacks: number
  /** Once true the 30-day trial is spent; upgrading then bills immediately. */
  trialUsed: boolean
}

export interface UpgradeToProRequest {
  /** Stripe returns the browser here on success. */
  successURL: string
  /** …and here if the checkout is abandoned. */
  cancelURL: string
}

export interface UpgradeToProResponse {
  checkoutURL: string
}

export interface CustomerPortalSession {
  url: string
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
