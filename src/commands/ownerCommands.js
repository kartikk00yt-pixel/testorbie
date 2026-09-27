import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    EmbedBuilder,
    MessageFlags,
    Routes,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
    ThumbnailBuilder,
} from 'discord.js';
import { getEmoji } from '../handlers/emoji.js';
import { isOwnerUserId } from '../utils/config.js';
import { grantBypass, grantGlobalNoPrefix, grantGuildBypass, grantGuildBypassForGuild, grantGuildNoPrefix, grantGuildPremium, grantNoPrefix, grantQuestAccess, revokeBypass, revokeGlobalNoPrefix, revokeGuildBypass, revokeGuildBypassForGuild, revokeGuildNoPrefix, revokeGuildPremium, revokeNoPrefix } from '../quest/questAccessStore.js';
import { grantTrialPremium, hasClaimedTrial, hasPremiumAccess, normalizePremiumUserId } from '../quest/premiumStore.js';
import { parseNameStyleColor, removeNameStyle, setNameStyle, validateNameStyle } from '../utils/nameStyles.js';

const TRIAL_CLAIM_BUTTON = 'trial_claim';

const UI_EMOJI = {
    previous: getEmoji('previous'),
    next: getEmoji('next'),
};

function buildTrialPanel() {
    return {
        embeds: [new EmbedBuilder()
            .setColor(0xFFFFFF)
            .setTitle('__***<:7212roleadmin:1541307976772624396> Orbie Premium Panel***__')
            .setDescription([
                '__ Unlock Orbie Premium automation, video/desktop quest support, and active notifications.__',
                '',
                '*<a:premium:1533801634352594964> Trial Keys',
                '',
                '    Grant Orbie Trial for 3 days.',
                '    Limited to one trial redemption per Discord account.',
                '    Trial accounts can only link their own Discord token (no alts).',
                '',
                '<:RainyMM_premium_crown:1541342354034921512> Premium Keys',
                '',
                '    Grant full Orbie Premium (5 active account slots).',
                '    Extend existing paid premium periods natively.',
                '',
                '<:RainyMM_Premiumpass:1541315494508888065> Activation',
                'Click the button below to activate your key!',
                'Thank you for using Orbie.*',
            ].join('\n'))],
        components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(TRIAL_CLAIM_BUTTON)
                .setEmoji({ name: 'MekoKey', id: '1542125120905154630' })
                .setLabel('Trial Claim')
                .setStyle(ButtonStyle.Success),
        )],
    };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isOwner(userId) {
    return isOwnerUserId(userId);
}

async function requireOwner(message) {
    if (!isOwner(message.author.id)) {
        await message.reply({ content: `${getEmoji('error')} This command is owner-only.`, allowedMentions: { repliedUser: false } }).catch(() => {});
        return false;
    }
    return true;
}

export const accessCmd = {
    prefix: 'access',
    async prefixExecute(message, args) {
        if (!(await requireOwner(message))) return;

        const userId = normalizePremiumUserId(args[0]);
        if (!userId) {
            await message.reply('Usage: `;access @user` or `;access userId`').catch(() => {});
            return;
        }

        grantQuestAccess(userId, message.author.id);
        const embed = new EmbedBuilder()
            .setColor(0xFFFFFF)
            .setTitle(`__**${getEmoji('access')} Lifetime Access Granted**__`)
            .setDescription(`Lifetime free quest access has been granted to <@${userId}>.`)
            .addFields(
                { name: 'User', value: `<@${userId}>`, inline: true },
                { name: `${getEmoji('time')} Access`, value: 'Lifetime', inline: true },
            )
            .setFooter({ text: `Granted by ${message.author.tag}` });

        await message.reply({ embeds: [embed], allowedMentions: { users: [userId], repliedUser: false } }).catch(() => {});
    },
};

