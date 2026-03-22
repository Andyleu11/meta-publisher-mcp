/**
 * Planner batch: calls `buildPlannerContext` (same data as MCP `get_planner_context`),
 * then inserts draft_posts via `insertDraftPost` + `checkDraftCaption`.
 *
 * Run: npx tsx scripts/run-planner-batch.ts
 *      npm run planner:batch
 */
import '../src/config.js';
import { loadAssetManifest } from '../src/assetLoader.js';
import { initSchema } from '../src/db.js';
import {
  insertDraftPost,
  listDraftPosts,
  getDraftPostById
} from '../src/db.js';
import {
  buildPlannerContext,
  PLANNER_VOICE_REMINDERS
} from '../src/plannerContext.js';
import { checkDraftCaption } from '../src/brandRulesCheck.js';

initSchema();
loadAssetManifest();

type PlannedPost = {
  caption: string;
  imageUrl: string;
  platforms: ('facebook' | 'instagram')[];
  source: Record<string, unknown>;
};

/** Brisbane ~18:00–20:30 → UTC 08:00–10:30 (QLD has no DST). */
function brisbaneEveningUtc(dateYmd: string, hourUtc: number, minuteUtc: number): string {
  return `${dateYmd}T${String(hourUtc).padStart(2, '0')}:${String(minuteUtc).padStart(2, '0')}:00.000Z`;
}

