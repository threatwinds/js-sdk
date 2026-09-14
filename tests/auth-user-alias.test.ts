import { jest } from '@jest/globals';
import { ThreatWindsClient } from '../src/core';
import { AuthClient } from '../src/auth/auth-client';

describe('AuthClient.getUserAlias', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockFetch = jest.fn<any>();

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = mockFetch;
  });

  beforeEach(() => mockFetch.mockReset());

  function auth() {
    return new AuthClient(
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

  const ID = 'ea04845b-d127-4bd6-ae1b-b5ef40a3a7a7';

  it('resolves a user id to their alias', async () => {
    respond(200, { alias: 'osmany' });
    expect(await auth().getUserAlias(ID)).toBe('osmany');
  });

  it('requests the by-id route with the id path-encoded', async () => {
    respond(200, { alias: 'osmany' });
    await auth().getUserAlias(ID);
    expect(mockFetch.mock.calls[0][0]).toContain(`/api/auth/v2/user/${ID}`);
  });

  // The API answers 400 (not 404) when the user is gone or carries no alias —
  // auth-api/controllers/user.go raises ErrorNoUserWithID with status 400 for
  // an empty alias. Both statuses mean "unresolvable" to a caller.
  it('returns null on 400, the API\'s "no such user / no alias" answer', async () => {
    respond(400, { error: { message: 'no user with that id' } });
    expect(await auth().getUserAlias(ID)).toBeNull();
  });

  it('returns null on 404 as well', async () => {
    respond(404, { error: { message: 'not found' } });
    expect(await auth().getUserAlias(ID)).toBeNull();
  });

  it('returns null when the response carries no alias field', async () => {
    respond(200, {});
    expect(await auth().getUserAlias(ID)).toBeNull();
  });

  it('returns null rather than an empty string for a blank alias', async () => {
    respond(200, { alias: '' });
    expect(await auth().getUserAlias(ID)).toBeNull();
  });

  // A genuine failure must not be silently reported as "unknown user" —
  // that would turn an outage into every author reading as unresolvable.
  it('rethrows a 500 instead of swallowing it', async () => {
    respond(500, { error: { message: 'boom' } });
    await expect(auth().getUserAlias(ID)).rejects.toThrow();
  });
});
