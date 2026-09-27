import { MessageFlags } from 'discord.js';
import { getEmoji } from '../handlers/emoji.js';
import { handleLinkModal, handleLinkPromptButton, handleAccountButton, buildTokenDeviceInstructions, getDeviceScript } from '../commands/questCommands.js';
import { handleTrialClaimButton } from '../commands/ownerCommands.js';
import { buildHelpMenu } from '../commands/help.js';
import { isGuildCommandChannel } from '../quest/channelSettings.js';
import { requireSupportServerMember } from '../utils/supportServer.js';
import { hasBypass, hasGuildBypass, hasGuildPremium } from '../quest/questAccessStore.js';
import { isOwnerUserId } from '../utils/config.js';

async function reportInteractionError(interaction, err) {
    const payload = { content: `${getEmoji('error')} Something went wrong.`, flags: MessageFlags.Ephemeral };
    console.error(`[InteractionCreate] Interaction error (${interaction.customId ?? interaction.commandName}):`, err?.message ?? err);
    if (err?.code === 40060 || /already been acknowledged/i.test(String(err?.message ?? ''))) return;
    if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(replyErr => {
          console.error(`[InteractionCreate] Failed to send follow-up:`, replyErr?.message ?? replyErr);
        });
    } else {
        await interaction.reply(payload).catch(replyErr => {
          console.error(`[InteractionCreate] Failed to send reply:`, replyErr?.message ?? replyErr);
        });
    }
}

export default {
    name: 'interactionCreate',
    once: false,
    async execute(interaction, client) {
        if (interaction.guild && !isGuildCommandChannel(interaction.guild.id, interaction.channelId)) {
            await interaction.reply({ content: 'Commands are disabled in this channel.', flags: MessageFlags.Ephemeral }).catch(() => {});
            return;
        }

        if (interaction.isModalSubmit() && interaction.customId.startsWith('link_token_modal')) {
            try {
                await handleLinkModal(interaction, client);
            } catch (err) {
                if (err?.code !== 10062 && err?.code !== 40060 && err?.status !== 404) await reportInteractionError(interaction, err);
            }
            return;
        }

        if (interaction.isButton() && interaction.customId === 'link_prompt') {
            try {
                await handleLinkPromptButton(interaction);
            } catch (err) {
                if (err?.code === 10062 || err?.status === 404) return;
                await reportInteractionError(interaction, err);
            }
            return;
        }

        if (interaction.isButton() && interaction.customId === 'trial_claim') {
            try {
                await handleTrialClaimButton(interaction);
            } catch (err) {
                await reportInteractionError(interaction, err);
            }
            return;
        }

        if (interaction.isButton() && (interaction.customId.startsWith('account_link:') || interaction.customId.startsWith('account_unlink:') || interaction.customId.startsWith('account_switch:'))) {
            try {
                await handleAccountButton(interaction, client);
            } catch (err) {
                await reportInteractionError(interaction, err);
            }
            return;
        }

        if (interaction.isButton() && interaction.customId.startsWith('token_device_')) {
            const device = interaction.customId.replace('token_device_', '');

            try {
                const guide = await buildTokenDeviceInstructions(device);
                await interaction.reply({
                    components: guide.components,
                    flags: guide.flags | MessageFlags.Ephemeral,
                });
            } catch (err) {
                if (err?.code !== 10062 && err?.code !== 40060 && err?.status !== 404) await reportInteractionError(interaction, err);
            }
            return;
        }

        if (interaction.isButton() && interaction.customId.startsWith('token_copy_code_')) {
            const device = interaction.customId.replace('token_copy_code_', '');
            try {
                const script = getDeviceScript(device);
                await interaction.reply({
                    content: script || 'Code is not available for this device.',
                    flags: MessageFlags.Ephemeral,
                });
            } catch (err) {
                if (err?.code !== 10062 && err?.code !== 40060 && err?.status !== 404) await reportInteractionError(interaction, err);
            }
            return;
        }

        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('help_category_')) {
            const customId = interaction.customId;
            const ownerId = customId === 'help_category_select' ? null : customId.replace('help_category_', '');
            if (ownerId && ownerId !== 'public' && interaction.user.id !== ownerId) {
                await interaction.reply({ content: 'This help menu belongs to another user.', flags: MessageFlags.Ephemeral });
                return;
            }

            try {
                const category = interaction.values?.[0] ?? 'overview';
                const payload = buildHelpMenu(interaction.user, interaction.client, category);
                await interaction.update(payload);
            } catch (err) {
                await reportInteractionError(interaction, err);
            }
            return;
        }

        if (interaction.isButton() && interaction.customId.startsWith('help_action_')) {
            const parts = interaction.customId.split('_');
            const ownerId = parts[2];
            const category = parts[3] ?? 'overview';
            if (interaction.user.id !== ownerId) {
                await interaction.reply({ content: 'This help menu belongs to another user.', flags: MessageFlags.Ephemeral });
                return;
            }

            try {
                const payload = buildHelpMenu(interaction.user, interaction.client, category);
                await interaction.update(payload);
            } catch (err) {
                await reportInteractionError(interaction, err);
            }
            return;
        }

        if (!interaction.isChatInputCommand()) return;
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        if (interaction.commandName === 'ping') {
            try {
                await command.execute(interaction, client);
            } catch (err) {
                await reportInteractionError(interaction, err);
            }
            return;
        }
        
        const isPrivileged = isOwnerUserId(interaction.user.id) || hasBypass(interaction.user.id);
        const guildBypass = interaction.guildId
            ? hasGuildBypass(interaction.user.id, interaction.guildId)
            : false;
        const guildPremium = interaction.guildId
            ? hasGuildPremium(interaction.user.id, interaction.guildId)
            : false;
        const hasSupport = isPrivileged || guildBypass || guildPremium
            ? true
            : await requireSupportServerMember(interaction, client);

        if (!isPrivileged && !guildBypass && !guildPremium && !hasSupport) return;

        try {
            await command.execute(interaction, client);
        } catch (err) {
            console.error(err);
            await reportInteractionError(interaction, err);
        }
    },
};