export const bypassCmd = {
    prefix: 'bypass',
    async prefixExecute(message, args) {
        if (!(await requireOwner(message))) return;
        const action = String(args[0] ?? '').toLowerCase();
        if (!['add', 'remove'].includes(action)) {
            await message.reply('Usage: `;bypass add @user` or `;bypass remove @user`').catch(() => {});
            return;
        }

        const userId = normalizePremiumUserId(args[1]);
        if (!userId) {
            await message.reply(`Usage: ;bypass ${action} @user or ;bypass ${action} userId`).catch(() => {});
            return;
        }

        const changed = action === 'add'
            ? Boolean(grantBypass(userId, message.author.id))
            : revokeBypass(userId);
        const embed = new EmbedBuilder()
            .setColor(0xFFFFFF)
            .setTitle(`__**${getEmoji(action === 'add' ? 'access' : 'cross')} Bypass ${action === 'add' ? 'Granted' : 'Removed'}**__`)
            .setDescription(action === 'add'
                ? `Full bypass has been granted to <@${userId}>.`
                : changed
                    ? `Full bypass has been removed from <@${userId}>.`
                    : `<@${userId}> did not have a bypass.`)
            .addFields(
                { name: 'User', value: `<@${userId}>`, inline: true },
                { name: 'Support Server', value: action === 'add' ? 'Bypassed' : 'Required', inline: true },
                { name: 'Premium and Quest Limit', value: action === 'add' ? 'Bypassed' : 'Required', inline: true },
            )
            .setFooter({ text: `Changed by ${message.author.tag}` });

        await message.reply({
            embeds: [embed],
            allowedMentions: { users: [userId], repliedUser: false },
        }).catch(() => {});
    },
};

async function resolvePermissionUserId(message, args) {
    const mentionedUserId = message.mentions?.users?.first()?.id;
    if (mentionedUserId) return mentionedUserId;

    const directUserId = normalizePremiumUserId(args[1]);
    if (directUserId) return directUserId;

    if (!message.guild) return '';
    const requestedName = args.slice(1).filter((value) => !/^\d{17,20}$/.test(value)).join(' ').trim().replace(/^@/, '').toLowerCase();
    if (!requestedName) return '';

    const members = message.guild.members.cache.size > 0
        ? message.guild.members.cache.values()
        : (await message.guild.members.fetch()).values();
    const member = [...members].find((candidate) => [
        candidate.displayName,
        candidate.user?.globalName,
        candidate.user?.username,
        candidate.user?.tag,
    ].some((name) => String(name ?? '').toLowerCase() === requestedName));
    return member?.user?.id ?? '';
}

function parsePermissionDuration(args) {
    const durationArgs = args.slice(2).filter((value) => !/^\d{17,20}$/.test(value));
    if (durationArgs.length === 0) return { label: '1 month', ms: 30 * 24 * 60 * 60 * 1000 };

    const raw = durationArgs.join('').toLowerCase();
    if (['p', 'perm', 'permanent', 'forever', 'lifetime'].includes(raw)) return { label: 'Permanent', ms: null };

    const match = raw.match(/^(\d+(?:\.\d+)?)(m|mo|month|months|d|day|days|w|week|weeks|y|year|years)$/);
    if (!match) return null;

    const value = Number(match[1]);
    const unit = match[2];
    const unitMs = unit.startsWith('m') ? 30 * 24 * 60 * 60 * 1000
        : unit.startsWith('w') ? 7 * 24 * 60 * 60 * 1000
            : unit.startsWith('y') ? 365 * 24 * 60 * 60 * 1000
                : 24 * 60 * 60 * 1000;
    const durationMs = value * unitMs;
    const expiresAt = Date.now() + durationMs;
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 8.64e15 || !Number.isFinite(expiresAt) || expiresAt > 8.64e15) return null;
    return { label: `${value} ${unit}`, ms: durationMs };
}

