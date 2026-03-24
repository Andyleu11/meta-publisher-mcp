export type Platform = "instagram" | "facebook" | "linkedin" | "google_business";

export type PostStatus =
  | "draft"
  | "approved"
  | "rejected"
  | "pending"
  | "posted"
  | "failed"
  | "cancelled";

export interface ScheduledPost {
  id: number;
  platform: Platform;
  status: PostStatus;
  caption: string;
  imageUrl: string | null;
  runAtIso: string;
  createdAtIso: string | null;
  error: string | null;
}

export interface DraftPost {
  id: number;
  platform: Platform;
  status: PostStatus;
  caption: string;
  imageUrl: string | null;
  createdAtIso: string | null;
  brandWarnings: string[];
}

export interface PerformanceItem {
  id: number | null;
  platform: Platform;
  captionPreview: string | null;
  metaPostId: string;
  scheduledAt: string | null;
  postedAt: string | null;
  metrics: {
    impressions?: number;
    reach?: number;
    engagement?: number;
  };
}

export interface CompetitorReportSignal {
  dateIso: string;
  source: string;
  headline: string;
  summary: string;
  url: string;
}

export interface CompetitorGroup {
  name: string;
  signals: CompetitorReportSignal[];
}

export interface CompetitorReport {
  lookbackDays: number;
  competitors: CompetitorGroup[];
}

export interface ErrorLogEntry {
  id: number;
  source: string;
  message: string;
  detail: string | null;
  createdAt: string;
}

export interface ListResponse<T> {
  items: T[];
}
