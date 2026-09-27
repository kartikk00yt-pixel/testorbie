import * as crypto from 'node:crypto';
import * as fs from 'node:fs';

const STORE_FILE = 'tokens.json';
const LEDGER_FILE = 'tokenLedger.json';
const ACCOUNT_FILE = 'tokenAccounts.json';
const ALGORITHM = 'aes-256-gcm';

function deriveKey(secret) {
    return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(text, key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return JSON.stringify({
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        data: encrypted.toString('hex'),
    });
}

function decrypt(stored, key) {
    try {
        const { iv, tag, data } = JSON.parse(stored);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
        decipher.setAuthTag(Buffer.from(tag, 'hex'));
        return decipher.update(Buffer.from(data, 'hex')) + decipher.final('utf8');
    } catch {
        return null;
    }
}

function loadStore() {
    try {
        return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    } catch {
        return {};
    }
}

function saveStore(store) {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
    fs.chmodSync(STORE_FILE, 0o600);
}

function loadLedger() {
    try {
        const ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));
        if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) return {};
        let changed = false;
        for (const entry of Object.values(ledger)) {
            if (!entry || typeof entry !== 'object') continue;
            if ('currentToken' in entry) {
                delete entry.currentToken;
                changed = true;
            }
            if (Array.isArray(entry.history)) {
                for (const event of entry.history) {
                    if (event && typeof event === 'object' && 'token' in event) {
                        delete event.token;
                        changed = true;
                    }
                }
            }
        }
        if (changed) saveLedger(ledger);
        return ledger;
    } catch {
        return {};
    }
}

function saveLedger(store) {
    fs.writeFileSync(LEDGER_FILE, JSON.stringify(store, null, 2));
    fs.chmodSync(LEDGER_FILE, 0o600);
}

function loadAccounts() {
    try {
        const accounts = JSON.parse(fs.readFileSync(ACCOUNT_FILE, 'utf8'));
        return accounts && typeof accounts === 'object' && !Array.isArray(accounts) ? accounts : {};
    } catch {
        return {};
    }
}

function saveAccounts(accounts) {
    fs.writeFileSync(ACCOUNT_FILE, JSON.stringify(accounts, null, 2));
    fs.chmodSync(ACCOUNT_FILE, 0o600);
}

export class TokenStore {
    constructor(secret) {
        this.key = deriveKey(secret);
    }

    save(userId, token, displayName = '', avatarUrl = '') {
        this.saveAccount(userId, 0, token, displayName, avatarUrl, userId, displayName);
    }

    saveAccount(userId, slot, token, displayName = '', avatarUrl = '', accountId = userId, accountName = displayName) {
        const store = loadStore();
        const encrypted = encrypt(token, this.key);
        const accountKey = `${userId}:${slot}`;
        const legacyToken = store[userId];
        store[accountKey] = encrypted;
        if (slot === 0 && legacyToken) delete store[userId];
        saveStore(store);

        const accounts = loadAccounts();
        const userAccounts = accounts[userId] ?? { activeSlot: slot, accounts: {} };
        userAccounts.accounts = userAccounts.accounts ?? {};
        if (legacyToken && !userAccounts.accounts[0] && decrypt(legacyToken, this.key)) {
            userAccounts.accounts[0] = {
                slot: 0,
                accountId: String(userId),
                accountName: String(userId),
                displayName: '',
                avatarUrl: '',
                linkedAt: null,
            };
            userAccounts.activeSlot = 0;
        }
        userAccounts.accounts[slot] = {
            slot,
            accountId: String(accountId),
            accountName: String(accountName || displayName || accountId).slice(0, 100),
            displayName: String(displayName).slice(0, 100),
            avatarUrl: String(avatarUrl).slice(0, 500),
            linkedAt: userAccounts.accounts[slot]?.linkedAt ?? new Date().toISOString(),
        };
        if (userAccounts.activeSlot === undefined || userAccounts.activeSlot === null) userAccounts.activeSlot = slot;
        accounts[userId] = userAccounts;
        saveAccounts(accounts);

        const ledger = loadLedger();
        const entry = ledger[userId] ?? { userId, status: 'unknown', history: [] };
        if (displayName) entry.displayName = String(displayName).slice(0, 100);
        if (avatarUrl) entry.avatarUrl = String(avatarUrl).slice(0, 500);
        entry.status = 'linked';
        entry.lastUpdated = new Date().toISOString();
        entry.history = Array.isArray(entry.history) ? entry.history : [];
        entry.history.push({ status: 'linked', at: entry.lastUpdated });
        ledger[userId] = entry;
        saveLedger(ledger);
    }

    get(userId) {
        const store = loadStore();
        const accounts = loadAccounts()[userId];
        const activeSlot = accounts?.activeSlot ?? 0;
        const raw = store[`${userId}:${activeSlot}`] ?? (activeSlot === 0 ? store[userId] : null);
        if (!raw) return null;
        return decrypt(raw, this.key);
    }