async function executeGuildPermissionCommand(message, args, type, globalUserScope = false) {
    if (!(await requireOwner(message))) return;

    const action = String(args[0] ?? '').toLowerCase();
    if (!['add', 'remove'].includes(action)) {
        await message.reply(`Usage: ;${type} add @user [time] or ;${type} add guild <guildId> [time]`).catch(() => {});
        return;
    }

    const guildScopeKeyword = ['@guild', 'guild', '@server', 'server'];
    const scopedGuildToken = String(args[1] ?? '').toLowerCase();
    const secondIsGuildId = /^\d{17,20}$/.test(String(args[1] ?? ''));
    const guildWide = guildScopeKeyword.includes(scopedGuildToken)
        || (type === 'guildpass' && secondIsGuildId)
        || (type === 'noprefix' && secondIsGuildId && !/^\d{17,20}$/.test(String(args[2] ?? '')));

    const guildId = globalUserScope
        ? ''
        : guildWide
        ? String(args[2] ?? (guildScopeKeyword.includes(scopedGuildToken) ? message.guild?.id ?? '' : args[1] ?? message.guild?.id ?? '') ?? message.guild?.id ?? '').trim()
        : String(args.find((value) => /^\d{17,20}$/.test(value)) ?? message.guild?.id ?? '').trim();

    const userId = guildWide ? '' : await resolvePermissionUserId(message, args);
    const duration = action === 'add' ? parsePermissionDuration(args) : { label: '', ms: null };
    if (!globalUserScope && !/^\d{17,20}$/.test(guildId)) {
        await message.reply(`Usage: ;${type} ${action} @user [time] or ;${type} ${action} guild <guildId> [time]`).catch(() => {});
        return;
    }
    if (!guildWide && !userId) {
        await message.reply(`Usage: ;${type} ${action} @user [time] or ;${type} ${action} guild <guildId> [time]`).catch(() => {});
        return;
    }
    if (!duration) {
        await message.reply('Invalid time. Use `1m`, `1 day`, `1 week`, `1 year`, or `permanent`.').catch(() => {});
        return;
    }

    const isGuildPass = type === 'guildpass';
    const changed = globalUserScope
        ? (action === 'add' ? grantGlobalNoPrefix(userId, message.author.id, duration.ms) : revokeGlobalNoPrefix(userId))
        : isGuildPass
        ? (guildWide
            ? (action === 'add' ? grantGuildBypassForGuild(guildId, message.author.id, duration.ms) : revokeGuildBypassForGuild(guildId))
            : (action === 'add' ? grantGuildBypass(userId, guildId, message.author.id, duration.ms) : revokeGuildBypass(userId, guildId)))
        : guildWide
            ? (action === 'add' ? grantGuildNoPrefix(guildId, message.author.id, duration.ms) : revokeGuildNoPrefix(guildId))
            : (action === 'add' ? grantNoPrefix(userId, guildId, message.author.id, duration.ms) : revokeNoPrefix(userId, guildId));
    const granted = action === 'add';
    const existed = typeof changed === 'boolean' ? changed : true;
    const title = isGuildPass ? 'Guild Pass' : 'No Prefix';
    const description = granted
        ? `${title} permission granted to ${globalUserScope ? `<@${userId}> globally` : guildWide ? 'everyone in this guild' : `<@${userId}>`} ${globalUserScope ? '' : `in guild \`${guildId}\``}.`
        : existed
            ? `${title} permission removed from ${globalUserScope ? `<@${userId}> globally` : guildWide ? 'everyone in this guild' : `<@${userId}>`} ${globalUserScope ? '' : `in guild \`${guildId}\``}.`
            : `${globalUserScope ? `<@${userId}> did not have global` : guildWide ? 'This guild did not have' : `<@${userId}> did not have`} ${title.toLowerCase()} permission${globalUserScope ? '' : ` in guild \`${guildId}\``}.`;

    await message.reply({
        embeds: [new EmbedBuilder()
            .setColor(0xFFFFFF)
            .setTitle(`__**${getEmoji(granted ? 'access' : 'cross')} ${title} ${granted ? 'Granted' : 'Removed'}**__`)
            .setDescription(description)
            .addFields(
                { name: globalUserScope || guildWide ? 'Scope' : 'User', value: globalUserScope ? 'Global' : guildWide ? 'Everyone in guild' : `<@${userId}>`, inline: true },
                ...(!globalUserScope ? [{ name: 'Guild ID', value: guildId, inline: true }] : []),
                ...(granted ? [{ name: 'Duration', value: duration.label, inline: true }] : []),
            )
            .setFooter({ text: `Changed by ${message.author.tag}` })],
        allowedMentions: { users: userId ? [userId] : [], repliedUser: false },
    }).catch(() => {});
}

export const guildPassCmd = {
    prefix: 'guildpass',
    async prefixExecute(message, args) {
        await executeGuildPermissionCommand(message, args, 'guildpass');
    },
};

export const guildBypassAliasCmd = {
    prefix: 'guildbypass',
    async prefixExecute(message, args) {
        await executeGuildPermissionCommand(message, args, 'guildpass');
    },
};

export const guildPremiumCmd = {
    prefix: 'guildpremium',
    async prefixExecute(message, args) {
        if (!(await requireOwner(message))) return;
        if (!message.guild) {
            await message.reply({ embeds: [new EmbedBuilder()
                .setColor(0xFFFFFF)
                .setTitle(`${getEmoji('error_icon')} Guild Premium`)
                .setDescription('This command can only be used inside a server.')],
            }).catch(() => {});
            return;
        }

        const action = String(args[0] ?? '').toLowerCase();
        if (!['add', 'remove'].includes(action)) {
            await message.reply({ embeds: [new EmbedBuilder()
                .setColor(0xFFFFFF)
                .setTitle(`${getEmoji('info')} Guild Premium Usage`)
                .setDescription('Use `;guildpremium add @user [time]` or `;guildpremium remove @user`.')],
            }).catch(() => {});
            return;
        }

        const userId = await resolvePermissionUserId(message, args);
        if (!userId) {
            await message.reply({ embeds: [new EmbedBuilder()
                .setColor(0xFFFFFF)
                .setTitle(`${getEmoji('info')} Guild Premium Usage`)
                .setDescription(`Use \`;guildpremium ${action} @user${action === 'add' ? ' [time]' : ''}\`.`)],
            }).catch(() => {});
            return;
        }

        if (action === 'remove') {
            const removed = revokeGuildPremium(userId, message.guild.id);
            await message.reply({
                embeds: [new EmbedBuilder()
                    .setColor(0xFFFFFF)
                    .setTitle(`${removed ? '<a:Cross:1533801616262697032>' : getEmoji('warning_icon')} Guild Premium ${removed ? 'Removed' : 'Not Found'}`)
                    .setDescription(removed
                        ? 'Guild premium has been removed from this user.'
                        : 'This user does not have guild premium in this server.')
                    .addFields(
                        { name: 'User', value: `<@${userId}>`, inline: true },
                        { name: 'Guild', value: message.guild.name, inline: true },
                    )
                    .setFooter({ text: `Changed by ${message.author.tag}` })],
                allowedMentions: { users: [userId], repliedUser: false },
            }).catch(() => {});
            return;
        }

        const duration = parsePermissionDuration(args);
        if (!duration) {
            await message.reply({ embeds: [new EmbedBuilder()
                .setColor(0xFFFFFF)
                .setTitle(`${getEmoji('error_icon')} Invalid Duration`)
                .setDescription('Use `1d`, `1 week`, `1 month`, `1 year`, or `permanent`.')],
            }).catch(() => {});
            return;
        }
        grantGuildPremium(userId, message.guild.id, message.author.id, duration.ms);
        await message.reply({
            embeds: [new EmbedBuilder()
                .setColor(0xFFFFFF)
                .setTitle('<:guild:1544987309361991701> Guild Premium Granted')
                .setDescription('Premium access has been granted for this server only.')
                .addFields(
                    { name: 'User', value: `<@${userId}>`, inline: true },
                    { name: 'Guild', value: message.guild.name, inline: true },
                    { name: 'Duration', value: duration.label, inline: true },
                    { name: 'Account Slots', value: '2', inline: true },
                )
                .setFooter({ text: `Granted by ${message.author.tag}` })],
            allowedMentions: { users: [userId], repliedUser: false },
        }).catch(() => {});
    },
};

