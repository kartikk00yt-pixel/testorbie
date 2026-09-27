// Atomic File Operations Module - Bot V3
// Prevents race conditions and data corruption in concurrent multi-user scenarios

import { readFileSync, writeFileSync, existsSync, renameSync, chmodSync, mkdirSync } from 'fs';
import { lock, unlock } from 'proper-lockfile';
import path from 'path';

const LOCK_TIMEOUT = 10_000; // 10 seconds max lock wait
const LOCK_DIR = '.locks';

// Ensure locks directory exists
if (!existsSync(LOCK_DIR)) mkdirSync(LOCK_DIR, { recursive: true });

class AtomicFileOps {
    #locks = new Map();
    #queue = new Map(); // Operation queue per file

    constructor() {
        this.#locks = new Map();
        this.#queue = new Map();
    }

    #assertCompatibleRoot(data, defaultValue) {
        const expectedArray = Array.isArray(defaultValue);
        const valid = expectedArray
            ? Array.isArray(data)
            : data !== null && typeof data === 'object' && !Array.isArray(data);
        if (!valid) {
            throw new TypeError(`Expected ${expectedArray ? 'an array' : 'an object'} at the root of the JSON store`);
        }
    }

    /**
     * Get file lock path
     */
    #getLockPath(filePath) {
        const fileName = path.basename(filePath);
        return path.join(LOCK_DIR, `${fileName}.lock`);
    }

    /**
     * Acquire lock for a file (with timeout)
     */
    async #acquireLock(filePath, timeoutMs = LOCK_TIMEOUT) {
        const lockPath = this.#getLockPath(filePath);
        const startTime = Date.now();

        while (true) {
            try {
                // Ensure file exists before locking (proper-lockfile requires this)
                if (!existsSync(filePath)) {
                    writeFileSync(filePath, '{}');
                }
                
                // Try to acquire the lock from proper-lockfile
                // Don't track locally - let proper-lockfile handle it
                await lock(filePath, { lockfilePath: lockPath, retries: 0 });
                return { lockPath, filePath };
            } catch (err) {
                // Lock is held, retry or timeout
                if (Date.now() - startTime > timeoutMs) {
                    throw new Error(`Lock timeout on ${filePath}`);
                }
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
    }

    /**
     * Release lock for a file
     */
    async #releaseLock(lockInfo) {
        if (!lockInfo) return;
        const { lockPath, filePath } = lockInfo;
        try {
            await unlock(filePath, { lockfilePath: lockPath });
        } catch (err) {
            console.error(`Warning: Failed to release lock on ${filePath}:`, err?.message ?? err);
        }
    }

    /**
     * Read JSON file atomically
     */
    async readJSON(filePath, defaultValue = {}) {
        let lockInfo = null;
        try {
            lockInfo = await this.#acquireLock(filePath);
            if (!existsSync(filePath)) {
                return defaultValue;
            }
            const content = readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content);
            this.#assertCompatibleRoot(data, defaultValue);
            return data;
        } catch (err) {
            console.error(`Error reading ${filePath}:`, err?.message ?? err);
            return defaultValue;
        } finally {
            if (lockInfo) await this.#releaseLock(lockInfo);
        }
    }

    /**
     * Write JSON file atomically with backup
     */
    async writeJSON(filePath, data) {
        let lockInfo = null;
        try {
            lockInfo = await this.#acquireLock(filePath);
            const tempFile = `${filePath}.tmp`;
            const backupFile = `${filePath}.bak`;

            // Write to temp file first
            writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');

            // Create backup of current file
            if (existsSync(filePath)) {
                writeFileSync(backupFile, readFileSync(filePath, 'utf-8'), 'utf-8');
            }

            // Atomic rename
            if (existsSync(tempFile)) {
                renameSync(tempFile, filePath);
                chmodSync(filePath, 0o600);
            }
        } catch (err) {
            console.error(`Error writing ${filePath}:`, err?.message ?? err);
        } finally {
            if (lockInfo) await this.#releaseLock(lockInfo);
        }
    }

    /**
     * Read-Modify-Write operation (atomic)
     */
    async updateJSON(filePath, updateFn, defaultValue = {}) {
        let lockInfo = null;
        try {
            lockInfo = await this.#acquireLock(filePath);
            let data = defaultValue;
            if (existsSync(filePath)) {
                const content = readFileSync(filePath, 'utf-8');
                data = JSON.parse(content);
                this.#assertCompatibleRoot(data, defaultValue);
            }

            // Apply update function
            const updated = await Promise.resolve(updateFn(data));

            // Write back atomically
            const tempFile = `${filePath}.tmp`;
            writeFileSync(tempFile, JSON.stringify(updated, null, 2), 'utf-8');
            renameSync(tempFile, filePath);
            chmodSync(filePath, 0o600);

            return updated;
        } catch (err) {
            console.error(`Error updating ${filePath}:`, err?.message ?? err);
            throw err;
        } finally {
            if (lockInfo) await this.#releaseLock(lockInfo);
        }
    }

    /**
     * Get current lock count (for debugging)
     */
    getLockCount() {
        return this.#locks.size;
    }

    /**
     * Force release all locks (use with caution)
     */
    async forceReleaseAll() {
        for (const lockPath of this.#locks.keys()) {
            try {
                const filePath = lockPath.replace('.lock', '');
                await unlock(filePath, { lockfilePath: lockPath });
            } catch {}
        }
        this.#locks.clear();
    }
}

// Export singleton instance
export const atomicOps = new AtomicFileOps();

export default atomicOps;
