import { jest } from '@jest/globals';
import { ThreatWindsClient } from '../src/core';
import { AnalyticsClient } from '../src/analytics/analytics-client';

describe('AnalyticsClient.getEntityDetails field mapping', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockFetch = jest.fn<any>();

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = mockFetch;
  });

  beforeEach(() => mockFetch.mockReset());

  function analytics() {
    return new AnalyticsClient(
      new ThreatWindsClient({
        baseUrl: 'https://api.threatwinds.com',
        apiKey: 'k',
        apiSecret: 's',
      }),
    );
  }

  function respond(body: Record<string, unknown>) {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      headers: new Map(),
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
  }

  it('keeps first_seen, last_seen, label and tags', async () => {
    respond({
      attributes: {
        id: 'ip-abc',
        type: 'ip',
        ip: '8.8.8.8',
        label: 'IP',
        first_seen: '2025-05-17T01:20:11.176691819Z',
        last_seen: '2025-05-17T01:20:11.191398362Z',
        tags: ['dns', 'google'],
      },
    });

    const d = await analytics().getEntityDetails('ip-abc');

    expect(d.attributes.firstSeen).toBe('2025-05-17T01:20:11.176691819Z');
    expect(d.attributes.lastSeen).toBe('2025-05-17T01:20:11.191398362Z');
    expect(d.attributes.label).toBe('IP');
    expect(d.attributes.tags).toEqual(['dns', 'google']);
  });

  it('nulls the seen dates when absent rather than emitting empty strings', async () => {
    respond({ attributes: { id: 'ip-abc', type: 'ip', ip: '8.8.8.8' } });

    const d = await analytics().getEntityDetails('ip-abc');

    expect(d.attributes.firstSeen).toBeNull();
    expect(d.attributes.lastSeen).toBeNull();
    expect(d.attributes.tags).toEqual([]);
  });

  it('keeps seen dates on each association', async () => {
    respond({
      attributes: { id: 'ip-abc', type: 'ip', ip: '8.8.8.8' },
      latest_associations: [
        {
          id: 'threat-xyz',
          type: 'threat',
          threat: 'phishing',
          reputation_score: -3,
          first_seen: '2023-07-15T13:31:01Z',
          last_seen: '2025-08-22T11:59:20Z',
        },
      ],
    });

    const d = await analytics().getEntityDetails('ip-abc');

    expect(d.latestAssociations?.[0].firstSeen).toBe('2023-07-15T13:31:01Z');
    expect(d.latestAssociations?.[0].lastSeen).toBe('2025-08-22T11:59:20Z');
  });
});
