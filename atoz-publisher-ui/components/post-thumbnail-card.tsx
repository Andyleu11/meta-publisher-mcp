"use client";

import { motion } from "framer-motion";
import { Eye, ThumbsUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { platformBadgeClass } from "@/lib/platform-styles";
import type { Platform, PostStatus } from "@/types/api";

interface PostThumbnailCardProps {
  title: string;
  imageUrl?: string | null;
  platform: Platform;
  status: PostStatus;
  engagement?: number;
  reach?: number;
  onClick?: () => void;
}

function statusVariant(status: PostStatus): "secondary" | "outline" {
  return status === "posted" ? "secondary" : "outline";
}

export function PostThumbnailCard({
  title,
  imageUrl,
  platform,
  status,
  engagement,
  reach,
  onClick,
}: PostThumbnailCardProps) {
  return (
    <motion.button
      whileHover={{ y: -4 }}
      transition={{ duration: 0.18 }}
      className="group relative w-full overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm hover:shadow-md hover:border-brand-teal/30 transition-all"
      onClick={onClick}
      type="button"
    >
      <div className="aspect-square w-full bg-brand-cream">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-brand-muted">
            No image
          </div>
        )}
      </div>
      <div className="absolute left-3 top-3 flex items-center gap-2">
        <Badge className={platformBadgeClass(platform)}>
          {platform}
        </Badge>
        <Badge variant={statusVariant(status)}>{status}</Badge>
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm text-brand-charcoal">{title}</p>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full border-t border-brand-teal/20 bg-white/95 p-3 transition-transform duration-200 group-hover:translate-y-0">
        <div className="flex items-center gap-4 text-xs text-brand-muted">
          <span className="inline-flex items-center gap-1 text-brand-teal">
            <Eye className="h-3.5 w-3.5" />
            {reach ?? 0}
          </span>
          <span className="inline-flex items-center gap-1 text-brand-gold">
            <ThumbsUp className="h-3.5 w-3.5" />
            {engagement ?? 0}
          </span>
        </div>
      </div>
    </motion.button>
  );
}
