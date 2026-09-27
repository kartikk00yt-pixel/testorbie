function normalizeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function getQuestTaskEntries(quest) {
  const config = quest?.config ?? {};
  const taskConfig = config.task_config ?? config.task_config_v2 ?? {};
  const tasks = taskConfig.tasks ?? {};
  return Object.entries(tasks);
}

export function summarizeQuestProgress(quest) {
  const taskEntries = getQuestTaskEntries(quest);
  let target = 0;
  let current = 0;
  const userStatus = quest?.user_status ?? quest?.userStatus ?? {};
  const progressMap = userStatus.progress ?? {};

  for (const [taskKey, task] of taskEntries) {
    const taskTarget = normalizeNumber(task?.target);
    if (taskTarget > target) target = taskTarget;

    const eventName = task?.event_name ?? task?.type;
    const taskProgress = progressMap[eventName]?.value
      ?? progressMap[eventName]?.progress
      ?? progressMap[taskKey]?.value
      ?? progressMap[taskKey]?.progress
      ?? 0;
    const taskCurrent = normalizeNumber(taskProgress);
    if (taskCurrent > current) current = taskCurrent;
  }

  const fallbackTarget = target || (quest?.config?.target ?? 0);
  const safeTarget = Math.max(1, normalizeNumber(fallbackTarget));
  const percent = fallbackTarget > 0 ? Math.min(100, Math.round((current / fallbackTarget) * 100)) : 0;
  const remaining = fallbackTarget > 0 ? Math.max(0, fallbackTarget - current) : 0;
  const completed = Boolean(userStatus.completed_at) || (fallbackTarget > 0 && current >= fallbackTarget);
  const status = completed ? 'Completed' : remaining === 0 && current > 0 ? 'Ready' : current > 0 ? 'In Progress' : 'Not Started';

  const result = {
    current,
    target: fallbackTarget,
    remaining,
    percent: Math.max(0, Math.min(100, percent)),
    completed,
    status,
    safeTarget,
  };

  return {
    ...result,
    progress: result,
  };
}

export class QuestProgressTracker {
  #snapshots = new Map();

  recordSnapshot(userId, quest) {
    const key = `${userId}:${quest?.id ?? 'unknown'}`;
    const current = summarizeQuestProgress(quest);
    const previous = this.#snapshots.get(key);
    const changed = previous ? (
      previous.current !== current.current ||
      previous.completed !== current.completed ||
      previous.status !== current.status ||
      previous.target !== current.target
    ) : false;

    this.#snapshots.set(key, { ...current, questId: quest?.id ?? key, userId, updatedAt: Date.now() });
    return { ...current, changed, questId: quest?.id ?? key, userId, progress: current.progress };
  }

  getSnapshot(userId, questId) {
    return this.#snapshots.get(`${userId}:${questId}`) ?? null;
  }
}
