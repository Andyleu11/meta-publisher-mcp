"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useErrorLog } from "@/hooks/use-api-data";
import { clearErrorLog } from "@/lib/api";

const sourceColors: Record<string, string> = {
  scheduler: "bg-red-100 text-red-700",
  "generate-draft": "bg-brand-gold/15 text-brand-gold",
  "curate-url": "bg-brand-teal/10 text-brand-teal",
  "image-gen": "bg-brand-jade/15 text-brand-emerald",
};

export default function ErrorLogPage() {
  const { data: entries = [], isLoading, mutate } = useErrorLog();
  const [clearing, setClearing] = useState(false);

  async function handleClear() {
    if (!confirm("Clear all error log entries?")) return;
    setClearing(true);
    try {
      await clearErrorLog();
      await mutate();
      toast.success("Error log cleared");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clear");
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-charcoal">Error Log</h1>
          <p className="text-sm text-brand-muted">
            Recent errors from content generation, image generation, and post scheduling.
          </p>
        </div>
        {entries.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleClear} disabled={clearing} className="gap-1.5">
            <Trash2 className="h-3.5 w-3.5" />
            Clear Log
          </Button>
        )}
      </div>

      <Card className="rounded-2xl border-l-4 border-l-destructive/60">
        <CardHeader>
          <CardTitle className="text-base text-brand-charcoal">
            {isLoading ? "Loading..." : `${entries.length} error${entries.length !== 1 ? "s" : ""}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center py-12 text-brand-muted">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-jade/10">
                <svg className="h-6 w-6 text-brand-jade" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium">All clear</p>
              <p className="text-xs">No errors recorded.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {entries.map((entry) => (
                <div key={entry.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className={sourceColors[entry.source] ?? "bg-brand-cream text-brand-charcoal"}>
                      {entry.source}
                    </Badge>
                    <span className="text-xs text-brand-muted">
                      {entry.createdAt ? format(new Date(entry.createdAt), "MMM d, HH:mm:ss") : "—"}
                    </span>
                  </div>
                  <p className="text-sm text-brand-charcoal">{entry.message}</p>
                  {entry.detail && (
                    <pre className="mt-1 max-h-32 overflow-auto rounded-lg bg-brand-cream p-2.5 text-xs text-brand-muted font-mono">
                      {entry.detail}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
