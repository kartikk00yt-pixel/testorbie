import * as fs from 'node:fs';
import * as path from 'node:path';

const AUTOQUEST_FILE = path.join(process.cwd(), 'autoquest.json');

function normalizeUserId(userId) {
    const raw = String(userId ?? '').trim();
    if (!raw) return '';

    const match = raw.match(/^(?:<@!?)?(\d{17,20})>?$/);
    if (match) return match[1];
    return /^\d{17,20}$/.test(raw) ? raw : '';
}

function load() {
    try {
        const raw = JSON.parse(fs.readFileSync(AUTOQUEST_FILE, 'utf-8'));
        const values = Array.isArray(raw) ? raw : [];
        return values
            .map((value) => normalizeUserId(value))
            .filter(Boolean)
            .filter((value, index, arr) => arr.indexOf(value) === index);
    } catch {
        return [];
    }
}

function save(data) {
    const normalized = Array.from(new Set((Array.isArray(data) ? data : []).map(normalizeUserId).filter(Boolean)));
    fs.writeFileSync(AUTOQUEST_FILE, JSON.stringify(normalized, null, 2));
}

export function enableAutoquest(userId) {
    const key = normalizeUserId(userId);
    if (!key) return false;

    const data = load();
    if (data.includes(key)) return false;
    data.push(key);
    save(data);
    return true;
}

export function disableAutoquest(userId) {
    const key = normalizeUserId(userId);
    if (!key) return false;

    const data = load();
    const idx = data.indexOf(key);
    if (idx === -1) return false;
    data.splice(idx, 1);
    save(data);
    return true;
}

export function isAutoquestEnabled(userId) {
    const key = normalizeUserId(userId);
    return key ? load().includes(key) : false;
}

export function getAutoquestUsers() {
    return load();
}

export function getAutoquestUserCount() {
    return load().length;
}
