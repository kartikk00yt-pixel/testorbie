import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getGuildCommandChannelIds, setGuildCommandChannel } from '../quest/channelSettings.js';
import { getEmoji } from '../handlers/emoji.js';

export function resolveChannelInput(guild, channelInput) {
    const mentionMatch = channelInput.match(/^<#(\d+)>$/);
    const requestedName = channelInput.replace(/^#/, '').toLowerCase();
    return mentionMatch
        ? guild.channels.cache.get(mentionMatch[1])
        : guild.channels.cache.find((candidate) => (
            candidate.isTextBased?.() && candidate.name?.toLowerCase() === requestedName
        ));
}

    function canUseChannel(guild, channel) {
        const botMember = guild.members.me;
        const permissions = botMember ? channel.permissionsFor(botMember) : null;
        return permissions?.has([
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
        ]) ?? false;
    }

export default {
    prefix: 'set',

    async prefixExecute(message, args) {
        if (!message.guild) {
            await message.reply('This command can only be used in a server.').catch(() => {});
            return;
        }

        if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
            await message.reply('You need Manage Server permission to set the bot channel.').catch(() => {});
            return;
        }

        if (args[0]?.toLowerCase() !== 'channel' || !args[1]) {
            await message.reply('Usage: `;set channel <channel-name>` or `;set channel <#channel-id>`').catch(() => {});
            return;
        }

        const channelInput = args.slice(1).join(' ').trim();
        const channel = resolveChannelInput(message.guild, channelInput);
        if (!channel || !channel.isTextBased?.()) {
            await message.reply(`I could not find a text channel matching **${channelInput}**.`).catch(() => {});
            return;
        }
        if (!canUseChannel(message.guild, channel)) {
            await message.reply(`I cannot use <#${channel.id}>. I need View Channel, Send Messages, and Embed Links permissions there.`).catch(() => {});
            return;
        }

        setGuildCommandChannel(message.guild.id, channel.id);
        const configuredChannels = getGuildCommandChannelIds(message.guild.id);
        const confirmation = new EmbedBuilder()
            .setColor(0xFFFFFF)
            .setTitle(`__**${getEmoji('check')} Command Channel Updated**__`)
            .setDescription(`Bot commands are enabled in ${configuredChannels.map((id) => `<#${id}>`).join(', ')}.`)
            .addFields(
                { name: `${getEmoji('server')} Server`, value: message.guild.name, inline: true },
                { name: `${getEmoji('server')} Added Channel`, value: `<#${channel.id}>`, inline: true },
            )
            .setFooter({ text: 'Use ;set channel <#channel-id> to add another, or ;remove channel <#channel-id> to remove one.' });

        await message.reply({ embeds: [confirmation] }).catch(() => {});
    },
};
