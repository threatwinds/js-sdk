import { ThreatWindsClient } from '../core/client';
import { FeedListOptions, FeedList, Feed, Subscription } from './feeds-types';

export class FeedsClient {
  constructor(private client: ThreatWindsClient) {}

  async listFeeds(options?: FeedListOptions): Promise<FeedList> {
    const queryParams: Record<string, string> = {};
    if (options?.page !== undefined) {
      queryParams.page = String(options.page);
    }
    if (options?.limit !== undefined) {
      queryParams.limit = String(options.limit);
    }

    return this.client.request('GET', '/api/feeds/v1', {
      queryParams,
    }) as Promise<FeedList>;
  }

  async getFeed(id: string): Promise<Feed> {
    return this.client.request('GET', `/api/feeds/v1/${id}`) as Promise<Feed>;
  }

  async subscribeToFeed(id: string): Promise<Subscription> {
    return this.client.request('POST', `/api/feeds/v1/${id}/subscribe`) as Promise<Subscription>;
  }

  async unsubscribeFromFeed(id: string): Promise<void> {
    await this.client.request('DELETE', `/api/feeds/v1/${id}/unsubscribe`);
  }
}