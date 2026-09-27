import test from 'node:test';
import assert from 'node:assert/strict';

import { QuestProgressTracker, summarizeQuestProgress } from '../src/core/questProgressTracker.js';
import { buildHelpMenu } from '../src/commands/help.js';
import { buildTokenDeviceInstructions, getDeviceGuideData, getQuestAllWorkerCount, dispatchQuestBatch, premiumCmd } from '../src/commands/questCommands.js';
import { getAutoquestWorkerCount } from '../src/utils/autoquestWatcher.js';
import { normalizePremiumUserId, parsePremiumDuration, grantTrialPremium, hasClaimedTrial } from '../src/quest/premiumStore.js';
import { enableAutoquest, disableAutoquest, isAutoquestEnabled } from '../src/quest/autoquestStore.js';
import { Quest } from '../src/quest/quest.js';
import { QuestManager } from '../src/quest/questManager.js';
import { getDefaultNameStyle, getStyleForGuild, parseNameStyleColor, validateNameStyle } from '../src/utils/nameStyles.js';

test('quest progress tracker prevents stale or duplicate progress updates', () => {
  const tracker = new QuestProgressTracker();
  const quest = {
    id: 'quest-1',
    config: { messages: { quest_name: 'Send Messages' }, task_config: { tasks: { PLAY_ACTIVITY: { target: 20 } } } },
    user_status: { progress: { PLAY_ACTIVITY: { value: 12 } }, completed_at: null },
  };

  const first = tracker.recordSnapshot('user-1', quest);
  const second = tracker.recordSnapshot('user-1', quest);
  const third = tracker.recordSnapshot('user-1', {
    ...quest,
    user_status: { progress: { PLAY_ACTIVITY: { value: 14 } }, completed_at: null },
  });

  assert.equal(first.changed, false);
  assert.equal(second.changed, false);
  assert.equal(third.changed, true);
  assert.equal(third.progress.current, 14);
  assert.equal(third.progress.remaining, 6);
  assert.equal(third.progress.percent, 70);
});

test('quest manager rejects invalid numeric task targets before progress requests', async () => {
  const requests = [];
  const client = {
    post: async (path, body) => {
      requests.push({ path, body });
      return {};
    },
  };
  const quest = Quest.create({
    id: 'quest-invalid-target',
    config: {
      messages: { quest_name: 'Invalid Target Quest' },
      task_config: { tasks: { WATCH_VIDEO: { target: undefined } } },
    },
    user_status: null,
  });
  const manager = new QuestManager(client, [quest]);
  const logs = [];

  assert.equal(await manager.doingQuest(quest, (message) => logs.push(message)), false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, '/quests/quest-invalid-target/enroll');
  assert.match(logs.at(-1), /target must be a positive number/);
});

test('desktop quest requires Discord completion confirmation', async () => {
  const client = {
    post: async (path) => path.endsWith('/heartbeat')
      ? { user_status: { enrolled_at: new Date().toISOString(), progress: { PLAY_ON_DESKTOP: { value: 10 } } } }
      : {},
    get: async () => ({ quests: [{ id: 'quest-desktop-unconfirmed', user_status: { progress: { PLAY_ON_DESKTOP: { value: 10 } } } }] }),
  };
  const quest = Quest.create({
    id: 'quest-desktop-unconfirmed',
    config: {
      messages: { quest_name: 'Desktop Quest' },
      application: { name: 'Test Game' },
      task_config: { tasks: { PLAY_ON_DESKTOP: { target: 10 } } },
    },
    user_status: { enrolled_at: new Date().toISOString(), progress: { PLAY_ON_DESKTOP: { value: 0 } } },
  });
  const manager = new QuestManager(client, [quest]);

  assert.equal(await manager.doingQuest(quest, () => {}), false);
});

