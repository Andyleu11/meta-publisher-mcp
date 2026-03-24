"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PhoneMockup } from "@/components/ui/phone-mockup";
import { curateUrl } from "@/lib/api";
import type { CuratedDraft } from "@/lib/api";
import { platformLabel } from "@/lib/platform-styles";
import type { Platform } from "@/types/api";

const AUDIENCE_OPTIONS = [
  { value: "general", label: "General Home Improvement" },
  { value: "insurance", label: "Insurance Replacement" },
  { value: "renovations", label: "Renovations & Remodels" },
  { value: "new_home", label: "New Home Buyers" },
  { value: "upgrades", label: "Quality-of-Life Upgrades" },
  { value: "rental", label: "Investment / Rental Property" },
] as const;

export default function CuratePage() {
  const [url, setUrl] = useState("");
  const [audience, setAudience] = useState("general");
  const [platforms, setPlatforms] = useState<Set<Platform>>(new Set(["instagram", "facebook"]));
  const [curating, setCurating] = useState(false);
  const [results, setResults] = useState<CuratedDraft[]>([]);

  function togglePlatform(p: Platform) {
    setPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) {
        if (next.size > 1) next.delete(p);
      } else {
        next.add(p);
      }
      return next;
    });
  }

  async function handleCurate() {
    if (!url.trim()) {
      toast.error("Paste a URL to curate");
      return;
    }
    setCurating(true);
    setResults([]);
    try {
      const drafts = await curateUrl({
        url: url.trim(),
        audience,
        platforms: [...platforms],
      });
      setResults(drafts);
      toast.success(`${drafts.length} draft(s) created from URL`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Curation failed");
    } finally {
      setCurating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-charcoal">URL to Post</h1>
        <p className="text-sm text-brand-muted">
          Paste an article or product link and generate platform-ready drafts automatically.
        </p>
      </div>

      <Card className="rounded-2xl border-l-4 border-l-brand-gold">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-brand-charcoal">
            <Link2 className="h-5 w-5 text-brand-gold" />
            Curate from URL
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-brand-charcoal" htmlFor="curate-url">Article URL</label>
            <Input
              disabled={curating}
              id="curate-url"
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/flooring-trends-2026"
              type="url"
              value={url}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-brand-charcoal">Platforms</label>
              <div className="flex flex-wrap gap-2">
                {(["instagram", "facebook", "linkedin", "google_business"] as const).map((p) => (
                  <button
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
                      platforms.has(p)
                        ? "border-brand-teal bg-brand-teal text-white shadow-sm"
                        : "border-border bg-white text-brand-muted hover:border-brand-teal/40 hover:text-brand-teal"
                    }`}
                    disabled={curating}
                    key={p}
                    onClick={() => togglePlatform(p)}
                    type="button"
                  >
                    {platformLabel(p)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-brand-charcoal" htmlFor="curate-audience">Audience</label>
              <select
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-brand-charcoal focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
                disabled={curating}
                id="curate-audience"
                onChange={(e) => setAudience(e.target.value)}
                value={audience}
              >
                {AUDIENCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <Button className="w-full gap-2" disabled={curating} onClick={handleCurate}>
            {curating ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Curating...
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4" />
                Generate Drafts from URL
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-brand-charcoal">Generated Drafts</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {results.map((draft) => (
              <div className="space-y-3" key={draft.id}>
                {draft.brandWarnings.length > 0 && (
                  <div className="space-y-1 rounded-lg bg-brand-gold/10 border border-brand-gold/20 px-3 py-2">
                    {draft.brandWarnings.map((w, i) => (
                      <p className="text-xs text-brand-gold" key={i}>{w}</p>
                    ))}
                  </div>
                )}
                <PhoneMockup
                  caption={draft.caption}
                  platform={draft.platform as Platform}
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
