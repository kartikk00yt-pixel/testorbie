import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getEmoji } from '../handlers/emoji.js';
import { removeGuildCommandChannel } from '../quest/channelSettings.js';
import { resolveChannelInput } from './channel.js';

export default {
    prefix: 'remove',

    async prefixExecute(message, args) {
        if (!message.guild) {
            await message.reply('This command can only be used in a server.').catch(() => {});
            return;
        }

        if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
            await message.reply('You need Manage Server permission to remove a bot channel.').catch(() => {});
            return;
        }

        if (args[0]?.toLowerCase() !== 'channel' || !args[1]) {
            await message.reply('Usage: `;remove channel <channel-name>` or `;remove channel <#channel-id>`').catch(() => {});
            return;
        }

        const channelInput = args.slice(1).join(' ').trim();
        const channel = resolveChannelInput(message.guild, channelInput);
        if (!channel || !channel.isTextBased?.()) {
            await message.reply(`I could not find a text channel matching **${channelInput}**.`).catch(() => {});
            return;
        }

        if (!removeGuildCommandChannel(message.guild.id, channel.id)) {
            await message.reply(`<#${channel.id}> is not configured as a bot command channel.`).catch(() => {});
            return;
        }

        const confirmation = new EmbedBuilder()
            .setColor(0xFFFFFF)
            .setTitle(`__**${getEmoji('check')} Command Channel Removed**__`)
            .setDescription(`Bot commands are no longer enabled in <#${channel.id}>.`)
            .addFields({ name: `${getEmoji('server')} Removed Channel`, value: `<#${channel.id}>`, inline: true })
            .setFooter({ text: 'Use ;set channel <#channel-id> to add it again.' });

        await message.reply({ embeds: [confirmation] }).catch(() => {});
    },
};