export const noPrefixCmd = {
    prefix: 'noprefix',
    async prefixExecute(message, args) {
        await executeGuildPermissionCommand(message, args, 'noprefix');
    },
};

export const noPrefixAliasCmd = {
    prefix: 'np',
    async prefixExecute(message, args) {
        await executeGuildPermissionCommand(message, args, 'noprefix', true);
    },
};

export const trialCmd = {
    prefix: 'trial',
    async prefixExecute(message, args) {
        if (!(await requireOwner(message))) return;
        if (String(args[0] ?? '').toLowerCase() !== 'activate') {
            await message.reply('Usage: `;trial activate`').catch(() => {});
            return;
        }
        await message.reply(buildTrialPanel()).catch(() => {});
    },
};

export const nameStyleCmd = {
    prefix: 'namestyle',
    async prefixExecute(message, args, client) {
        if (!(await requireOwner(message))) return;
        if (!message.guild) {
            await message.reply('This command can only be used inside a server.').catch(() => {});
            return;
        }

        const action = String(args[0] ?? '').toLowerCase();
        if (action === 'reset') {
            try {
                await client.rest.patch(Routes.guildMember(message.guild.id, '@me'), {
                    body: { display_name_font_id: null, display_name_effect_id: null, display_name_colors: null },
                });
                removeNameStyle(message.guild.id);
                await message.reply('Bot name style reset for this server.').catch(() => {});
            } catch (err) {
                await message.reply(`Could not reset the bot name style: ${err?.message ?? 'Discord API error'}`).catch(() => {});
            }
            return;
        }

        const fontId = Number(args[1]);
        const effectId = Number(args[2]);
        const firstColor = parseNameStyleColor(args[3]);
        const secondColor = args[4] === undefined ? null : parseNameStyleColor(args[4]);
        const style = {
            display_name_font_id: fontId,
            display_name_effect_id: effectId,
            display_name_colors: secondColor === null ? [firstColor] : [firstColor, secondColor],
        };
        if (!validateNameStyle(style)) {
            await message.reply('Usage: `;namestyle set <font 1-12> <effect 1-6> <color> [second-color]` or `;namestyle reset`').catch(() => {});
            return;
        }

        try {
            await client.rest.patch(Routes.guildMember(message.guild.id, '@me'), { body: style });
            setNameStyle(message.guild.id, style);
            await message.reply('Bot name style updated for this server.').catch(() => {});
        } catch (err) {
            await message.reply(`Could not update the bot name style: ${err?.message ?? 'Discord API error'}`).catch(() => {});
        }
    },
};

