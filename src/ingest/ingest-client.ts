import { ThreatWindsClient, RequestOptions } from '../core/client';
import {
  AssociationRequest,
  Comment,
  CommentRequest,
  EntityDefinition,
  IngestAck,
  IngestEntity,
  ScanRequest,
  ScanResult,
} from './ingest-types';

const BASE = '/api/ingest/v1';

/**
 * Client for the ThreatWinds Ingest API — reporting new indicators back into
 * the corpus.
 *
 * Authorization for entity, association and comment submission is identity
 * verification: any KYC-verified account may report. The former `reporter` role
 * is deprecated and no longer grants access. `well-known` still requires the
 * `trusted` role, and `scan` requires `user`.
 *
 * Ingestion is asynchronous: a 202 acknowledgement means accepted for
 * processing, not that the entity is queryable yet.
 *
 * Earlier SDK versions exposed a `/batch` endpoint and comment read/delete
 * routes that the API does not implement; they have been removed rather than
 * left to fail at runtime.
 */
export class IngestClient {
  constructor(private client: ThreatWindsClient) {}

  /**
   * Reports a new entity, optionally with nested associations.
   *
   * The indicator's value belongs in `attributes` under a key matching `type`.
   * Requires a KYC-verified account.
   */
  async submitEntity(entity: IngestEntity, options: RequestOptions = {}): Promise<IngestAck> {
    return this.client.request('POST', `${BASE}/entity`, {
      ...options,
      body: entity,
    }) as Promise<IngestAck>;
  }

  /** Links two existing entities. Both must share at least one security group. */
  async submitAssociation(
    request: AssociationRequest,
    options: RequestOptions = {},
  ): Promise<IngestAck> {
    return this.client.request('POST', `${BASE}/association`, {
      ...options,
      body: request,
    }) as Promise<IngestAck>;
  }

  /** Reports a well-known (trusted) entity. Requires the `trusted` role. */
  async submitWellKnown(entity: IngestEntity, options: RequestOptions = {}): Promise<IngestAck> {
    return this.client.request('POST', `${BASE}/well-known`, {
      ...options,
      body: entity,
    }) as Promise<IngestAck>;
  }

  /**
   * Schema for every supported entity type — the authoritative list of valid
   * `type` values and the attributes each accepts.
   */
  async getDefinitions(options: RequestOptions = {}): Promise<EntityDefinition[]> {
    const raw = await this.client.request('GET', `${BASE}/definitions`, options);
    return Array.isArray(raw) ? (raw as EntityDefinition[]) : [];
  }

  async createComment(request: CommentRequest, options: RequestOptions = {}): Promise<Comment> {
    return this.client.request('POST', `${BASE}/comment`, {
      ...options,
      body: {
        entityId: request.entityId,
        content: request.content,
        parentId: request.parentId ?? null,
      },
    }) as Promise<Comment>;
  }

  /** Schedules a scan of an IP or hostname. Requires the `user` role. */
  async createScan(request: ScanRequest, options: RequestOptions = {}): Promise<ScanResult> {
    return this.client.request('POST', `${BASE}/scan`, {
      ...options,
      body: { target: request.target, type: request.type },
    }) as Promise<ScanResult>;
  }

  async getScanStatus(taskId: string, options: RequestOptions = {}): Promise<ScanResult> {
    return this.client.request(
      'GET',
      `${BASE}/scan/${encodeURIComponent(taskId)}`,
      options,
    ) as Promise<ScanResult>;
  }
}
