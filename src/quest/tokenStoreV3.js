// TokenStore V3 - Atomic Multi-User Safe
// Fixed race conditions and data corruption issues

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { atomicOps } from '../utils/atomicFileOps.js';
import { userMutex } from '../utils/userMutex.js';

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

export class TokenStoreV3 {
    constructor(secret) {
        this.key = deriveKey(secret);
        this.version = 3;
    }

    /**
     * V3: Atomic save with user-level locking
     */
    async save(userId, token, displayName = '', avatarUrl = '') {
        await this.saveAccount(userId, 0, token, displayName, avatarUrl, userId, displayName);
    }

    /**
     * V3: Atomic account save with race condition prevention
     */
    async saveAccount(userId, slot, token, displayName = '', avatarUrl = '', accountId = userId, accountName = displayName) {
        // Acquire user-level lock to prevent concurrent modifications
        const release = await userMutex.acquireLock(userId);
        try {
            await this.#saveAccountLocked(userId, slot, token, displayName, avatarUrl, accountId, accountName);
        } finally {
            release();
        }
    }

    async saveAccountInAvailableSlot(userId, maxSlots, token, displayName = '', avatarUrl = '', accountId = userId, accountName = displayName) {
        const release = await userMutex.acquireLock(userId);
        try {
            const accounts = await atomicOps.readJSON(ACCOUNT_FILE, {});
            const store = await atomicOps.readJSON(STORE_FILE, {});
            const userAccounts = accounts[userId]?.accounts ?? {};
            const slot = Array.from({ length: maxSlots }, (_, candidate) => candidate)
                .find((candidate) => !userAccounts[candidate] && !store[`${userId}:${candidate}`]);
            if (slot === undefined) return null;

            await this.#saveAccountLocked(userId, slot, token, displayName, avatarUrl, accountId, accountName);
            return slot;
        } finally {
            release();
        }
    }

    async saveAccountIfSlotAvailable(userId, slot, token, displayName = '', avatarUrl = '', accountId = userId, accountName = displayName) {
        const release = await userMutex.acquireLock(userId);
        try {
            const accounts = await atomicOps.readJSON(ACCOUNT_FILE, {});
            const store = await atomicOps.readJSON(STORE_FILE, {});
            const numericSlot = Number(slot);
            const userAccounts = accounts[userId]?.accounts ?? {};
            if (!Number.isInteger(numericSlot) || userAccounts[numericSlot] || store[`${userId}:${numericSlot}`]) return false;

            await this.#saveAccountLocked(userId, numericSlot, token, displayName, avatarUrl, accountId, accountName);
            return true;
        } finally {
            release();
        }
    }

    async #saveAccountLocked(userId, slot, token, displayName, avatarUrl, accountId, accountName) {
            const encrypted = encrypt(token, this.key);
            const accountKey = `${userId}:${slot}`;

            // Step 1: Update token store atomically
            await atomicOps.updateJSON(STORE_FILE, (store) => {
                const legacyToken = store[userId];
                store[accountKey] = encrypted;
                if (slot === 0 && legacyToken) delete store[userId];
                return store;
            }, {});

            // Step 2: Update accounts metadata atomically
            await atomicOps.updateJSON(ACCOUNT_FILE, (accounts) => {
                const userAccounts = accounts[userId] ?? { activeSlot: slot, accounts: {} };
                userAccounts.accounts = userAccounts.accounts ?? {};

                // Migrate legacy token if needed
                const store = fs.existsSync(STORE_FILE) ? JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')) : {};
                const legacyToken = store[userId];
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

                // Add/update new account
                userAccounts.accounts[slot] = {
                    slot,
                    accountId: String(accountId),
                    accountName: String(accountName || displayName || accountId).slice(0, 100),
                    displayName: String(displayName).slice(0, 100),
                    avatarUrl: String(avatarUrl).slice(0, 500),
                    linkedAt: userAccounts.accounts[slot]?.linkedAt ?? new Date().toISOString(),
                };

                if (userAccounts.activeSlot === undefined || userAccounts.activeSlot === null) {
                    userAccounts.activeSlot = slot;
                }

                accounts[userId] = userAccounts;
                return accounts;
            }, {});

