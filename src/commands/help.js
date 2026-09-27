import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    TextDisplayBuilder,
    ThumbnailBuilder,
} from 'discord.js';
import { PREFIX, SUPPORT_SERVER_INVITE } from '../utils/config.js';
import { getEmoji } from '../handlers/emoji.js';

const LIVE_EMOJI_ICON_URL = 'https://cdn.discordapp.com/emojis/1533801619353763870.png?size=64';
const HELP_BANNER_URL = 'https://cdn.discordapp.com/attachments/1517476247410835498/1529030642518724709/ezgif.com-crop.gif?ex=6a6da341&is=6a6c51c1&hm=7d5bbd066c156936f876245b0b774f8ca39c505260cef4a98e45d83ea75cea9c';
const BOT_INVITE_URL = 'https://discord.com/oauth2/authorize?client_id=1530860905573650612';

const HELP_CATEGORIES = [
    {
        key: 'overview',
        label: 'Overview',
        emoji: getEmoji('Overview'),
        title: 'Overview',
        subtitle: 'Explore the complete Orbie command suite.',
        commands: [
            { name: '/help', value: 'Open this premium command dashboard.' },
            { name: '/support', value: 'Join the support server.' },
        ],
    },
    {
        key: 'all',
        label: 'All Commands',
        emoji: getEmoji('source'),
        title: 'All Commands',
        subtitle: 'Explore the complete Orbie command suite.',
        commands: [
            { name: '/help', value: 'Open this premium command dashboard.' },
            { name: '/link', value: 'Save your Discord token securely.' },
            { name: '/unlink', value: 'Remove your saved token.' },
            { name: '/tokencheck', value: 'Verify your token health.' },
            { name: '/quest', value: 'Complete one quest.' },
            { name: '/questall', value: 'Finish every available quest.' },
            { name: '/questlist', value: 'View your current quest progress.' },
            { name: '/autoquest', value: 'Run daily quests automatically.' },
            { name: '/ping', value: 'Check the bot latency.' },
            { name: '/support', value: 'Join the support server.' },
            { name: '/invite', value: 'Invite the bot to another server.' },
        ],
    },
    {
        key: 'security',
        label: 'Access & Security',
        emoji: getEmoji('lock'),
        title: 'Access & Security',
        subtitle: 'Keep your account safe and your token protected.',
        commands: [
            { name: '/link', value: 'Save your token with secure account linking.' },
            { name: '/unlink', value: 'Remove the saved token instantly.' },
            { name: '/tokencheck', value: 'Confirm that your token is still healthy.' },
        ],
    },
    {
        key: 'quest',
        label: 'Quest Suite',
        emoji: getEmoji('orbie'),
        title: 'Quest Suite',
        subtitle: 'Complete quests faster with the Orbie quest flow.',
        commands: [
            { name: '/quest', value: 'Pick and complete one quest.' },
            { name: '/questall', value: 'Finish every available quest.' },
            { name: '/questlist', value: 'View your progress in a clean list.' },
            { name: '/autoquest', value: 'Let Orbie run quests in the background.' },
        ],
    },
    {
        key: 'utilities',
        label: 'Utilities',
        emoji: getEmoji('tools'),
        title: 'Utilities',
        subtitle: 'Everyday commands for support and bot access.',
        commands: [
            { name: '/ping', value: 'Check live latency instantly.' },
            { name: '/help', value: 'Open this premium dashboard.' },
            { name: '/support', value: 'Join the support community.' },
            { name: '/invite', value: 'Invite the bot to a new server.' },
        ],
    },
    {
        key: 'settings',
        label: 'Settings',
        emoji: getEmoji('gear'),
        title: 'Settings',
        subtitle: 'Control your bot experience and account setup.',
        commands: [
            { name: '/link', value: 'Reconnect your account with the bot.' },
            { name: '/unlink', value: 'Reset your linked account state.' },
        ],
    },
    {
        key: 'support',
        label: 'Support',
        emoji: getEmoji('heart'),
        title: 'Support',
        subtitle: 'Need help or want to join the community?',
        commands: [
            { name: '/support', value: 'Open the support server invite.' },
            { name: '/invite', value: 'Share the bot with your friends.' },
        ],
    },
    {
        key: 'premium',
        label: 'Premium',
        emoji: getEmoji('premium'),
        title: 'Premium Access',
        subtitle: 'Premium commands are locked for regular users and only granted by the owner.',
        commands: [
            { name: '/questall', value: 'Premium command: complete every active quest.' },
            { name: '/autoquest', value: 'Premium command: auto-run quests in the background.' },
            { name: '/premium', value: 'Owner-only tool to add or remove premium access.' },
        ],
    },
];

