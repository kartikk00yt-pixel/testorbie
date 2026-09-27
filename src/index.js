import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
import { readdirSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import deployCommands from './utils/deployCommands.js';
import { makeTokenStore } from './commands/questCommands.js';
import { SUPPORT_SERVER_INVITE } from './utils/config.js';
import { writeFileSync, existsSync } from 'fs';
import { performanceOptimizer } from './utils/performanceOptimizer.js';
import { getAllEmojis } from './handlers/emoji.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const col = {
    reset:  '\x1b[0m', bright: '\x1b[1m', cyan: '\x1b[96m',
    blue:   '\x1b[34m', white: '\x1b[97m', purple: '\x1b[35m',
    green:  '\x1b[92m', dim:   '\x1b[90m', red: '\x1b[91m', yellow: '\x1b[93m',
};

function banner() {
    const lines = [
        '',
        `${col.cyan}${col.bright}   ██████╗  ██████╗██╗   ██╗ ██╗${col.reset}`,
        `${col.cyan}${col.bright}  ██╔═══██╗██╔════╝██║   ██║███║${col.reset}`,
        `${col.blue}${col.bright}  ██║   ██║██║     ██║   ██║╚██║${col.reset}`,
        `${col.blue}${col.bright}  ██║▄▄ ██║██║     ╚██╗ ██╔╝ ██║${col.reset}`,
        `${col.white}${col.bright}  ╚██████╔╝╚██████╗ ╚████╔╝  ██║${col.reset}`,
        `${col.white}${col.bright}   ╚══▀▀═╝  ╚═════╝  ╚═══╝   ╚═╝${col.reset}`,
        '',
        `${col.dim}  ─────────────────────────────────────────────────${col.reset}`,
        `  ${col.green}●${col.reset} ${col.white}Quest Completer V3${col.reset}  ${col.dim}|${col.reset}   ${col.white}${SUPPORT_SERVER_INVITE}${col.reset}`,
        `${col.dim}  ─────────────────────────────────────────────────${col.reset}`,
        '',
    ];
    for (const line of lines) process.stdout.write(line + '\n');
}

const TOKEN = (process.env.DISCORD_TOKEN || process.env.BOT_TOKEN || '').trim();
if (!TOKEN) { console.error('DISCORD_TOKEN or BOT_TOKEN is not set.'); process.exit(1); }

// Ensure data files exist (synchronous is OK for startup)
if (!existsSync('tokens.json'))       writeFileSync('tokens.json', '{}');
if (!existsSync('autoquest.json'))    writeFileSync('autoquest.json', '[]');
if (!existsSync('tokenLedger.json'))  writeFileSync('tokenLedger.json', '{}');
if (!existsSync('tokenAccounts.json')) writeFileSync('tokenAccounts.json', '{}');
if (!existsSync('channelSettings.json')) writeFileSync('channelSettings.json', '{}');
if (!existsSync('access.json')) writeFileSync('access.json', '{}');
if (!existsSync('bypass.json')) writeFileSync('bypass.json', '{}');
if (!existsSync('guildBypass.json')) writeFileSync('guildBypass.json', '{}');
if (!existsSync('guildPremium.json')) writeFileSync('guildPremium.json', '{}');
if (!existsSync('noPrefix.json')) writeFileSync('noPrefix.json', '{}');
if (!existsSync('trialClaims.json')) writeFileSync('trialClaims.json', '{}');
if (!existsSync('questUsage.json')) writeFileSync('questUsage.json', '{}');
if (!existsSync('nameStyles.json')) writeFileSync('nameStyles.json', '{}');

banner();
console.log(`${col.cyan}Initializing Discord Bot...${col.reset}`);

// Pre-cache emoji data on startup for faster getEmoji() calls
const emojisForCache = getAllEmojis();
performanceOptimizer.setCache('emojis_data', emojisForCache, 60 * 1000);
console.log(`${col.green}✓ Emoji cache initialized${col.reset}`);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Message, Partials.Channel],
});

client.commands       = new Collection();
client.prefixCommands = new Collection();
client.tokenStore     = makeTokenStore(TOKEN);

const commandFiles = readdirSync(join(__dirname, 'commands')).filter(f => f.endsWith('.js'));
let commandCount = 0;
for (const file of commandFiles) {
    try {
        const mod = await import(pathToFileURL(join(__dirname, 'commands', file)).href);
        // Single default export
        if (mod.default) {
            const cmd = mod.default;
            if (cmd?.data)   { client.commands.set(cmd.data.name, cmd); commandCount++; }
            if (cmd?.prefix) { client.prefixCommands.set(cmd.prefix, cmd); commandCount++; }
        }
        // Named exports (questCommands.js has multiple)
        for (const [key, cmd] of Object.entries(mod)) {
            if (key === 'default' || key === 'makeTokenStore' || key === 'handleLinkModal' || key === 'handleLinkPromptButton' || key === 'runAutoquestForUser') continue;
            if (cmd?.data)   { client.commands.set(cmd.data.name, cmd); commandCount++; }
            if (cmd?.prefix) { client.prefixCommands.set(cmd.prefix, cmd); commandCount++; }
        }
    } catch (err) {
        console.error(`${col.red}✗ Failed to load command ${file}:${col.reset}`, err?.message ?? err);
    }
}
console.log(`${col.green}✓ Loaded ${commandCount} commands${col.reset}`);

const eventFiles = readdirSync(join(__dirname, 'events')).filter(f => f.endsWith('.js'));
let eventCount = 0;
for (const file of eventFiles) {
    try {
        const mod   = await import(pathToFileURL(join(__dirname, 'events', file)).href);
        const event = mod.default;
        if (!event?.name || !event?.execute) {
            console.warn(`${col.yellow}⚠ Event ${file} missing name or execute${col.reset}`);
            continue;
        }
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, client));
        } else {
            client.on(event.name, (...args) => event.execute(...args, client));
        }
        eventCount++;
    } catch (err) {
        console.error(`${col.red}✗ Failed to load event ${file}:${col.reset}`, err?.message ?? err);
    }
}
console.log(`${col.green}✓ Loaded ${eventCount} events${col.reset}`);

try {
    await client.login(TOKEN);
} catch (error) {
    console.error('Discord login failed:', error?.message ?? error);
    process.exitCode = 1;
}

if (client.user) {
    try {
        const commandsDeployed = await deployCommands(TOKEN, process.env.DISCORD_CLIENT_ID);
        console.log(commandsDeployed
            ? `${col.green}✓ Commands deployed${col.reset}`
            : `${col.yellow}⚠ Slash commands were not deployed${col.reset}`);
    } catch (err) {
        console.error(`${col.red}✗ Failed to deploy commands:${col.reset}`, err?.message ?? err);
    }
}
