import 'dotenv/config';

/** Graph API version segment (e.g. v21.0). Override with META_GRAPH_API_VERSION. */
const graphApiVersion = process.env.META_GRAPH_API_VERSION ?? 'v21.0';

export const metaConfig = {
  graphApiVersion,
  appId: process.env.META_APP_ID!,
  appSecret: process.env.META_APP_SECRET!,
  accessToken: process.env.META_ACCESS_TOKEN!,
  pageId: process.env.META_PAGE_ID!,
  igUserId: process.env.META_IG_USER_ID!,
  adAccountId: process.env.META_AD_ACCOUNT_ID!,
  timezone: process.env.DEFAULT_POSTING_TIMEZONE ?? 'Australia/Brisbane',
  defaultAdRadiusKm: Number(process.env.DEFAULT_AD_RADIUS_KM ?? 40),
  defaultAgeMin: Number(process.env.DEFAULT_AD_AGE_MIN ?? 30),
  defaultAgeMax: Number(process.env.DEFAULT_AD_AGE_MAX ?? 65),
  defaultDailyBudgetAud: Number(process.env.DEFAULT_AD_DAILY_BUDGET_AUD ?? 10)
};