test('quest-all and autoquest fan out across every valid quest instead of capping to the normal concurrency limit', async () => {
  assert.equal(getQuestAllWorkerCount(0), 1);
  assert.equal(getQuestAllWorkerCount(1), 1);
  assert.equal(getQuestAllWorkerCount(3), 3);
  assert.equal(getQuestAllWorkerCount(12), 12);

  assert.equal(getAutoquestWorkerCount(0), 1);
  assert.equal(getAutoquestWorkerCount(1), 1);
  assert.equal(getAutoquestWorkerCount(4), 4);
  assert.equal(getAutoquestWorkerCount(9), 9);

  const started = [];
  const valid = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const progressMsgs = [
    { edit: async () => {} },
    { edit: async () => {} },
    { edit: async () => {} },
  ];
  const manager = {
    doingQuest: async (quest) => {
      started.push(quest.id);
      await new Promise((resolve) => setTimeout(resolve, 25));
      return true;
    },
  };

  const { questResults } = await dispatchQuestBatch(valid, manager, progressMsgs);
  assert.deepEqual(started.sort(), ['a', 'b', 'c']);
  assert.equal(questResults.length, 3);
  assert.ok(questResults.every((result) => result?.status === 'fulfilled' && result.value === true));
});

test('help menu renders the selected category as a Components V2 panel', () => {
  const client = {
    user: { displayAvatarURL: () => 'https://example.com/bot.png' },
    guilds: { cache: { size: 4 } },
  };
  const menu = buildHelpMenu({ id: 'user-1', username: 'Alpha' }, client, 'quest');

  assert.equal(menu.embeds, undefined);
  assert.equal(menu.content, undefined);
  assert.ok(menu.flags > 0);
  assert.ok(menu.components?.length >= 1);
  const panel = menu.components[0].toJSON();
  assert.equal(panel.type, 17);
  assert.match(panel.components[0].components[0].content, /Orbie Panel/);
  assert.match(panel.components[0].components[0].content, /Quest Suite/);
  assert.equal(panel.components[3].type, 12);
  assert.equal(panel.components[3].items[0].media.url, 'https://cdn.discordapp.com/attachments/1517476247410835498/1529030642518724709/ezgif.com-crop.gif?ex=6a6da341&is=6a6c51c1&hm=7d5bbd066c156936f876245b0b774f8ca39c505260cef4a98e45d83ea75cea9c');
  assert.match(panel.components[5].content, /Live .* Prefix/);
});

