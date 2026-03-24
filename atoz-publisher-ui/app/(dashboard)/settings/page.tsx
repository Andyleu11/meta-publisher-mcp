"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LocationGroupsEditor } from "@/components/location-groups-editor";
import { useSettings } from "@/hooks/use-api-data";
import { checkSettingsHealth, saveSettings, type Settings } from "@/lib/api";

type HealthStatus = { ok: boolean; name?: string; message?: string } | null;

const SECTION_ICONS: Record<string, string> = {
  "Meta API Credentials": "border-l-brand-teal",
  "Default Ad Targeting & Demographics": "border-l-brand-jade",
  "Meta / Social Ads Spend Budgets": "border-l-brand-gold",
  "Google Ads": "border-l-brand-gold",
  "LinkedIn Ads": "border-l-platform-linkedin",
  "AI Text Generation": "border-l-brand-emerald",
  "AI Image Generation": "border-l-brand-emerald",
  "Brand Logo Overlay": "border-l-brand-teal",
  "AI Guardrails": "border-l-brand-gold",
  "Email Notifications": "border-l-brand-jade",
  "Asset Library": "border-l-brand-mint",
  "Scheduler & Automation": "border-l-brand-teal",
  "LinkedIn Platform": "border-l-platform-linkedin",
  "Google Business Profile": "border-l-platform-gbp",
  "Webhook Integration": "border-l-brand-emerald",
  "Brand Rules": "border-l-brand-gold",
  "Connection Test": "border-l-brand-teal",
};

