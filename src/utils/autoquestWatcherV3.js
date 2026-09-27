// Autoquest Watcher V3 - Multi-User Safe Concurrent Processing
// Prevents race conditions and unfair quest distribution

import { disableAutoquest, getAutoquestUsers } from '../quest/autoquestStore.js';
import { hasPremiumRole, runAutoquestForUser } from '../commands/questCommands.js';
import { hasBypass, hasGuildPremium } from '../quest/questAccessStore.js';
import { QuestClient } from '../quest/questClient.js';
import { hasPremiumAccess } from '../quest/premiumStore.js';
import { QUEST_SETTINGS, isOwnerUserId } from './config.js';
import { userMutex } from './userMutex.js';
import { atomicOps } from './atomicFileOps.js';

// V3: Per-user quest tracking instead of global
// This prevents one user's completed quests from blocking another user's quests
const USER_QUEST_TRACKING = new Map(); // userId -> { questId -> { completedAt, retries } }
const QUEST_COMPLETION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours - reset tracking after this

class AutoquestWatcherV3 {
    #checkRunning = false;
    #processingUsers = new Set();
    #stats = {
        totalProcessed: 0,
        successCount: 0,
        failureCount: 0,
        startTime: Date.now(),
    };

    /**
     * Get or initialize user's quest tracking
     */
    #getUserQuestTracking(userId) {
        if (!USER_QUEST_TRACKING.has(userId)) {
            USER_QUEST_TRACKING.set(userId, {});
        }
        return USER_QUEST_TRACKING.get(userId);
    }

    /**
     * Check if quest should be skipped for this user
     */
    #shouldSkipQuest(userId, questId) {
        const tracking = this.#getUserQuestTracking(userId);
        if (!tracking[questId]) return false;

        const { completedAt, retries } = tracking[questId];

        // Reset tracking if older than 24 hours
        if (Date.now() - completedAt > QUEST_COMPLETION_TIMEOUT) {
            delete tracking[questId];
            return false;
        }

        // Keep successful quests skipped; retry failed quests up to three times.
        return tracking[questId].success === true || retries >= 3;
    }

    /**
     * Mark quest as attempted for user
     */
    #markQuestAttempt(userId, questId, success = false) {
        const tracking = this.#getUserQuestTracking(userId);
        if (!tracking[questId]) {
            tracking[questId] = { completedAt: Date.now(), retries: 0, success: false };
        }
        tracking[questId].retries += 1;
        if (success) {
            tracking[questId].completedAt = Date.now();
            tracking[questId].success = true;
        }
    }

    /**
     * Start the autoquest watcher with V3 improvements
     */
    start(client) {
        console.log('  \x1b[92m●\x1b[0m \x1b[97mAutoquest Watcher V3 started - Multi-User Safe Mode\x1b[0m');

        setInterval(async () => {
            // Prevent overlapping check runs
            if (this.#checkRunning) {
                console.debug('[AutoquestWatcher V3] Check already running, skipping...');
                return;
            }

            this.#checkRunning = true;
            try {
                await this.#runWatcherCycle(client);
            } catch (err) {
                console.error('[AutoquestWatcher V3] Fatal error in watcher cycle:', err?.message ?? err);
            } finally {
                this.#checkRunning = false;
            }
        }, Math.max(10_000, QUEST_SETTINGS.autoquestPollIntervalMs));
    }

    /**
     * V3: Single watcher cycle with proper concurrency
     */
    async #runWatcherCycle(client) {
        const users = getAutoquestUsers();
        if (users.length === 0) return;

        console.debug(`[AutoquestWatcher V3] Processing ${users.length} users...`);

        // Process users sequentially but use async operations
        for (const userId of users) {
            // Skip if user is already being processed
            if (this.#processingUsers.has(userId)) {
                console.debug(`[AutoquestWatcher V3] User ${userId} already processing, skipping...`);
                continue;
            }

            this.#processingUsers.add(userId);
            try {
                await this.processUserQuests(client, userId);
            } catch (err) {
                console.error(`[AutoquestWatcher V3] Error processing user ${userId}:`, err?.message ?? err);
            } finally {
                this.#processingUsers.delete(userId);
                // Delay between users to prevent rate limiting
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }

    /**
     * V3: Process quests for a single user with proper locking
     */
    async processUserQuests(client, userId) {
        // Check permissions
            const hasGuildPremiumAccess = [...client.guilds.cache.keys()].some((guildId) => hasGuildPremium(userId, guildId));
            if (!isOwnerUserId(userId) && !hasBypass(userId) && !hasPremiumAccess(userId) && !(await hasPremiumRole(userId, client)) && !hasGuildPremiumAccess) {
                console.debug(`[AutoquestWatcher V3] User ${userId} no longer has access, disabling autoquest`);
                disableAutoquest(userId);
                return;
            }

            // Get user's token
            const token = await client.tokenStore.get(userId);
            if (!token) {
                console.warn(`[AutoquestWatcher V3] No token found for user ${userId}`);
                return;
            }

            // Fetch quests for this user
            let manager;
            try {
                const qc = new QuestClient(token);
                manager = await qc.fetchQuests();
            } catch (err) {
                console.error(`[AutoquestWatcher V3] Failed to fetch quests for user ${userId}:`, err?.message ?? err);
                return;
            }

            const validQuests = manager.filterQuestsValid();
            if (validQuests.length === 0) {
                console.debug(`[AutoquestWatcher V3] No valid quests for user ${userId}`);
                return;
            }

            console.debug(`[AutoquestWatcher V3] User ${userId} has ${validQuests.length} valid quest(s)`);

            // Process each quest for this user
            let successCount = 0;
            for (const quest of validQuests) {
                // Skip quest if already completed recently
                if (this.#shouldSkipQuest(userId, quest.id)) {
                    console.debug(`[AutoquestWatcher V3] Skipping completed quest ${quest.id} for user ${userId}`);
                    continue;
                }

                // Mark quest as processing
                userMutex.markQuestProcessing(userId, quest.id, true);
                console.log(`[AutoquestWatcher V3] Starting quest "${quest.config.messages.quest_name}" for user ${userId}`);

                try {
                    const completed = await runAutoquestForUser(userId, quest, client.tokenStore, client, manager);

                    if (completed) {
                        this.#markQuestAttempt(userId, quest.id, true);
                        successCount++;
                        this.#stats.successCount++;
                        console.log(`[AutoquestWatcher V3] ✓ Quest completed for user ${userId}`);
                    } else {
                        this.#markQuestAttempt(userId, quest.id, false);
                        this.#stats.failureCount++;
                        console.warn(`[AutoquestWatcher V3] ✗ Quest failed for user ${userId}`);
                    }
                } catch (questErr) {
                    this.#stats.failureCount++;
                    console.error(`[AutoquestWatcher V3] Error processing quest for user ${userId}:`, questErr?.message ?? questErr);
                } finally {
                    userMutex.markQuestProcessing(userId, quest.id, false);
                    // Small delay between quests
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            }

            this.#stats.totalProcessed++;
            console.debug(`[AutoquestWatcher V3] User ${userId} processed: ${successCount}/${validQuests.length} quests completed`);

    }

    /**
     * Get watcher statistics
     */
    getStats() {
        return {
            ...this.#stats,
            processingUsers: this.#processingUsers.size,
            trackedUsers: USER_QUEST_TRACKING.size,
            userMutexStats: userMutex.getStats(),
            uptime: Date.now() - this.#stats.startTime,
        };
    }

    /**
     * Get per-user quest tracking info
     */
    getUserQuestTracking(userId) {
        return this.#getUserQuestTracking(userId);
    }

    /**
     * Clear old tracking data (call periodically)
     */
    cleanupOldTracking() {
        let cleaned = 0;
        for (const [userId, tracking] of USER_QUEST_TRACKING.entries()) {
            for (const [questId, data] of Object.entries(tracking)) {
                if (Date.now() - data.completedAt > QUEST_COMPLETION_TIMEOUT) {
                    delete tracking[questId];
                    cleaned++;
                }
            }
            if (Object.keys(tracking).length === 0) {
                USER_QUEST_TRACKING.delete(userId);
            }
        }
        console.log(`[AutoquestWatcher V3] Cleaned up ${cleaned} old quest tracking entries`);
        return cleaned;
    }
}

// Export singleton
export const autoquestWatcherV3 = new AutoquestWatcherV3();

/**
 * Start watcher (for backward compatibility)
 */
export function startAutoquestWatcher(client) {
    autoquestWatcherV3.start(client);
}

export default autoquestWatcherV3;
