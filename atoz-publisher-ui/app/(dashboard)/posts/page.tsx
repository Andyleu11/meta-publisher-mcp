"use client";

import { useMemo, useState } from "react";
import { PhoneMockup } from "@/components/ui/phone-mockup";
import { PostThumbnailCard } from "@/components/post-thumbnail-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePostPerformance, useScheduledPosts } from "@/hooks/use-api-data";
import { platformBadgeClass, platformLabel } from "@/lib/platform-styles";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ScheduledPost } from "@/types/api";

export default function PostsPage() {
  const { data: posts = [], isLoading } = useScheduledPosts();
  const { data: perf = [] } = usePostPerformance();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [selected, setSelected] = useState<ScheduledPost | null>(null);

  const filtered = useMemo(
    () =>
      posts.filter((post) =>
        post.caption.toLowerCase().includes(query.toLowerCase().trim()),
      ),
    [posts, query],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-charcoal">Posts</h1>
          <p className="text-sm text-brand-muted">Browse scheduled and posted content.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            className="w-64"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search captions"
            value={query}
          />
          <Button onClick={() => setView("grid")} size="sm" variant={view === "grid" ? "default" : "outline"}>
            Grid
          </Button>
          <Button onClick={() => setView("table")} size="sm" variant={view === "table" ? "default" : "outline"}>
            Table
          </Button>
        </div>
      </div>

      {isLoading ? <p className="text-sm text-brand-muted">Loading posts...</p> : null}

      {view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {filtered.map((post) => {
            const metrics = perf.find((row) => row.metaPostId === String(post.id));
            return (
              <PostThumbnailCard
                engagement={metrics?.metrics.engagement}
                imageUrl={post.imageUrl}
                key={post.id}
                onClick={() => setSelected(post)}
                platform={post.platform}
                reach={metrics?.metrics.reach}
                status={post.status}
                title={post.caption}
              />
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-brand-cream text-left text-xs font-semibold uppercase tracking-wider text-brand-muted">
              <tr>
                <th className="px-4 py-2.5">Caption</th>
                <th className="px-4 py-2.5">Platform</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((post) => (
                <tr className="border-t border-border hover:bg-brand-cream/40 transition-colors" key={post.id}>
                  <td className="px-4 py-2.5 text-brand-charcoal">{post.caption}</td>
                  <td className="px-4 py-2.5">
                    <Badge className={platformBadgeClass(post.platform)}>{platformLabel(post.platform)}</Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline">{post.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <Button onClick={() => setSelected(post)} size="sm" variant="ghost" className="text-brand-teal">
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet onOpenChange={(open) => !open && setSelected(null)} open={selected !== null}>
        <SheetContent className="sm:max-w-[440px]">
          <SheetHeader>
            <SheetTitle className="text-brand-charcoal">Post Detail</SheetTitle>
            <SheetDescription>Preview selected post content before publishing.</SheetDescription>
          </SheetHeader>
          {selected ? (
            <div className="mt-4">
              <PhoneMockup
                caption={selected.caption}
                imageUrl={selected.imageUrl ?? undefined}
                platform={selected.platform}
              />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
