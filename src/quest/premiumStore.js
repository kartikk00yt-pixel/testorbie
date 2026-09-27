import * as fs from 'node:fs';
import * as path from 'node:path';

const PREMIUM_FILE = path.join(process.cwd(), 'premium.json');
const TRIAL_CLAIMS_FILE = path.join(process.cwd(), 'trialClaims.json');
const MAX_DURATION_MS = 8.64e15;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minute cache

// In-memory cache for premium checks with TTL
const premiumCache = new Map();

function getCached(userId) {
    const entry = premiumCache.get(userId);
    if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
        return entry.value;
    }
    premiumCache.delete(userId);
    return null;
}

function setCached(userId, value) {
    premiumCache.set(userId, { value, timestamp: Date.now() });
}

function readPremiumData() {
    try {
        const raw = JSON.parse(fs.readFileSync(PREMIUM_FILE, 'utf-8'));
        return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    } catch {
        return {};
    }
}

function writePremiumData(data) {
    fs.writeFileSync(PREMIUM_FILE, JSON.stringify(data, null, 2));
    premiumCache.clear(); // Clear cache on write
}

function readTrialClaims() {
    try {
        const raw = JSON.parse(fs.readFileSync(TRIAL_CLAIMS_FILE, 'utf-8'));
        return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    } catch {
        return {};
    }
}

function writeTrialClaims(data) {
    fs.writeFileSync(TRIAL_CLAIMS_FILE, JSON.stringify(data, null, 2));
}

export function normalizeUserId(userId) {
    return String(userId ?? '').trim();
}

export function normalizePremiumUserId(userId) {
    const raw = normalizeUserId(userId);
    if (!raw) return '';

    const match = raw.match(/^(?:<@!?)?(\d{17,20})>?$/);
    if (match) return match[1];

    return /^\d{17,20}$/.test(raw) ? raw : '';
}

export function parsePremiumDuration(rawValue, rawUnit) {
    const rawValueText = String(rawValue ?? '').trim().toLowerCase();
    const rawUnitText = String(rawUnit ?? '').trim().toLowerCase();

    const permanentTokens = new Set(['p', 'perm', 'permanent', 'forever', 'never', 'lifetime', 'life']);
    if (permanentTokens.has(rawValueText) || permanentTokens.has(rawUnitText)) {
        return { type: 'permanent', expiresAt: null, ms: null };
    }

    const value = Number(rawValue ?? 0);
    if (!Number.isFinite(value) || value <= 0) return null;

    const unit = rawUnitText;
    const unitMap = {
        second: 1000,
        seconds: 1000,
        sec: 1000,
        secs: 1000,
        s: 1000,
        minute: 60000,
        minutes: 60000,
        min: 60000,
        mins: 60000,
        hour: 3600000,
        hours: 3600000,
        hr: 3600000,
        hrs: 3600000,
        h: 3600000,
        day: 86400000,
        days: 86400000,
        d: 86400000,
        month: 2592000000,
        months: 2592000000,
        mon: 2592000000,
        mo: 2592000000,
        m: 2592000000,
        week: 604800000,
        weeks: 604800000,
        w: 604800000,
        years: 31557600000,
        year: 31557600000,
        yr: 31557600000,
        yrs: 31557600000,
        y: 31557600000,
    };

    const multiplier = unitMap[unit];
    if (multiplier == null) return null;
    const durationMs = value * multiplier;
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_DURATION_MS) return null;
    const expiresAtMs = Date.now() + durationMs;
    if (!Number.isFinite(expiresAtMs) || expiresAtMs > MAX_DURATION_MS) return null;
    return { type: 'temporary', expiresAt: new Date(expiresAtMs).toISOString(), ms: durationMs };
}

function normalizeEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    return {
        userId: normalizeUserId(entry.userId),
        grantedBy: normalizeUserId(entry.grantedBy || 'owner'),
        grantedAt: entry.grantedAt || new Date().toISOString(),
        expiresAt: entry.expiresAt || null,
        permanent: Boolean(entry.permanent),
        trial: Boolean(entry.trial),
    };
}