    getAccountToken(userId, slot) {
        const store = loadStore();
        const numericSlot = Number(slot);
        const raw = store[`${userId}:${numericSlot}`] ?? (numericSlot === 0 ? store[userId] : null);
        return raw ? decrypt(raw, this.key) : null;
    }

    getAccounts(userId) {
        const store = loadStore();
        const accounts = loadAccounts();
        const metadata = accounts[userId];
        if (!metadata?.accounts) {
            if (!store[userId]) return [];
            const token = decrypt(store[userId], this.key);
            return token ? [{ slot: 0, accountId: userId, accountName: '', displayName: '', avatarUrl: '', linkedAt: null, active: true }] : [];
        }

        return Object.values(metadata.accounts)
            .filter((account) => store[`${userId}:${account.slot}`] && decrypt(store[`${userId}:${account.slot}`], this.key))
            .sort((a, b) => a.slot - b.slot)
            .map((account) => ({ ...account, active: account.slot === (metadata.activeSlot ?? 0) }));
    }

    switchAccount(userId, slot) {
        const accounts = loadAccounts();
        const metadata = accounts[userId];
        const numericSlot = Number(slot);
        if (!metadata?.accounts?.[numericSlot]) return false;
        const store = loadStore();
        if (!store[`${userId}:${numericSlot}`] || !decrypt(store[`${userId}:${numericSlot}`], this.key)) return false;
        metadata.activeSlot = numericSlot;
        saveAccounts(accounts);
        return true;
    }

    remove(userId) {
        const store = loadStore();
        const accounts = loadAccounts();
        const metadata = accounts[userId];
        const activeSlot = metadata?.activeSlot ?? 0;
        return this.removeAccount(userId, activeSlot);
    }

    removeAccount(userId, slot) {
        const store = loadStore();
        const accounts = loadAccounts();
        const metadata = accounts[userId];
        const numericSlot = Number(slot);
        const accountKey = `${userId}:${numericSlot}`;
        const legacyKey = numericSlot === 0 && !store[accountKey] ? userId : null;
        if (!store[accountKey] && !legacyKey) return false;
        delete store[accountKey];
        if (legacyKey) delete store[legacyKey];
        if (metadata?.accounts?.[numericSlot]) delete metadata.accounts[numericSlot];
        if (metadata?.accounts && Object.keys(metadata.accounts).length > 0) {
            if (metadata.activeSlot === numericSlot) metadata.activeSlot = Number(Object.keys(metadata.accounts).sort()[0]);
        } else {
            delete accounts[userId];
        }
        saveStore(store);
        saveAccounts(accounts);

        const ledger = loadLedger();
        const entry = ledger[userId] ?? { userId, status: 'unknown', history: [] };
        entry.status = 'unlinked';
        entry.lastUpdated = new Date().toISOString();
        entry.history = Array.isArray(entry.history) ? entry.history : [];
        entry.history.push({ status: 'unlinked', at: entry.lastUpdated });
        ledger[userId] = entry;
        saveLedger(ledger);

        return true;
    }

    has(userId) {
        return !!this.get(userId);
    }

    get size() {
        return Object.keys(loadStore()).length;
    }

    listUserIds() {
        const store = loadStore();
        return [...new Set(Object.keys(store).map((key) => key.includes(':') ? key.split(':')[0] : key))];
    }

    listLedgerEntries(page = 1, pageSize = 20) {
        const ledger = loadLedger();
        const activeStore = loadStore();
        const entries = [];

        for (const [userId, raw] of Object.entries(activeStore)) {
            if (ledger[userId]) continue;
            if (!decrypt(raw, this.key)) continue;
            entries.push({
                userId,
                displayName: '',
                avatarUrl: '',
                status: 'linked',
                recordedAt: new Date().toISOString(),
            });
        }

        for (const [userId, entry] of Object.entries(ledger)) {
            const history = Array.isArray(entry?.history) && entry.history.length > 0
                ? entry.history
                : [{
                    status: entry?.status ?? 'unknown',
                    at: entry?.lastUpdated ?? new Date().toISOString(),
                }];

            for (const event of history) {
                entries.push({
                    userId,
                    displayName: entry?.displayName ?? '',
                    avatarUrl: entry?.avatarUrl ?? '',
                    status: event?.status ?? 'unknown',
                    recordedAt: event?.at ?? entry?.lastUpdated ?? new Date().toISOString(),
                });
            }
        }

        const unique = new Map();
        for (const entry of entries) {
            const key = `${entry.userId}|${entry.status}|${entry.recordedAt}`;
            if (!unique.has(key)) unique.set(key, entry);
        }

        const sorted = [...unique.values()].sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
        const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
        const safePage = Number.isFinite(page) && page > 0 ? Math.min(Math.floor(page), pages) : 1;
        const start = (safePage - 1) * pageSize;
        return {
            total: sorted.length,
            pages,
            page: safePage,
            items: sorted.slice(start, start + pageSize),
        };
    }
}
