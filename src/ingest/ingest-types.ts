export interface IngestEntity {
  id?: string;
  type: string;
  value: string;
  reputation: number;
  accuracy?: number;
  attributes?: Record<string, string>;
  tags?: string[];
}

export interface IngestResponse {
  id: string;
  status: string;
  message: string;
}

export interface BatchIngestResponse {
  total: number;
  accepted: number;
  rejected: number;
  results: IngestResponse[];
}