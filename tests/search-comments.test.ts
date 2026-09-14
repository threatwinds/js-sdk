import { jest } from '@jest/globals';
import { ThreatWindsClient } from '../src/core';
import { IngestClient } from '../src/ingest/ingest-client';
import { SearchClient } from '../src/search/search-client';

describe('IngestClient.createComment', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockFetch = jest.fn<any>();

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = mockFetch;
  });

  beforeEach(() => mockFetch.mockReset());

  function ingest() {
    return new IngestClient(
      new ThreatWindsClient({
        baseUrl: 'https://api.threatwinds.com',
        apiKey: 'k',
        apiSecret: 's',
      }),
    );
  }

  function respondOk() {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      headers: new Map(),
      json: async () => ({}),
      text: async () => '{}',
    });
  }

  function sentBody() {
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    return JSON.parse(init.body as string);
  }

  it('sends the field names the ingest API actually reads', async () => {
    respondOk();
    await ingest().createComment({ entityId: 'ip-abc', content: 'seen in a phishing kit' });

    const body = sentBody();
    // ingest-api/controllers/comment.go binds entityID / comment / parentID.
    expect(body.entityID).toBe('ip-abc');
    expect(body.comment).toBe('seen in a phishing kit');
    expect(body.entityId).toBeUndefined();
    expect(body.content).toBeUndefined();
  });

  it('omits parentID entirely for a top-level comment', async () => {
    respondOk();
    await ingest().createComment({ entityId: 'ip-abc', content: 'top level' });
    expect(sentBody().parentID).toBeUndefined();
  });

  it('sends parentID for a reply', async () => {
    respondOk();
    await ingest().createComment({
      entityId: 'ip-abc',
      content: 'replying',
      parentId: '7a1b3c2d-4e5f-46a7-8i9j-0k1l2m3n4o5p',
    });
    expect(sentBody().parentID).toBe('7a1b3c2d-4e5f-46a7-8i9j-0k1l2m3n4o5p');
  });
});

describe('SearchClient.listComments', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockFetch = jest.fn<any>();

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = mockFetch;
  });

  beforeEach(() => mockFetch.mockReset());

  function search() {
    return new SearchClient(
      new ThreatWindsClient({
        baseUrl: 'https://api.threatwinds.com',
        apiKey: 'k',
        apiSecret: 's',
      }),
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

  it('maps the indexed document to the SDK shape', async () => {
    respond(200, {
      items: 1,
      pages: 1,
      results: [
        {
          id: '7a1b-comment',
          '@timestamp': '2026-09-01T10:00:00.000Z',
          entityID: 'ip-abc',
          comment: 'known scanner',
          userID: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
          parentID: '00000000-0000-0000-0000-000000000000',
          visibleBy: ['public'],
        },
      ],
    });

    const page = await search().listComments('ip-abc');

    expect(page.items).toBe(1);
    expect(page.results[0].content).toBe('known scanner');
    expect(page.results[0].author).toBe('f47ac10b-58cc-4372-a567-0e02b2c3d479');
    expect(page.results[0].createdAt).toBe('2026-09-01T10:00:00.000Z');
    expect(page.results[0].parentId).toBe('00000000-0000-0000-0000-000000000000');
  });

  it('treats 404 as an empty page, not an error', async () => {
    respond(404, { error: { message: 'the comments you are looking for were not found' } });

    const page = await search().listComments('ip-quiet');

    expect(page.items).toBe(0);
    expect(page.results).toEqual([]);
    expect(page.next).toBeNull();
  });

  it('reports the next page number while pages remain', async () => {
    respond(200, { items: 30, pages: 3, results: [] });
    const page = await search().listComments('ip-abc', { page: 1 });
    expect(page.next).toBe(2);
  });

  it('reports no next page on the last one', async () => {
    respond(200, { items: 30, pages: 3, results: [] });
    const page = await search().listComments('ip-abc', { page: 3 });
    expect(page.next).toBeNull();
  });
});
