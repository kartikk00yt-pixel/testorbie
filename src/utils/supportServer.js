import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { SUPPORT_SERVER_INVITE } from './config.js';
import { getEmoji } from '../handlers/emoji.js';

let supportGuildPromise;
const membershipCache = new Map();
const MEMBERSHIP_CACHE_TTL = 10 * 60 * 1000; // 10 minute cache for membership
const NEGATIVE_MEMBERSHIP_CACHE_TTL = 30 * 1000;

async function getSupportGuild(client) {
    if (!SUPPORT_SERVER_INVITE) return null;

    supportGuildPromise ??= client.fetchInvite(SUPPORT_SERVER_INVITE)
        .then(async (invite) => {
            if (!invite.guild) return null;
            return client.guilds.cache.get(invite.guild.id)
                ?? await client.guilds.fetch(invite.guild.id).catch(() => null);
        })
        .catch(() => null);

    return supportGuildPromise;
}

export async function isSupportServerMember(client, userId) {
    if (!SUPPORT_SERVER_INVITE) return true;

    // Check cache first
    const cached = membershipCache.get(userId);
    const cacheTtl = cached?.value ? MEMBERSHIP_CACHE_TTL : NEGATIVE_MEMBERSHIP_CACHE_TTL;
    if (cached !== undefined && Date.now() - cached.timestamp < cacheTtl) {
        return cached.value;
    }

    const supportGuild = await getSupportGuild(client);
    if (!supportGuild || !userId) {
        membershipCache.set(userId, { value: false, timestamp: Date.now() });
        return false;
    }

    try {
        await supportGuild.members.fetch(userId);
        membershipCache.set(userId, { value: true, timestamp: Date.now() });
        return true;
    } catch {
        membershipCache.set(userId, { value: false, timestamp: Date.now() });
        return false;
    }
}

export function buildSupportJoinPrompt(ephemeral = false) {
    const prompt = {
        embeds: [new EmbedBuilder()
            .setColor(0xFFFFFF)
            .setTitle(`__**${getEmoji('support')} Support Server Required**__`)
            .setDescription('Please join the support server before using commands.')
            .setFooter({ text: 'Join the server, then run your command again.' })],
    };

    if (ephemeral) prompt.flags = MessageFlags.Ephemeral;
    if (SUPPORT_SERVER_INVITE) {
        prompt.components = [new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Join Support Server')
                .setStyle(ButtonStyle.Link)
                .setURL(SUPPORT_SERVER_INVITE),
        )];
    }

    return prompt;
}

export async function requireSupportServerMember(interaction, client) {
    if (await isSupportServerMember(client, interaction.user?.id)) return true;

    await interaction.reply(buildSupportJoinPrompt(true)).catch(() => {});
    return false;
}
