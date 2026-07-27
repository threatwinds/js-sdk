import { ThreatWindsClient, RequestOptions } from '../core/client';
import { APIError } from '../core/errors';
import {
  AddMemberRequest,
  Customer,
  QuotaReport,
  ServiceLimits,
  TierLimits,
  TransferOwnershipRequest,
  UsageReport,
} from './billing-types';

const BASE = '/api/billing/v1';

/**
 * Client for the ThreatWinds Billing API — tier limits, live consumption and
 * resource quotas.
 *
 * Useful beyond invoicing: `getUsage` is how a client can show an analyst how
 * close they are to a rate limit before the API starts rejecting calls.
 */
export class BillingClient {
  constructor(private client: ThreatWindsClient) {}

  /** Returns `null` when the caller has no customer record yet. */
  async getCustomer(options: RequestOptions = {}): Promise<Customer | null> {
    try {
      return (await this.client.request('GET', `${BASE}/customer`, options)) as Customer;
    } catch (err) {
      if (err instanceof APIError && err.statusCode === 404) return null;
      throw err;
    }
  }

  async createCustomer(options: RequestOptions = {}): Promise<Customer> {
    return this.client.request('POST', `${BASE}/customer`, options) as Promise<Customer>;
  }

  /** Limit definitions for every service on the caller's tier. */
  async getLimits(options: RequestOptions = {}): Promise<TierLimits> {
    return this.client.request('GET', `${BASE}/limits`, options) as Promise<TierLimits>;
  }

  /** Limit definitions for one service, e.g. `ai-api`. */
  async getServiceLimits(
    serviceName: string,
    options: RequestOptions = {},
  ): Promise<ServiceLimits> {
    return this.client.request(
      'GET',
      `${BASE}/limits/${encodeURIComponent(serviceName)}`,
      options,
    ) as Promise<ServiceLimits>;
  }

  /** Live consumption for the authenticated user. */
  async getUsage(options: RequestOptions = {}): Promise<UsageReport> {
    return this.client.request('GET', `${BASE}/limits/usage`, options) as Promise<UsageReport>;
  }

  /** Live consumption attributed to the caller's IP, for anonymous access. */
  async getIpUsage(options: RequestOptions = {}): Promise<UsageReport> {
    return this.client.request('GET', `${BASE}/limits/usage/ip`, options) as Promise<UsageReport>;
  }

  /** Stateful resource caps, e.g. concurrent compute instances. */
  async getQuotas(options: RequestOptions = {}): Promise<QuotaReport> {
    return this.client.request('GET', `${BASE}/quotas/usage`, options) as Promise<QuotaReport>;
  }

  async addMember(request: AddMemberRequest, options: RequestOptions = {}): Promise<unknown> {
    return this.client.request('POST', `${BASE}/customer/member`, {
      ...options,
      body: request,
    });
  }

  async transferOwnership(
    request: TransferOwnershipRequest,
    options: RequestOptions = {},
  ): Promise<unknown> {
    return this.client.request('POST', `${BASE}/customer/transfer-ownership`, {
      ...options,
      body: request,
    });
  }
}
