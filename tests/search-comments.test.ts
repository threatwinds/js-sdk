import { jest } from '@jest/globals';
import { ThreatWindsClient } from '../src/core';
import { IngestClient } from '../src/ingest/ingest-client';

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
