import type { Express, Request, Response } from 'express';
import { getMeta, insertDraftPost, countDraftsCreatedTodayBySource, insertErrorLog } from './db.js';
import { checkDraftCaption } from './brandRulesCheck.js';
import { withRetry } from './retry.js';

const AUDIENCE_SEGMENTS: Record<string, string> = {
  insurance: 'insurance replacement flooring customers who need fast, reliable floor restoration after water damage, fire, or storm events',
  renovations: 'homeowners planning kitchen, bathroom, or whole-home renovations who want durable, stylish flooring options',
  new_home: 'new home buyers and builders selecting flooring for their first home or custom build',
  upgrades: 'homeowners upgrading their living spaces for better comfort, aesthetics, and property value',
  rental: 'property investors and landlords upgrading rental or investment properties with hard-wearing, low-maintenance floors',
  general: 'homeowners across Bundaberg, Hervey Bay, and surrounding Queensland regions looking for quality flooring solutions',
};

const SYSTEM_PROMPT = `You are the social media content writer for A to Z Flooring Solutions, a professional flooring company based in Bundaberg, Queensland, Australia.

Your brand voice is:
- Friendly, knowledgeable, and confident (never salesy or pushy)
- Local and relatable — reference Queensland weather, lifestyle, and real customer scenarios
- Educational — help people understand flooring options, not just sell them

You write social media posts for Facebook and Instagram. Each post should:
- Be concise (under 300 characters for Instagram, up to 500 for Facebook)
- Include a clear call-to-action (visit website, call for free measure and quote, book a consultation)
- Avoid mentioning competitor names
- Avoid making specific price claims unless told otherwise
- Use emojis sparingly and naturally (1-3 max)

Business contact: atozflooringsolutions.com.au`;

async function callLlmOnce(
  provider: string,
  apiKey: string,
  prompt: string,
  systemPrompt: string,
): Promise<string> {
  if (provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${text}`);
    }
    const json = (await response.json()) as { content: Array<{ text: string }> };
    return json.content?.[0]?.text ?? '';
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: 1024,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${text}`);
  }
  const json = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return json.choices?.[0]?.message?.content ?? '';
}

async function callLlm(
  provider: string,
  apiKey: string,
  prompt: string,
  systemPrompt: string,
): Promise<string> {
  return withRetry(
    () => callLlmOnce(provider, apiKey, prompt, systemPrompt),
    `LLM (${provider})`,
  );
}

