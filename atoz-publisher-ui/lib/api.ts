import type {
  CompetitorReport,
  DraftPost,
  ErrorLogEntry,
  ListResponse,
  PerformanceItem,
  Platform,
  PostStatus,
  ScheduledPost,
} from "@/types/api";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asPlatform(value: unknown): Platform {
  if (value === "facebook") return "facebook";
  if (value === "linkedin") return "linkedin";
  if (value === "google_business") return "google_business";
  return "instagram";
}

function asStatus(value: unknown, fallback: PostStatus): PostStatus {
  if (typeof value !== "string") return fallback;
  const allowed: PostStatus[] = [
    "draft",
    "approved",
    "rejected",
    "pending",
    "posted",
    "failed",
    "cancelled",
  ];
  return allowed.includes(value as PostStatus) ? (value as PostStatus) : fallback;
}

export async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

function toScheduledPost(raw: unknown): ScheduledPost {
  const row = asRecord(raw);
  return {
    id: asNumber(row.id),
    platform: asPlatform(row.platform),
    status: asStatus(row.status, "pending"),
    caption: asString(row.caption),
    imageUrl: asNullableString(row.image_url),
    runAtIso: asString(row.run_at_iso),
    createdAtIso: asNullableString(row.created_at_iso),
    error: asNullableString(row.error),
  };
}

function toDraftPost(raw: unknown): DraftPost {
  const row = asRecord(raw);
  const warningsRaw = Array.isArray(row.brandWarnings)
    ? row.brandWarnings
    : Array.isArray(row.brand_warnings)
      ? row.brand_warnings
      : [];
  return {
    id: asNumber(row.id),
    platform: asPlatform(row.platform),
    status: asStatus(row.status, "draft"),
    caption: asString(row.caption),
    imageUrl: asNullableString(row.image_url),
    createdAtIso: asNullableString(row.created_at_iso),
    brandWarnings: warningsRaw.filter((item): item is string => typeof item === "string"),
  };
}

function toPerformanceItem(raw: unknown): PerformanceItem {
  const row = asRecord(raw);
  const metrics = asRecord(row.metrics);
  return {
    id: row.id === null ? null : asNumber(row.id),
    platform: asPlatform(row.platform),
    captionPreview: asNullableString(row.captionPreview),
    metaPostId: asString(row.metaPostId),
    scheduledAt: asNullableString(row.scheduledAt),
    postedAt: asNullableString(row.postedAt),
    metrics: {
      impressions: metrics.impressions === undefined ? undefined : asNumber(metrics.impressions),
      reach: metrics.reach === undefined ? undefined : asNumber(metrics.reach),
      engagement: metrics.engagement === undefined ? undefined : asNumber(metrics.engagement),
    },
  };
}

export async function getScheduledPosts(): Promise<ScheduledPost[]> {
  const data = await fetcher<ListResponse<unknown>>("/api/scheduled-posts");
  return data.items.map(toScheduledPost);
}

export async function getDraftPosts(): Promise<DraftPost[]> {
  const data = await fetcher<ListResponse<unknown>>("/api/draft-posts?status=all");
  return data.items.map(toDraftPost);
}

export async function getPostPerformance(): Promise<PerformanceItem[]> {
  const data = await fetcher<ListResponse<unknown>>("/api/post-performance");
  return data.items.map(toPerformanceItem);
}

export async function getCompetitorReport(): Promise<CompetitorReport> {
  const data = await fetcher<Record<string, unknown>>("/api/competitor-report");
  const competitors = Array.isArray(data.competitors) ? data.competitors : [];
  return {
    lookbackDays: asNumber(data.lookbackDays, 14),
    competitors: competitors.map((raw) => {
      const group = asRecord(raw);
      const signals = Array.isArray(group.signals) ? group.signals : [];
      return {
        name: asString(group.name),
        signals: signals.map((s) => {
          const row = asRecord(s);
          return {
            dateIso: asString(row.dateIso),
            source: asString(row.source),
            headline: asString(row.headline),
            summary: asString(row.summary),
            url: asString(row.url),
          };
        }),
      };
    }),
  };
}

