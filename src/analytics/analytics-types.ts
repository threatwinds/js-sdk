export interface Geolocation {
  latitude: number;
  longitude: number;
  radius: number;
  ip: string | null;
}

export interface Association {
  id: string;
  type: string;
  value: string;
  reputation: number | null;
}

export interface Metadata {
  [key: string]: string;
}

export interface ExtendedMetadata {
  [key: string]: Metadata;
}

export interface EntityAttributes {
  id: string;
  type: string;
  value: string;
  description: string;
  reputationScore: number;
  reputation: string;
  accuracyScore: number;
  accuracy: string;
  worstReputationScore: number;
  worstReputation: string;
  bestReputationScore: number;
  bestReputation: string;
}

export interface EntityDetails {
  attributes: EntityAttributes;
  metadata: Metadata | null;
  extendedMetadata: ExtendedMetadata | null;
  geolocations: Geolocation[] | null;
  latestAssociations: Association[] | null;
}