const SECTIONS = [
  {
    title: "Meta API Credentials",
    description: "Connect your Facebook / Instagram accounts. Secrets are masked after saving.",
    fields: [
      { key: "meta_app_id", label: "App ID", type: "text" },
      { key: "meta_app_secret", label: "App Secret", type: "password" },
      { key: "meta_access_token", label: "Access Token", type: "password" },
      { key: "meta_page_id", label: "Page ID", type: "text" },
      { key: "meta_ig_user_id", label: "Instagram User ID", type: "text" },
      { key: "meta_ad_account_id", label: "Ad Account ID", type: "text", placeholder: "act_xxxxxxx" },
      { key: "meta_graph_api_version", label: "Graph API Version", type: "text", placeholder: "v21.0" },
    ],
  },
  {
    title: "Default Ad Targeting & Demographics",
    description: "Set the default audience for paid promotions. These apply when no override is specified.",
    fields: [
      { key: "default_posting_timezone", label: "Posting Timezone", type: "text", placeholder: "Australia/Brisbane" },
      { key: "default_ad_radius_km", label: "Ad Radius (km)", type: "number", placeholder: "40" },
      { key: "default_ad_age_min", label: "Min Age", type: "number", placeholder: "30" },
      { key: "default_ad_age_max", label: "Max Age", type: "number", placeholder: "65" },
      { key: "target_location_groups", label: "Target Location Groups", type: "location_groups" },
      { key: "default_target_interests", label: "Target Interests", type: "text", placeholder: "Home improvement, Flooring, Renovations, New home buyers, Interior design" },
    ],
  },
  {
    title: "Meta / Social Ads Spend Budgets",
    description: "Daily, weekly, and monthly spend caps for Meta (Facebook + Instagram) paid ads in AUD.",
    fields: [
      { key: "meta_ad_daily_budget_aud", label: "Daily Budget (AUD)", type: "number", placeholder: "15" },
      { key: "meta_ad_weekly_spend_limit_aud", label: "Weekly Spend Limit (AUD)", type: "number", placeholder: "80" },
      { key: "meta_ad_monthly_spend_limit_aud", label: "Monthly Spend Limit (AUD)", type: "number", placeholder: "300" },
    ],
  },
  {
    title: "Google Ads",
    description: "Credentials and spend limits for Google Ads campaigns.",
    fields: [
      { key: "google_ads_customer_id", label: "Customer ID", type: "text", placeholder: "123-456-7890" },
      { key: "google_ads_api_key", label: "API Key / Developer Token", type: "password" },
      { key: "google_ads_daily_budget_aud", label: "Daily Budget (AUD)", type: "number", placeholder: "10" },
      { key: "google_ads_weekly_spend_limit_aud", label: "Weekly Spend Limit (AUD)", type: "number", placeholder: "60" },
      { key: "google_ads_monthly_spend_limit_aud", label: "Monthly Spend Limit (AUD)", type: "number", placeholder: "200" },
    ],
  },
  {
    title: "LinkedIn Ads",
    description: "Spend budgets for LinkedIn sponsored content campaigns.",
    fields: [
      { key: "linkedin_ads_daily_budget_aud", label: "Daily Budget (AUD)", type: "number", placeholder: "10" },
      { key: "linkedin_ads_weekly_spend_limit_aud", label: "Weekly Spend Limit (AUD)", type: "number", placeholder: "50" },
      { key: "linkedin_ads_monthly_spend_limit_aud", label: "Monthly Spend Limit (AUD)", type: "number", placeholder: "180" },
    ],
  },
  {
    title: "AI Text Generation",
    description: "LLM provider for generating post captions and copy.",
    fields: [
      { key: "llm_provider", label: "Provider", type: "text", placeholder: "openai or anthropic" },
      { key: "llm_api_key", label: "API Key", type: "password" },
    ],
  },
  {
    title: "AI Image Generation",
    description: "Provider for auto-generating post images (DALL-E, Stability AI, etc.). Enable auto-crop to trim potential watermarks from the bottom-right corner.",
    fields: [
      { key: "image_gen_provider", label: "Provider", type: "text", placeholder: "openai or stability" },
      { key: "image_gen_api_key", label: "API Key", type: "password" },
      { key: "image_gen_auto_crop", label: "Auto-crop AI Images (trim watermark area)", type: "toggle" },
      { key: "image_gen_crop_bottom_pct", label: "Crop Bottom (%)", type: "number", placeholder: "10" },
      { key: "image_gen_crop_right_pct", label: "Crop Right (%)", type: "number", placeholder: "15" },
      { key: "image_gen_require_review", label: "Require Manual Review Before Posting AI Images", type: "toggle" },
    ],
  },
  {
    title: "Brand Logo Overlay",
    description: "Automatically apply your logo/watermark to generated images and library assets before posting. Point to a PNG with transparency for best results.",
    fields: [
      { key: "brand_overlay_enabled", label: "Enable Brand Overlay on All Images", type: "toggle" },
      { key: "brand_overlay_logo_path", label: "Logo File Path", type: "text", placeholder: "/Volumes/NAS/AtoZ-Assets/logo.png" },
      { key: "brand_overlay_position", label: "Position", type: "text", placeholder: "bottom-right (or top-left, top-right, bottom-left, center)" },
      { key: "brand_overlay_opacity", label: "Opacity (%)", type: "number", placeholder: "80" },
      { key: "brand_overlay_scale_pct", label: "Logo Size (% of image width)", type: "number", placeholder: "15" },
      { key: "brand_overlay_margin_px", label: "Margin from Edge (px)", type: "number", placeholder: "20" },
    ],
  },
  {
    title: "AI Guardrails",
    description: "Control what the AI is allowed to do. Restrict access, limit output volume, and block topics.",
    fields: [
      { key: "ai_access_mode", label: "Access Mode", type: "text", placeholder: "read_write or read_only" },
      { key: "ai_auto_approve_drafts", label: "Auto-approve AI Drafts", type: "toggle" },
      { key: "ai_max_drafts_per_day", label: "Max AI Drafts per Day", type: "number", placeholder: "10" },
      { key: "ai_allowed_topics", label: "Allowed Topics (comma-separated, empty = all)", type: "text", placeholder: "flooring, renovations, home improvement" },
      { key: "ai_blocked_topics", label: "Blocked Topics (comma-separated)", type: "text", placeholder: "politics, religion, competitor promotions" },
    ],
  },
  {
    title: "Email Notifications",
    description: "SMTP settings and event triggers for email alerts.",
    fields: [
      { key: "notify_email_to", label: "Recipient Email(s)", type: "text", placeholder: "admin@atozflooring.com.au" },
      { key: "notify_smtp_host", label: "SMTP Host", type: "text", placeholder: "smtp.gmail.com" },
      { key: "notify_smtp_port", label: "SMTP Port", type: "number", placeholder: "587" },
      { key: "notify_smtp_user", label: "SMTP Username", type: "text" },
      { key: "notify_smtp_pass", label: "SMTP Password", type: "password" },
      { key: "notify_on_draft_created", label: "Notify on Draft Created", type: "toggle" },
      { key: "notify_on_post_published", label: "Notify on Post Published", type: "toggle" },
      { key: "notify_on_post_failed", label: "Notify on Post Failed", type: "toggle" },
      { key: "notify_on_budget_threshold", label: "Notify on Budget Threshold", type: "toggle" },
    ],
  },
  {
    title: "Asset Library",
    description: "Path to a shared network folder of images and saved posts the app can browse and attach to drafts.",
    fields: [
      { key: "asset_library_path", label: "Library Directory Path", type: "text", placeholder: "/Volumes/NAS/AtoZ-Assets" },
    ],
  },
  {
    title: "Scheduler & Automation",
    description: "Control background scheduling, competitor scraping, and email ingestion.",
    fields: [
      { key: "scheduler_enabled", label: "Scheduler Enabled", type: "toggle" },
      { key: "scheduler_interval_ms", label: "Scheduler Interval (ms)", type: "number", placeholder: "45000" },
      { key: "scraping_enabled", label: "Competitor Scraping", type: "toggle" },
      { key: "upload_email_api_enabled", label: "Email Upload API", type: "toggle" },
    ],
  },
  {
    title: "LinkedIn Platform",
    description: "Credentials for publishing posts to a LinkedIn company page.",
    fields: [
      { key: "linkedin_access_token", label: "Access Token", type: "password" },
      { key: "linkedin_org_id", label: "Organization ID", type: "text", placeholder: "12345678" },
    ],
  },
  {
    title: "Google Business Profile",
    description: "Credentials for publishing local posts to your Google Business listing.",
    fields: [
      { key: "gbp_access_token", label: "Access Token", type: "password" },
      { key: "gbp_location_id", label: "Location ID", type: "text", placeholder: "accounts/123/locations/456" },
    ],
  },
  {
    title: "Webhook Integration",
    description: "Shared secret for inbound webhook endpoints (n8n, Zapier, Make). Send as x-webhook-secret header.",
    fields: [
      { key: "webhook_secret", label: "Webhook Secret", type: "password" },
    ],
  },
  {
    title: "Brand Rules",
    description: "Guard rails for AI-generated content to keep it on-brand.",
    fields: [
      { key: "brand_forbid_competitor_names", label: "Forbid Competitor Names", type: "toggle" },
      { key: "brand_max_quoted_words", label: "Max Quoted Words from Supplier", type: "number", placeholder: "20" },
      { key: "brand_allow_price_claims", label: "Allow Price Claims", type: "toggle" },
    ],
  },
] as const;