function getInviteUrl() {
    return BOT_INVITE_URL;
}

function getCategoryConfig(selectedCategory = 'overview') {
    return HELP_CATEGORIES.find((item) => item.key === selectedCategory) || HELP_CATEGORIES[0];
}

function buildHelpSelectMenu(selectedCategory = 'all', ownerId) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(`help_category_${ownerId || 'public'}`)
        .setPlaceholder('Select a category...')
        .setMinValues(1)
        .setMaxValues(1);

    for (const category of HELP_CATEGORIES) {
        menu.addOptions({
            label: category.label,
            value: category.key,
            description: category.subtitle,
            emoji: category.emoji,
            default: category.key === selectedCategory,
        });
    }

    return new ActionRowBuilder().addComponents(menu);
}

function buildHelpButtons() {
    const buttons = [];
    const inviteUrl = getInviteUrl();

    if (inviteUrl) {
        buttons.push(
            new ButtonBuilder()
                .setLabel('Invite Bot')
                .setStyle(ButtonStyle.Link)
                .setURL(inviteUrl),
        );
    }

    if (SUPPORT_SERVER_INVITE) {
        buttons.push(
            new ButtonBuilder()
                .setLabel('Support Server')
                .setStyle(ButtonStyle.Link)
                .setURL(SUPPORT_SERVER_INVITE),
        );
    }

    return buttons.length > 0 ? new ActionRowBuilder().addComponents(buttons) : null;
}

export function buildHelpMenu(user, client, selectedCategory = 'overview') {
    const botAvatar = client?.user?.displayAvatarURL?.({ size: 128, extension: 'png' }) || null;
    const category = getCategoryConfig(selectedCategory);
    const categoryList = HELP_CATEGORIES.map((item) => `> ${getEmoji('arrow')} ${item.label}`).join('\n');
    const categoryCommands = category.commands.map((cmd) => {
        const commandLabel = cmd.name.startsWith('/') ? `${PREFIX}${cmd.name.slice(1)}` : cmd.name;
        return `• **${commandLabel}** — ${cmd.value}`;
    }).join('\n');

    const panel = new ContainerBuilder().setAccentColor(0xFFFFFF);
    panel.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent([
                    `# ${getEmoji('sparkle')} Orbie Panel`,
                    `${getEmoji('arrow')} Select a category below to browse the bot.`,
                    `**${category.emoji} ${category.title}**`,
                    category.subtitle,
                ].join('\n')),
            )
            .setThumbnailAccessory(
                new ThumbnailBuilder().setURL(botAvatar || LIVE_EMOJI_ICON_URL),
            ),
    );

    panel.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
    );

    panel.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            selectedCategory === 'overview'
                ? `## ${getEmoji('info')} Available categories\n${categoryList}`
                : `## ${getEmoji('bot')} Category commands\n${categoryCommands || '*No commands available for this category.*'}`,
        ),
    );

    panel.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL(HELP_BANNER_URL),
        ),
    );

    panel.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
    );

    panel.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `-# Live • ${client?.guilds?.cache?.size ?? 0} servers • Prefix ${PREFIX}`,
        ),
    );

    return {
        components: [panel, buildHelpSelectMenu(selectedCategory, user?.id), buildHelpButtons()].filter(Boolean),
        flags: MessageFlags.IsComponentsV2,
    };
}

export default {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('See all available commands'),
    prefix: 'help',

    async execute(interaction) {
        await interaction.reply(buildHelpMenu(interaction.user, interaction.client));
    },

    async prefixExecute(message, _args, client) {
        await message.reply(buildHelpMenu(message.author, client));
    },
};
