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
  attributes: Record<string, string | number>;
  tags?: string[];
  /**
   * Intersected with the parent's. An empty intersection returns 403 for the
   * whole submission, not just this association.
   */
  visibleBy?: string[];
  /** Associations nest recursively. */
  associations?: IngestAssociation[];
}

export interface IngestEntity {
  type: string;
  /**
   * Required. Must include a key matching `type` carrying the entity's value.
   *
   * Ten attributes are Go `*int`/`*float64` and must be sent as JSON numbers:
   * aba-rtn, asn, bank-account-nr, bin, breach-count, cc-number,
   * accuracy-radius, latitude, longitude, size-in-bytes. `port` is a string
   * despite its name — its example is "443/tcp".
   */
  attributes: Record<string, string | number>;
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

/**
 * Schema for one supported entity type.
 *
 * Recursive, because Go's `Definition` is: `Attributes []Definition` is the
 * same struct again, so a `file`'s `md5` attribute carries its own attributes,
 * dataType and example. This was previously modelled as a separate flat
 * `EntityAttributeDefinition` with four fields, which typed away everything
 * below the first level — `getDefinitions` is a cast, so the data was arriving
 * and being discarded by the declaration alone.
 *
 * `attributes` is advisory, not enforced: ingest-api validates an attribute
 * name against the global type list and never checks it belongs to the parent
 * type. It says which fields are worth offering, not which are permitted.
 */
export interface EntityDefinition {
  type: string;
  label: string;
  description: string;
  /**
   * A human-readable name, not an enum: "Integer", "String", "SHA-1",
   * "Case-sensitive string", "UUID|MD5|SHA3-256". Matching on "INTEGER"
   * matches nothing.
   */
  dataType: string;
  /** Sub-attributes worth offering for this type. */
  attributes?: EntityDefinition[];
  associations?: EntityDefinition[];
  /** Attribute names this type recommends spinning out into linked entities. */
  correlate?: string[];
  tags?: string[];
  example?: IngestEntity;
}

export interface CommentRequest {
  entityId: string;
  content: string;
  /** Omit for a top-level comment. */
  parentId?: string | null;
  /** Defaults server-side to the poster's own groups. */
  visibleBy?: string[];
}

// The comment record itself is a search-side concern; re-exported here so
// `createComment`'s return type stays importable from the ingest surface.
export type { Comment } from '../search/search-types';

export interface ScanRequest {
  target: string;
  type: 'ip' | 'fqdn';
}

export interface ScanResult {
  taskId: string;
  status: string;
  message: string;
}
