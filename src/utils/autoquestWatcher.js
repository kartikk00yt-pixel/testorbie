import { disableAutoquest, getAutoquestUsers } from '../quest/autoquestStore.js';
import { hasPremiumRole, runAutoquestForUser } from '../commands/questCommands.js';
import { hasBypass } from '../quest/questAccessStore.js';
import { QuestClient } from '../quest/questClient.js';
import { hasPremiumAccess } from '../quest/premiumStore.js';
import { QUEST_SETTINGS, isOwnerUserId } from './config.js';

const completedQuestIds = new Set(); // track already-processed quest IDs globally
let checkRunning = false;

export function getAutoquestWorkerCount(validQuestCount) {
    const total = Number(validQuestCount) || 0;
    if (!Number.isFinite(total) || total <= 0) return 1;
    return Math.max(1, Math.floor(total));
}

export function startAutoquestWatcher(client) {
    console.log('  \x1b[92m●\x1b[0m \x1b[97mAutoquest watcher started\x1b[0m');

    setInterval(async () => {
        if (checkRunning) return;
        checkRunning = true;
        try {
            const users = getAutoquestUsers();
            if (users.length === 0) return;

            // Process users sequentially to prevent rate limiting on enrollment
            for (const userId of users) {
                try {
                    if (!isOwnerUserId(userId) && !hasBypass(userId) && !hasPremiumAccess(userId) && !(await hasPremiumRole(userId, client))) {
                        disableAutoquest(userId);
                        continue;
                    }
                    const token = await client.tokenStore.get(userId);
                    if (!token) continue;

                    const qc = new QuestClient(token);
                    const manager = await qc.fetchQuests();
                    const valid = manager.filterQuestsValid();
                    
                    // Process each user's quests sequentially with delays
                    for (const quest of valid) {
                        const key = `${userId}:${quest.id}`;
                        if (completedQuestIds.has(key)) continue;
                        try {
                            const completed = await runAutoquestForUser(userId, quest, client.tokenStore, client, manager);
                            if (completed) completedQuestIds.add(key);
                        } catch (questErr) {
                            console.error(`[AutoquestWatcher] Error processing quest for user ${userId}:`, questErr?.message ?? questErr);
                        }
                        // Wait between quest completions
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                    // Wait between users to prevent enrollment rate limiting
                    await new Promise(resolve => setTimeout(resolve, 3000));
                } catch (userErr) {
                    // Log but continue — token may be expired or other user-specific issue
                    console.debug(`[AutoquestWatcher] Error processing user ${userId}:`, userErr?.message ?? userErr);
                }
            }
        } catch (err) {
            console.error('[AutoquestWatcher] Fatal error in watcher loop:', err?.message ?? err);
        } finally {
            checkRunning = false;
        }
    }, Math.max(10_000, QUEST_SETTINGS.autoquestPollIntervalMs));
}