async function scrapeUrl(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'AtoZPublisher/1.0 (content curation)' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Failed to fetch URL: ${response.status}`);
  const html = await response.text();
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.slice(0, 4000);
}

function checkAiGuardrails(): { allowed: boolean; reason?: string } {
  const mode = getMeta('ai_access_mode');
  if (mode === 'read_only') {
    return { allowed: false, reason: 'AI access mode is set to read_only. Generation is disabled.' };
  }

  const maxPerDay = getMeta('ai_max_drafts_per_day');
  if (maxPerDay) {
    const limit = parseInt(maxPerDay, 10);
    if (!Number.isNaN(limit) && limit > 0) {
      const todayCount = countDraftsCreatedTodayBySource('ai-generate') +
        countDraftsCreatedTodayBySource('url-curate');
      if (todayCount >= limit) {
        return { allowed: false, reason: `Daily AI draft limit reached (${todayCount}/${limit}). Try again tomorrow or increase the limit in Settings.` };
      }
    }
  }

  return { allowed: true };
}

function checkBlockedTopics(prompt: string): string | null {
  const blocked = getMeta('ai_blocked_topics');
  if (!blocked) return null;
  const topics = blocked.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  const lower = prompt.toLowerCase();
  for (const topic of topics) {
    if (lower.includes(topic)) {
      return `Blocked topic detected: "${topic}". Remove it from your prompt or update AI Guardrails in Settings.`;
    }
  }
  return null;
}

function buildUrlCurationPrompt(platform: string, audienceDesc: string, pageText: string, sourceUrl: string): string {
  return [
    `You are curating a ${platform} post for A to Z Flooring Solutions.`,
    `Target audience: ${audienceDesc}.`,
    `\nSummarize the key point from this article and turn it into a compelling flooring-related social media post.`,
    `Source: ${sourceUrl}`,
    `\nArticle content:\n${pageText}`,
    `\nReturn ONLY the post caption text — no quotes, no preamble. Include a call-to-action.`,
  ].join('\n');
}

export function registerGenerateDraftRoutes(app: Express): void {
  app.post('/api/generate-draft', async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
      const sourceUrl = typeof body.url === 'string' ? body.url.trim() : '';
      const validPlatforms = ['facebook', 'instagram', 'linkedin', 'google_business'];
      const platform = typeof body.platform === 'string' && validPlatforms.includes(body.platform)
        ? body.platform
        : 'instagram';
      const audienceKey = typeof body.audience === 'string' ? body.audience : 'general';

      if (!prompt && !sourceUrl) {
        res.status(400).json({ ok: false, message: 'Provide a prompt or URL' });
        return;
      }

      const guardrail = checkAiGuardrails();
      if (!guardrail.allowed) {
        res.status(403).json({ ok: false, message: guardrail.reason });
        return;
      }

      if (prompt) {
        const blockedMsg = checkBlockedTopics(prompt);
        if (blockedMsg) {
          res.status(400).json({ ok: false, message: blockedMsg });
          return;
        }
      }

      const provider = getMeta('llm_provider') ?? 'openai';
      const apiKey = getMeta('llm_api_key');
      if (!apiKey) {
        res.status(400).json({
          ok: false,
          message: 'No LLM API key configured. Go to Settings to add one.',
        });
        return;
      }

      const audienceDesc = AUDIENCE_SEGMENTS[audienceKey] ?? AUDIENCE_SEGMENTS.general;
      let contextBlock = '';
      if (sourceUrl) {
        try {
          const text = await scrapeUrl(sourceUrl);
          contextBlock = `\n\nReference content from ${sourceUrl}:\n${text}`;
        } catch (err) {
          contextBlock = `\n\n(Could not fetch URL: ${err instanceof Error ? err.message : String(err)})`;
        }
      }

      const fullPrompt = [
        `Write a ${platform} post for the following audience: ${audienceDesc}.`,
        prompt ? `Topic/direction: ${prompt}` : '',
        contextBlock,
        `\nReturn ONLY the post caption text, nothing else.`,
      ]
        .filter(Boolean)
        .join('\n');

      const caption = await callLlm(provider, apiKey, fullPrompt, SYSTEM_PROMPT);
      if (!caption.trim()) {
        res.status(500).json({ ok: false, message: 'LLM returned empty response' });
        return;
      }

      const sourceJson = JSON.stringify({
        prompt: prompt || null,
        url: sourceUrl || null,
        audience: audienceKey,
        provider,
      });
      const warnings = checkDraftCaption(caption, sourceJson);

      const draftId = insertDraftPost({
        caption: caption.trim(),
        imageUrl: null,
        platforms: [platform],
        createdBy: 'ai-generate',
        sourceJson: JSON.stringify({
          prompt: prompt || null,
          url: sourceUrl || null,
          audience: audienceKey,
          provider,
        }),
      });

      res.json({
        ok: true,
        draft: {
          id: draftId,
          caption: caption.trim(),
          platform,
          audience: audienceKey,
          brandWarnings: warnings.map((w) => w.message),
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      insertErrorLog('generate-draft', msg);
      res.status(500).json({ ok: false, message: msg });
    }
  });

  app.post('/api/curate-url', async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const sourceUrl = typeof body.url === 'string' ? body.url.trim() : '';
      const audienceKey = typeof body.audience === 'string' ? body.audience : 'general';
      const allowedPlatforms = ['facebook', 'instagram', 'linkedin', 'google_business'];
      const platforms = Array.isArray(body.platforms)
        ? (body.platforms as string[]).filter((p) => allowedPlatforms.includes(p))
        : ['instagram', 'facebook'];

      if (!sourceUrl) {
        res.status(400).json({ ok: false, message: 'URL is required' });
        return;
      }

      const guardrail = checkAiGuardrails();
      if (!guardrail.allowed) {
        res.status(403).json({ ok: false, message: guardrail.reason });
        return;
      }

      const provider = getMeta('llm_provider') ?? 'openai';
      const apiKey = getMeta('llm_api_key');
      if (!apiKey) {
        res.status(400).json({ ok: false, message: 'No LLM API key configured. Go to Settings.' });
        return;
      }

      let pageText: string;
      try {
        pageText = await scrapeUrl(sourceUrl);
      } catch (err) {
        res.status(400).json({
          ok: false,
          message: `Could not fetch URL: ${err instanceof Error ? err.message : String(err)}`,
        });
        return;
      }

      const audienceDesc = AUDIENCE_SEGMENTS[audienceKey] ?? AUDIENCE_SEGMENTS.general;
      const drafts: Array<{ id: number; platform: string; caption: string; brandWarnings: string[] }> = [];

      for (const platform of platforms) {
        const prompt = buildUrlCurationPrompt(platform, audienceDesc, pageText, sourceUrl);
        const caption = await callLlm(provider, apiKey, prompt, SYSTEM_PROMPT);
        if (!caption.trim()) continue;

        const curateSourceJson = JSON.stringify({ url: sourceUrl, audience: audienceKey, provider });
        const warnings = checkDraftCaption(caption, curateSourceJson);
        const draftId = insertDraftPost({
          caption: caption.trim(),
          imageUrl: null,
          platforms: [platform],
          createdBy: 'url-curate',
          sourceJson: curateSourceJson,
        });
        drafts.push({
          id: draftId,
          platform,
          caption: caption.trim(),
          brandWarnings: warnings.map((w) => w.message),
        });
      }

      res.json({ ok: true, drafts });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      insertErrorLog('curate-url', msg);
      res.status(500).json({ ok: false, message: msg });
    }
  });
}