export function hasPremiumAccess(userId) {
    const safeId = normalizePremiumUserId(userId);
    if (!safeId) return false;
    
    // Check cache first
    const cached = getCached(safeId);
    if (cached !== null) return cached;
    
    const data = readPremiumData();
    const entry = normalizeEntry(data[safeId]);
    if (!entry) {
        setCached(safeId, false);
        return false;
    }
    if (entry.permanent || !entry.expiresAt) {
        setCached(safeId, true);
        return true;
    }
    const expiresAt = new Date(entry.expiresAt).getTime();
    const expired = !Number.isFinite(expiresAt) || expiresAt <= Date.now();
    if (expired) {
        delete data[safeId];
        writePremiumData(data);
        setCached(safeId, false);
        return false;
    }
    setCached(safeId, true);
    return true;
}

export function isTrialPremium(userId) {
    const safeId = normalizePremiumUserId(userId);
    if (!safeId) return false;
    const entry = normalizeEntry(readPremiumData()[safeId]);
    if (!entry?.trial) return false;
    return hasPremiumAccess(safeId);
}

export function hasClaimedTrial(userId) {
    const safeId = normalizePremiumUserId(userId);
    return Boolean(safeId && readTrialClaims()[safeId]);
}

export function grantTrialPremium(userId, grantedBy = 'trial') {
    const safeId = normalizePremiumUserId(userId);
    if (!safeId) return { ok: false, error: 'Missing or invalid userId.' };
    if (hasClaimedTrial(safeId)) return { ok: false, error: 'You have already claimed your 3-day trial.' };

    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const data = readPremiumData();
    data[safeId] = {
        userId: safeId,
        grantedBy: normalizeUserId(grantedBy),
        grantedAt: new Date().toISOString(),
        expiresAt,
        permanent: false,
        trial: true,
    };
    writePremiumData(data);

    const claims = readTrialClaims();
    claims[safeId] = { claimedAt: new Date().toISOString() };
    writeTrialClaims(claims);
    return { ok: true, expiresAt };
}

export function addPremiumAccess(userId, value, unit, grantedBy) {
    const safeId = normalizePremiumUserId(userId);
    if (!safeId) return { ok: false, error: 'Missing or invalid userId. Use a Discord user ID or @mention.' };

    const parsed = parsePremiumDuration(value, unit);
    if (!parsed) {
        return { ok: false, error: 'Invalid duration. Use examples like 7 days, 2 months, 1 year, or permanent.' };
    }

    const data = readPremiumData();
    const entry = {
        userId: safeId,
        grantedBy: normalizeUserId(grantedBy || 'owner'),
        grantedAt: new Date().toISOString(),
        expiresAt: parsed.expiresAt,
        permanent: parsed.type === 'permanent',
        trial: false,
    };

    data[safeId] = entry;
    writePremiumData(data);
    return { ok: true, entry, expiresAt: parsed.expiresAt, permanent: parsed.type === 'permanent' };
}

export function addPermanentPremiumAccessForUsers(userIds, grantedBy) {
    return addPremiumAccessForUsers(userIds, 0, 'permanent', grantedBy);
}

export function addPremiumAccessForUsers(userIds, value, unit, grantedBy) {
    const parsed = parsePremiumDuration(value, unit);
    if (!parsed) return { ok: false, count: 0, error: 'Invalid duration. Use examples like 7 days, 2 months, 1 year, or permanent.' };

    const data = readPremiumData();
    const grantedAt = new Date().toISOString();
    const safeIds = [...new Set(userIds.map(normalizePremiumUserId).filter(Boolean))];

    for (const userId of safeIds) {
        data[userId] = {
            userId,
            grantedBy: normalizeUserId(grantedBy || 'owner'),
            grantedAt,
            expiresAt: parsed.expiresAt,
            permanent: parsed.type === 'permanent',
            trial: false,
        };
    }

    if (safeIds.length > 0) writePremiumData(data);
    return { ok: true, count: safeIds.length, expiresAt: parsed.expiresAt, permanent: parsed.type === 'permanent' };
}

export function removePremiumAccess(userId) {
    const safeId = normalizePremiumUserId(userId);
    if (!safeId) return false;
    const data = readPremiumData();
    if (!(safeId in data)) return false;
    delete data[safeId];
    writePremiumData(data);
    return true;
}

export function listPremiumAccess() {
    const data = readPremiumData();
    return Object.values(data)
        .map(normalizeEntry)
        .filter(Boolean)
        .sort((a, b) => (a.userId || '').localeCompare(b.userId || ''));
}

export function formatPremiumExpiry(expiresAt, permanent = false) {
    if (permanent || !expiresAt) return 'Permanent';
    const date = new Date(expiresAt);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
