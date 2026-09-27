export const PREFIX = process.env.BOT_PREFIX || ';';
export const LOG_LEVEL = process.env.LOG_LEVEL || 'INFO';

const rawOwnerIds = (process.env.OWNER_IDS || process.env.OWNER_ID || '')
    .split(',')
    .map((id) => String(id).trim())
    .filter(Boolean);

export const OWNER_IDS = [...new Set(rawOwnerIds)];
export const OWNER_ID = OWNER_IDS[0] || null;

export const SUPPORT_SERVER_INVITE = process.env.SUPPORT_SERVER_INVITE || '';
const rawPremiumRoleIds = (process.env.PREMIUM_ROLE_ID || '')
    .split(',')
    .map((id) => String(id).trim())
    .filter(Boolean);

export const PREMIUM_ROLE_IDS = [...new Set(rawPremiumRoleIds)];
const maxConcurrentQuestChecks = Number(process.env.QUEST_MAX_CONCURRENT_CHECKS || 4);
const autoquestPollIntervalMs = Number(process.env.QUEST_POLL_MS || 300000);
export const QUEST_SETTINGS = {
    maxConcurrentQuestChecks: Number.isFinite(maxConcurrentQuestChecks) && maxConcurrentQuestChecks > 0 ? Math.floor(maxConcurrentQuestChecks) : 4,
    autoquestPollIntervalMs: Number.isFinite(autoquestPollIntervalMs) && autoquestPollIntervalMs >= 10_000 ? autoquestPollIntervalMs : 300_000,
};

export function isOwnerUserId(userId) {
    if (!userId) return false;
    const target = String(userId).trim();
    return OWNER_IDS.some((id) => String(id).trim() === target);
}