export default function SettingsPage() {
  const { data: remote, isLoading, mutate } = useSettings();
  const [form, setForm] = useState<Settings>({});
  const [saving, setSaving] = useState(false);
  const [health, setHealth] = useState<HealthStatus>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (remote) {
      setForm(remote);
      setDirty(false);
    }
  }, [remote]);

  const onChange = useCallback((key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  async function onSave() {
    setSaving(true);
    try {
      await saveSettings(form);
      toast.success("Settings saved");
      setDirty(false);
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onHealthCheck() {
    setHealth(null);
    try {
      const result = await checkSettingsHealth();
      setHealth(result);
      if (result.ok) {
        toast.success(`Connected as ${result.name}`);
      } else {
        toast.error(result.message ?? "Connection failed");
      }
    } catch {
      toast.error("Health check request failed");
    }
  }

  if (isLoading) {
    return <p className="text-sm text-brand-muted">Loading settings...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-charcoal">Settings</h1>
          <p className="text-sm text-brand-muted">
            API keys, targeting defaults, automation toggles, and brand rules.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button disabled={saving || !dirty} onClick={onSave} size="sm">
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {SECTIONS.map((section) => (
        <Card className={`rounded-2xl border-l-4 ${SECTION_ICONS[section.title] ?? "border-l-brand-teal"}`} key={section.title}>
          <CardHeader>
            <CardTitle className="text-brand-charcoal">{section.title}</CardTitle>
            <p className="text-sm text-brand-muted">{section.description}</p>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {section.fields.map((field) =>
              field.type === "location_groups" ? (
                <LocationGroupsEditor
                  key={field.key}
                  value={form[field.key] ?? ""}
                  onChange={(json) => onChange(field.key, json)}
                />
              ) : (
                <SettingsField
                  key={field.key}
                  fieldKey={field.key}
                  label={field.label}
                  onChange={onChange}
                  placeholder={"placeholder" in field ? field.placeholder : undefined}
                  type={field.type}
                  value={form[field.key] ?? ""}
                />
              ),
            )}
          </CardContent>
        </Card>
      ))}

      <Card className={`rounded-2xl border-l-4 ${SECTION_ICONS["Connection Test"]}`}>
        <CardHeader>
          <CardTitle className="text-brand-charcoal">Connection Test</CardTitle>
          <p className="text-sm text-brand-muted">
            Verify your Meta API credentials are working.
          </p>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Button onClick={onHealthCheck} size="sm" variant="secondary">
            Test Connection
          </Button>
          {health !== null && (
            <Badge variant={health.ok ? "secondary" : "destructive"}>
              {health.ok ? `Connected: ${health.name}` : health.message ?? "Failed"}
            </Badge>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsField({
  fieldKey,
  label,
  onChange,
  placeholder,
  type,
  value,
}: Readonly<{
  fieldKey: string;
  label: string;
  onChange: (key: string, value: string) => void;
  placeholder?: string;
  type: string;
  value: string;
}>) {
  if (type === "toggle") {
    const checked = value === "true" || value === "1";
    return (
      <label className="flex items-center gap-3 sm:col-span-2 cursor-pointer group">
        <div className="relative">
          <input
            checked={checked}
            className="peer sr-only"
            onChange={(e) => onChange(fieldKey, e.target.checked ? "true" : "false")}
            type="checkbox"
          />
          <div className="h-5 w-9 rounded-full bg-border transition-colors peer-checked:bg-brand-teal" />
          <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
        </div>
        <span className="text-sm text-brand-charcoal group-hover:text-brand-teal transition-colors">{label}</span>
      </label>
    );
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-brand-muted" htmlFor={fieldKey}>
        {label}
      </label>
      <Input
        id={fieldKey}
        onChange={(e) => onChange(fieldKey, e.target.value)}
        placeholder={placeholder}
        type={type === "password" ? "password" : type === "number" ? "number" : "text"}
        value={value ?? ""}
      />
    </div>
  );
}