            // Step 3: Update ledger atomically
            await atomicOps.updateJSON(LEDGER_FILE, (ledger) => {
                const entry = ledger[userId] ?? { userId, status: 'unknown', history: [] };
                if (displayName) entry.displayName = String(displayName).slice(0, 100);
                if (avatarUrl) entry.avatarUrl = String(avatarUrl).slice(0, 500);
                entry.status = 'linked';
                entry.lastUpdated = new Date().toISOString();
                entry.history = Array.isArray(entry.history) ? entry.history : [];
                entry.history.push({ status: 'linked', at: entry.lastUpdated });
                ledger[userId] = entry;
                return ledger;
            }, {});
    }

    /**
     * V3: Atomic get with consistency check
     */
    async get(userId) {
        const release = await userMutex.acquireLock(userId);
        try {
            const store = await atomicOps.readJSON(STORE_FILE, {});
            const accounts = await atomicOps.readJSON(ACCOUNT_FILE, {});

            const userAccounts = accounts[userId];
            const activeSlot = userAccounts?.activeSlot ?? 0;
            const accountKey = `${userId}:${activeSlot}`;
            const raw = store[accountKey] ?? (activeSlot === 0 ? store[userId] : null);

            if (!raw) return null;
            const token = decrypt(raw, this.key);
            return token;
        } finally {
            release();
        }
    }

    /**
     * V3: Atomic get with slot specification
     */
    async getAccountToken(userId, slot) {
        const release = await userMutex.acquireLock(userId);
        try {
            const store = await atomicOps.readJSON(STORE_FILE, {});
            const numericSlot = Number(slot);
            const accountKey = `${userId}:${numericSlot}`;
            const raw = store[accountKey] ?? (numericSlot === 0 ? store[userId] : null);
            return raw ? decrypt(raw, this.key) : null;
        } finally {
            release();
        }
    }

    /**
     * V3: Get all accounts for user atomically
     */
    async getAccounts(userId) {
        const release = await userMutex.acquireLock(userId);
        try {
            const store = await atomicOps.readJSON(STORE_FILE, {});
            const accounts = await atomicOps.readJSON(ACCOUNT_FILE, {});
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
        } finally {
            release();
        }
    }

    /**
     * V3: Atomic account switch
     */
    async switchAccount(userId, slot) {
        const release = await userMutex.acquireLock(userId);
        try {
            const store = await atomicOps.readJSON(STORE_FILE, {});
            const accounts = await atomicOps.readJSON(ACCOUNT_FILE, {});

            const metadata = accounts[userId];
            const numericSlot = Number(slot);

            if (!metadata?.accounts?.[numericSlot]) return false;
            if (!store[`${userId}:${numericSlot}`] || !decrypt(store[`${userId}:${numericSlot}`], this.key)) return false;

            await atomicOps.updateJSON(ACCOUNT_FILE, (accts) => {
                if (accts[userId]) accts[userId].activeSlot = numericSlot;
                return accts;
            }, {});

            return true;
        } finally {
            release();
        }
    }

    /**
     * V3: Atomic remove with cleanup
     */
    async remove(userId) {
        const release = await userMutex.acquireLock(userId);
        try {
            const accounts = await atomicOps.readJSON(ACCOUNT_FILE, {});
            const activeSlot = accounts[userId]?.activeSlot ?? 0;
            return await this.#removeAccountLocked(userId, activeSlot);
        } finally {
            release();
        }
    }

    /**
     * V3: Atomic remove account
     */
    async removeAccount(userId, slot) {
        const release = await userMutex.acquireLock(userId);
        try {
            return await this.#removeAccountLocked(userId, slot);
        } finally {
            release();
        }
    }

    async #removeAccountLocked(userId, slot) {
            const numericSlot = Number(slot);
            const accountKey = `${userId}:${numericSlot}`;
            let removed = false;

            // Remove from store atomically
            await atomicOps.updateJSON(STORE_FILE, (store) => {
                const legacyKey = numericSlot === 0 ? userId : null;
                if (store[accountKey]) {
                    delete store[accountKey];
                    removed = true;
                }
                if (legacyKey && store[legacyKey]) {
                    delete store[legacyKey];
                    removed = true;
                }
                return store;
            }, {});

            if (!removed) return false;

            // Update accounts atomically
            await atomicOps.updateJSON(ACCOUNT_FILE, (accounts) => {
                const metadata = accounts[userId];
                if (metadata?.accounts?.[numericSlot]) delete metadata.accounts[numericSlot];

                if (metadata?.accounts && Object.keys(metadata.accounts).length > 0) {
                    if (metadata.activeSlot === numericSlot) {
                        metadata.activeSlot = Number(Object.keys(metadata.accounts).sort()[0]);
                    }
                } else {
                    delete accounts[userId];
                }

                return accounts;
            }, {});

            // Update ledger atomically
            await atomicOps.updateJSON(LEDGER_FILE, (ledger) => {
                const entry = ledger[userId] ?? { userId, status: 'unknown', history: [] };
                entry.status = 'unlinked';
                entry.lastUpdated = new Date().toISOString();
                entry.history = Array.isArray(entry.history) ? entry.history : [];
                entry.history.push({ status: 'unlinked', at: entry.lastUpdated });
                ledger[userId] = entry;
                return ledger;
            }, {});

            return true;
    }

    /**
     * V3: Async has check
     */
    async has(userId) {
        return (await this.get(userId)) !== null;
    }

    /**
     * V3: Get size atomically
     */
    async getSize() {
        const store = await atomicOps.readJSON(STORE_FILE, {});
        return Object.keys(store).length;
    }

    /**
     * V3: List user IDs atomically
     */
    async listUserIds() {
        const store = await atomicOps.readJSON(STORE_FILE, {});
        return [...new Set(Object.keys(store).map((key) => key.includes(':') ? key.split(':')[0] : key))];
    }

    /**
     * V3: List ledger entries atomically with pagination
     */
    async listLedgerEntries(page = 1, pageSize = 20) {
        const ledger = await atomicOps.readJSON(LEDGER_FILE, {});
        const activeStore = await atomicOps.readJSON(STORE_FILE, {});

        const entries = Object.values(ledger)
            .filter((entry) => {
                const userId = entry?.userId;
                const activeSlot = entry?.activeSlot ?? 0;
                const accountKey = `${userId}:${activeSlot}`;
                return activeStore[accountKey]
                    || activeStore[userId]
                    || Object.keys(activeStore).some((key) => key.startsWith(`${userId}:`));
            })
            .sort((a, b) => new Date(b.lastUpdated ?? 0) - new Date(a.lastUpdated ?? 0));

        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        const data = entries.slice(start, end);

        return {
            data,
            page,
            pageSize,
            total: entries.length,
            pages: Math.max(1, Math.ceil(entries.length / pageSize)),
        };
    }

    /**
     * Get statistics for debugging
     */
    async getStats() {
        const store = await atomicOps.readJSON(STORE_FILE, {});
        const accounts = await atomicOps.readJSON(ACCOUNT_FILE, {});
        const ledger = await atomicOps.readJSON(LEDGER_FILE, {});

        return {
            version: this.version,
            storeSize: Object.keys(store).length,
            uniqueUsers: new Set(Object.keys(store).map(k => k.includes(':') ? k.split(':')[0] : k)).size,
            accountsTracked: Object.keys(accounts).length,
            ledgerEntries: Object.keys(ledger).length,
            activeUsers: userMutex.getStats().lockedUsers,
        };
    }
}

export default TokenStoreV3;
