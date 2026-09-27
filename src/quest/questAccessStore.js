import * as fs from 'node:fs';
import * as path from 'node:path';

const ACCESS_FILE = path.join(process.cwd(), 'access.json');
const BYPASS_FILE = path.join(process.cwd(), 'bypass.json');
const GUILD_BYPASS_FILE = path.join(process.cwd(), 'guildBypass.json');
const GUILD_PREMIUM_FILE = path.join(process.cwd(), 'guildPremium.json');
const NO_PREFIX_FILE = path.join(process.cwd(), 'noPrefix.json');
const USAGE_FILE = path.join(process.cwd(), 'questUsage.json');
const WINDOW_MS = 24 * 60 * 60 * 1000;
const FREE_QUEST_LIMIT = 3;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minute cache

// In-memory cache for permission checks with TTL
const permissionCache = new Map();

function getCacheKey(type, userId, guildId) {
    return `${type}:${userId}${guildId ? `:${guildId}` : ''}`;
}

function getCached(type, userId, guildId) {
    const key = getCacheKey(type, userId, guildId);
    const entry = permissionCache.get(key);
    if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
        return entry.value;
    }
    permissionCache.delete(key);
    return null;
}

function setCached(type, userId, guildId, value) {
    const key = getCacheKey(type, userId, guildId);
    permissionCache.set(key, { value, timestamp: Date.now() });
}

function clearCache(type, userId, guildId) {
    const key = getCacheKey(type, userId, guildId);
    permissionCache.delete(key);
}

function readJson(file, fallback) {
    try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        return data && typeof data === 'object' && !Array.isArray(data) ? data : fallback;
    } catch {
        return fallback;
    }
}

function writeJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    // Clear relevant caches when writing
    permissionCache.clear();
}

export function hasQuestAccess(userId) {
    const cached = getCached('access', userId);
    if (cached !== null) return cached;

    const access = readJson(ACCESS_FILE, {});
    const result = Boolean(access[String(userId)]);
    setCached('access', userId, null, result);
    return result;
}

export function hasBypass(userId) {
    const cached = getCached('bypass', userId);
    if (cached !== null) return cached;

    const bypass = readJson(BYPASS_FILE, {});
    const result = Boolean(bypass[String(userId)]);
    setCached('bypass', userId, null, result);
    return result;
}

export function grantBypass(userId, grantedBy) {
    const bypass = readJson(BYPASS_FILE, {});
    const key = String(userId);
    bypass[key] = {
        userId: key,
        grantedBy: String(grantedBy),
        grantedAt: new Date().toISOString(),
        lifetime: true,
    };
    writeJson(BYPASS_FILE, bypass);
    return bypass[key];
}

export function revokeBypass(userId) {
    const bypass = readJson(BYPASS_FILE, {});
    const key = String(userId);
    const existed = Boolean(bypass[key]);
    delete bypass[key];
    writeJson(BYPASS_FILE, bypass);
    return existed;
}

function permissionKey(userId, guildId) {
    return `${String(guildId)}:${String(userId)}`;
}

function isPermissionActive(permission) {
    return Boolean(permission) && (!permission.expiresAt || new Date(permission.expiresAt).getTime() > Date.now());
}

export function hasGuildBypass(userId, guildId) {
    if (!guildId) return false;

    // Check cache for both guild-wide and user-specific permissions
    const cacheKey = `guildbypass:${userId}:${guildId}`;
    const entry = permissionCache.get(cacheKey);
    if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
        return entry.value;
    }

    const permissions = readJson(GUILD_BYPASS_FILE, {});
    const guildKey = `guild:${String(guildId)}`;
    const result = isPermissionActive(permissions[guildKey]) || (!!userId && isPermissionActive(permissions[permissionKey(userId, guildId)]));
    permissionCache.set(cacheKey, { value: result, timestamp: Date.now() });
    return result;
}

