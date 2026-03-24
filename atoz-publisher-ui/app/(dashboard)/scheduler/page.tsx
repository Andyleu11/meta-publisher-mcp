"use client";

import { useCallback, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  subMonths,
  setHours,
  setMinutes,
} from "date-fns";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useScheduledPosts } from "@/hooks/use-api-data";
import { reschedulePost } from "@/lib/api";
import { platformBadgeClass, platformLabel } from "@/lib/platform-styles";
import type { ScheduledPost } from "@/types/api";

export default function SchedulerPage() {
  const { data: scheduled = [], isLoading, mutate } = useScheduledPosts();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [dragPostId, setDragPostId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const postsByDay = useMemo(() => {
    const map = new Map<string, ScheduledPost[]>();
    for (const post of scheduled) {
      if (!post.runAtIso) continue;
      const key = format(new Date(post.runAtIso), "yyyy-MM-dd");
      const bucket = map.get(key) ?? [];
      bucket.push(post);
      map.set(key, bucket);
    }
    return map;
  }, [scheduled]);

  const handleDragStart = useCallback((postId: number) => {
    setDragPostId(postId);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, dayKey: string) => {
      e.preventDefault();
      if (dragPostId !== null) setDropTarget(dayKey);
    },
    [dragPostId],
  );

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetDay: Date) => {
      e.preventDefault();
      setDropTarget(null);
      if (dragPostId === null) return;

      const post = scheduled.find((p) => p.id === dragPostId);
      setDragPostId(null);
      if (!post || post.status !== "pending") {
        toast.error("Only pending posts can be rescheduled");
        return;
      }

      const originalDate = new Date(post.runAtIso);
      if (isSameDay(originalDate, targetDay)) return;

      const newDate = setMinutes(
        setHours(targetDay, originalDate.getHours()),
        originalDate.getMinutes(),
      );

      try {
        await reschedulePost(post.id, newDate.toISOString());
        await mutate();
        toast.success(
          `Moved "${post.caption.slice(0, 40)}..." to ${format(newDate, "MMM d, HH:mm")}`,
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Reschedule failed");
      }
    },
    [dragPostId, scheduled, mutate],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-charcoal">Scheduler</h1>
        <p className="text-sm text-brand-muted">
          Calendar view of your posting queue. Drag pending posts to reschedule.
        </p>
      </div>
      <Card className="rounded-2xl border-l-4 border-l-brand-teal">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-brand-charcoal">{format(currentMonth, "MMMM yyyy")}</CardTitle>
          <div className="flex items-center gap-1">
            <Button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} size="sm" variant="ghost">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              className="text-xs font-semibold text-brand-teal hover:text-brand-teal"
              onClick={() => setCurrentMonth(new Date())}
              size="sm"
              variant="ghost"
            >
              Today
            </Button>
            <Button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} size="sm" variant="ghost">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-brand-muted">Loading schedule...</p>
          ) : (
            <div className="grid grid-cols-7 gap-px rounded-xl border border-border bg-border overflow-hidden">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <div className="bg-brand-cream px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-brand-muted" key={day}>
                  {day}
                </div>
              ))}
              {days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const posts = postsByDay.get(key) ?? [];
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isToday = isSameDay(day, new Date());
                const isDropping = dropTarget === key;
                return (
                  <div
                    className={`min-h-[90px] bg-white p-1.5 transition-colors ${
                      isCurrentMonth ? "" : "opacity-30"
                    } ${isDropping ? "bg-brand-jade/10 ring-2 ring-brand-teal/40 ring-inset" : ""}`}
                    key={key}
                    onDragOver={(e) => handleDragOver(e, key)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, day)}
                  >
                    <span
                      className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                        isToday ? "bg-brand-teal text-white font-bold" : "text-brand-charcoal"
                      }`}
                    >
                      {format(day, "d")}
                    </span>
                    <div className="space-y-0.5">
                      {posts.slice(0, 3).map((post) => (
                        <PostPill
                          key={post.id}
                          post={post}
                          onDragStart={handleDragStart}
                        />
                      ))}
                      {posts.length > 3 && (
                        <p className="text-[10px] text-brand-muted">+{posts.length - 3} more</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PostPill({
  post,
  onDragStart,
}: {
  post: ScheduledPost;
  onDragStart: (id: number) => void;
}) {
  const isPending = post.status === "pending";
  return (
    <div
      draggable={isPending}
      onDragStart={() => isPending && onDragStart(post.id)}
      className={`group flex items-center gap-0.5 truncate rounded px-1 py-0.5 text-[10px] leading-tight ${
        isPending
          ? "cursor-grab bg-brand-teal/10 text-brand-teal active:cursor-grabbing"
          : "bg-brand-cream text-brand-muted"
      }`}
      title={`${platformLabel(post.platform)} — ${post.caption}`}
    >
      {isPending && (
        <GripVertical className="h-2.5 w-2.5 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
      )}
      <Badge
        className={`mr-0.5 h-2.5 w-2.5 shrink-0 p-0 inline-block rounded-full ${platformBadgeClass(post.platform)}`}
      />
      <span className="truncate">
        {format(new Date(post.runAtIso), "HH:mm")}
      </span>
    </div>
  );
}
