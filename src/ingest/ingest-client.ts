import { ThreatWindsClient } from '../core/client';
import { IngestEntity, IngestResponse, BatchIngestResponse } from './ingest-types';

export class IngestClient {
  constructor(private client: ThreatWindsClient) {}

  async submitEntity(entity: IngestEntity): Promise<IngestResponse> {
    return this.client.request('POST', '/api/ingest/v1/entity', {
      body: entity,
    }) as Promise<IngestResponse>;
  }

  async batchSubmit(entities: IngestEntity[]): Promise<BatchIngestResponse> {
    return this.client.request('POST', '/api/ingest/v1/batch', {
      body: { entities },
    }) as Promise<BatchIngestResponse>;
  }
}