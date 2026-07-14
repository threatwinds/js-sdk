export interface Feed {
  id: string;
  name: string;
  description: string;
  type: string;
  format: string;
  updatedAt: string;
}

export interface FeedList {
  feeds: Feed[];
  pages: number;
  next: number | null;
}

export interface Subscription {
  id: string;
  feedId: string;
  createdAt: string;
}

export interface FeedListOptions {
  page?: number;
  limit?: number;
}