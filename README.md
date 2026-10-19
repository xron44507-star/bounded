# 🛡️🎵🎲 Discord Moderation, VC Music & Gambling Bot

A dedicated, feature-packed Discord bot built with **Discord.js v14** and **DisTube** featuring VC audio streaming, casino gambling with interactive buttons, and server moderation tools.

- **Command Prefix:** `.` (dot)
- **Starting Cash:** $1,000 in your vault (saved in `economy.json`)
- **Voice Channel Audio:** YouTube, Spotify, SoundCloud, direct URLs

---

## 🚀 Quick Setup

1. Your bot token is already configured in [`.env`](.env):
   ```env
   DISCORD_TOKEN=your_token_here
   PREFIX=.
   ```
2. Start the bot:
   - Double-click [`start.bat`](start.bat), or
   - In terminal: `npm start`

---

## 🎲 Casino & Gambling Commands (Prefix: `.`)
Every member receives **$1,000 starter cash**. All games are rebalanced for fair, engaging odds with streak mechanics and safety refunds!

| Command | Example | Description & Payouts |
| :--- | :--- | :--- |
| `,balance [@user]` | `,bal` | Check VIP membership card, vault, daily/work timers, and streaks |
| `,daily` | `,daily` | Daily stipend: **+$500 up to +$1,100** with consecutive streaks (+$150/day) |
| `,work` | `,work` | Clock in for a 15m shift (**$120-$700**) with job promotions & VIP guest tips |
| `,coinflip <h\|t> <bet>` | `,cf heads 100` | 50/50 toss with **consecutive win streaks** (2.0x, 2.1x, 2.25x, 2.4x, 2.5x max) |
| `,slots <bet>` | `,slot 50` | Bellagio Vegas reels: 7️⃣7️⃣7️⃣ (15x), 💎💎💎 (10x), 🔔🔔🔔 (6x), pairs (1.5x-2.5x), and **single 🍒 safe refund (1x)** |
| `,blackjack <bet>` | `,bj 200` | VIP table with **5-Card Charlie bonus (2:1)**, **Natural 21 (3:2)**, and dual control (Buttons + typing `hit`/`stand`) |
| `,roulette <choice> <bet>` | `,roulette red 100` | European wheel: Red/Black/Even/Odd/High/Low (2x), Dozens (3x), Green/0 (18x), Exact number (36x) |
| `,dice <bet>` | `,dice 50` | High-stakes 2-dice craps: **Lucky Doubles (2.2x)**, **Natural 7/11 (2.1x)**, standard win (2x), tie push (refund 1x) |
| `,rob <@user>` | `,rob @user` | High-stakes casino heist: steal 20%-45% or get caught and pay fine to victim |
| `,pay <@user> <amount>` | `,pay @user 250` | Transfer money to another player |
| `,leaderboard` | `,lb` | View the server wealth leaderboard |

---

### 🎵 Voice Channel Music Commands (Prefix: `,`)
| Command | Example | Description |
| :--- | :--- | :--- |
| `,play <song/URL>` | `,play shape of you` | Plays or queues track in your voice channel |
| `,skip` | `,skip` | Skips to the next song |
| `,stop` | `,stop` | Stops audio, clears queue, leaves voice channel |
| `,pause` | `,pause` | Pauses playback |
| `,resume` | `,resume` | Resumes paused audio |
| `,queue` | `,queue` | Displays upcoming song queue & durations |
| `,nowplaying` | `,nowplaying` | Displays interactive progress bar & track info |
| `,volume <1-100>` | `,volume 75` | Sets playback volume percentage |
| `,loop [off\|song\|queue]` | `,loop song` | Changes loop / repeat mode |
| `,shuffle` | `,shuffle` | Shuffles the upcoming queue |

*(Aliases: `,p` for play, `,s` for skip, `,dc` for stop, `,unpause` for resume, `,q` for queue, `,np` for nowplaying, `,vol` for volume)*

