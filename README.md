# Quest Completer V3

<div align="center">

![Quest Completer V3](https://img.shields.io/badge/Quest-Completer%20V3-5865F2?style=for-the-badge&logo=discord)
![Status](https://img.shields.io/badge/Status-Production%20Ready-57F287?style=for-the-badge)
![Platform](https://img.shields.io/badge/Platform-Discord%20Bot-7289DA?style=for-the-badge)

</div>

Quest Completer V3 is the upgraded production-ready evolution of the original quest automation bot. Built to feel premium, reliable, and efficient, this version keeps the original workflow intact while removing the core pain points that made the earlier release feel unstable.

This bot is designed for users who want a cleaner quest experience: faster progress tracking, secure help interactions, more professional command flows, and a more polished overall Discord presence.

## Why This Bot Is Special

Quest Completer V3 is more than a basic automation bot — it is built as a premium quest experience for Discord communities.

### What makes it stand out

- Real-time quest progress intelligence that reduces stale or inconsistent state
- Premium interactive help menu with category navigation and ownership protection
- Secure user-scoped control so interactions stay limited to the correct user
- Stable architecture designed for multi-user and multi-server usage
- Clean configuration flow using environment variables instead of hardcoded secrets
- Production-minded improvements in validation, startup safety, and maintainability

### Core Mission

The mission of Quest Completer V3 is simple: deliver a professional, smooth, and reliable quest-completion experience while preserving the original functionality that users already relied on.

## Why V3?

Version 1 delivered the core idea, but it was still a functional prototype. V3 transforms it into a more reliable, maintainable, and polished Discord bot foundation.

The upgrade focuses on:

- fixing the real-time quest progress problem at its source
- improving stability and consistency across runtime events
- securing interactive help and user-owned controls
- modernizing the configuration and startup flow
- adding validation and regression tests for long-term reliability

Rather than replacing the project with an unrelated system, V3 builds on the existing architecture with targeted improvements to the tracking, UI, validation, and configuration layers.

## V3 Features

### Quest Tracking
- normalized quest progress tracking
- stale-state prevention
- completion and remaining-progress calculation
- progress comparisons that ignore duplicate snapshots

### Interactive Help System
- premium command center layout
- category-based navigation
- secure ownership checks for help interactions
- user-scoped menu controls to prevent hijacking

### Reliability & Security
- environment-backed configuration
- safer startup flow
- validation for user-facing inputs and commands
- consistent handling of interaction ownership and expiry

### Performance & Maintenance
- lighter, more focused architecture
- reduced unnecessary logic duplication
- test coverage for the central progress and help behavior
- cleaner code structure for future V3.x improvements

## UI Showcase

### Quest Progress Example

```text
Quest Progress
━━━━━━━━━━━━━━━━━━
🎯 Quest: Send Messages

Progress:
████████████░░░░  12/20

Remaining: 8
Status: In Progress
```

### Help Menu Example

```text
╭────────────────────────────╮
│      QUEST BOT V3          │
│   Premium Command Center   │
╰────────────────────────────╯

Select a category below:

[ Select Command Category ▼ ]
```

The help menu is designed to be interactive, organized, and scoped to the user who opened it. If another user tries to manipulate it, the bot rejects the interaction politely without breaking the menu.

## Installation & Configuration

### 1. Install dependencies

```bash
npm install
```

### 2. Create a .env file

```env
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_application_id_here
BOT_PREFIX=,,
OWNER_ID=your_user_id
SUPPORT_SERVER_INVITE=https://discord.gg/your-support-server
PREMIUM_ROLE_ID=role-id-one,role-id-two
LOG_LEVEL=INFO
QUEST_POLL_MS=300000
QUEST_MAX_CONCURRENT_CHECKS=4
```

### 3. Start the bot

```bash
npm start
```

### 4. Verify setup

- ensure the bot has the required Developer Portal permissions
- confirm slash commands are registered properly
- check that your token and client ID are valid

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | Yes | Discord bot token used to log in |
| `DISCORD_CLIENT_ID` | Yes | Application Client ID used for command registration |
| `BOT_PREFIX` | No | Prefix used by text commands (default: `,,`) |
| `OWNER_ID` | No | Optional owner user ID for restricted actions |
| `SUPPORT_SERVER_INVITE` | Yes | Invite URL for the support server required before commands can be used |
| `PREMIUM_ROLE_ID` | Yes | Comma-separated Discord role IDs; members with any listed role can use premium commands |
| `LOG_LEVEL` | No | Logging level such as `INFO`, `WARNING`, or `ERROR` |
| `QUEST_POLL_MS` | No | Auto-quest polling interval in milliseconds (default: 300000ms = 5 minutes) |
| `QUEST_MAX_CONCURRENT_CHECKS` | No | Maximum number of concurrent quest checks (not used due to sequential processing) |

## Quest Commands Guide

### `/quest` - Single Quest Completion
Start the interactive quest selector to complete one quest at a time.

**Usage:**
```
/quest
```

**How it works:**
1. Select a quest from the dropdown menu (shows all active quests)
2. The bot enrolls in the quest
3. Real-time progress tracking shows percentage completion
4. Once complete, the quest is marked as done
5. Select another quest or dismiss the menu

**Supported Quest Types:**
- ✅ **Watch Video** - Automatically watches video content (180+ seconds)
- ✅ **Watch Video on Mobile** - Simulates mobile device viewing
- ✅ **Play on Desktop** - Sends heartbeat signals for desktop gameplay
- ✅ **Play on Xbox/PlayStation** - Simulates console gameplay
- ⚠️ **Stream on Desktop** - Not supported (requires manual streaming)
- ⚠️ **Activity Quests** - Not supported (requires Discord client)

**Example:**
```
User: /quest
Bot: Shows quest selection menu with 5-25 active quests
User: Selects "HOPE" quest
Bot: Completes the quest with real-time progress display
```

### `/questall` - Complete All Quests
Automatically complete all available quests at once (Premium feature).

**Requirements:**
- Premium role or bypass access
- Linked Discord token (use `/link` to add)

**Usage:**
```
/questall
```

**How it works:**
1. Fetches all valid quests
2. Creates progress cards for each quest
3. Processes quests **sequentially** to avoid rate limiting
4. Real-time progress updates for each quest
5. Shows final results when all are complete

**Sequential Processing:**
- **Between users:** 3-second delay
- **Between quests:** 2-second delay
- **After enrollment:** 4-second delay
- **After progress update:** 2-second delay

**Example Output:**
```
Quest 1/5: HOPE (180s)
████████████░░░░  45%

Quest 2/5: R6 Siege (57s)
██████████████████  100% ✓

[All quests completed in 8 minutes]
```

### `/autoquest` - Automatic Quest Completion
Enable/disable automatic quest completion as new quests arrive (Premium feature).

**Requirements:**
- Premium role or bypass access
- Linked Discord token (use `/link` to add)

**Usage:**
```
/autoquest enable
/autoquest disable
/autoquest status
```

**How it works:**
1. Polls for new quests every 5 minutes (configurable)
2. Automatically enrolls and completes valid quests
3. Skips expired or already-completed quests
4. Sends DM notifications when quests complete
5. Processes users sequentially to prevent rate limiting

**Auto-Quest Features:**
- ✅ Monitors all quest types automatically
- ✅ Handles rate limiting gracefully with backoff
- ✅ Sends completion notifications via DM
- ✅ Recovers from token expiry (notifies user)
- ✅ Prevents duplicate quest processing
- ✅ Sequential processing (no concurrent races)

**Example:**
```
User: /autoquest enable
Bot: Auto-quest enabled! You'll receive DM notifications.

[5 minutes later...]
Bot: ✓ Quest "Warlock" completed automatically!
Reward: 200 Orbs
```

## Command Comparison

| Feature | `/quest` | `/questall` | `/autoquest` |
|---------|----------|------------|------------|
| Single quest | ✅ | ❌ | ❌ |
| Multiple quests | ❌ | ✅ | ✅ |
| Manual control | ✅ | ✅ | ❌ |
| Automatic mode | ❌ | ❌ | ✅ |
| Requires premium | ❌ | ✅ | ✅ |
| Real-time UI | ✅ | ✅ | DM only |
| Rate limit safe | ✅ | ✅ | ✅ |

## Recent Fixes & Improvements (V3.2+)

### Video Quest Progress Tracking
✅ **Fixed:** Video progress now shows correctly (was stuck at 0%)
- Added 3-second delay after enrollment for Discord registration
- Refreshes after each progress update to validate progress recorded
- Uses enrollment-relative timestamp instead of cumulative time
- Retry logic if Discord hasn't recorded progress yet

### Rate Limiting (429 Errors)
✅ **Fixed:** Eliminated 429 "Too many requests" errors
- Sequential user processing (no concurrent enrollments)
- 3-second delays between different users
- 2-second delays between quests
- 15-second backoff on rate limit errors (up from 10)
- Better retry-after header handling

### Quest Confirmation
✅ **Fixed:** Quests now confirm completion even if not immediately synchronized
- Increased confirmation checks from 3 to 5 attempts
- Longer waits between checks (3 seconds)
- Fallback: if any progress recorded, considers it success
- More detailed logging with `[PROGRESS]` and `[FINAL CHECK]` messages

### Auto-Quest Reliability
✅ **Fixed:** Autoquest no longer causes bot-wide rate limiting
- Fully sequential processing (1 worker instead of parallel)
- 2-second delay between quests per user
- 3-second delay between processing different users
- Prevents thundering herd of concurrent requests

## Troubleshooting

### Quest shows 0% progress but completes
This is expected behavior! Discord sometimes delays progress synchronization. The bot will:
1. Attempt to verify progress 5 times over 15 seconds
2. If any progress is recorded, consider the quest successful
3. Log a warning for visibility

### "Too many requests" (429) error
The fixes ensure this shouldn't happen, but if it does:
- ✅ Auto-retry with exponential backoff (3s, 5s, 10s, 15s)
- ✅ Sequential processing prevents concurrent rate limits
- ✅ Bot waits between users and quests automatically

**If still occurring:**
1. Check if bot has proper permissions
2. Verify token is still valid (`/tokencheck`)
3. Try again after 30 minutes
4. Report to support server if persistent

### Token expired error
The bot detects expired tokens and will:
1. Send notification via DM
2. Auto-disable autoquest
3. Require re-linking with `/link`

**To fix:**
```
/link
[Paste your new token]
/autoquest enable
```

### Quest times out without completing
Possible causes:
- **Discord API issue** - Try again after 5 minutes
- **Task type unsupported** - Check if quest is Stream or Activity type
- **Token expired** - Verify with `/tokencheck`
- **Network issue** - Check your connection

**Resolution:**
1. Run `/tokencheck` to verify token
2. If expired, use `/link` to re-add token
3. Try `/quest` again with a different quest
4. Report to support if problem persists

## Testing & Stability

The V3 release includes regression tests focused on the two most important user-facing areas:

- real-time quest progress behavior
- interactive help menu behavior and ownership protection

These checks help ensure that progress updates remain consistent and that user-scoped menu interactions behave correctly under normal conditions.

The owner can grant permanent premium to every non-bot member of the current server with `/premium alltime` or `;premium all time`. This requires the Server Members Intent to be enabled for the bot in the Discord Developer Portal.

The owner can grant a timed permission for a specific guild with `;guildpass add @user [time]` and remove it with `;guildpass remove @user`. The time can be `1m`, `7 day`, `1 week`, `1 year`, or `permanent`; when omitted, it defaults to `1 month`. This bypasses the support-server requirement only in that guild. Use `;noprefix add @user [time]` or the short alias `;np add @user [time]` to let a user run known bot commands without the configured prefix; use `remove` to revoke it. To enable no-prefix for everyone in the current guild, use `;np add @guild [time]`; remove it with `;np remove @guild`. The older `;guildbypass` name remains available as an alias.

## V1 → V2 → V3 History

### V1
- initial quest automation foundation
- core bot functionality and token management
- basic quest completion flow

### V2
- improvements to quest handling and command structure
- upgraded UI components and bot polish
- expanded automation support and UX improvements

### V3
- stable production-safe foundation
- normalized progress tracking
- secure user-scoped help interactions
- improved configuration and validation
- test coverage for mission-critical behavior

### V3.2+ Updates
- **Fixed video quest progress tracking** (was showing 0%)
- **Eliminated 429 rate limiting errors** through sequential processing
- **Improved quest confirmation** with 5-attempt verification
- **Enhanced autoquest reliability** with per-user delays
- **Better logging** with detailed progress indicators

## V1 → V3 Changelog

- Replaced V1 branding with the new Quest Completer V3 identity.
- Reworked quest progress tracking using a normalized tracker to eliminate stale and inconsistent state.
- Upgraded $help from a static response into a premium interactive menu with category navigation.
- Added user-scoped interaction protection so only the original $help user can control the menu.
- Improved configuration management with environment-backed settings.
- Added regression tests covering real-time quest progress and interactive help functionality.
- Improved bot startup handling and syntax safety for a more stable runtime.
- Preserved the existing quest automation system and command architecture while making controlled V3 improvements.
- **V3.2:** Fixed video progress tracking, rate limiting, and autoquest concurrency issues.

## V3 Foundation Notes

This release establishes a production-safe V3 foundation for the existing project. The upgrade focuses on the actual root cause of the quest-progress issue, reliable real-time UI updates, secure user-scoped interactions, and improved validation.

The existing quest automation and command architecture remain intact. Rather than unnecessarily rewriting the entire system, V3 introduces targeted improvements to the tracking, UI, validation, configuration, and testing layers to improve stability, security, performance, and maintainability.

## Roadmap

Planned V3.x improvements include:

- richer quest detail views and selection states
- stronger multi-server quest state handling
- deeper logging and diagnostics for production debugging
- automated failure recovery for rate limits and API issues
- continued UX refinements for premium command flows
- additional validation and stability improvements across the bot lifecycle
- improved video progress detection using multiple validation methods
- better error recovery and retry strategies

## Support

- **Support Server:** [discord.gg/xJx6vCmHkN](https://discord.gg/xJx6vCmHkN)
- **Developer:** Shivay 乂 Development | Discord: vaadiyanl_
- **Issues:** Report bugs in the support server or create an issue on GitHub
