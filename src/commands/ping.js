// : ! Shivay 乂 Development !
// + Discord: vaadiyanl_
// + Community: https://discord.gg/PduCym9ue4 (Shivay 乂 Development)
// + for any queries reach out Community or DM me.

import {
  SlashCommandBuilder,
  Routes,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
  MessageFlags,
} from 'discord.js';
import { getEmoji } from '../handlers/emoji.js';

function statusLabel(ws, rest) {
  if (rest >= 1000) {
    return { text: 'REST API is responding slowly', color: 0xFFFFFF };
  }
  if (rest >= 500) {
    return { text: 'REST API has elevated latency', color: 0xFFFFFF };
  }
  // Handle -1 or invalid WebSocket ping
  if (ws < 0 || !Number.isFinite(ws)) {
    return { text: 'WebSocket ping unavailable', color: 0xFFFFFF };
  }
  if (ws < 80)  return { text: 'Blazing fast — no complaints here', color: 0xFFFFFF };
  if (ws < 150) return { text: 'Solid connection, all good', color: 0xFFFFFF };
  if (ws < 250) return { text: 'A little sluggish, but holding up', color: 0xFFFFFF };
  return { text: 'Running hot — might be a hiccup', color: 0xFFFFFF };
}

function buildPingCard(ws, rest, avatar) {
  const { text, color } = statusLabel(ws, rest);
  const c = new ContainerBuilder().setAccentColor(0xFFFFFF);

  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# __**${getEmoji('ping')} Latency Check**__\n-# ${text}`,
        ),
      )
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatar)),
  );

  c.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
  );

  const wsPingDisplay = ws < 0 || !Number.isFinite(ws) ? 'not available yet' : `${ws}ms`;
  const restDisplay = rest == null ? 'unavailable' : `${rest}ms`;
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `${getEmoji('info')} __**WebSocket Heartbeat**__ — \`${wsPingDisplay}\`\n${getEmoji('arrow')} __**REST Round-trip**__ — \`${restDisplay}\``,
    ),
  );

  c.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
  );

  // Status message based on valid values
  let statusMsg;
  if (ws < 0 || !Number.isFinite(ws)) {
    statusMsg = getEmoji('info') + ' WebSocket latency unavailable';
  } else if (rest >= 1000) {
    statusMsg = getEmoji('error') + ' REST API latency is high';
  } else if (rest >= 500) {
    statusMsg = getEmoji('warning') + ' REST API latency is elevated';
  } else if (ws < 150) {
    statusMsg = getEmoji('success') + ' All systems nominal';
  } else if (ws < 250) {
    statusMsg = getEmoji('warning') + ' Slight delay detected';
  } else {
    statusMsg = getEmoji('error') + ' Elevated latency — keep an eye on it';
  }

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# ${statusMsg}`),
  );

  return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

let cachedWebSocketLatency = null;
let cachedRestLatency = null;
let lastRestMeasure = 0;
let restMeasurementPromise = null;
const REST_CACHE_TTL = 30 * 1000;

async function measureRestLatency(client) {
  const now = Date.now();
  if (cachedRestLatency !== null && now - lastRestMeasure < REST_CACHE_TTL) return cachedRestLatency;
  if (restMeasurementPromise) return restMeasurementPromise;

  restMeasurementPromise = (async () => {
    const startedAt = Date.now();
    try {
      await client.rest.get(Routes.user('@me'));
      cachedRestLatency = Date.now() - startedAt;
      lastRestMeasure = Date.now();
    } catch {
      // Keep the last successful measurement when Discord is temporarily slow.
    } finally {
      restMeasurementPromise = null;
    }
    return cachedRestLatency;
  })();
  return restMeasurementPromise;
}

async function measureRestLatencyWithTimeout(client, timeoutMs = 1500) {
  return Promise.race([
    measureRestLatency(client),
    new Promise((resolve) => setTimeout(() => resolve(cachedRestLatency), timeoutMs)),
  ]);
}

function getWebSocketPing(client) {
  const shardPings = (client.ws.shards?.map((shard) => shard.ping) ?? [])
    .filter((ping) => ping >= 0 && Number.isFinite(ping));
  const ws = shardPings.length > 0
    ? Math.round(shardPings.reduce((total, ping) => total + ping, 0) / shardPings.length)
    : client.ws.ping;
  if (ws >= 0 && Number.isFinite(ws)) {
    cachedWebSocketLatency = ws;
    return ws;
  }
  return cachedWebSocketLatency ?? -1;
}

async function waitForWebSocketPing(client, timeoutMs = 500) {
  const startedAt = Date.now();
  let ws = getWebSocketPing(client);
  while (ws < 0 && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    ws = getWebSocketPing(client);
  }
  return ws;
}

export default {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency'),
  prefix: 'ping',

  async execute(interaction) {
    const ws = getWebSocketPing(interaction.client);
    const latestWs = ws >= 0 ? ws : await waitForWebSocketPing(interaction.client, 150);
    const avatar = interaction.client.user.displayAvatarURL({ size: 128, extension: 'png' });
    const initialRest = cachedRestLatency;
    await interaction.reply(buildPingCard(latestWs, cachedRestLatency, avatar)).catch(err => {
      console.error('[Ping] Failed to send ping response:', err?.message ?? err);
    });

    void measureRestLatencyWithTimeout(interaction.client).then((latestRest) => {
      if (latestRest !== initialRest && latestRest !== null) {
        return interaction.editReply(buildPingCard(latestWs, latestRest, avatar)).catch(err => {
          console.error('[Ping] Failed to update ping response:', err?.message ?? err);
        });
      }
      return null;
    }).catch(err => {
      console.error('[Ping] Failed to measure REST latency:', err?.message ?? err);
    });
  },

  async prefixExecute(message, _a, client) {
    const ws = getWebSocketPing(client);
    const latestWs = ws >= 0 ? ws : await waitForWebSocketPing(client, 150);
    const avatar = client.user.displayAvatarURL({ size: 128, extension: 'png' });
    const reply = await message.reply(buildPingCard(latestWs, cachedRestLatency, avatar)).catch(err => {
      console.error('[Ping] Failed to send ping response:', err?.message ?? err);
    });
    if (!reply) return;

    const initialRest = cachedRestLatency;
    void measureRestLatencyWithTimeout(client).then((latestRest) => {
      if (latestRest !== initialRest && latestRest !== null) {
        return reply.edit(buildPingCard(latestWs, latestRest, avatar)).catch(err => {
          console.error('[Ping] Failed to update ping response:', err?.message ?? err);
        });
      }
      return null;
    }).catch(err => {
      console.error('[Ping] Failed to measure REST latency:', err?.message ?? err);
    });
  },
};

// : ! Shivay 乂 Development !
// + Discord: vaadiyanl_
// + Community: https://discord.gg/PduCym9ue4 (Shivay 乂 Development)
// + for any queries reach out Community or DM me.
