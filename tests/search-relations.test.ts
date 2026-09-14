import { jest } from '@jest/globals';
import { ThreatWindsClient } from '../src/core';
import { SearchClient } from '../src/search/search-client';

describe('SearchClient.getEntityRelations', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockFetch = jest.fn<any>();

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = mockFetch;
  });

  beforeEach(() => mockFetch.mockReset());

  function search() {
    return new SearchClient(
      new ThreatWindsClient({ baseUrl: 'https://api.threatwinds.com', apiKey: 'k', apiSecret: 's' }),
    );
  }

  function respond(status: number, body: Record<string, unknown>) {
    mockFetch.mockResolvedValueOnce({
      status,
      headers: new Map(),
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
  }

  it('maps a relation record, taking its value from the type-named attribute', async () => {
    respond(200, {
      items: 1,
      pages: 1,
      results: [
        {
          id: 'threat-9fb3',
          type: 'threat',
          '@timestamp': '2024-03-02T22:04:19.026Z',
          lastSeen: '2025-08-22T12:11:04.797Z',
          reputation: -3,
          accuracy: 2,
          attributes: { threat: 'carrying out attacks against honeypots' },
          tags: [],
          visibleBy: ['public'],
          wellKnown: false,
        },
      ],
    });

    const r = (await search().getEntityRelations('ip-abc')).results[0];

    expect(r.value).toBe('carrying out attacks against honeypots');
    expect(r.timestamp).toBe('2024-03-02T22:04:19.026Z');
    expect(r.lastSeen).toBe('2025-08-22T12:11:04.797Z');
    expect(r.reputation).toBe(-3);
  });

  it('passes a types filter as a comma-separated list', async () => {
    respond(200, { items: 0, pages: 0, results: [] });
    await search().getEntityRelations('ip-abc', { types: ['domain', 'url'] });
    expect(mockFetch.mock.calls[0][0]).toContain('types=domain%2Curl');
  });

  it('treats 404 as an empty page', async () => {
    respond(404, { error: { message: 'the relations you are looking for were not found' } });
    const page = await search().getEntityRelations('ip-quiet');
    expect(page.results).toEqual([]);
  });

  it('nulls lastSeen when absent', async () => {
    respond(200, { items: 1, pages: 1, results: [{ id: 'x', type: 'ip', attributes: { ip: '1.1.1.1' } }] });
    expect((await search().getEntityRelations('ip-abc')).results[0].lastSeen).toBeNull();
  });
});
