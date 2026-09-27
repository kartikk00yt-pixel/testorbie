import { getEmoji } from '../handlers/emoji.js';
import { PREFIX } from '../utils/config.js';
import { isGuildCommandChannel } from '../quest/channelSettings.js';
import { buildSupportJoinPrompt, isSupportServerMember } from '../utils/supportServer.js';
import { hasBypass, hasGuildBypass, hasGuildPremium, hasNoPrefix } from '../quest/questAccessStore.js';
import { hasPremiumAccess } from '../quest/premiumStore.js';
import { hasPremiumRole } from '../commands/questCommands.js';
import { isOwnerUserId } from '../utils/config.js';

export default {
  name: 'messageCreate',
  once: false,
  async execute(message, client) {
    if (message.author.bot) return;
    const hasCommandPrefix = message.content.startsWith(PREFIX);
    if (!hasCommandPrefix) {
      if (!message.guild) return;
      // Parallelize premium checks
      const [hasPremium, hasPremiumRoleResult] = await Promise.all([
        Promise.resolve(hasPremiumAccess(message.author.id)),
        hasPremiumRole(message.author.id, client, message.member),
      ]);
      const premiumNoPrefix = hasPremium || hasPremiumRoleResult;
      if (!hasNoPrefix(message.author.id, message.guild.id) && !premiumNoPrefix) return;
    }

    const args = message.content.slice(hasCommandPrefix ? PREFIX.length : 0).trim().split(/\s+/);
    const commandName = args.shift().toLowerCase();

    const command = client.prefixCommands.get(commandName);
    if (!command) return;
    if (!['set', 'remove'].includes(commandName) && message.guild && !isGuildCommandChannel(message.guild.id, message.channel.id)) return;

    if (commandName === 'ping') {
      try {
        await command.prefixExecute(message, args, client);
      } catch (err) {
        console.error(`[MessageCreate] Error executing ping:`, err?.message ?? err);
      }
      return;
    }

    const isPrivileged = isOwnerUserId(message.author.id) || hasBypass(message.author.id);
    const guildBypass = message.guild ? hasGuildBypass(message.author.id, message.guild.id) : false;
    const guildPremium = message.guild ? hasGuildPremium(message.author.id, message.guild.id) : false;
    const hasSupport = isPrivileged || guildBypass || guildPremium
      ? true
      : await isSupportServerMember(client, message.author.id);

    if (!isPrivileged && !guildBypass && !guildPremium && !hasSupport) {
      await message.reply(buildSupportJoinPrompt()).catch(() => {});
      return;
    }

    try {
      await command.prefixExecute(message, args, client);
    } catch (err) {
      console.error(`[MessageCreate] Error executing command "${commandName}":`, err?.message ?? err);
      await message.reply(`${getEmoji('error')} Something went wrong: ${err?.message ?? 'Unknown error'}`).catch(replyErr => {
        console.error(`[MessageCreate] Failed to send error message:`, replyErr?.message ?? replyErr);
      });
    }
  },
};
