import { Routes } from 'discord.js';
import { getStyleForGuild } from '../utils/nameStyles.js';

export default {
    name: 'guildCreate',
    once: false,
    async execute(guild, client) {
        const style = getStyleForGuild(guild.id);
        if (!style) return;

        try {
            await client.rest.patch(Routes.guildMember(guild.id, '@me'), { body: style });
            console.log(`[GuildCreate] Applied automatic name style in ${guild.name} (${guild.id})`);
        } catch (err) {
            console.error(`[GuildCreate] Failed to apply name style in ${guild.id}:`, err?.message ?? err);
        }
    },
};
