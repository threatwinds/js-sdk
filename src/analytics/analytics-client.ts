import { ThreatWindsClient } from '../core/client';
import { EntityDetails } from './analytics-types';

export class AnalyticsClient {
  constructor(private client: ThreatWindsClient) {}

  async getEntityDetails(id: string): Promise<EntityDetails> {
    return this.client.request('GET', `/api/analytics/v1/entity/${id}/details`) as Promise<EntityDetails>;
  }
}