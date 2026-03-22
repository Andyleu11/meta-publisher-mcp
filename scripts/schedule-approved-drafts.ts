/**
 * Schedule all `approved` drafts into `scheduled_posts` using `source.plannedRunAtIso`
 * when valid (same behaviour as MCP `schedule_draft_post` → `promoteDraftToScheduled`).
 *
 * Run: npx tsx scripts/schedule-approved-drafts.ts
 *      npm run schedule:approved-drafts
 */
import '../src/config.js';
import { initSchema, listDraftPosts, type DraftPostRow } from '../src/db.js';
import { promoteDraftToScheduled } from '../src/draftsService.js';

initSchema();

function parseSourceJson(row: DraftPostRow): Record<string, unknown> | null {
  if (!row.source_json?.trim()) return null;
  try {
    return JSON.parse(row.source_json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractPlannedRunAtIso(row: DraftPostRow): string | null {
  const o = parseSourceJson(row);
  if (!o) return null;
  const v = o.plannedRunAtIso;
  if (typeof v !== 'string' || !v.trim()) return null;
  return v.trim();
}

function isValidFutureIso(s: string): boolean {
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) return false;
  if (ms < Date.now() - 60_000) return false;
  return true;
}

/**
 * Brisbane-friendly evening slots: 08:00–10:30 UTC (18:00–20:30 QLD, no DST).
 * 11 slots per day, 15 minutes apart; spread across next 14 days.
 */
function fallbackRunAtIso(globalIndex: number): string {
  const slotInDay = globalIndex % 11;
  const daySkip = Math.floor(globalIndex / 11);
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 1 + daySkip);
  d.setUTCHours(8, slotInDay * 15, 0, 0);
  return d.toISOString();
}

type RowResult = {
  draftId: number;
  runAtIso: string;
  scheduledId: number | null;
  status: 'scheduled' | 'error';
  errorMessage?: string;
  usedFallback: boolean;
};

async function main(): Promise<void> {
  const approved = listDraftPosts(['approved']);

  if (approved.length === 0) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          message: 'No drafts with status "approved" — nothing to schedule.',
          results: []
        },
        null,
        2
      )
    );
    return;
  }

  let fallbackCounter = 0;
  const results: RowResult[] = [];

  for (const row of approved) {
    const id = row.id;
    let planned = extractPlannedRunAtIso(row);
    let usedFallback = false;

    if (!planned || !isValidFutureIso(planned)) {
      planned = fallbackRunAtIso(fallbackCounter);
      fallbackCounter += 1;
      usedFallback = true;
    }

    try {
      const { scheduledId } = await promoteDraftToScheduled(id, planned);
      results.push({
        draftId: id,
        runAtIso: new Date(Date.parse(planned)).toISOString(),
        scheduledId,
        status: 'scheduled',
        usedFallback
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({
        draftId: id,
        runAtIso: planned,
        scheduledId: null,
        status: 'error',
        errorMessage: msg,
        usedFallback
      });
    }
  }

  const ok = results.filter((r) => r.status === 'scheduled').length;
  const err = results.filter((r) => r.status === 'error').length;
  const withFallback = results.filter((r) => r.usedFallback && r.status === 'scheduled').length;

  console.log(
    JSON.stringify(
      {
        ok: err === 0,
        summary: {
          approvedDraftsSeen: approved.length,
          successfullyScheduled: ok,
          failed: err,
          usedFallbackRunTime: withFallback
        },
        results
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(
    JSON.stringify({
      ok: false,
      globalError: e instanceof Error ? e.message : String(e)
    })
  );
  process.exitCode = 1;
});