export function grantGuildBypass(userId, guildId, grantedBy, durationMs = null) {
    const permissions = readJson(GUILD_BYPASS_FILE, {});
    const key = permissionKey(userId, guildId);
    permissions[key] = {
        userId: String(userId),
        guildId: String(guildId),
        grantedBy: String(grantedBy),
        grantedAt: new Date().toISOString(),
        expiresAt: durationMs === null ? null : new Date(Date.now() + durationMs).toISOString(),
    };
    writeJson(GUILD_BYPASS_FILE, permissions);
    return permissions[key];
}

export function grantGuildBypassForGuild(guildId, grantedBy, durationMs = null) {
    const permissions = readJson(GUILD_BYPASS_FILE, {});
    const key = `guild:${String(guildId)}`;
    permissions[key] = {
        userId: null,
        guildId: String(guildId),
        grantedBy: String(grantedBy),
        grantedAt: new Date().toISOString(),
        expiresAt: durationMs === null ? null : new Date(Date.now() + durationMs).toISOString(),
        guildWide: true,
    };
    writeJson(GUILD_BYPASS_FILE, permissions);
    return permissions[key];
}

export function revokeGuildBypass(userId, guildId) {
    const permissions = readJson(GUILD_BYPASS_FILE, {});
    const key = permissionKey(userId, guildId);
    const existed = Boolean(permissions[key]);
    delete permissions[key];
    writeJson(GUILD_BYPASS_FILE, permissions);
    return existed;
}

export function revokeGuildBypassForGuild(guildId) {
    const permissions = readJson(GUILD_BYPASS_FILE, {});
    const key = `guild:${String(guildId)}`;
    const existed = Boolean(permissions[key]);
    delete permissions[key];
    writeJson(GUILD_BYPASS_FILE, permissions);
    return existed;
}

export function hasGuildPremium(userId, guildId) {
    if (!userId || !guildId) return false;
    const permissions = readJson(GUILD_PREMIUM_FILE, {});
    return isPermissionActive(permissions[permissionKey(userId, guildId)]);
}

export function grantGuildPremium(userId, guildId, grantedBy, durationMs = null) {
    const permissions = readJson(GUILD_PREMIUM_FILE, {});
    const key = permissionKey(userId, guildId);
    permissions[key] = {
        userId: String(userId),
        guildId: String(guildId),
        grantedBy: String(grantedBy),
        grantedAt: new Date().toISOString(),
        expiresAt: durationMs === null ? null : new Date(Date.now() + durationMs).toISOString(),
    };
    writeJson(GUILD_PREMIUM_FILE, permissions);
    return permissions[key];
}

export function revokeGuildPremium(userId, guildId) {
    const permissions = readJson(GUILD_PREMIUM_FILE, {});
    const key = permissionKey(userId, guildId);
    const existed = Boolean(permissions[key]);
    delete permissions[key];
    writeJson(GUILD_PREMIUM_FILE, permissions);
    return existed;
}

export function hasNoPrefix(userId, guildId) {
    if (!userId || !guildId) return false;

    // Check cache
    const cacheKey = `noprefix:${userId}:${guildId}`;
    const entry = permissionCache.get(cacheKey);
    if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
        return entry.value;
    }

    const permissions = readJson(NO_PREFIX_FILE, {});
    const result = isPermissionActive(permissions[`global:${String(userId)}`])
        || isPermissionActive(permissions[permissionKey(userId, guildId)])
        || isPermissionActive(permissions[`guild:${String(guildId)}`]);
    permissionCache.set(cacheKey, { value: result, timestamp: Date.now() });
    return result;
}

export function grantGlobalNoPrefix(userId, grantedBy, durationMs = null) {
    const permissions = readJson(NO_PREFIX_FILE, {});
    const key = `global:${String(userId)}`;
    permissions[key] = {
        userId: String(userId),
        grantedBy: String(grantedBy),
        grantedAt: new Date().toISOString(),
        expiresAt: durationMs === null ? null : new Date(Date.now() + durationMs).toISOString(),
        global: true,
    };
    writeJson(NO_PREFIX_FILE, permissions);
    return permissions[key];
}