export async function updateDraftStatus(
  id: number,
  status: "approved" | "rejected",
): Promise<void> {
  const response = await fetch(`/api/draft-posts/${id}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) throw new Error(await response.text());
}

export async function scheduleDraft(id: number, runAtIso: string): Promise<void> {
  const response = await fetch(`/api/draft-posts/${id}/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runAtIso }),
  });
  if (!response.ok) throw new Error(await response.text());
}

export interface GenerateDraftParams {
  prompt: string;
  url?: string;
  platform: Platform;
  audience: string;
}

export interface GenerateDraftResult {
  id: number;
  caption: string;
  platform: string;
  audience: string;
  brandWarnings: string[];
}

export async function generateDraft(params: GenerateDraftParams): Promise<GenerateDraftResult> {
  const response = await fetch("/api/generate-draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: "Generation failed" })) as { message?: string };
    throw new Error(data.message ?? "Generation failed");
  }
  const data = (await response.json()) as { draft: GenerateDraftResult };
  return data.draft;
}

export interface CurateUrlParams {
  url: string;
  audience: string;
  platforms: Platform[];
}

export interface CuratedDraft {
  id: number;
  platform: string;
  caption: string;
  brandWarnings: string[];
}

export async function curateUrl(params: CurateUrlParams): Promise<CuratedDraft[]> {
  const response = await fetch("/api/curate-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: "Curation failed" })) as { message?: string };
    throw new Error(data.message ?? "Curation failed");
  }
  const data = (await response.json()) as { drafts: CuratedDraft[] };
  return data.drafts;
}

export interface GenerateImageResult {
  filename: string;
  filePath: string;
  wasCropped: boolean;
  brandApplied?: boolean;
  requiresReview: boolean;
  provider: string;
}

export async function generateImage(prompt: string): Promise<GenerateImageResult> {
  const response = await fetch("/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: "Image generation failed" })) as { message?: string };
    throw new Error(data.message ?? "Image generation failed");
  }
  const data = (await response.json()) as { image: GenerateImageResult };
  return data.image;
}

export interface ApplyBrandResult {
  filename: string;
  filePath: string;
  applied: boolean;
}

export async function applyBrandOverlay(imagePath: string): Promise<ApplyBrandResult> {
  const response = await fetch("/api/apply-brand-overlay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imagePath }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: "Brand overlay failed" })) as { message?: string };
    throw new Error(data.message ?? "Brand overlay failed");
  }
  const data = (await response.json()) as { image: ApplyBrandResult };
  return data.image;
}

export type Settings = Record<string, string | null>;

export async function getSettings(): Promise<Settings> {
  const data = await fetcher<{ settings: Settings }>("/api/settings");
  return data.settings;
}

export async function saveSettings(settings: Settings): Promise<void> {
  const response = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!response.ok) throw new Error(await response.text());
}

export async function checkSettingsHealth(): Promise<{
  ok: boolean;
  name?: string;
  message?: string;
}> {
  return fetcher("/api/settings/health-check");
}

// Error log

function toErrorLogEntry(raw: unknown): ErrorLogEntry {
  const row = asRecord(raw);
  return {
    id: asNumber(row.id),
    source: asString(row.source),
    message: asString(row.message),
    detail: asNullableString(row.detail),
    createdAt: asString(row.createdAt),
  };
}

export async function getErrorLog(): Promise<ErrorLogEntry[]> {
  const data = await fetcher<ListResponse<unknown>>("/api/error-log");
  return data.items.map(toErrorLogEntry);
}

export async function clearErrorLog(): Promise<void> {
  const response = await fetch("/api/error-log/clear", { method: "POST" });
  if (!response.ok) throw new Error(await response.text());
}

// Reschedule

export async function reschedulePost(id: number, runAt: string): Promise<void> {
  const response = await fetch(`/api/scheduled-posts/${id}/reschedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_at: runAt }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: "Reschedule failed" })) as { message?: string };
    throw new Error(data.message ?? "Reschedule failed");
  }
}
