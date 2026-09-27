import * as fs from 'node:fs';
import * as path from 'node:path';

const SETTINGS_FILE = path.join(process.cwd(), 'channelSettings.json');

function load() {
    try {
        const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch {
        return {};
    }
}

function save(data) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

export function getGuildCommandChannelId(guildId) {
    return getGuildCommandChannelIds(guildId)[0] ?? null;
}

export function getGuildCommandChannelIds(guildId) {
    if (!guildId) return [];
    const configured = load()[guildId];
    if (Array.isArray(configured)) return configured.filter(Boolean).map(String);
    return configured ? [String(configured)] : [];
}

export function setGuildCommandChannel(guildId, channelId) {
    if (!guildId || !channelId) return;
    const data = load();
    const channelIds = getGuildCommandChannelIds(guildId);
    if (!channelIds.includes(String(channelId))) channelIds.push(String(channelId));
    data[guildId] = channelIds;
    save(data);
}

export function removeGuildCommandChannel(guildId, channelId) {
    if (!guildId || !channelId) return false;
    const data = load();
    const channelIds = getGuildCommandChannelIds(guildId);
    const remaining = channelIds.filter((id) => id !== String(channelId));
    if (remaining.length === channelIds.length) return false;
    if (remaining.length > 0) data[guildId] = remaining;
    else delete data[guildId];
    save(data);
    return true;
}

export function clearGuildCommandChannel(guildId) {
    if (!guildId) return false;
    const data = load();
    if (getGuildCommandChannelIds(guildId).length === 0) return false;
    delete data[guildId];
    save(data);
    return true;
}

export function isGuildCommandChannel(guildId, channelId) {
    const configuredChannelIds = getGuildCommandChannelIds(guildId);
    return configuredChannelIds.length === 0 || configuredChannelIds.includes(String(channelId));
}
