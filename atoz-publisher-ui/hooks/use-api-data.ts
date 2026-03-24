"use client";

import useSWR from "swr";
import {
  getCompetitorReport,
  getDraftPosts,
  getErrorLog,
  getPostPerformance,
  getScheduledPosts,
  getSettings,
} from "@/lib/api";

const refreshInterval = 30_000;

export function useScheduledPosts() {
  return useSWR("scheduled-posts", getScheduledPosts, { refreshInterval });
}

export function useDraftPosts() {
  return useSWR("draft-posts", getDraftPosts, { refreshInterval });
}

export function usePostPerformance() {
  return useSWR("post-performance", getPostPerformance, { refreshInterval });
}

export function useCompetitorReport() {
  return useSWR("competitor-report", getCompetitorReport, { refreshInterval });
}

export function useSettings() {
  return useSWR("settings", getSettings);
}

export function useErrorLog() {
  return useSWR("error-log", getErrorLog, { refreshInterval });
}