export async function handleTrialClaimButton(interaction) {
    const userId = interaction.user.id;
    if (hasPremiumAccess(userId)) {
        await interaction.reply({ content: 'You already have Premium access. Your existing Premium plan is unchanged.', flags: MessageFlags.Ephemeral });
        return;
    }
    if (hasClaimedTrial(userId)) {
        await interaction.reply({ content: 'You have already claimed your 3-day trial.', flags: MessageFlags.Ephemeral });
        return;
    }

    const result = grantTrialPremium(userId, 'trial-panel');
    if (!result.ok) {
        await interaction.reply({ content: result.error, flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.reply({
        content: `Trial activated successfully. Your Orbie Premium trial expires <t:${Math.floor(new Date(result.expiresAt).getTime() / 1000)}:R>. Use \`;link\` to link your own Discord account.`,
        flags: MessageFlags.Ephemeral,
    });
}

function buildOwnerListEmbed(title, rows, page, totalPages) {
    const body = rows.length > 0 ? rows.join('\n') : 'No entries found.';
    return new EmbedBuilder()
        .setColor(0xFFFFFF)
        .setTitle(`__**${title} • Page ${page}/${totalPages}**__`)
        .setDescription(`\`\`\`\n${body}\n\`\`\``)
        .setFooter({ text: `${rows.length} item${rows.length === 1 ? '' : 's'} shown` });
}

function buildOwnerPaginationButtons(prefix, currentPage, totalPages, userId) {
    const prevStyle = ButtonStyle.Secondary;
    const nextStyle = ButtonStyle.Secondary;

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${prefix}_prev_${userId}`)
            .setLabel(`${UI_EMOJI.previous} Previous`)
            .setStyle(prevStyle)
            .setDisabled(false),
        new ButtonBuilder()
            .setCustomId(`${prefix}_page_info_${userId}`)
            .setLabel(`Page ${currentPage}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`${prefix}_next_${userId}`)
            .setLabel(`Next ${UI_EMOJI.next}`)
            .setStyle(nextStyle)
            .setDisabled(false),
    );
}

function buildTokenLedgerPanel(page, pages, items, total, pageSize) {
    const panel = new ContainerBuilder().setAccentColor(0xFFFFFF);
    panel.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# __**Token Ledger**__\nPage ${page}/${pages} • ${total} user${total === 1 ? '' : 's'} total`,
    ));

    for (const [index, entry] of items.entries()) {
        const status = entry.status === 'linked' ? 'LINKED' : entry.status === 'unlinked' ? 'UNLINKED' : String(entry.status || 'UNKNOWN').toUpperCase();
        const time = new Date(entry.recordedAt ?? entry.lastUpdated ?? 0).toLocaleString();
        const accountLines = (entry.accounts ?? []).map((account) => [
            `Slot ${Number(account.slot ?? 0) + 1}: ${account.accountName || account.accountId || 'Unknown account'}`,
            `Account ID: ${account.accountId || 'Unknown'}`,
            `Status: ${account.active ? 'Active' : 'Inactive'}`,
            `Linked: ${account.linkedAt ? new Date(account.linkedAt).toLocaleString() : 'Unknown'}`,
        ].join(' | '));
        if (index > 0) panel.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        const content = [
            `### ${(page - 1) * pageSize + index + 1}. ${entry.displayName || entry.userId || 'Unknown User'}`,
            `User ID: ${entry.userId}`,
            `Username: ${entry.username || entry.displayName || 'Unknown User'}`,
            `Mention: <@${entry.userId}>`,
            `Status: ${status} • Token: Stored securely`,
            `Updated: ${time}`,
            accountLines.join('\n') || 'No account metadata found.',
        ].join('\n');
        const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
        if (entry.avatarUrl) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(entry.avatarUrl));
        panel.addSectionComponents(section);
    }

    if (items.length === 0) panel.addTextDisplayComponents(new TextDisplayBuilder().setContent('No token history found.'));
    return { components: [panel], flags: MessageFlags.IsComponentsV2 };
}

