import { jest } from '@jest/globals';
import { ThreatWindsClient } from '../src/core';
import { SearchClient } from '../src/search/search-client';

describe('SearchClient.getEntityHistory', () => {
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

  function sent() {
    return {
      url: mockFetch.mock.calls[0][0] as string,
      body: JSON.parse((mockFetch.mock.calls[0][1] as any).body as string),
    };
  }

  // This is the load-bearing assertion of the whole feature. A term on plain
  // `entityID` 404s and a `match` returns thousands of unrelated rows, because
  // the field is text-analyzed. Only the .keyword subfield matches exactly.
  it('filters on the entityID.keyword subfield', async () => {
    respond(200, { items: 0, pages: 0, results: [] });
    await search().getEntityHistory('ip-abc');

    const { url, body } = sent();
    expect(url).toContain('/api/search/v1/entities/history/advanced');
    expect(body.query.must).toEqual([{ term: { 'entityID.keyword': { value: 'ip-abc' } } }]);
  });

  it('maps a history record', async () => {
    respond(200, {
      items: 1,
      pages: 1,
      results: [
        {
          id: '1e26c46a',
          '@timestamp': '2026-09-02T11:31:32.088Z',
          entityID: 'ip-abc',
          type: 'ip',
          userID: 'ea04845b-d127-4bd6-ae1b-b5ef40a3a7a7',
          reputation: -2,
          accuracy: 2,
          attributes: { ip: '8.8.8.8' },
          tags: ['feed:spamhaus'],
          visibleBy: ['public'],
          wellKnown: false,
        },
      ],
    });

    const page = await search().getEntityHistory('ip-abc');
    const r = page.results[0];

    expect(r.timestamp).toBe('2026-09-02T11:31:32.088Z');
    expect(r.reputation).toBe(-2);
    expect(r.author).toBe('ea04845b-d127-4bd6-ae1b-b5ef40a3a7a7');
    expect(r.tags).toEqual(['feed:spamhaus']);
  });

  it('treats 404 as an empty page', async () => {
    respond(404, { error: { message: 'the entities you are looking for were not found' } });
    const page = await search().getEntityHistory('ip-quiet');
    expect(page.results).toEqual([]);
    expect(page.next).toBeNull();
  });

  it('defaults tags and attributes when the record omits them', async () => {
    respond(200, { items: 1, pages: 1, results: [{ id: 'x', entityID: 'ip-abc' }] });
    const r = (await search().getEntityHistory('ip-abc')).results[0];
    expect(r.tags).toEqual([]);
    expect(r.attributes).toEqual({});
  });
});
