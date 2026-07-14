export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface APIResponse<T = unknown> {
  data: T;
  status: number;
}

export interface PaginatedResponse<T> {
  results: T[];
  pages: number;
  next: number | null;
}