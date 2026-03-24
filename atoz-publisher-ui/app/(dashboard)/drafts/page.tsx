"use client";

import { useMemo, useState } from "react";
import { formatISO } from "date-fns";
import { ImagePlus, Stamp, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PhoneMockup } from "@/components/ui/phone-mockup";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useDraftPosts } from "@/hooks/use-api-data";
import { applyBrandOverlay, generateDraft, generateImage, scheduleDraft, updateDraftStatus } from "@/lib/api";
import { platformBadgeClass } from "@/lib/platform-styles";
import type { DraftPost, Platform } from "@/types/api";

const AUDIENCE_OPTIONS = [
  { value: "general", label: "General Home Improvement" },
  { value: "insurance", label: "Insurance Replacement" },
  { value: "renovations", label: "Renovations & Remodels" },
  { value: "new_home", label: "New Home Buyers" },
  { value: "upgrades", label: "Quality-of-Life Upgrades" },
  { value: "rental", label: "Investment / Rental Property" },
] as const;

export default function DraftsPage() {
  const { data: drafts = [], error, isLoading, mutate } = useDraftPosts();
  const [selected, setSelected] = useState<DraftPost | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [showGenerate, setShowGenerate] = useState(false);
  const [genPrompt, setGenPrompt] = useState("");
  const [genUrl, setGenUrl] = useState("");
  const [genPlatform, setGenPlatform] = useState<Platform>("instagram");
  const [genAudience, setGenAudience] = useState("general");
  const [generating, setGenerating] = useState(false);
  const [genPreview, setGenPreview] = useState<{ caption: string; warnings: string[]; imageUrl?: string } | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [applyingBrand, setApplyingBrand] = useState(false);

  const sortedDrafts = useMemo(
    () => [...drafts].sort((a, b) => b.id - a.id),
    [drafts],
  );

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === sortedDrafts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedDrafts.map((d) => d.id)));
    }
  }

  async function onStatus(id: number, status: "approved" | "rejected") {
    setBusyId(id);
    try {
      await updateDraftStatus(id, status);
      toast.success(`Draft #${id} ${status}`);
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  async function onSchedule(id: number) {
    setBusyId(id);
    try {
      await scheduleDraft(id, formatISO(new Date(Date.now() + 60 * 60 * 1000)));
      toast.success(`Draft #${id} scheduled`);
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Schedule failed");
    } finally {
      setBusyId(null);
    }
  }

  async function bulkAction(status: "approved" | "rejected") {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBusyId(-1);
    try {
      await Promise.all(ids.map((id) => updateDraftStatus(id, status)));
      toast.success(`${ids.length} draft(s) ${status}`);
      setSelectedIds(new Set());
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk action failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleGenerate() {
    if (!genPrompt.trim() && !genUrl.trim()) {
      toast.error("Enter a prompt or paste a URL");
      return;
    }
    setGenerating(true);
    setGenPreview(null);
    try {
      const result = await generateDraft({
        prompt: genPrompt.trim(),
        url: genUrl.trim() || undefined,
        platform: genPlatform,
        audience: genAudience,
      });
      setGenPreview({ caption: result.caption, warnings: result.brandWarnings });
      toast.success("Draft generated and saved");
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerateImage() {
    const prompt = genPreview?.caption || genPrompt.trim();
    if (!prompt) {
      toast.error("Generate a caption first, or enter a prompt");
      return;
    }
    setGeneratingImage(true);
    try {
      const result = await generateImage(
        `Professional social media image for a flooring company: ${prompt}. Clean, modern, no text overlays.`,
      );
      const imageUrl = `/generated-images/${result.filename}`;
      setGenPreview((prev) => prev ? { ...prev, imageUrl } : { caption: prompt, warnings: [], imageUrl });
      if (result.wasCropped) {
        toast.info("Image was auto-cropped to remove potential watermark area");
      }
      if (result.brandApplied) {
        toast.info("Brand logo was applied automatically");
      }
      if (result.requiresReview) {
        toast.warning("AI images require manual review before posting (see Settings)");
      }
      toast.success("Image generated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Image generation failed");
    } finally {
      setGeneratingImage(false);
    }
  }

  async function handleApplyBranding() {
    if (!genPreview?.imageUrl) {
      toast.error("Generate or attach an image first");
      return;
    }
    setApplyingBrand(true);
    try {
      const filename = genPreview.imageUrl.split("/").pop() ?? "";
      const result = await applyBrandOverlay(filename);
      if (result.applied) {
        const newUrl = `/generated-images/${result.filename}`;
        setGenPreview((prev) => prev ? { ...prev, imageUrl: newUrl } : null);
        toast.success("Brand logo applied");
      } else {
        toast.warning("Overlay not applied — check logo path in Settings > Brand Logo Overlay");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Brand overlay failed");
    } finally {
      setApplyingBrand(false);
    }
  }

  function resetGenerate() {
    setGenPrompt("");
    setGenUrl("");
    setGenPreview(null);
    setGenPlatform("instagram");
    setGenAudience("general");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-charcoal">Drafts</h1>
          <p className="text-sm text-brand-muted">
            Review AI-generated drafts and move them to the posting queue.
          </p>
        </div>
        <Button
          className="gap-1.5"
          onClick={() => { resetGenerate(); setShowGenerate(true); }}
        >
          <Sparkles className="h-4 w-4" />
          Generate with AI
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error.message}</p> : null}

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-brand-accent/30 bg-brand-accent/5 px-4 py-2">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button disabled={busyId !== null} onClick={() => bulkAction("approved")} size="sm">
            Approve All
          </Button>
          <Button disabled={busyId !== null} onClick={() => bulkAction("rejected")} size="sm" variant="outline">
            Reject All
          </Button>
          <Button onClick={() => setSelectedIds(new Set())} size="sm" variant="ghost">
            Clear
          </Button>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading drafts...</p>
      ) : (
        <>
          {sortedDrafts.length > 0 && (
            <div className="flex items-center gap-2">
              <input
                checked={selectedIds.size === sortedDrafts.length && sortedDrafts.length > 0}
                className="h-4 w-4 rounded border-border accent-brand-primary"
                onChange={toggleAll}
                type="checkbox"
              />
              <span className="text-xs text-brand-muted">Select all</span>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {sortedDrafts.map((draft) => (
              <Card className="rounded-2xl" key={draft.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <input
                      checked={selectedIds.has(draft.id)}
                      className="mt-1 h-4 w-4 rounded border-border accent-brand-primary"
                      onChange={() => toggleSelect(draft.id)}
                      type="checkbox"
                    />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge className={platformBadgeClass(draft.platform)}>
                          {draft.platform}
                        </Badge>
                        <Badge variant="outline">{draft.status}</Badge>
                      </div>
                      <p className="line-clamp-3 text-sm">{draft.caption}</p>
                      <div className="flex flex-wrap gap-2">
                        {draft.status === "draft" && (
                          <>
                            <Button
                              disabled={busyId !== null}
                              onClick={() => onStatus(draft.id, "approved")}
                              size="sm"
                            >
                              Approve
                            </Button>
                            <Button
                              disabled={busyId !== null}
                              onClick={() => onStatus(draft.id, "rejected")}
                              size="sm"
                              variant="outline"
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        {draft.status === "approved" && (
                          <Button
                            disabled={busyId !== null}
                            onClick={() => onSchedule(draft.id)}
                            size="sm"
                            variant="secondary"
                          >
                            Schedule +1h
                          </Button>
                        )}
                        <Button onClick={() => setSelected(draft)} size="sm" variant="ghost">
                          Preview
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Preview sheet */}
      <Sheet onOpenChange={(open) => !open && setSelected(null)} open={selected !== null}>
        <SheetContent className="sm:max-w-[440px]">
          <SheetHeader>
            <SheetTitle>Draft Preview</SheetTitle>
            <SheetDescription>Live mobile render for final QA before scheduling.</SheetDescription>
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

      {/* AI Generate sheet */}
      <Sheet onOpenChange={(open) => { if (!open) { setShowGenerate(false); resetGenerate(); } }} open={showGenerate}>
        <SheetContent className="sm:max-w-[520px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-brand-gold" />
              Generate with AI
            </SheetTitle>
            <SheetDescription>
              Describe the post you want, pick your audience, and let the AI write it.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="gen-prompt">Prompt</label>
              <textarea
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-brand-charcoal focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
                disabled={generating}
                id="gen-prompt"
                onChange={(e) => setGenPrompt(e.target.value)}
                placeholder="Write a post about our new hybrid plank range for pet owners..."
                rows={3}
                value={genPrompt}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="gen-url">Reference URL (optional)</label>
              <Input
                disabled={generating}
                id="gen-url"
                onChange={(e) => setGenUrl(e.target.value)}
                placeholder="https://example.com/article-to-reference"
                type="url"
                value={genUrl}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="gen-platform">Platform</label>
                <select
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-brand-charcoal focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
                  disabled={generating}
                  id="gen-platform"
                  onChange={(e) => setGenPlatform(e.target.value as Platform)}
                  value={genPlatform}
                >
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="google_business">Google Business</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="gen-audience">Audience Segment</label>
                <select
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-brand-charcoal focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
                  disabled={generating}
                  id="gen-audience"
                  onChange={(e) => setGenAudience(e.target.value)}
                  value={genAudience}
                >
                  {AUDIENCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Button className="gap-1.5 text-xs" disabled={generating || generatingImage || applyingBrand} onClick={handleGenerate}>
                {generating ? (
                  <>
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Writing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Generate Caption
                  </>
                )}
              </Button>
              <Button
                className="gap-1.5 text-xs"
                disabled={generating || generatingImage || applyingBrand}
                onClick={handleGenerateImage}
                variant="secondary"
              >
                {generatingImage ? (
                  <>
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Creating...
                  </>
                ) : (
                  <>
                    <ImagePlus className="h-3.5 w-3.5" />
                    Generate Image
                  </>
                )}
              </Button>
              <Button
                className="gap-1.5 text-xs"
                disabled={generating || generatingImage || applyingBrand || !genPreview?.imageUrl}
                onClick={handleApplyBranding}
                variant="outline"
              >
                {applyingBrand ? (
                  <>
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Branding...
                  </>
                ) : (
                  <>
                    <Stamp className="h-3.5 w-3.5" />
                    Apply Logo
                  </>
                )}
              </Button>
            </div>

            {genPreview && (
              <div className="space-y-3 rounded-xl border border-border p-4">
                <h3 className="text-sm font-semibold">Preview</h3>
                {genPreview.warnings.length > 0 && (
                  <div className="space-y-1">
                    {genPreview.warnings.map((w, i) => (
                      <p className="text-xs text-amber-600" key={i}>{w}</p>
                    ))}
                  </div>
                )}
                <PhoneMockup
                  caption={genPreview.caption}
                  imageUrl={genPreview.imageUrl}
                  platform={genPlatform}
                />
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
