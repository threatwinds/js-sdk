/**
 * Indicator type detection.
 *
 * Exact lookup needs the entity type alongside the value, but analysts paste
 * bare indicators. Inferring the type from shape lets callers resolve
 * "8.8.8.8" or a SHA-256 without asking which kind it is.
 */

export type IndicatorType =
  | 'ip'
  | 'cidr'
  | 'domain'
  | 'hostname'
  | 'url'
  | 'md5'
  | 'sha1'
  | 'sha224'
  | 'sha256'
  | 'sha384'
  | 'sha512'
  | 'email';

const IPV4 =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6 = /^(([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|::|([0-9a-f]{1,4}:){1,7}:|(:[0-9a-f]{1,4}){1,7})$/i;
const CIDR = /^\S+\/\d{1,3}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
const HEX = /^[a-f0-9]+$/i;
const DOMAIN_LIKE = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

const HASH_BY_LENGTH: Record<number, IndicatorType> = {
  32: 'md5',
  40: 'sha1',
  56: 'sha224',
  64: 'sha256',
  96: 'sha384',
  128: 'sha512',
};

/**
 * Best-guess ordering of candidate types for a raw indicator, most likely
 * first. Returns several because some shapes are genuinely ambiguous — a
 * two-label string is a domain, but a deeper one is usually a hostname.
 */
export function detectIndicatorTypes(raw: string): IndicatorType[] {
  const value = raw.trim();
  if (!value) return [];

  if (CIDR.test(value)) return ['cidr'];
  if (IPV4.test(value) || IPV6.test(value)) return ['ip'];
  if (EMAIL.test(value)) return ['email'];

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return ['url'];

  if (HEX.test(value) && HASH_BY_LENGTH[value.length]) {
    return [HASH_BY_LENGTH[value.length]];
  }

  if (DOMAIN_LIKE.test(value)) {
    const labels = value.split('.');
    // "example.com" is a registrable domain; "www.example.com" is a host. Both
    // spellings exist in the corpus, so try the likelier one first.
    return labels.length > 2 ? ['hostname', 'domain'] : ['domain', 'hostname'];
  }

  // Anything else (malware family names, filenames, free text) has no reliable
  // shape — callers should fall back to full-text search.
  return [];
}

/** Convenience wrapper returning only the single most likely type. */
export function detectIndicatorType(raw: string): IndicatorType | null {
  return detectIndicatorTypes(raw)[0] ?? null;
}