---

### 🛡️ Moderation Commands (Prefix: `,`)
| Command | Example | Description |
| :--- | :--- | :--- |
| `,kick <@user\|ID> [reason]` | `,kick @user Rule breaking` | Kicks member with DM notification |
| `,ban <@user\|ID> [reason]` | `,ban @user Raiding` | Bans member from server |
| `,hardban <@user\|ID> [reason]` | `,hardban @user Spammer` | Permanent hardban + wipes all messages from past 7 days + **Alt Shield auto-bans any new/alt accounts on join** |
| `,linkalt <hardbannedID> <altID>` | `,linkalt 123456 987654` | Manually bind & permanently blacklist known alt accounts |
| `,unban <userID> [reason]` | `,unban 123456789 Appeal accepted` | Revokes ban by Discord User ID |
| `,timeout <@user\|ID> <time> [reason]` | `,timeout @user 10m Spam` | Mutes/timeouts member (`10m`, `1h`, `1d`) |
| `,untimeout <@user\|ID>` | `,untimeout @user` | Removes active timeout restriction |
| `,purge <1-100>` | `,purge 20` | Bulk deletes messages in text channel |
| `,warn <@user\|ID> [reason]` | `,warn @user Disrespect` | Issues recorded strike with DM notice |
| `,warnings <@user\|ID>` | `,warnings @user` | Views strike history and timestamps |
| `,clearwarns <@user\|ID>` | `,clearwarns @user` | Clears all recorded strikes for member |

---

### 🎫 Interactive Ticket System (Prefix: `,`)
Discord button-driven support ticket channels with automatic permissions and deletion countdowns:

| Command | Example | Description |
| :--- | :--- | :--- |
| `,ticketpanel [channel]` | `,ticketpanel #support` | Sends the interactive **📩 Create Ticket** embed panel with persistent buttons (Admin) |
| `,close [reason]` | `,close Resolved` | Prompts confirmation buttons (`🗑️ Yes, Close & Delete` / `✖️ Cancel`) inside ticket channel |
| `,add <@user\|ID>` | `,add @helper` | Grants a specific user access to view and chat in the private ticket channel |
| `,remove <@user\|ID>` | `,remove @helper` | Revokes a user's access from the ticket channel |

*Features:*
- **1-Click Button Support**: Users click **📩 Create Ticket** on the panel to spawn a private channel.
- **Auto Permissions**: Creates a channel hidden from `@everyone` where only the opener, staff, and bot can chat.
- **Anti-Spam Limiter**: Restricts users to 1 active ticket at a time.
- **One-Click Close Button**: Includes a **🔒 Close Ticket** button inside every ticket channel.

---

### 💬 Utility & Server Features (Prefix: `,`)
| Command | Example | Description |
| :--- | :--- | :--- |
| `,snipe` *(alias: `,s`)* | `,s` | Reveals the most recently deleted message and attachments in the current channel (all deletions also automatically logged to channel `1560394478395854859`) |
| `,afk [reason]` | `,afk eating lunch` | Sets your AFK status with optional reason, adds `[AFK]` tag, alerts anyone who mentions you, and auto-removes upon your return message |
| `,push <githubURL> [msg]` | `,push https://github.com/User/Repo.git` | Pushes bot repository code directly to GitHub (Admin only) |
| `,help` | `,help` | Opens full interactive command and feature manual |

---

### 🚀 Pushing to GitHub
You can push the bot to GitHub in either of two ways:
1. **Via Discord:** Type `,push <your_github_repo_url> [commit message]` in any admin channel.
2. **Via Desktop:** Double-click [`push.bat`](push.bat) and paste your GitHub repository URL.
*(All sensitive tokens and node_modules are automatically ignored by `.gitignore`)*

### 📖 Help
Type **`,help`** or **`,cmds`** in any server text channel to open the complete interactive guide.
