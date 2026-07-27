/**
 * Types for the ThreatWinds Ingest API (`/api/ingest/v1`).
 *
 * Note the entity payload does NOT carry a `value` field: an entity's value
 * lives in `attributes` under a key matching its own type, so an IP is
 * `{ type: 'ip', attributes: { ip: '203.0.113.1' } }`. Earlier SDK versions
 * declared a top-level `value`, which the API ignores — submissions built that
 * way are accepted but arrive without their indicator.
 *
 * Reputation here is -3..3, a narrower scale than the -5..+5 reported by search
 * and analytics.
 */

/** How a nested entity relates to its parent. */
export type AssociationMode = 'aggregation' | 'association';

export interface IngestAssociation {
  mode: AssociationMode;
  type: string;
  /** Must include a key matching `type`. */
  attributes: Record<string, string>;
  /** Associations nest recursively. */
  associations?: IngestAssociation[];
}

export interface IngestEntity {
  type: string;
  /** Required. Must include a key matching `type` carrying the entity's value. */
  attributes: Record<string, string>;
  associations?: IngestAssociation[];
  /** -3 (malicious) to 3 (benign); 0 is neutral. */
  reputation?: number;
  /** Attribute names to spin out into linked child entities. */
  correlate?: string[];
  tags?: string[];
  /** Security groups that may see this entity. Defaults to the reporter's own. */
  visibleBy?: string[];
}

/** Ingestion is asynchronous — 202 with an acknowledgement, no entity id. */
export interface IngestAck {
  message: string;
}

export interface AssociationRequest {
  /** Source entity id, formatted `[type]-[hash]`. */
  entityID: string;
  relatedEntityID: string;
}

/** One attribute a given entity type may carry. */
export interface EntityAttributeDefinition {
  type: string;
  label: string;
  description: string;
  dataType: string;
}

/** Schema for one of the supported entity types. */
export interface EntityDefinition {
  type: string;
  label: string;
  description: string;
  dataType: string;
  attributes?: EntityAttributeDefinition[];
}

export interface CommentRequest {
  entityId: string;
  content: string;
  parentId?: string | null;
}

export interface Comment {
  id: string;
  entityId: string;
  content: string;
  author: string;
  authorName: string;
  createdAt: string;
  parentId: string | null;
}

export interface ScanRequest {
  target: string;
  type: 'ip' | 'fqdn';
}

export interface ScanResult {
  taskId: string;
  status: string;
  message: string;
}
