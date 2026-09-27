import { Quest } from './quest.js';

const QuestTaskConfigType = {
    WATCH_VIDEO:           'WATCH_VIDEO',
    PLAY_ON_DESKTOP:       'PLAY_ON_DESKTOP',
    PLAY_ON_XBOX:          'PLAY_ON_XBOX',
    PLAY_ON_PLAYSTATION:   'PLAY_ON_PLAYSTATION',
    STREAM_ON_DESKTOP:     'STREAM_ON_DESKTOP',
    PLAY_ACTIVITY:         'PLAY_ACTIVITY',
    WATCH_VIDEO_ON_MOBILE: 'WATCH_VIDEO_ON_MOBILE',
    WATCH_VIDEO_ON_IOS:    'WATCH_VIDEO_ON_IOS',
};

export class QuestManager {
    #quests = new Map();
    #lastRefresh = new Map(); // Track last refresh time per quest to debounce API calls
    client;

    constructor(client, quests = []) {
        this.client = client;
        quests.forEach((quest) => this.#quests.set(quest.id, quest));
    }

    static fromResponse(client, response) {
        if (!Array.isArray(response?.quests)) {
            throw new Error('Discord returned an invalid quest list. Please try again later.');
        }
        return new QuestManager(
            client,
            response.quests.map((quest) => Quest.create(quest)),
        );
    }

    [Symbol.iterator]() { return this.#quests.values(); }
    get size() { return this.#quests.size; }
    list() { return Array.from(this.#quests.values()); }
    get(id) { return this.#quests.get(id); }
    upsert(quest) { this.#quests.set(quest.id, quest); }
    remove(id) { return this.#quests.delete(id); }
    clear() { this.#quests.clear(); }
    hasQuest(id) { return this.#quests.has(id); }

    getExpired(date = new Date()) {
        return this.list().filter((q) => q.isExpired(date));
    }
    getCompleted() {
        return this.list().filter((q) => q.isCompleted());
    }
    getClaimable() {
        return this.list().filter((q) => q.isCompleted() && !q.hasClaimedRewards());
    }
    filterQuestsValid() {
        return this.list().filter(
            (q) => !q.isCompleted() && !q.isExpired(),
        );
    }

    async claimRewards(log = console.log, questIds = null) {
        try {
            const fresh = await this.client.get('/quests/@me');
            if (!Array.isArray(fresh?.quests)) return;
            for (const q of fresh.quests) {
                const existing = this.#quests.get(q.id);
                if (existing && q.user_status) existing.updateUserStatus(q.user_status);
            }
        } catch { /* use stale state */ }

        const allowedIds = questIds ? new Set(questIds) : null;
        const claimable = this.getClaimable().filter((quest) => !allowedIds || allowedIds.has(quest.id));
        let claimed = 0;
        for (const quest of claimable) {
            try {
                await this.client.post(`/quests/${quest.id}/claim-reward`);
                claimed++;
                log(`Claimed reward for "${quest.config.messages.quest_name}"`);
                // Add delay between claims to reduce rate limiting
                await this.#timeout(1000);
            } catch (err) {
                log(`Could not claim reward for "${quest.config.messages.quest_name}": ${err.message}`);
                // Longer delay if rate limited
                if (err.message.includes('429')) {
                    await this.#timeout(15_000);
                }
            }
        }
        return claimed;
    }

    async acceptQuest(questId) {
        if (typeof this.client.get === 'function') {
            const fresh = await this.client.get('/quests/@me');
            const current = fresh?.quests?.find((candidate) => candidate.id === questId);
            if (!current) {
                throw new Error(`Quest ${questId} is no longer available. Refresh the quest list and try again.`);
            }
            const existing = this.#quests.get(questId);
            existing?.updateUserStatus(current.user_status ?? null);
            if (existing?.isEnrolledQuest()) return existing;
        }
        const r = await this.client.post(`/quests/${questId}/enroll`, {
            location: 11,
            is_targeted: false,
            metadata_raw: null,
        });
        const quest = this.get(questId);
        quest?.updateUserStatus(extractStatus(r));
        return quest;
    }

    #timeout(ms, signal) {
        if (signal?.aborted) return Promise.reject(new Error('Quest stopped because another quest was selected.'));
        return new Promise((resolve, reject) => {
            const onAbort = () => {
                clearTimeout(timer);
                reject(new Error('Quest stopped because another quest was selected.'));
            };
            const timer = setTimeout(() => {
                signal?.removeEventListener('abort', onAbort);
                resolve();
            }, ms);
            signal?.addEventListener('abort', onAbort, { once: true });
        });
    }

    async #refreshQuestStatus(quest, forceRefresh = false) {
        // Debounce: Don't refresh more frequently than every 30 seconds per quest
        const lastRefreshTime = this.#lastRefresh.get(quest.id) || 0;
        const timeSinceLastRefresh = Date.now() - lastRefreshTime;
        const MIN_REFRESH_INTERVAL = 30_000; // 30 seconds minimum between refreshes

        if (!forceRefresh && timeSinceLastRefresh < MIN_REFRESH_INTERVAL) {
            return; // Skip this refresh
        }

        try {
            const fresh = await this.client.get('/quests/@me');
            const updated = fresh.quests.find((q) => q.id === quest.id);
            if (updated?.user_status) quest.updateUserStatus(updated.user_status);
            this.#lastRefresh.set(quest.id, Date.now()); // Update last refresh time
        } catch { /* ignore */ }
    }

    async doingQuest(quest, log = console.log, onProgress = null, options = {}) {
        const signal = options?.signal;
        const checkCancelled = () => {
            if (signal?.aborted) throw new Error('Quest stopped because another quest was selected.');
        };
        const questName = quest.config.messages.quest_name;
        checkCancelled();

        if (!quest.isEnrolledQuest()) {
            log(`Enrolling in quest "${questName}"...`);
            try {
                await this.acceptQuest(quest.id);
                // Wait longer after enrollment for Discord to register it
                await this.#timeout(4000, signal);
            } catch (err) {
                log(`Could not enroll in "${questName}": ${err.message}`);
                return false;
            }
        }

        const taskConfig = quest.config.task_config ?? quest.config.task_config_v2;
        if (!taskConfig) {
            log(`[FAIL] "${questName}": task_config is missing from Discord's response.`);
            return false;
        }

        const tasks = taskConfig.tasks ?? {};
        const allKeys = Object.keys(tasks);
        log(`[INFO] "${questName}": task keys = [${allKeys.join(', ')}]`);

        const TASK_TYPES = Object.values(QuestTaskConfigType);
        const videoTaskNames = Object.keys(tasks).filter((key) => ['WATCH_VIDEO', 'WATCH_VIDEO_ON_MOBILE', 'WATCH_VIDEO_ON_IOS'].includes(key));
        const taskName = videoTaskNames[0] ?? TASK_TYPES.find((x) => tasks[x] != null);

        if (!taskName) {
            log(`[FAIL] "${questName}": unsupported task type(s) [${allKeys.join(', ')}].`);
            return false;
        }

        log(`[INFO] "${questName}": using task type "${taskName}"`);

        const applicationName = quest.config.application?.name ?? 'Unknown application';

        const task = tasks[taskName];
        const secondsNeeded = Number(task?.target);
        if (!Number.isFinite(secondsNeeded) || secondsNeeded <= 0) {
            log(`[FAIL] "${questName}": task target must be a positive number.`);
            return false;
        }
        const eventName = task?.event_name ?? task?.type ?? taskName;

        if (videoTaskNames.length > 0) {
            const taskNames = videoTaskNames;
            const maxFuture = 10, speed = 7, interval = 1;
            const startTime = Date.now();
            
            // Wait before starting to send progress (Discord needs time to register enrollment)
            await this.#timeout(3000, signal);
            
            const enrolledAt = quest.userStatus?.enrolled_at ? new Date(quest.userStatus.enrolled_at).getTime() : Date.now();
            let lastProgressLogTime = 0;

            for (const currentTaskName of taskNames) {
                const task = tasks[currentTaskName];
                const secondsNeeded = Number(task?.target);
                if (!Number.isFinite(secondsNeeded) || secondsNeeded <= 0) {
                    log(`[FAIL] "${questName}": task target must be a positive number.`);
                    return false;
                }

                const eventName = task.event_name ?? task.type ?? currentTaskName;
                let secondsDone = 0;
                let consecutiveErrors = 0;
                let lastRefreshTime = Date.now();
                const refreshInterval = 30_000; // Refresh every 30 seconds (reduced from 5s to avoid rate limits)

                while (secondsDone < secondsNeeded) {
                    checkCancelled();
                    // More generous timeout: base timeout + 120 extra seconds buffer for retries/API delays
                    if (Date.now() - startTime > (secondsNeeded + 120) * 1000) {
                        log(`Video quest "${questName}" timed out.`);
                        return false;
                    }

                    const elapsed = Math.floor((Date.now() - enrolledAt) / 1000);
                    const maxAllowed = elapsed + maxFuture;
                    const diff = maxAllowed - secondsDone;
                    const timestamp = Math.max(1, Math.min(secondsNeeded, elapsed + 3));

                    if (diff >= speed) {
                        try {
                            // Send video progress
                            const res = await this.client.post(`/quests/${quest.id}/video-progress`, {
                                timestamp: timestamp,
                            });
                            quest.updateUserStatus(extractStatus(res));
                            consecutiveErrors = 0;
                            if (quest.isCompleted()) break;
                            
                            // Only refresh periodically (every 30 seconds), not after every progress update
                            const now = Date.now();
                            if (now - lastRefreshTime >= refreshInterval) {
                                await this.#timeout(1000);
                                await this.#refreshQuestStatus(quest, false);
                                lastRefreshTime = now;
                            }
                            
                            const actualProgress = readProgress(quest, eventName, currentTaskName);
                            if (actualProgress > secondsDone) {
                                secondsDone = actualProgress;
                                lastProgressLogTime = Date.now();
                                const pct = Math.round((secondsDone / secondsNeeded) * 100);
                                log(`[PROGRESS] "${questName}": ${secondsDone}/${secondsNeeded}s (${pct}%)`);
                            }
                            
                            if (onProgress) {
                                await Promise.resolve(onProgress({
                                    quest,
                                    done: Math.max(secondsDone, getCombinedVideoProgress(quest, taskNames)),
                                    total: Math.max(...taskNames.map((name) => Number(tasks[name]?.target ?? 0))),
                                    taskName: currentTaskName,
                                    phase: 'starting',
                                })).catch((err) => log(`Progress update failed for "${questName}": ${err.message}`));
                            }
                            await this.#timeout(1000, signal);
                        } catch (err) {
                            consecutiveErrors++;
                            log(`Video progress beat failed for "${questName}" (attempt ${consecutiveErrors}): ${err.message}`);
                            if (consecutiveErrors >= 5) {
                                log(`Too many video progress failures for "${questName}". Giving up.`);
                                return false;
                            }
                            // Longer backoff for rate limit errors
                            const backoffMs = err.message.includes('429') ? 30_000 : 8_000;
                            await this.#timeout(backoffMs, signal);
                        }
                    }

                    if (secondsDone >= secondsNeeded) break;
                    await this.#timeout(interval * 1000, signal);
                }
            }

            // Reduced final checks: 2-3 checks instead of 5, with longer waits between
            let finalProgress = 0;
            for (let i = 0; i < 2; i++) {
                await this.#timeout(10_000, signal); // Wait 10 seconds between final checks
                await this.#refreshQuestStatus(quest, true); // Force refresh on final checks
                
                if (quest.isCompleted()) {
                    log(`Quest "${questName}" completed!`);
                    return true;
                }
                
                const actualProgress = getCombinedVideoProgress(quest, taskNames);
                if (actualProgress > finalProgress) {
                    finalProgress = actualProgress;
                    const maxTarget = Math.max(...taskNames.map((name) => Number(tasks[name]?.target ?? 0)));
                    const pct = Math.round((actualProgress / maxTarget) * 100);
                    log(`[FINAL CHECK ${i + 1}] "${questName}": ${actualProgress}/${maxTarget}s (${pct}%)`);
                }
                
                if (hasAllRequiredProgress(quest, taskNames, tasks)) {
                    log(`Quest "${questName}" completed!`);
                    return true;
                }
            }

            log(`Quest "${questName}" was not confirmed complete by Discord.`);
            return false;

        } else if (['PLAY_ON_DESKTOP', 'PLAY_ON_XBOX', 'PLAY_ON_PLAYSTATION'].includes(taskName)) {
            const interval = 30;
            // More generous timeout: base timeout + 120 extra seconds buffer
            const maxDurationMs = (secondsNeeded + 120) * 1000;
            const startTime = Date.now();
            let beats = 0, consecutiveErrors = 0;

            while (!quest.isCompleted()) {
                checkCancelled();
                if (Date.now() - startTime > maxDurationMs) {
                    log(`Quest "${questName}" timed out.`);
                    try {
                        const res = await this.client.post(`/quests/${quest.id}/heartbeat`, { stream_key: null, terminal: true });
                        quest.updateUserStatus(extractStatus(res));
                    } catch { /* ignore */ }
                    return quest.isCompleted();
                }

                try {
                    const res = await this.client.post(`/quests/${quest.id}/heartbeat`, { stream_key: null, terminal: false });
                    quest.updateUserStatus(extractStatus(res));
                    consecutiveErrors = 0;
                    await this.#timeout(2000, signal);
                } catch (err) {
                    consecutiveErrors++;
                    log(`Heartbeat failed for "${questName}" (attempt ${consecutiveErrors}): ${err.message}`);
                    if (consecutiveErrors >= 8) { log(`Too many heartbeat failures for "${questName}". Giving up.`); return false; }
                    // Longer backoff for rate limit errors
                    const backoffMs = err.message.includes('429') ? 30_000 : 8_000;
                    await this.#timeout(backoffMs, signal);
                    continue;
                }

                beats++;
                if (beats % 5 === 0) await this.#refreshQuestStatus(quest);

                const done = readProgress(quest, eventName, taskName);
                if (onProgress) await Promise.resolve(onProgress({ quest, done, total: secondsNeeded, taskName, phase: 'starting' })).catch((err) => log(`Progress update failed for "${questName}": ${err.message}`));
                const remaining = Math.max(0, secondsNeeded - done);
                log(`Spoofed your game to ${applicationName}. About ${Math.ceil(remaining / 60)} more minute(s) to go.`);

                if (done >= secondsNeeded || quest.isCompleted()) break;
                await this.#timeout(interval * 1000, signal);
            }

            try {
                const res = await this.client.post(`/quests/${quest.id}/heartbeat`, { stream_key: null, terminal: true });
                quest.updateUserStatus(extractStatus(res));
                await this.#timeout(2000, signal);
            } catch { /* best effort */ }

            // Multiple refresh attempts to ensure Discord processes the completion
            for (let i = 0; i < 3; i++) {
                await this.#timeout(2000);
                await this.#refreshQuestStatus(quest);
                if (quest.isCompleted()) {
                    log(`Quest "${questName}" completed!`);
                    return true;
                }
            }

            log(`Quest "${questName}" was not confirmed complete by Discord.`);
            return false;

        } else if (taskName === 'STREAM_ON_DESKTOP') {
            log(`Stream quests cannot be completed automatically. Use the Discord desktop app for "${questName}".`);
            return false;
        } else if (taskName === 'PLAY_ACTIVITY') {
            log(`Activity quests are not supported. Use the Discord desktop app for "${questName}".`);
            return false;
        }

        return true;
    }
}

function extractStatus(res) {
    if (res && typeof res === 'object' && 'user_status' in res && res.user_status) {
        return res.user_status;
    }
    return res;
}

function readProgress(quest, eventName, taskName) {
    const progress = quest.userStatus?.progress;
    if (!progress) return 0;
    return getProgressValue(progress, [eventName, taskName]);
}

function getCombinedVideoProgress(quest, taskNames) {
    const progress = quest.userStatus?.progress ?? {};
    let maxValue = 0;
    for (const name of taskNames) {
        const task = quest.config.task_config?.tasks?.[name] ?? quest.config.task_config_v2?.tasks?.[name] ?? {};
        const eventName = task?.event_name ?? task?.type ?? name;
        const value = getProgressValue(progress, [name, eventName, task.type]);
        if (value > maxValue) {
            maxValue = value;
        }
    }
    return maxValue;
}

function hasAllRequiredProgress(quest, taskNames, tasks) {
    const progress = quest.userStatus?.progress ?? {};
    // For video tasks, we need to check if ANY of the task types has reached the target
    // Video tasks are counted individually, not combined
    for (const name of taskNames) {
        const task = tasks[name] ?? {};
        const target = Number(task.target ?? 0);
        if (target <= 0) continue;
        
        const eventName = task?.event_name ?? task?.type ?? name;
        const value = getProgressValue(progress, [name, eventName, task.type]);
        
        if (value < target) {
            return false; // Not all tasks have reached their target
        }
    }
    return true; // All required tasks have their target progress
}

function getProgressValue(progress, keys) {
    return keys.reduce((highest, key) => {
        if (!key) return highest;
        const entry = progress[key];
        let value = 0;
        if (typeof entry === 'object' && entry !== null) {
            value = Number(entry?.value ?? entry?.progress ?? entry?.count ?? 0);
        } else if (typeof entry === 'number') {
            value = entry;
        }
        value = Number.isFinite(value) ? value : 0;
        return Math.max(highest, value);
    }, 0);
}
