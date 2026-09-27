// User-Level Concurrency Control - Bot V3
// Prevents multiple concurrent operations on the same user

export class UserMutex {
    #locks = new Map(); // userId -> { locked: boolean, queue: [] }
    #questProcessing = new Map(); // userId -> { questId -> processing }

    /**
     * Acquire lock for a user (queue-based)
     */
    async acquireLock(userId, timeoutMs = 30_000) {
        if (!this.#locks.has(userId)) {
            this.#locks.set(userId, { locked: false, queue: [] });
        }

        const userLock = this.#locks.get(userId);
        let resolveWaiter;
        let rejectWaiter;
        const waiter = new Promise((resolve, reject) => {
            resolveWaiter = resolve;
            rejectWaiter = reject;
        });
        const entry = { promise: waiter, resolve: resolveWaiter, reject: rejectWaiter };
        const timeout = setTimeout(() => {
            const index = userLock.queue.indexOf(entry);
            if (index !== -1) userLock.queue.splice(index, 1);
            rejectWaiter(new Error(`Lock timeout for user ${userId}`));
        }, timeoutMs);
        entry.timeout = timeout;

        userLock.queue.push(entry);
        if (!userLock.locked && userLock.queue[0] === entry) {
            userLock.locked = true;
            clearTimeout(timeout);
            resolveWaiter();
        }

        await entry.promise;
        let released = false;
        return () => {
            if (released) return;
            released = true;
            this.releaseLock(userId, entry);
        };
    }

    /**
     * Release lock for a user
     */
    releaseLock(userId, entry = null) {
        if (this.#locks.has(userId)) {
            const userLock = this.#locks.get(userId);
            if (!userLock.locked) return;
            if (entry && userLock.queue[0] !== entry) return;
            userLock.queue.shift();
            const next = userLock.queue[0];
            if (next) {
                userLock.locked = true;
                clearTimeout(next.timeout);
                next.resolve();
            } else {
                userLock.locked = false;
            }
        }
    }

    /**
     * Check if a specific quest is being processed by this user
     */
    isQuestProcessing(userId, questId) {
        if (!this.#questProcessing.has(userId)) {
            return false;
        }
        return this.#questProcessing.get(userId)[questId] === true;
    }

    /**
     * Mark quest as processing
     */
    markQuestProcessing(userId, questId, processing = true) {
        if (!this.#questProcessing.has(userId)) {
            this.#questProcessing.set(userId, {});
        }

        const userQuests = this.#questProcessing.get(userId);
        if (processing) {
            userQuests[questId] = true;
        } else {
            delete userQuests[questId];
        }
    }

    /**
     * Get all users with active locks
     */
    getActiveUsers() {
        return Array.from(this.#locks.entries())
            .filter(([, lock]) => lock.locked)
            .map(([userId]) => userId);
    }

    /**
     * Force release lock for a user (use with caution)
     */
    forceRelease(userId) {
        if (this.#locks.has(userId)) {
            const userLock = this.#locks.get(userId);
            if (userLock.locked) {
                userLock.queue.shift();
            }

            const next = userLock.queue[0];
            if (next) {
                userLock.locked = true;
                clearTimeout(next.timeout);
                next.resolve();
            } else {
                userLock.locked = false;
            }
        }
        this.#questProcessing.delete(userId);
    }

    /**
     * Clear all locks (for cleanup/testing)
     */
    clearAll() {
        this.#locks.clear();
        this.#questProcessing.clear();
    }

    /**
     * Get lock statistics for debugging
     */
    getStats() {
        return {
            totalUsers: this.#locks.size,
            lockedUsers: Array.from(this.#locks.values()).filter(l => l.locked).length,
            activeUsers: this.getActiveUsers(),
            questProcessing: Object.fromEntries(
                Array.from(this.#questProcessing.entries())
                    .map(([userId, quests]) => [userId, Object.keys(quests)])
            ),
        };
    }
}

export const userMutex = new UserMutex();

export default userMutex;