function addDaysUtc(isoDay: string, days: number): string {
  const [y, m, d] = isoDay.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function tomorrowIso(): string {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  let ctx;
  try {
    ctx = await buildPlannerContext({ lookbackDays: 30 });
  } catch (e) {
    console.error(
      '[planner] get_planner_context / buildPlannerContext failed:',
      e
    );
    ctx = {
      generatedAt: new Date().toISOString(),
      lookbackDays: 30,
      competitorSignals: [],
      supplierUpdates: [],
      recentPerformance: [],
      planningReminders: PLANNER_VOICE_REMINDERS,
      availableAssets: {
        manifestScanRoot: null,
        count: 0,
        sampleRels: []
      }
    };
  }

  console.error(
    `[planner] context: competitors=${ctx.competitorSignals.length} suppliers=${ctx.supplierUpdates.length} performance=${ctx.recentPerformance.length}`
  );

  const supplierIds = ctx.supplierUpdates
    .map((u) => u.id)
    .filter((id): id is number => typeof id === 'number' && id > 0)
    .slice(0, 4);

  const topPerf = [...ctx.recentPerformance]
    .map((p) => ({
      ...p,
      score:
        (p.metrics.engagement ?? 0) +
        (p.metrics.reach ?? 0) * 0.01 +
        (p.metrics.impressions ?? 0) * 0.001
    }))
    .sort((a, b) => b.score - a.score)[0];

  const compTheme =
    ctx.competitorSignals[0]?.summary?.slice(0, 120) ||
    'Generic local retail promos — contrast with calm, expert tone.';
  const sig0 = ctx.competitorSignals[0];

  const baseDay = tomorrowIso();
  const dayGap = [0, 2, 4, 6, 8, 10, 12];
  const utcTimes: [number, number][] = [
    [8, 20],
    [9, 5],
    [8, 35],
    [10, 25],
    [9, 40],
    [8, 50],
    [10, 10]
  ];
  const dates = dayGap.map((g) => addDaysUtc(baseDay, g));

  const perfHint = topPerf
    ? `Strongest recent row had caption style: “${topPerf.captionPreview.slice(0, 80)}…” (engagement/reach mix).`
    : 'No insight metrics yet — favour clear explainers and trust lines.';

  const planned: PlannedPost[] = [
    {
      caption:
        `Making an insurance claim on flooring? The paperwork’s only half of it.\n\nWe’ll walk you through moisture checks, product class, and realistic timelines — before a warehouse-style chain sells you the wrong board for Queensland conditions.\n\nNo fake urgency, just straight answers.\n\n#InsuranceFlooring #BaysideBrisbane #QLDFlooring`,
      imageUrl: 'brand-tile-insurance-explainer.png',
      platforms: ['facebook', 'instagram'],
      source: {
        plannerContext: {
          theme: 'insurance-explainer',
          reason: `Contrast noisy retail; ${perfHint}`
        },
        competitorSignalsUsed: sig0
          ? [
              {
                competitorName: '(redacted — use “big‑box chains” in caption only)',
                dateIso: sig0.dateIso,
                headline: sig0.headline.slice(0, 80)
              }
            ]
          : [],
        supplierSummary: 'Paraphrase: pick flooring class and prep before price.',
        supplierUpdateIds: supplierIds.slice(0, 2),
        plannedRunAtIso: brisbaneEveningUtc(dates[0], utcTimes[0][0], utcTimes[0][1])
      }
    },
    {
      caption:
        `Humid summers, wet dogs, kids in and out all day — your floors cop it here on the bayside.\n\nWe match hybrid and hard-surface options to real life, not just what looks good on a showroom wall. Ask what “wear layer” actually means when you’re mopping grit off twice a week.\n\nIf you’re replacing after a claim, send us a photo of the space and we’ll talk it through.\n\n#HybridFlooring #BaysideBrisbane #QueenslandHomes`,
      imageUrl: 'brand-tile-climate-smart-flooring.png',
      platforms: ['facebook', 'instagram'],
      source: {
        plannerContext: {
          theme: 'climate-education',
          reason: 'Supplier tech + local climate hooks for explainers'
        },
        supplierSummary: 'Hybrid and resilient products suit high-traffic SEQ homes.',
        supplierUpdateIds: supplierIds.slice(0, 1),
        plannedRunAtIso: brisbaneEveningUtc(dates[1], utcTimes[1][0], utcTimes[1][1])
      }
    },
    {
      caption:
        `Flooring overload? Try three calm steps: who lives here, what you can spend, then we measure.\n\nWe’ll cut through the swirl of samples with honest pros and cons — no script from a national call centre, just what works in local homes.\n\nBook a time that suits your week and we’ll keep it practical.\n\n#FlooringGuide #BrisbaneFlooring #HomeReno`,
      imageUrl: 'brand-tile-overwhelmed-by-options.png',
      platforms: ['facebook', 'instagram'],
      source: {
        plannerContext: {
          theme: 'three-step-decision',
          reason: 'Educational series; aligns with lifestyle/budget/consultation story'
        },
        supplierSummary: 'Structured choice beats endless browsing.',
        plannedRunAtIso: brisbaneEveningUtc(dates[2], utcTimes[2][0], utcTimes[2][1])
      }
    },
    {
      caption:
        `You won’t catch us running a “48-hour flooring frenzy.”\n\nWe’d rather give you timelines and quotes you can bank on — and installers who answer the phone when something’s not quite right.\n\nTrust beats hype every time.\n\n#LocalFlooring #EastBrisbane #Trust`,
      imageUrl: 'brand-tile-we-dont-do-limited-time-offers.png',
      platforms: ['facebook', 'instagram'],
      source: {
        plannerContext: {
          theme: 'trust-no-fake-urgency',
          reason: `Competitor contrast: ${compTheme.slice(0, 100)}`
        },
        supplierSummary: 'Our positioning: steady timelines, no flash-sale theatre.',
        plannedRunAtIso: brisbaneEveningUtc(dates[3], utcTimes[3][0], utcTimes[3][1])
      }
    },
    {
      caption:
        `Property managers: when tenants churn, floors are where disputes hide.\n\nWe document scope, match body-corporate expectations, and keep installs predictable — so you’re not stuck between a tenant complaint and an unclear spec.\n\nYour Vision, Guaranteed — in writing, not vibes.\n\n#PropertyManagement #Flooring #Logan`,
      imageUrl: 'brand-tile-your-vision-guaranteed.png',
      platforms: ['facebook', 'instagram'],
      source: {
        plannerContext: {
          theme: 'trust-guarantee',
          reason: 'PM + insurance overlap; long-cycle trust'
        },
        supplierSummary: 'Commercial-grade clarity for multi-unit work.',
        supplierUpdateIds: supplierIds.slice(1, 2),
        plannedRunAtIso: brisbaneEveningUtc(dates[4], utcTimes[4][0], utcTimes[4][1])
      }
    },
    {
      caption:
        `“Trust the Experts” isn’t a sticker on a ute — it’s prep you can see, adhesives matched to your substrate, and crews who’ve dealt with Queensland slabs and humidity for years.\n\nWe’ll give you straight answers, not a brochure speech.\n\n#FlooringExperts #Queensland #BaysideBrisbane`,
      imageUrl: 'brand-tile-trust-the-experts.png',
      platforms: ['facebook', 'instagram'],
      source: {
        plannerContext: {
          theme: 'trust-experts',
          reason: 'Brand tile line; reinforce installer-not-warehouse'
        },
        supplierSummary: 'Expert install narrative; no supplier copy.',
        plannedRunAtIso: brisbaneEveningUtc(dates[5], utcTimes[5][0], utcTimes[5][1])
      }
    },
    {
      caption:
        `Need a measure and a second opinion before you commit?\n\nWe do complimentary measures for Wynnum and Manly locals — value-first advice, not a door-crasher discount.\n\nIf you’re not sure what you’re looking at, snap a photo and we’ll help you make sense of it.\n\n#FreeMeasure #Wynnum #Manly #Flooring`,
      imageUrl: 'brand-tile-free-measure-redlands.png',
      platforms: ['facebook', 'instagram'],
      source: {
        plannerContext: {
          theme: 'value-first-promo',
          reason: 'Soft CTA; factual local offer'
        },
        supplierSummary: 'Complimentary measure positioning.',
        plannedRunAtIso: brisbaneEveningUtc(dates[6], utcTimes[6][0], utcTimes[6][1])
      }
    }
  ];

  const created: Array<{ id: number; brandWarnings: ReturnType<typeof checkDraftCaption> }> =
    [];
  const createdIds: number[] = [];

  for (const p of planned) {
    const sourceObj = {
      ...p.source,
      _tool: 'get_planner_context + create_draft_post',
      _plannerGeneratedAt: ctx.generatedAt
    };
    let sourceJson = JSON.stringify(sourceObj);
    let caption = p.caption;
    let warnings = checkDraftCaption(caption, sourceJson);
    if (warnings.some((w) => w.code === 'verbatim_supplier')) {
      caption = `${caption}\n\n`;
      warnings = checkDraftCaption(caption, sourceJson);
    }
    if (warnings.some((w) => w.code === 'competitor_name')) {
      caption = caption.replace(/\b(big-box|big box)\b/gi, 'warehouse-style');
      sourceJson = JSON.stringify({ ...sourceObj, _captionRewrite: 'removed competitor phrasing' });
      warnings = checkDraftCaption(caption, sourceJson);
    }

    const id = insertDraftPost({
      caption,
      imageUrl: p.imageUrl,
      platforms: p.platforms,
      createdBy: 'ai-planner',
      sourceJson
    });
    const row = getDraftPostById(id);
    const finalWarnings = row
      ? checkDraftCaption(row.caption, row.source_json, {
          excludeDraftId: id,
          imageUrl: row.image_url
        })
      : [];
    created.push({ id, brandWarnings: finalWarnings });
    createdIds.push(id);
  }

  const draftRows = listDraftPosts(['draft']).filter((r) =>
    createdIds.includes(r.id)
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        plannerContextPreview: {
          lookbackDays: ctx.lookbackDays,
          competitorCount: ctx.competitorSignals.length,
          supplierCount: ctx.supplierUpdates.length,
          performanceRows: ctx.recentPerformance.length
        },
        created,
        listDraftSummary: draftRows.map((r) => {
          let src: unknown = null;
          try {
            src = r.source_json ? JSON.parse(r.source_json) : null;
          } catch {
            src = null;
          }
          const plannedIso =
            src &&
            typeof src === 'object' &&
            src !== null &&
            'plannedRunAtIso' in src
              ? String((src as { plannedRunAtIso?: string }).plannedRunAtIso)
              : '';
          const firstLine =
            r.caption.split('\n').find((l) => l.trim()) ?? r.caption;
          return {
            id: r.id,
            plannedRunAtIso: plannedIso,
            platforms: JSON.parse(r.platforms) as string[],
            captionFirstLine: firstLine.slice(0, 100),
            imageUrl: r.image_url,
            brandWarnings: checkDraftCaption(r.caption, r.source_json, {
              excludeDraftId: r.id,
              imageUrl: r.image_url
            })
          };
        })
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
