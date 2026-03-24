import type { Platform } from "@/types/api";

export function platformBadgeClass(platform: Platform): string {
  switch (platform) {
    case "facebook":
      return "bg-platform-facebook text-white";
    case "instagram":
      return "bg-linear-to-r from-platform-instagram to-platform-instagram-end text-white";
    case "linkedin":
      return "bg-platform-linkedin text-white";
    case "google_business":
      return "bg-platform-gbp text-white";
    default:
      return "bg-muted text-foreground";
  }
}

export function platformLabel(platform: Platform): string {
  switch (platform) {
    case "facebook":
      return "Facebook";
    case "instagram":
      return "Instagram";
    case "linkedin":
      return "LinkedIn";
    case "google_business":
      return "Google Business";
    default:
      return platform;
  }
}