async function addTokenUserNames(items, client) {
    return Promise.all(items.map(async (entry) => {
        try {
            const user = await client.users.fetch(entry.userId);
            const accounts = await client.tokenStore.getAccounts(entry.userId).catch(() => []);
            return {
                ...entry,
                displayName: user.globalName || user.username || user.tag,
                username: user.username || user.tag || entry.username || '',
                avatarUrl: entry.avatarUrl || user.displayAvatarURL?.({ extension: 'png', size: 128 }) || '',
                accounts,
            };
        } catch {
            return {
                ...entry,
                displayName: entry.displayName || entry.userId || 'Unknown User',
                username: entry.username || entry.displayName || entry.userId || 'Unknown User',
                accounts: await client.tokenStore.getAccounts(entry.userId).catch(() => []),
            };
        }
    }));
}

async function paginateOwnerList(message, prefix, title, getRows, currentPage, totalPages, userId) {
    const rows = getRows(currentPage);
    const embed = buildOwnerListEmbed(title, rows, currentPage, totalPages);
    const buttons = buildOwnerPaginationButtons(prefix, currentPage, totalPages, userId);

    const reply = await message.reply({
        embeds: [embed],
        components: [buttons],
        allowedMentions: { repliedUser: false },
    }).catch(() => null);

    if (!reply) return;

    const collector = reply.createMessageComponentCollector({
        filter: (interaction) => {
            if (interaction.user.id !== userId) return false;
            return interaction.customId.startsWith(`${prefix}_prev_`) || interaction.customId.startsWith(`${prefix}_next_`);
        },
        time: 5 * 60 * 1000,
    });

    collector.on('collect', async (interaction) => {
        try {
            const isPrevious = interaction.customId.startsWith(`${prefix}_prev_`);
            const isNext = interaction.customId.startsWith(`${prefix}_next_`);

            if (interaction.user.id !== userId) {
                await interaction.reply({ content: 'This list belongs to another user.', flags: MessageFlags.Ephemeral }).catch(() => {});
                return;
            }

            const targetPage = isPrevious ? currentPage - 1 : currentPage + 1;
            if (isPrevious && currentPage <= 1) {
                await interaction.deferUpdate().catch(() => {});
                return;
            }
            if (isNext && currentPage >= totalPages) {
                await interaction.deferUpdate().catch(() => {});
                return;
            }

            const nextRows = getRows(targetPage);
            const nextEmbed = buildOwnerListEmbed(title, nextRows, targetPage, totalPages);
            const nextButtons = buildOwnerPaginationButtons(prefix, targetPage, totalPages, userId);

            currentPage = targetPage;
            await interaction.update({
                embeds: [nextEmbed],
                components: [nextButtons],
            }).catch(() => {});
        } catch (err) {
            console.error('Error updating owner pagination:', err);
            await interaction.reply({ content: 'An error occurred while updating the page.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    });
}

// ── Owner Commands ─────────────────────────────────────────────────────────

export const serverListCmd = {
    prefix: 'server',
    async prefixExecute(message, args, client) {
        if (!(await requireOwner(message))) return;

        const requestedPage = Number((args[0] === 'list' ? args[1] : args[0]) ?? 1);
        const guilds = [...client.guilds.cache.values()].sort((a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0));
        const pageSize = 20;
        const totalPages = Math.max(1, Math.ceil(guilds.length / pageSize));
        const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, totalPages) : 1;

        let currentPage = page;
        await paginateOwnerList(
            message,
            'server',
            `Global Server List • ${guilds.length} servers`,
            (targetPage) => {
                const start = (targetPage - 1) * pageSize;
                return guilds.slice(start, start + pageSize).map((guild, index) => {
                    const itemIndex = start + index + 1;
                    return `${itemIndex}. ${guild.name} | Members: ${guild.memberCount ?? 0} | ID: ${guild.id}`;
                });
            },
            currentPage,
            totalPages,
            message.author.id,
        );
    },
};

export const userListCmd = {
    prefix: 'user',
    async prefixExecute(message, args, client) {
        if (!(await requireOwner(message))) return;

        const requestedPage = Number((args[0] === 'list' ? args[1] : args[0]) ?? 1);
        const users = new Map();
        for (const guild of client.guilds.cache.values()) {
            for (const member of guild.members.cache.values()) {
                if (!member.user || member.user.bot) continue;
                users.set(member.user.id, `${member.user.tag} | ${member.user.id}`);
            }
        }

        const entries = [...users.entries()].sort((a, b) => a[1].localeCompare(b[1]));
        const pageSize = 20;
        const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
        const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, totalPages) : 1;
        let currentPage = page;

        await paginateOwnerList(
            message,
            'user',
            `Global User List • ${entries.length} users`,
            (targetPage) => {
                const start = (targetPage - 1) * pageSize;
                return entries.slice(start, start + pageSize).map(([id, label], index) => `${start + index + 1}. ${label} | ${id}`);
            },
            currentPage,
            totalPages,
            message.author.id,
        );
    },
};

export const tokenListCmd = {
    prefix: 'tokenlist',
    async prefixExecute(message, args, client) {
        if (!(await requireOwner(message))) return;

        const pageSize = 20;
        let currentPage = Number(args[0] ?? 1);
        currentPage = Number.isFinite(currentPage) && currentPage > 0 ? Math.floor(currentPage) : 1;

        const firstResult = await client.tokenStore.listLedgerEntries(currentPage, pageSize);
        const safePage = Math.min(currentPage, firstResult.pages);
        const { data, total, pages, page } = safePage === currentPage
            ? firstResult
            : await client.tokenStore.listLedgerEntries(safePage, pageSize);
        currentPage = page;
        const tokenPanel = buildTokenLedgerPanel(currentPage, pages, await addTokenUserNames(data, client), total, pageSize);
        const buttons = buildOwnerPaginationButtons('tokenlist', currentPage, pages, message.author.id);

        const reply = await message.reply({
            ...tokenPanel,
            components: [...tokenPanel.components, buttons],
            allowedMentions: { users: data.map((entry) => entry.userId).filter((id) => /^\d{17,20}$/.test(String(id))), repliedUser: false },
        }).catch(() => null);

        if (!reply) return;

        const collector = reply.createMessageComponentCollector({
            filter: (interaction) => {
                if (interaction.user.id !== message.author.id) return false;
                return interaction.customId.startsWith('tokenlist_prev_') || interaction.customId.startsWith('tokenlist_next_');
            },
            time: 5 * 60 * 1000,
        });

        collector.on('collect', async (interaction) => {
            try {
                const isPrevious = interaction.customId.startsWith('tokenlist_prev_');
                const isNext = interaction.customId.startsWith('tokenlist_next_');

                if (interaction.user.id !== message.author.id) {
                    await interaction.reply({ content: 'This list belongs to another user.', flags: MessageFlags.Ephemeral }).catch(() => {});
                    return;
                }

                if (isPrevious && currentPage <= 1) {
                    await interaction.deferUpdate().catch(() => {});
                    return;
                }
                if (isNext && currentPage >= pages) {
                    await interaction.deferUpdate().catch(() => {});
                    return;
                }

                currentPage = isPrevious ? currentPage - 1 : currentPage + 1;
                const { data: nextItems, total: nextTotal, page: nextPage } = await client.tokenStore.listLedgerEntries(currentPage, pageSize);
                currentPage = nextPage;
                const nextTokenPanel = buildTokenLedgerPanel(currentPage, pages, await addTokenUserNames(nextItems, client), nextTotal, pageSize);
                const nextButtons = buildOwnerPaginationButtons('tokenlist', currentPage, pages, message.author.id);

                await interaction.update({
                    ...nextTokenPanel,
                    components: [...nextTokenPanel.components, nextButtons],
                    allowedMentions: { users: nextItems.map((entry) => entry.userId).filter((id) => /^\d{17,20}$/.test(String(id))), repliedUser: false },
                }).catch(() => {});
            } catch (err) {
                console.error('Error updating pagination:', err);
                await interaction.reply({ content: 'An error occurred while updating the page.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        });
    },
};