test('device guides embed instructions with one video link and video player', async () => {
  const phoneGuide = getDeviceGuideData('phone');
  const computerGuide = getDeviceGuideData('computer');
  const iosGuide = getDeviceGuideData('ios');

  assert.match(phoneGuide.videoUrl, /VN20260307_122317\.mp4/);
  assert.match(computerGuide.videoUrl, /bandicam_2026-03-07_12-30-23-184\.mp4/);
  assert.match(iosGuide.videoUrl, /VN20260307_122317\.mp4/);

  const computerPayload = buildTokenDeviceInstructions('computer');
  assert.equal(computerPayload.content, undefined);
  assert.equal(computerPayload.files, undefined);
  assert.equal(computerPayload.flags > 0, true);
  assert.equal(computerPayload.components?.length, 1);
  const panel = computerPayload.components[0].toJSON();
  assert.equal(panel.type, 17);
  assert.equal(panel.accent_color, 0xFFFFFF);
  assert.equal(panel.components[1].type, 12);
  assert.equal(panel.components[1].items[0].media.url, computerGuide.videoUrl);
  assert.doesNotMatch(panel.components[0].content, /```javascript/);
  assert.equal(panel.components[2].components[0].custom_id, 'token_copy_code_computer');
});

test('premium grants accept raw ids and mention ids', () => {
  assert.equal(normalizePremiumUserId('123456789012345678'), '123456789012345678');
  assert.equal(normalizePremiumUserId('<@123456789012345678>'), '123456789012345678');
  assert.equal(normalizePremiumUserId('<@!123456789012345678>'), '123456789012345678');
  assert.equal(normalizePremiumUserId('@someone'), '');
});

test('premium duration shortcuts map to the requested units', () => {
    assert.equal(parsePremiumDuration(1, 's').ms, 1000);
    assert.equal(parsePremiumDuration(1, 'min').ms, 60 * 1000);
    assert.equal(parsePremiumDuration(1, 'h').ms, 60 * 60 * 1000);
    assert.equal(parsePremiumDuration(1, 'd').ms, 24 * 60 * 60 * 1000);
    assert.equal(parsePremiumDuration(1, 'w').ms, 7 * 24 * 60 * 60 * 1000);
    assert.equal(parsePremiumDuration(1, 'm').ms, 30 * 24 * 60 * 60 * 1000);
    assert.equal(parsePremiumDuration(1, 'y').ms, 31557600000);
    assert.equal(parsePremiumDuration(1, 'second').ms, 1000);
    assert.equal(parsePremiumDuration(1, 'minute').ms, 60 * 1000);
    assert.equal(parsePremiumDuration(1, 'hour').ms, 60 * 60 * 1000);
    assert.equal(parsePremiumDuration(1, 'day').ms, 24 * 60 * 60 * 1000);
    assert.equal(parsePremiumDuration(1, 'week').ms, 7 * 24 * 60 * 60 * 1000);
    assert.equal(parsePremiumDuration(1, 'month').ms, 30 * 24 * 60 * 60 * 1000);
    assert.equal(parsePremiumDuration(1, 'year').ms, 31557600000);
    assert.equal(parsePremiumDuration('p', '').type, 'permanent');
    assert.equal(parsePremiumDuration(0, 'day'), null);
});

test('premium prefix command handles non-owner access without throwing', async () => {
  const message = {
    author: { id: '999999999999999999' },
    reply: async () => ({ ok: true }),
  };

  await assert.doesNotReject(() => premiumCmd.prefixExecute(message, []));
});

test('multi-task video quests keep progressing until every queued video requirement is satisfied', async () => {
  const requests = [];
  const client = {
    post: async (path, body) => {
      requests.push({ path, body });
      return {
        user_status: {
          completed_at: new Date().toISOString(),
          progress: {
            WATCH_VIDEO: { value: 29 },
          },
        },
      };
    },
    get: async () => ({ quests: [] }),
  };

  const quest = Quest.create({
    id: 'multi-video-quest',
    config: {
      messages: { quest_name: 'Student Perks' },
      task_config: {
        tasks: {
          WATCH_VIDEO: { target: 29, event_name: 'WATCH_VIDEO' },
          WATCH_VIDEO_ON_MOBILE: { target: 20, event_name: 'WATCH_VIDEO_ON_MOBILE' },
        },
      },
    },
    user_status: {
      enrolled_at: new Date().toISOString(),
      progress: {
        WATCH_VIDEO: { value: 29 },
        WATCH_VIDEO_ON_MOBILE: { value: 0 },
      },
    },
  });

  const manager = new QuestManager(client, [quest]);

  assert.equal(await manager.doingQuest(quest, () => {}), true);
  assert.ok(requests.length >= 1);
});

test('autoquest state is normalized for mention and numeric IDs', () => {
  const userId = String(Date.now()).slice(-18).padStart(18, '1');
  const mentionId = `<@${userId}>`;

  assert.equal(enableAutoquest(mentionId), true);
  assert.equal(isAutoquestEnabled(userId), true);
  assert.equal(disableAutoquest(userId), true);
  assert.equal(isAutoquestEnabled(mentionId), false);
});

test('trial claims work for mention-style ids without duplicate claims', () => {
  const userId = String(Date.now() + 5000).slice(-18).padStart(18, '2');
  const mentionId = `<@${userId}>`;

  const first = grantTrialPremium(mentionId, 'trial-panel');
  const second = grantTrialPremium(userId, 'trial-panel');

  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(hasClaimedTrial(userId), true);
});

test('name styles validate Discord font, effect, and color requirements', () => {
  assert.deepEqual(getDefaultNameStyle(), {
    display_name_font_id: 10,
    display_name_effect_id: 3,
    display_name_colors: [0xFF7EB3],
  });
  assert.equal(parseNameStyleColor('#5865F2'), 0x5865F2);
  assert.equal(parseNameStyleColor('16777215'), 0xFFFFFF);
  assert.equal(parseNameStyleColor('#1000000'), null);
  assert.deepEqual(validateNameStyle({
    display_name_font_id: 6,
    display_name_effect_id: 2,
    display_name_colors: [0x5865F2, 0x57F287],
  }), {
    display_name_font_id: 6,
    display_name_effect_id: 2,
    display_name_colors: [0x5865F2, 0x57F287],
  });
  assert.equal(validateNameStyle({
    display_name_font_id: 99,
    display_name_effect_id: 1,
    display_name_colors: [0xFFFFFF],
  }), null);
  assert.equal(validateNameStyle({
    display_name_font_id: 6,
    display_name_effect_id: 2,
    display_name_colors: [0xFFFFFF],
  }), null);
  assert.deepEqual(getStyleForGuild(`new-guild-${Date.now()}`), getDefaultNameStyle());
});
