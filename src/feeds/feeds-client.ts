import { ThreatWindsClient } from '../core/client';
import { FeedListOptions, FeedList, Feed, Subscription } from './feeds-types';

const FEEDS_BASE_URL = 'https://apis.threatwinds.com';

const feedsClientInstance: WeakMap<ThreatWindsClient, ThreatWindsClient> = new WeakMap();

function getFeedsApiClient(client: ThreatWindsClient): ThreatWindsClient {
  let apiClient = feedsClientInstance.get(client);
  if (!apiClient) {
    apiClient = new ThreatWindsClient({
      baseUrl: FEEDS_BASE_URL,
      bearer: client.bearer || 'public',
      timeout: client.timeout,
      maxRetries: client.maxRetries,
    });
    feedsClientInstance.set(client, apiClient);
  }
  return apiClient;
}

export class FeedsClient {
  private apiClient: ThreatWindsClient;

  constructor(private client: ThreatWindsClient) {
    this.apiClient = getFeedsApiClient(client);
  }

  async listFeeds(_options?: FeedListOptions): Promise<FeedList> {
    const raw = (await this.apiClient.request('GET', '/api/feeds/v1/list')) as any[];
    const feeds: Feed[] = (Array.isArray(raw) ? raw : []).map((item, i) => ({
      id: `${item.name}-${item.accuracy}-${item.type}`,
      name: item.name || `feed-${i}`,
      description: `Threat intelligence feed for ${item.name || 'unknown'} indicators (${item.type || 'accumulative'}, ${item.accuracy || 'level1'})`,
      type: item.type || 'accumulative',
      format: 'TXT',
      updatedAt: '',
    }));
    return { feeds, pages: 1, next: null };
  }

  async getFeed(id: string): Promise<Feed> {
    const raw = await this.apiClient.request('GET', `/api/feeds/v1/list`);
    const list = Array.isArray(raw) ? raw : [];
    const parts = id.split('-');
    const item = list.find((f: any) => `${f.name}-${f.accuracy}-${f.type}` === id);
    return {
      id,
      name: item?.name || id,
      description: '',
      type: item?.type || '',
      format: 'TXT',
      updatedAt: '',
    };
  }

  async subscribeToFeed(_id: string): Promise<Subscription> {
    return { id: '', feedId: _id, createdAt: new Date().toISOString() };
  }

  async unsubscribeFromFeed(_id: string): Promise<void> {
    // No-op: feeds API does not support subscriptions
    return;
  }
}