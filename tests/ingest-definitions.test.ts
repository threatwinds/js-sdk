import { jest } from '@jest/globals';
import { ThreatWindsClient } from '../src/core';
import { IngestClient } from '../src/ingest/ingest-client';

describe('IngestClient.getDefinitions', () => {
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

  function respond(body: unknown) {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      headers: new Map(),
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
  }

  // Shaped like the real `file` definition: nested attributes, a correlate
  // list, tags and an example. The SDK used to model attributes as a separate
  // flat type with four fields, so everything below the first level was
  // discarded by the type even though the transport delivered it.
  const FILE_DEFINITION = {
    type: 'file',
    label: 'File',
    description: 'A file',
    dataType: 'String',
    attributes: [
      { type: 'filename', label: 'Filename', description: 'Name', dataType: 'String' },
      {
        type: 'md5',
        label: 'MD5',
        description: 'MD5 hash',
        dataType: 'MD5',
        attributes: [{ type: 'text', label: 'Text', description: 'Note', dataType: 'String' }],
      },
    ],
    associations: [{ type: 'malware', label: 'Malware', description: 'M', dataType: 'String' }],
    correlate: ['md5', 'sha256'],
    tags: ['malware'],
    example: { type: 'file', attributes: { file: 'a.exe', 'size-in-bytes': 1024 } },
  };

  it('carries nested attributes through untouched', async () => {
    respond([FILE_DEFINITION]);
    const [file] = await ingest().getDefinitions();
    expect(file.attributes?.[1].attributes?.[0].type).toBe('text');
  });

  it('carries correlate, tags, associations and example', async () => {
    respond([FILE_DEFINITION]);
    const [file] = await ingest().getDefinitions();
    expect(file.correlate).toEqual(['md5', 'sha256']);
    expect(file.tags).toEqual(['malware']);
    expect(file.associations?.[0].type).toBe('malware');
    expect(file.example?.attributes['size-in-bytes']).toBe(1024);
  });

  // The ten numeric attributes are Go *int / *float64. A Record<string,string>
  // made every one of them a type error at the call site, so callers stringified
  // them and the server rejected the unmarshal.
  it('accepts a numeric attribute value', async () => {
    respond([FILE_DEFINITION]);
    const [file] = await ingest().getDefinitions();
    expect(typeof file.example?.attributes['size-in-bytes']).toBe('number');
  });

  it('returns an empty list when the response is not an array', async () => {
    respond({ message: 'nope' });
    expect(await ingest().getDefinitions()).toEqual([]);
  });
});
