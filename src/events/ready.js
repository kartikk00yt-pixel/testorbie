// : ! Shivay 乂 Development !
// + Discord: vaadiyanl_
// + Community: https://discord.gg/PduCym9ue4 (Shivay 乂 Development)
// + for any queries reach out Community or DM me.

import { ActivityType } from 'discord.js';
import { OWNER_ID } from '../utils/config.js';
import { startAutoquestWatcher } from '../utils/autoquestWatcherV3.js';
import { getStyleForGuild } from '../utils/nameStyles.js';
import { Routes } from 'discord.js';

const col = {
    reset:  '\x1b[0m',
    bright: '\x1b[1m',
    green:  '\x1b[92m',
    white:  '\x1b[97m',
    gray:   '\x1b[90m',
    purple: '\x1b[35m',
};

const line = `${col.purple}${col.bright}  ─────────────────────────────────────${col.reset}`;
// Discord rate-limits presence updates; five seconds is too frequent for a bot.
const PRESENCE_INTERVAL_MS = 60_000;

function getCachedUserCount(client) {
    return [...client.guilds.cache.values()].reduce((total, guild) => total + Math.max(0, (guild.memberCount ?? 1) - 1), 0);
}

async function getPresenceActivities(client) {
    const userCount = getCachedUserCount(client);
    const owner = OWNER_ID ? await client.users.fetch(OWNER_ID).catch(() => null) : null;
    const ownerName = owner?.globalName || owner?.username || OWNER_ID || 'Unknown';
    return [
        `Server List: ${client.guilds.cache.size}`,
        `User List: ${userCount}`,
        `Bot Owner: ${ownerName}`,
    ];
}

function startPresenceRotation(client) {
    if (client.presenceRotation) clearInterval(client.presenceRotation);
    let index = 0;
    const updatePresence = async () => {
        const activities = await getPresenceActivities(client);
        const activity = activities[index % activities.length];
        index += 1;
        try {
            await client.user.setPresence({
                activities: [{ name: activity, type: ActivityType.Watching }],
                status: 'online',
            });
        } catch (err) {
            console.error('[Ready] Failed to update presence:', err?.message ?? err);
        }
    };
    void updatePresence();
    client.presenceRotation = setInterval(updatePresence, PRESENCE_INTERVAL_MS);
}

async function reapplyNameStyles(client) {
    for (const guild of client.guilds.cache.values()) {
        const guildId = guild.id;
        const style = getStyleForGuild(guildId);
        if (!style) continue;
        try {
            await client.rest.patch(Routes.guildMember(guildId, '@me'), { body: style });
        } catch (err) {
            console.error(`[Ready] Failed to reapply name style in ${guildId}:`, err?.message ?? err);
        }
    }
}

export default {
    name: 'clientReady',
    once: true,
    async execute(client) {
        startPresenceRotation(client);
        await reapplyNameStyles(client);

        console.log(line);
        console.log(`  ${col.green}${col.bright}✓ ${col.white}Logged in as ${col.green}${client.user.tag}${col.reset}`);
        console.log(`  ${col.green}${col.bright}✓ ${col.white}Serving ${col.green}${client.guilds.cache.size}${col.white} guild(s)${col.reset}`);
        console.log(line);

        // Start autoquest watcher with error handling
        try {
            startAutoquestWatcher(client);
            console.log(`  ${col.green}${col.bright}✓ ${col.white}Autoquest watcher initialized${col.reset}`);
        } catch (err) {
            console.error('[Ready] Failed to start autoquest watcher:', err?.message ?? err);
        }
    },
};

// : ! Shivay 乂 Development !
// + Discord: vaadiyanl_
// + Community: https://discord.gg/PduCym9ue4 (Shivay 乂 Development)
// + for any queries reach out Community or DM me.