export function revokeGlobalNoPrefix(userId) {
    const permissions = readJson(NO_PREFIX_FILE, {});
    const key = `global:${String(userId)}`;
    const existed = Boolean(permissions[key]);
    delete permissions[key];
    writeJson(NO_PREFIX_FILE, permissions);
    return existed;
}

export function grantNoPrefix(userId, guildId, grantedBy, durationMs = null) {
    const permissions = readJson(NO_PREFIX_FILE, {});
    const key = permissionKey(userId, guildId);
    permissions[key] = {
        userId: String(userId),
        guildId: String(guildId),
        grantedBy: String(grantedBy),
        grantedAt: new Date().toISOString(),
        expiresAt: durationMs === null ? null : new Date(Date.now() + durationMs).toISOString(),
    };
    writeJson(NO_PREFIX_FILE, permissions);
    return permissions[key];
}

export function revokeNoPrefix(userId, guildId) {
    const permissions = readJson(NO_PREFIX_FILE, {});
    const key = permissionKey(userId, guildId);
    const existed = Boolean(permissions[key]);
    delete permissions[key];
    writeJson(NO_PREFIX_FILE, permissions);
    return existed;
}

export function grantGuildNoPrefix(guildId, grantedBy, durationMs = null) {
    const permissions = readJson(NO_PREFIX_FILE, {});
    const key = `guild:${String(guildId)}`;
    permissions[key] = {
        guildId: String(guildId),
        grantedBy: String(grantedBy),
        grantedAt: new Date().toISOString(),
        expiresAt: durationMs === null ? null : new Date(Date.now() + durationMs).toISOString(),
    };
    writeJson(NO_PREFIX_FILE, permissions);
    return permissions[key];
}

export function revokeGuildNoPrefix(guildId) {
    const permissions = readJson(NO_PREFIX_FILE, {});
    const key = `guild:${String(guildId)}`;
    const existed = Boolean(permissions[key]);
    delete permissions[key];
    writeJson(NO_PREFIX_FILE, permissions);
    return existed;
}

export function grantQuestAccess(userId, grantedBy) {
    const access = readJson(ACCESS_FILE, {});
    const key = String(userId);
    access[key] = {
        userId: key,
        grantedBy: String(grantedBy),
        grantedAt: new Date().toISOString(),
        lifetime: true,
    };
    writeJson(ACCESS_FILE, access);
    return access[key];
}

function getRecentUsage(userId, now = Date.now()) {
    const usage = readJson(USAGE_FILE, {});
    const recent = Array.isArray(usage[String(userId)])
        ? usage[String(userId)].filter((timestamp) => Number(timestamp) > now - WINDOW_MS)
        : [];
    usage[String(userId)] = recent;
    writeJson(USAGE_FILE, usage);
    return { usage, recent };
}

export function getQuestUsage(userId) {
    return getRecentUsage(userId).recent.length;
}

export function canCompleteFreeQuest(userId) {
    return getQuestUsage(userId) < FREE_QUEST_LIMIT;
}

export function reserveFreeQuest(userId) {
    const now = Date.now();
    const { usage, recent } = getRecentUsage(userId, now);
    if (recent.length >= FREE_QUEST_LIMIT) return null;
    let reservationTime = now;
    while (recent.some((timestamp) => Number(timestamp) === reservationTime)) reservationTime++;
    usage[String(userId)] = [...recent, reservationTime];
    writeJson(USAGE_FILE, usage);
    return reservationTime;
}

export function releaseQuestReservation(userId, reservationTime) {
    const { usage, recent } = getRecentUsage(userId);
    const remaining = recent.filter((timestamp) => Number(timestamp) !== reservationTime);
    usage[String(userId)] = remaining;
    writeJson(USAGE_FILE, usage);
}

export function recordQuestCompletion(userId) {
    const now = Date.now();
    const { usage, recent } = getRecentUsage(userId, now);
    const key = String(userId);
    usage[key] = [...recent, now];
    writeJson(USAGE_FILE, usage);
    return usage[key].length;
}

export { FREE_QUEST_LIMIT, WINDOW_MS };
