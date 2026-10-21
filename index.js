require('dotenv').config();
const crypto = require('crypto');
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    PermissionsBitField,
    ActivityType,
    Events,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    ChannelType,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} = require('discord.js');
const { DisTube } = require('distube');
const { SpotifyPlugin } = require('@distube/spotify');
const { SoundCloudPlugin } = require('@distube/soundcloud');
const { DirectLinkPlugin } = require('@distube/direct-link');
const { RobustYtDlpPlugin } = require('./ytdlp-plugin');
const ffmpegStatic = require('ffmpeg-static');
const eco = require('./economy');
const afk = require('./afk');
const altshield = require('./altshield');
const tickets = require('./tickets');

// Configuration
const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = '.';

if (!TOKEN || TOKEN === 'YOUR_BOT_TOKEN_HERE') {
    console.error('\x1b[31m[ERROR] No valid DISCORD_TOKEN found in .env!\x1b[0m');
    console.log('Please open .env and set your bot token:');
    console.log('DISCORD_TOKEN=your_token_here');
    process.exit(1);
}

// Color Theme (Moody Dark / Gothic Aesthetic)
const COLORS = {
    PRIMARY: 0x18191C,   // Deep sleek charcoal black
    SUCCESS: 0x2A3B32,   // Muted dark forest emerald
    WARNING: 0x4A3E20,   // Muted dark amber
    DANGER: 0x4D1A1E,    // Deep muted blood-ruby
    MUSIC: 0x2C2640,     // Deep muted midnight amethyst
    GOLD: 0x362F1E,      // Deep muted dark brass / bronze
    CASINO: 0x2E2A20,    // Muted deep casino dark gold
    DARK: 0x0F1012,      // True pitch obsidian dark
    EMERALD: 0x1E3326,   // Darkened muted pine
    RUBY: 0x451619       // Darkened gothic noir crimson
};

// Cryptographically secure uniform random integer in [min, max] inclusive
function secureRandomInt(min, max) {
    return crypto.randomInt(min, max + 1);
}

// Provably Fair ticket hash generator
function generateFairTicket() {
    return crypto.randomBytes(3).toString('hex').toUpperCase();
}

const DICE_ART = {
    1: '⚀',
    2: '⚁',
    3: '⚂',
    4: '⚃',
    5: '⚄',
    6: '⚅'
};

function getTier(balance, debt = 0) {
    if (debt > 0) return '⚠️ Delinquent Debtor';
    if (balance >= 250000) return '👑 Royal High Roller';
    if (balance >= 50000) return '💎 Platinum Whale';
    if (balance >= 15000) return '🥇 Gold VIP';
    if (balance >= 5000) return '🥈 Silver Gambler';
    return '🥉 Bronze Rookie';
}

// Global active blackjack sessions tracking for seamless text & button control
const activeBlackjackGames = new Map();

// Channel recent deleted messages cache for ,snipe command
const snipes = new Map();

// Discord Client Setup with aggressive memory caching & high-speed packet handling
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    rest: {
        timeout: 15000,
        retries: 3
    },
    sweepers: {
        messages: {
            interval: 300,
            lifetime: 600
        }
    }
});

// Guard against disconnects, network timeouts, and unhandled errors
client.on('error', err => {
    console.error('\x1b[33m[DISCORD CLIENT ERROR]\x1b[0m', err.message || err);
});

process.on('unhandledRejection', reason => {
    console.error('\x1b[33m[UNHANDLED REJECTION]\x1b[0m', reason);
});

process.on('uncaughtException', err => {
    console.error('\x1b[31m[UNCAUGHT EXCEPTION]\x1b[0m', err);
});

function getFfmpegPath() {
    if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
    const fs = require('fs');
    if (fs.existsSync('/usr/bin/ffmpeg')) return '/usr/bin/ffmpeg';
    if (fs.existsSync('/root/.nix-profile/bin/ffmpeg')) return '/root/.nix-profile/bin/ffmpeg';
    if (fs.existsSync('/nix/var/nix/profiles/default/bin/ffmpeg')) return '/nix/var/nix/profiles/default/bin/ffmpeg';
    try {
        if (ffmpegStatic && fs.existsSync(ffmpegStatic)) return ffmpegStatic;
    } catch (_) {}
    return 'ffmpeg';
}

// DisTube VC Music Player Setup
const distube = new DisTube(client, {
    ffmpeg: { path: getFfmpegPath() },
    plugins: [
        new SpotifyPlugin(),
        new SoundCloudPlugin(),
        new DirectLinkPlugin(),
        new RobustYtDlpPlugin()
    ],
    emitNewSongOnly: false,
    emitAddSongWhenCreatingQueue: false
});

// High-speed response helper (non-blocking mentions check, fast direct channel dispatch)
function fastReply(message, data) {
    if (typeof data === 'string') {
        data = { content: data };
    }
    data.allowedMentions = { repliedUser: false };
    return message.channel.send(data).catch(() => message.reply(data).catch(() => null));
}

// Generic Embed Helper
function makeEmbed(title, description, color = COLORS.PRIMARY, emoji = '') {
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(emoji ? `${emoji} ${title}` : title)
        .setDescription(description)
        .setTimestamp();
}

// ----------------- LUXURY CASINO EMBEDS -----------------

function casinoBalanceEmbed(user, ecoData, rank) {
    const now = Date.now();
    const dailyCooldown = 24 * 60 * 60 * 1000;
    const workCooldown = 15 * 60 * 1000;

    const dailyReady = (now - (ecoData.lastDaily || 0)) >= dailyCooldown;
    const workReady = (now - (ecoData.lastWork || 0)) >= workCooldown;

    const dailyStreak = ecoData.dailyStreak || 0;
    const dailyStatus = dailyReady 
        ? `🟢 \`Ready!\` *(Streak: ${dailyStreak}d • +$${500 + Math.min(4, dailyStreak) * 150})*` 
        : `⏳ \`${Math.ceil((dailyCooldown - (now - ecoData.lastDaily)) / (60 * 60 * 1000))}h remaining\``;

    const workShifts = ecoData.workCount || 0;
    let workTitle = 'Intern';
    if (workShifts >= 31) workTitle = '👑 VIP Pit Boss';
    else if (workShifts >= 16) workTitle = '🥇 Senior Dealer';
    else if (workShifts >= 6) workTitle = '🥈 Floor Host';
    else workTitle = '🥉 Lounge Apprentice';

    const workStatus = workReady 
        ? `🟢 \`Ready for shift!\` *(${workTitle})*` 
        : `⏳ \`${Math.ceil((workCooldown - (now - ecoData.lastWork)) / (60 * 1000))}m remaining\``;

    const tier = getTier(ecoData.balance, ecoData.debt || 0);
    const cfStreak = ecoData.cfStreak || 0;
    const streakDisplay = cfStreak > 0 ? `🔥 \`${cfStreak}-Win Streak\` *(+${Math.min(50, cfStreak * 10)}% Coinflip Boost)*` : '⚪ `No active streak`';

    const fields = [
        { name: '🎁 Daily Bonus (+$500 - $1,100)', value: `${dailyStatus}\n*(Type \`${PREFIX}daily\`)*`, inline: true },
        { name: '💼 Career Shift ($120 - $700)', value: `${workStatus}\n*(Type \`${PREFIX}work\`)*`, inline: true },
        { name: '🪙 Coinflip Streak', value: streakDisplay, inline: false },
        { name: '🎮 Casino Games', value: `\`${PREFIX}bj\` • \`${PREFIX}slot\` • \`${PREFIX}cf\` • \`${PREFIX}roulette\` • \`${PREFIX}dice\``, inline: false }
    ];

    if (ecoData.loan) {
        const dueTimestamp = Math.floor(ecoData.loan.dueAt / 1000);
        fields.push({
            name: '🏛️ Active Server Loan',
            value: `• **Principal Borrowed:** \`${eco.formatMoney(ecoData.loan.principal)}\`\n• **Amount Owed:** \`${eco.formatMoney(ecoData.loan.owed)}\`\n• **Due Date:** <t:${dueTimestamp}:R> *(Repay with \`${PREFIX}payloan\`)*`,
            inline: false
        });
    } else if (ecoData.debt > 0) {
        fields.push({
            name: '🚨 Delinquent Server Debt',
            value: `• **Delinquent Debt:** \`${eco.formatMoney(ecoData.debt)}\` *(Account In Default)*\n• *Repay with \`${PREFIX}payloan\` to clear debt!*`,
            inline: false
        });
    }

    return new EmbedBuilder()
        .setColor(ecoData.debt > 0 ? COLORS.DANGER : COLORS.GOLD)
        .setAuthor({ name: `${user.username.toUpperCase()}'S VIP MEMBERSHIP CARD 💳`, iconURL: user.displayAvatarURL() })
        .setDescription(
            `\`\`\`ansi\n` +
            `\u001b[1;33m┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\u001b[0m\n` +
            `\u001b[1;37m   CASINO VAULT: \u001b[1;32m${eco.formatMoney(ecoData.balance).padEnd(23)}\u001b[0m\n` +
            `\u001b[1;37m   RANK: \u001b[1;36m#${rank.toString().padEnd(10)}\u001b[1;37m TIER: \u001b[1;35m${tier.padEnd(16)}\u001b[0m\n` +
            `\u001b[1;33m┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\u001b[0m\n` +
            `\`\`\``
        )
        .addFields(fields)
        .setFooter({ text: 'The Grand Casino • Fair Odds & Server Treasury Loans' })
        .setTimestamp();
}

function casinoSlotsEmbed(username, avatarUrl, r1, r2, r3, outcome, bet, newBal) {
    const won = outcome.multiplier > 0;
    const color = outcome.multiplier >= 4 ? COLORS.GOLD : won ? COLORS.EMERALD : COLORS.RUBY;
    const winnings = Math.floor(bet * outcome.multiplier);

    return new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: `${username}'s Bellagio Slots 🎰`, iconURL: avatarUrl })
        .setDescription(
            `\`\`\`\n` +
            `╔══════════════════════════════════╗\n` +
            `║      ★ BELLAGIO CASINO ★         ║\n` +
            `╠══════════════════════════════════╣\n` +
            `║      [  ${r1}  │  ${r2}  │  ${r3}  ]       ║ ◀ PAYLINE\n` +
            `╠══════════════════════════════════╣\n` +
            `║    ${outcome.banner.padEnd(28)}  ║\n` +
            `╚══════════════════════════════════╝\n` +
            `\`\`\`\n` +
            (outcome.multiplier > 1
                ? `🏆 **Outcome:** ${outcome.desc}!\n✨ **Payout:** \`+${eco.formatMoney(winnings)}\` (\`${outcome.multiplier}x\` return)`
                : outcome.multiplier === 1
                    ? `🛡️ **Outcome:** ${outcome.desc}!\n🤝 **Consolation Refund:** Wager \`${eco.formatMoney(bet)}\` safely returned!`
                    : `💀 **Outcome:** No winning payline hit.\nLost **-${eco.formatMoney(bet)}**`) +
            `\n💵 **Current Vault:** \`${eco.formatMoney(newBal)}\``
        )
        .setFooter({ text: 'Fair Payline: 7️⃣7️⃣7️⃣ (35x) • 💎💎💎 (20x) • 🔔🔔🔔 (12x) • Pairs (1.5x-3x) • 🍒 Refund (1x) • Fruit Salad (1.2x)' })
        .setTimestamp();
}

function formatBlackjackCards(cards, inProgress = false) {
    if (inProgress) {
        return `\`[ 🂡 ${cards[0].val} ${cards[0].suit} ]\`  \`[ 🂠 ? ? ]\``;
    }
    return cards.map(c => `\`[ 🂡 ${c.val} ${c.suit} ]\``).join('  ');
}

function casinoBlackjackEmbed(username, avatarUrl, playerCards, dealerCards, playerTotal, dealerTotal, bet, inProgress, statusMessage) {
    const dealerDisplay = formatBlackjackCards(dealerCards, inProgress);
    const playerDisplay = formatBlackjackCards(playerCards, false);

    const dealerScore = inProgress
        ? (dealerCards[0].val === 'A' ? '11 or 1' : ['K', 'Q', 'J'].includes(dealerCards[0].val) ? '10' : dealerCards[0].val)
        : dealerTotal;

    let color = COLORS.DARK;
    let title = '🃏 VIP HIGH-ROLLER BLACKJACK';
    if (!inProgress) {
        if (statusMessage.includes('NATURAL 21')) { color = COLORS.GOLD; title = '👑 NATURAL 21! BLACKJACK'; }
        else if (statusMessage.includes('5-CARD CHARLIE')) { color = COLORS.GOLD; title = '🌟 5-CARD CHARLIE VICTORY!'; }
        else if (statusMessage.includes('WIN') || statusMessage.includes('DEALER BUSTED') || statusMessage.includes('YOU WIN')) { color = COLORS.EMERALD; title = '🎉 PLAYER VICTORY!'; }
        else if (statusMessage.includes('PUSH')) { color = COLORS.GOLD; title = '🤝 PUSH (TIE HAND)'; }
        else { color = COLORS.RUBY; title = '💀 DEALER WINS'; }
    }

    return new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: `${username.toUpperCase()}'S BLACKJACK TABLE`, iconURL: avatarUrl })
        .setTitle(title)
        .setDescription(
            `\`\`\`ansi\n` +
            `\u001b[1;30m╭────────────────────────────────────────╮\u001b[0m\n` +
            `\u001b[1;37m  🤵 DEALER'S HAND   \u001b[1;33m[ Value: ${dealerScore} ]\u001b[0m\n` +
            `\u001b[1;30m╰────────────────────────────────────────╯\u001b[0m\n` +
            `\`\`\`\n` +
            `${dealerDisplay}\n\n` +
            `\`\`\`ansi\n` +
            `\u001b[1;30m╭────────────────────────────────────────╮\u001b[0m\n` +
            `\u001b[1;37m  👤 YOUR HAND       \u001b[1;32m[ Total: ${playerTotal} ]\u001b[0m\n` +
            `\u001b[1;30m╰────────────────────────────────────────╯\u001b[0m\n` +
            `\`\`\`\n` +
            `${playerDisplay}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `💰 **Active Wager:** \`${eco.formatMoney(bet)}\`\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            (inProgress
                ? `⚡ **Options:** Click **Hit 🟢**, **Stand 🛑**, or **Double Down ⚡** below, or type \`hit\` / \`stand\` in chat!`
                : statusMessage)
        )
        .setFooter({ text: inProgress ? 'Action Timer: 60s • 6-Deck Shuffled Shoe • Natural 21 pays 3:2 • 5-Card Charlie pays 2:1!' : 'Hand Finalized • 6-Deck Shuffled Shoe' })
        .setTimestamp();
}

function casinoCoinflipEmbed(username, avatarUrl, choice, isHeads, won, bet, streak, profit, newBal, ticketId = null) {
    const resultSide = isHeads ? 'HEADS' : 'TAILS';
    const color = won ? COLORS.EMERALD : COLORS.RUBY;
    const coinArt = isHeads
        ? `    .--------.   \n   /  HEADS   \\  \n  |     🪙     | \n   \\          /  \n    '--------'   `
        : `    .--------.   \n   /  TAILS   \\  \n  |     🪙     | \n   \\          /  \n    '--------'   `;

    const streakNotice = won
        ? (streak > 1 ? `\n🔥 **Streak Multiplier:** \`${streak}-Win Streak!\` (+${Math.min(50, (streak - 1) * 10 + 10)}% bonus profit)` : '')
        : (streak > 0 ? `\n⚠️ **Streak Broken:** Reset from ${streak} wins to 0.` : '');

    return new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: `${username}'s Double-or-Nothing 🪙`, iconURL: avatarUrl })
        .setTitle(won ? (streak >= 3 ? `🔥 HOT STREAK (${streak} WINS)!` : '🎉 VICTORY! DOUBLE OR NOTHING') : '💀 DEFEAT! BETTER LUCK NEXT FLIP')
        .setDescription(
            `\`\`\`\n${coinArt}\n\`\`\`\n` +
            `╭─────────────────────────────────╮\n` +
            `│  🪙 **Landed On:** \`${resultSide}\`\n` +
            `│  🎯 **Your Pick:** \`${choice.toUpperCase()}\`\n` +
            `│  💵 **Wager:**     \`${eco.formatMoney(bet)}\`\n` +
            `╰─────────────────────────────────╯\n\n` +
            (won ? `✨ **Profit Won:** \`+${eco.formatMoney(profit)}\` *(Total Return: ${eco.formatMoney(bet + profit)})*` : `💀 **Deducted:** \`-${eco.formatMoney(bet)}\``) +
            `${streakNotice}\n` +
            `💵 **New Vault Balance:** \`${eco.formatMoney(newBal)}\``
        )
        .setFooter({ text: `Provably Fair CSPRNG (Roll #${ticketId || 'VERIFIED'}) • Consecutive wins earn up to +50% streak bonuses!` })
        .setTimestamp();
}

function casinoRouletteEmbed(username, avatarUrl, choice, roll, rollColor, won, bet, multiplier, newBal, isLaPartage = false) {
    const color = won ? COLORS.EMERALD : isLaPartage ? COLORS.GOLD : COLORS.RUBY;
    const winnings = bet * multiplier;

    let outcomeText = '';
    if (won) {
        outcomeText = `✨ **Winnings:** \`+${eco.formatMoney(winnings)}\` (\`${multiplier}x\` payout)`;
    } else if (isLaPartage) {
        outcomeText = `🛡️ **European "La Partage" Rule:** Pocket \`[ 0 ]\` triggered!\nHalf your wager (\`${eco.formatMoney(Math.floor(bet * 0.5))}\`) was safely refunded to your vault.`;
    } else {
        outcomeText = `💀 **Lost:** \`-${eco.formatMoney(bet)}\``;
    }

    return new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: `${username}'s European Roulette 🎡`, iconURL: avatarUrl })
        .setTitle(won ? `🎉 BALL LANDED: WINNER (${multiplier}x)!` : isLaPartage ? '🛡️ ZERO LANDED: LA PARTAGE REFUND' : '💀 BALL LANDED: HOUSE TAKES WAGER')
        .setDescription(
            `╭─────────────────────────────────╮\n` +
            `│  🎡 **Winning Pocket:** ${rollColor} \`[ ${roll} ]\`\n` +
            `│  🎯 **Your Call:**     \`${choice.toUpperCase()}\`\n` +
            `│  💵 **Wager Placed:**  \`${eco.formatMoney(bet)}\`\n` +
            `╰─────────────────────────────────╯\n\n` +
            outcomeText +
            `\n💵 **New Balance:** \`${eco.formatMoney(newBal)}\``
        )
        .setFooter({ text: 'Fair European Wheel: Red/Black/Even/Odd/High/Low (2x) • Dozens (3x) • Green/0 (36x) • La Partage on 0' })
        .setTimestamp();
}

function casinoDiceEmbed(username, avatarUrl, pDice, dDice, pTotal, dTotal, resultType, multiplier, bet, newBal) {
    const tied = resultType === 'tie';
    const won = resultType !== 'loss' && !tied;
    const color = tied ? COLORS.GOLD : (resultType === 'doubles' || resultType === 'natural') ? COLORS.GOLD : won ? COLORS.EMERALD : COLORS.RUBY;

    const pArt = `${DICE_ART[pDice[0]] || '🎲'} ${DICE_ART[pDice[1]] || '🎲'}`;
    const dArt = `${DICE_ART[dDice[0]] || '🎲'} ${DICE_ART[dDice[1]] || '🎲'}`;

    let title = '💀 DEALER ROLLED HIGHER: HOUSE WINS!';
    let outcomeText = `💀 **Lost:** \`-${eco.formatMoney(bet)}\``;

    if (tied) {
        title = '🤝 IT\'S A PUSH (TIED TOTAL)!';
        outcomeText = `🤝 **Tied roll!** Both scored \`${pTotal}\`. Your wager of \`${eco.formatMoney(bet)}\` has been refunded.`;
    } else if (resultType === 'doubles') {
        title = '🎲 LUCKY DOUBLES! BONUS WINNER (2.5x)!';
        const profit = Math.floor(bet * 1.5);
        outcomeText = `🌟 **Pair of ${pDice[0]}'s!** High-roller doubles bonus awarded!\n✨ **Profit:** \`+${eco.formatMoney(profit)}\` *(2.5x return: ${eco.formatMoney(bet + profit)})*`;
    } else if (resultType === 'natural') {
        title = `🎲 CRAPS LUCKY ${pTotal}! BONUS WINNER (2.2x)!`;
        const profit = Math.floor(bet * 1.2);
        outcomeText = `🔥 **Natural ${pTotal}!** Lucky craps strike awarded!\n✨ **Profit:** \`+${eco.formatMoney(profit)}\` *(2.2x return: ${eco.formatMoney(bet + profit)})*`;
    } else if (won) {
        title = '🎉 YOU ROLLED HIGHER: VICTORY (2x)!';
        outcomeText = `✨ **Won:** \`+${eco.formatMoney(bet)}\` *(2x return: ${eco.formatMoney(bet * 2)})*`;
    }

    return new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: `${username}'s High-Stakes Craps Dice 🎲`, iconURL: avatarUrl })
        .setTitle(title)
        .setDescription(
            `\`\`\`ansi\n` +
            `\u001b[1;30m╭────────────────────────────────────────╮\u001b[0m\n` +
            `\u001b[1;37m  👤 YOUR ROLL:   \u001b[1;32m${pArt}  [ Total: ${pTotal.toString().padStart(2, ' ')} ]\u001b[0m\n` +
            `\u001b[1;37m  🤵 DEALER ROLL: \u001b[1;33m${dArt}  [ Total: ${dTotal.toString().padStart(2, ' ')} ]\u001b[0m\n` +
            `\u001b[1;30m╰────────────────────────────────────────╯\u001b[0m\n` +
            `\`\`\`\n` +
            `💰 **Wager Placed:** \`${eco.formatMoney(bet)}\`\n` +
            `${outcomeText}\n\n` +
            `💵 **Current Vault:** \`${eco.formatMoney(newBal)}\``
        )
        .setFooter({ text: 'High-Stakes 2-Dice Duel • Doubles pay 2.5x • Natural 7/11 pays 2.2x • Push refunds 100% • CSPRNG Fair' })
        .setTimestamp();
}

function parseDuration(str) {
    if (!str) return null;
    const match = str.match(/^(\d+)([smhd]?)$/i);
    if (!match) return null;
    const val = parseInt(match[1], 10);
    const unit = match[2]?.toLowerCase();
    if (unit === 's') return val * 1000;
    if (unit === 'h') return val * 60 * 60 * 1000;
    if (unit === 'd') return val * 24 * 60 * 60 * 1000;
    return val * 60 * 1000;
}

// Fast Member Resolver: Checks memory cache immediately before falling back to network fetch
async function resolveMember(message, arg) {
    if (!arg) return null;
    if (message.mentions.members && message.mentions.members.first()) {
        return message.mentions.members.first();
    }
    const cleanId = arg.replace(/[<@!>]/g, '');
    if (/^\d{17,20}$/.test(cleanId)) {
        return message.guild.members.cache.get(cleanId) || await message.guild.members.fetch(cleanId).catch(() => null);
    }
    // Name/Tag matching from in-memory cache
    const lower = arg.toLowerCase();
    const found = message.guild.members.cache.find(m => m.user.username.toLowerCase() === lower || m.displayName.toLowerCase() === lower);
    if (found) return found;

    return null;
}

// DisTube Event Handlers
distube
    .on('playSong', (queue, song) => {
        const embed = new EmbedBuilder()
            .setColor(COLORS.MUSIC)
            .setAuthor({ name: 'NOW PLAYING 🎵' })
            .setTitle(song.name || 'Unknown Track')
            .setURL(song.url)
            .setThumbnail(song.thumbnail)
            .addFields(
                { name: '⏱️ Duration', value: `\`${song.formattedDuration}\``, inline: true },
                { name: '👤 Requested By', value: `<@${song.user.id}>`, inline: true },
                { name: '🔊 Volume', value: `\`${queue.volume}%\``, inline: true }
            )
            .setFooter({ text: `Queue: ${queue.songs.length} song(s) | Prefix: ${PREFIX}` })
            .setTimestamp();
        queue.textChannel?.send({ embeds: [embed] }).catch(() => {});
    })
    .on('addSong', (queue, song) => {
        const embed = new EmbedBuilder()
            .setColor(COLORS.SUCCESS)
            .setAuthor({ name: 'ADDED TO QUEUE 📥' })
            .setTitle(song.name || 'Unknown Track')
            .setURL(song.url)
            .addFields(
                { name: '⏱️ Duration', value: `\`${song.formattedDuration}\``, inline: true },
                { name: '🔢 Position', value: `#${queue.songs.length}`, inline: true }
            )
            .setTimestamp();
        queue.textChannel?.send({ embeds: [embed] }).catch(() => {});
    })
    .on('addList', (queue, playlist) => {
        const embed = new EmbedBuilder()
            .setColor(COLORS.SUCCESS)
            .setAuthor({ name: 'PLAYLIST QUEUED 📑' })
            .setTitle(playlist.name || 'Unknown Playlist')
            .setURL(playlist.url || null)
            .setDescription(`Enqueued **${playlist.songs.length}** tracks into the playlist queue.`)
            .setTimestamp();
        queue.textChannel?.send({ embeds: [embed] }).catch(() => {});
    })
    .on('error', (channel, error) => {
        console.error('[DISTUBE ERROR]', error);
        channel?.send({
            embeds: [makeEmbed('Playback Error ⚠️', `\`${error.message || error}\``, COLORS.DANGER, '❌')]
        }).catch(() => {});
    })
    .on('finish', queue => {
        queue.textChannel?.send({
            embeds: [makeEmbed('Queue Finished ⏹️', 'All queued songs have finished playing.', COLORS.PRIMARY)]
        }).catch(() => {});
    })
    .on('empty', queue => {
        queue.textChannel?.send({
            embeds: [makeEmbed('Channel Empty 💨', 'Voice channel is empty. Leaving voice channel.', COLORS.WARNING)]
        }).catch(() => {});
    });

// Ready Event
client.once(Events.ClientReady, c => {
    console.log(`\x1b[32m[READY] Logged in as ${c.user.tag}\x1b[0m`);
    console.log(`[INFO] Bot prefix is: "${PREFIX}"`);
    console.log(`[INFO] Connected to ${c.guilds.cache.size} server(s).`);

    // Activity Status
    c.user.setPresence({
        activities: [{ name: 'tickets 📩 | .help', type: ActivityType.Watching }],
        status: 'online'
    });
});

// Alt Shield: Auto-detect and ban alts / fresh accounts of hardbanned users on join
client.on(Events.GuildMemberAdd, async member => {
    try {
        if (member.user.bot) return;
        const altCheck = altshield.checkMemberIsAlt(member);
        if (altCheck.isAlt) {
            const banReason = `[ALT SHIELD AUTO-BAN] ${altCheck.reason}`;

            try {
                await member.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLORS.RUBY)
                            .setTitle('🚫 Alt Shield Interception & Ban')
                            .setDescription(`You have been automatically banned from **${member.guild.name}** as a detected alt of a hardbanned user.\n\n**Reason:** ${altCheck.reason}`)
                            .setTimestamp()
                    ]
                });
            } catch (_) {}

            await member.guild.bans.create(member.id, {
                deleteMessageSeconds: 604800,
                reason: banReason
            });

            const alertChannel = member.guild.systemChannel || member.guild.channels.cache.find(c => c.isTextBased() && c.permissionsFor(member.guild.members.me).has(PermissionsBitField.Flags.SendMessages));
            if (alertChannel) {
                alertChannel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLORS.RUBY)
                            .setAuthor({ name: 'ALT SHIELD TRIGGERED • AUTO-BAN EXECUTED 🛡️' })
                            .setTitle('🚫 Suspected Alt / Fresh Account Banned on Join')
                            .setDescription(
                                `\`\`\`ansi\n` +
                                `\u001b[1;31m╔════════════════════════════════════════╗\u001b[0m\n` +
                                `\u001b[1;31m║         ALT SHIELD INTERCEPTION        ║\u001b[0m\n` +
                                `\u001b[1;31m╚════════════════════════════════════════╝\u001b[0m\n` +
                                `\`\`\`\n` +
                                `👤 **Banned Alt:** <@${member.id}> \`(${member.user.tag})\`\n` +
                                `🎯 **Hardbanned User:** **${altCheck.original.username}** \`(${altCheck.original.id})\`\n` +
                                `🔍 **Detection Match:** \`${altCheck.matchType}\`\n` +
                                `🛡️ **Confidence:** \`${altCheck.confidence}\`\n` +
                                `📝 **Details:** ${altCheck.reason}`
                            )
                            .setFooter({ text: 'Alt Shield Watchdog Active' })
                            .setTimestamp()
                    ]
                }).catch(() => {});
            }
        }
    } catch (err) {
        console.error('[ALT SHIELD ERROR]', err);
    }
});

// Cache recently deleted messages for ,snipe and forward to audit log channel
const SNIPE_LOG_CHANNEL_ID = '1561898213890465954';

client.on(Events.MessageDelete, async message => {
    try {
        if (!message || !message.channel || message.author?.bot) return;

        const deletedData = {
            content: message.content || null,
            author: message.author || null,
            image: message.attachments.first() ? message.attachments.first().proxyURL || message.attachments.first().url : null,
            attachmentsCount: message.attachments.size,
            channelName: message.channel.name,
            channelId: message.channel.id,
            timestamp: Date.now()
        };

        snipes.set(message.channel.id, deletedData);

        // Forward deletion audit log to designated channel
        if (message.guild) {
            const logChannel = message.guild.channels.cache.get(SNIPE_LOG_CHANNEL_ID) 
                || await client.channels.fetch(SNIPE_LOG_CHANNEL_ID).catch(() => null);

            if (logChannel && logChannel.isTextBased()) {
                const logEmbed = new EmbedBuilder()
                    .setColor(COLORS.RUBY)
                    .setAuthor({
                        name: message.author ? `${message.author.tag || message.author.username} (Deleted Message)` : 'Unknown Author',
                        iconURL: message.author ? message.author.displayAvatarURL() : null
                    })
                    .setDescription(
                        `🗑️ **Message deleted in <#${message.channel.id}>**\n\n` +
                        (message.content ? message.content : '*[No text content (attachment or embed only)]*')
                    )
                    .addFields(
                        { name: '👤 Author', value: `<@${message.author.id}> \`(${message.author.id})\``, inline: true },
                        { name: '📍 Channel', value: `<#${message.channel.id}> \`(#${message.channel.name})\``, inline: true }
                    )
                    .setFooter({ text: `Message ID: ${message.id || 'N/A'} • Logged automatically` })
                    .setTimestamp();

                if (deletedData.image) {
                    logEmbed.setImage(deletedData.image);
                }

                logChannel.send({ embeds: [logEmbed] }).catch(() => {});
            }
        }
    } catch (_) {}
});

// ----------------- HELP EMBED GENERATOR HELPER -----------------
function getHelpCategoryEmbed(category, avatarUrl) {
    if (category === 'casino') {
        return new EmbedBuilder()
            .setColor(COLORS.GOLD)
            .setAuthor({ name: '/bounded • Casino & Gambling Suite 🎲', iconURL: avatarUrl })
            .setTitle('🎰 High-Roller Casino & Economy')
            .setDescription(
                `Every player starts with **$1,000** in their vault. All games feature balanced odds, payout multipliers, and protection refunds!\n\n` +
                `**Core Vault & Jobs**\n` +
                `• \`${PREFIX}bal [@user]\` — View membership card, net worth, work/daily cooldowns\n` +
                `• \`${PREFIX}daily\` — Claim daily check ($500 base + streak bonus up to $1,100)\n` +
                `• \`${PREFIX}work\` — Clock in for a 15-minute shift ($120–$700) with promotions & tips\n` +
                `• \`${PREFIX}pay <@user> <amount>\` — Wire cash from your vault to another user\n` +
                `• \`${PREFIX}rob <@user>\` — Heist 20%–45% of someone's cash (or get caught and fined)\n` +
                `• \`${PREFIX}lb\` — Server wealth hall of fame\n\n` +
                `**Server Funds & Loans**\n` +
                `• \`${PREFIX}serverfunds\` — View central community bank reserves & debt statistics\n` +
                `• \`${PREFIX}loan <amount>\` — Borrow money from server funds (repay in 24h or get seized)\n` +
                `• \`${PREFIX}payloan [amount]\` — Repay active loan (+5% interest) or delinquent debt\n` +
                `• \`${PREFIX}depositfunds <amount>\` — Donate / invest your cash into server treasury\n\n` +
                `**High-Stakes Games**\n` +
                `• \`${PREFIX}bj <bet>\` — VIP Blackjack (6-Deck Shoe, 🟢🛑⚡, Natural 21 pays 3:2, 5-Card Charlie 2:1)\n` +
                `• \`${PREFIX}slot <bet>\` — Bellagio 3-Reel Slots (777 35x, Diamonds 20x, Bells 12x, Cherry 1x safe refund)\n` +
                `• \`${PREFIX}cf <h|t> <bet>\` — 50/50 Coinflip (CSPRNG Fair, win streaks up to 2.5x payout)\n` +
                `• \`${PREFIX}dice <bet>\` — 2-Dice Craps (Doubles 2.5x, Natural 7/11 2.2x, Push refund 100%)\n` +
                `• \`${PREFIX}roul <choice> <bet>\` — European Roulette (2x colors/parity, 3x dozens, 36x green/number, La Partage)`
            )
            .setFooter({ text: `Page: Casino & Economy • Prefix: ${PREFIX}` })
            .setTimestamp();
    }

    if (category === 'music') {
        return new EmbedBuilder()
            .setColor(COLORS.MUSIC)
            .setAuthor({ name: '/bounded • Voice Channel Audio 🎵', iconURL: avatarUrl })
            .setTitle('🎶 VC Music Streaming')
            .setDescription(
                `High-fidelity audio streaming directly into voice channels from YouTube, Spotify, SoundCloud, or direct URLs.\n\n` +
                `**Playback Controls**\n` +
                `• \`${PREFIX}play <query/URL>\` *(alias: \`${PREFIX}p\`)* — Search and stream audio\n` +
                `• \`${PREFIX}skip\` *(alias: \`${PREFIX}next\`)* — Skip currently playing track\n` +
                `• \`${PREFIX}stop\` *(alias: \`${PREFIX}dc\`, \`${PREFIX}leave\`)* — Stop audio, wipe queue, and leave VC\n` +
                `• \`${PREFIX}pause\` — Pause playback without losing queue\n` +
                `• \`${PREFIX}resume\` *(alias: \`${PREFIX}unpause\`)* — Resume paused music\n\n` +
                `**Queue & Configuration**\n` +
                `• \`${PREFIX}queue\` *(alias: \`${PREFIX}q\`)* — View upcoming songs list and durations\n` +
                `• \`${PREFIX}nowplaying\` *(alias: \`${PREFIX}np\`)* — Track progress bar and requester info\n` +
                `• \`${PREFIX}volume <1-100>\` *(alias: \`${PREFIX}vol\`)* — Adjust volume percentage\n` +
                `• \`${PREFIX}loop [off|song|queue]\` — Toggle repeat mode\n` +
                `• \`${PREFIX}shuffle\` — Randomize upcoming queue order`
            )
            .setFooter({ text: `Page: Voice Music • Prefix: ${PREFIX}` })
            .setTimestamp();
    }

    if (category === 'mod') {
        return new EmbedBuilder()
            .setColor(COLORS.RUBY)
            .setAuthor({ name: '/bounded • Moderation & Security 🛡️', iconURL: avatarUrl })
            .setTitle('⚔️ Server Moderation Suite')
            .setDescription(
                `Powerful staff enforcement utilities featuring automated strike tracking and Alt Shield account interception.\n\n` +
                `**Disciplinary Actions**\n` +
                `• \`${PREFIX}warn <@user|ID> [reason]\` — Issue a recorded strike with automated DM notice\n` +
                `• \`${PREFIX}warnings <@user|ID>\` — View member's complete strike history and timestamps\n` +
                `• \`${PREFIX}clearwarns <@user|ID>\` — Wipe strikes for a user\n` +
                `• \`${PREFIX}timeout <@user|ID> <time> [reason]\` — Timeout/mute member (\`10m\`, \`1h\`, \`1d\`)\n` +
                `• \`${PREFIX}untimeout <@user|ID>\` — Remove timeout restriction immediately\n` +
                `• \`${PREFIX}purge <1-100>\` — Bulk delete messages in channel\n` +
                `• \`${PREFIX}kick <@user|ID> [reason]\` — Kick member with DM reason notice\n` +
                `• \`${PREFIX}ban <@user|ID> [reason]\` — Ban member from server\n` +
                `• \`${PREFIX}unban <userID> [reason]\` — Revoke ban by user ID\n\n` +
                `**Alt Shield (Automated Anti-Raid)**\n` +
                `• \`${PREFIX}hardban <@user|ID> [reason]\` — Permanent hardban + auto-bans all alts & fresh accounts\n` +
                `• \`${PREFIX}linkalt <hardbannedID> <altID>\` — Permanently bind known alt accounts to watch-list`
            )
            .setFooter({ text: `Page: Moderation Suite • Prefix: ${PREFIX}` })
            .setTimestamp();
    }

    if (category === 'tickets') {
        const appsStatus = tickets.areAppsOpen() ? '🟢 OPEN' : '🔴 CLOSED';
        return new EmbedBuilder()
            .setColor(COLORS.PRIMARY)
            .setAuthor({ name: '/bounded • Support & Applications 🎫', iconURL: avatarUrl })
            .setTitle('📩 Interactive Support & Staff Applications')
            .setDescription(
                `Button-driven private support channels and staff applications under dedicated server categories.\n\n` +
                `**Commands & Setup**\n` +
                `• \`${PREFIX}ticketpanel [channel]\` *(alias: \`${PREFIX}ticketsetup\`)* — Deploy interactive **Support & Staff Application** portal (Admin)\n` +
                `• \`${PREFIX}openapps\` — Enable staff applications button for members (Admin)\n` +
                `• \`${PREFIX}closeapps\` — Disable staff applications button (Admin)\n` +
                `• \`${PREFIX}close [reason]\` — Close ticket & trigger confirmation buttons with 5s countdown\n` +
                `• \`${PREFIX}add <@user|ID>\` — Grant a user access to the active ticket channel\n` +
                `• \`${PREFIX}remove <@user|ID>\` — Revoke a user's access from the ticket channel\n\n` +
                `**Current Status**\n` +
                `• Staff Applications: **${appsStatus}**\n` +
                `• Support Category: \`1550661181138669653\`\n` +
                `• Staff Apps Category: \`1550381632396197908\``
            )
            .setFooter({ text: `Page: Tickets & Apps • Prefix: ${PREFIX}` })
            .setTimestamp();
    }

    if (category === 'utility') {
        return new EmbedBuilder()
            .setColor(COLORS.EMERALD)
            .setAuthor({ name: '/bounded • Utility & Server Tools 💬', iconURL: avatarUrl })
            .setTitle('⚡ Server Utilities')
            .setDescription(
                `Everyday tools, status management, and automated channel features.\n\n` +
                `**Commands**\n` +
                `• \`${PREFIX}snipe\` *(alias: \`${PREFIX}s\`)* — Reveal recently deleted message/photo in channel\n` +
                `• \`${PREFIX}afk [reason]\` — Set AFK status; notifies anyone who tags you & auto-removes on return\n` +
                `• \`${PREFIX}help\` *(alias: \`${PREFIX}cmds\`)* — Open interactive help menu\n` +
                `• \`${PREFIX}push <github_repo_url> [msg]\` — Push bot codebase to GitHub repo (Admin)\n\n` +
                `**Automated Channel Features**\n` +
                `• **Media-Only Auto-Mod:** Enforces image/video-only channels with instant text wipe & 2s warning\n` +
                `• **Audit Logging:** Automatically archives deleted messages with attachments in log channel`
            )
            .setFooter({ text: `Page: Utilities • Prefix: ${PREFIX}` })
            .setTimestamp();
    }

    // Default Overview Page
    return new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setAuthor({ name: '/bounded • Command Manual', iconURL: avatarUrl })
        .setTitle('✨ /bounded Dashboard')
        .setDescription(
            `Welcome to **/bounded**! Use the **dropdown menu** or **buttons** below to browse commands by category.\n\n` +
            `**Command Prefix:** \`${PREFIX}\` *(dot)*\n\n` +
            `📂 **Available Categories:**\n` +
            `• 🎲 **Casino & Economy** — VIP Blackjack, Slots, Coinflip, Craps, Roulette, Rob, Bal\n` +
            `• 🎵 **Voice Music** — YT/Spotify/SoundCloud streaming, Queue, Volume, Controls\n` +
            `• 🛡️ **Moderation Suite** — Warns, Timeouts, Purge, Bans, Hardban & Alt Shield\n` +
            `• 🎫 **Ticket System** — 1-Click button support channels with auto-permissions\n` +
            `• 💬 **Utility & Server** — Snipe (\`.s\`), AFK tracking, media-only channels`
        )
        .addFields(
            { name: '⚡ Quick Shortcuts', value: `\`${PREFIX}help casino\` • \`${PREFIX}help music\` • \`${PREFIX}help mod\` • \`${PREFIX}help tickets\` • \`${PREFIX}help utility\``, inline: false }
        )
        .setFooter({ text: 'Select a category below or click buttons to navigate' })
        .setTimestamp();
}

function getHelpActionRows(currentCategory = 'overview') {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('help_category_select')
        .setPlaceholder('📂 Select a command category...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Dashboard Overview')
                .setValue('overview')
                .setDescription('View the main dashboard and bot features')
                .setEmoji('✨')
                .setDefault(currentCategory === 'overview'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Casino & Gambling')
                .setValue('casino')
                .setDescription('Blackjack, slots, coinflip, roulette, craps, rob & vault')
                .setEmoji('🎲')
                .setDefault(currentCategory === 'casino'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Voice Music')
                .setValue('music')
                .setDescription('Play, skip, stop, queue, volume, pause & loop')
                .setEmoji('🎵')
                .setDefault(currentCategory === 'music'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Moderation Suite')
                .setValue('mod')
                .setDescription('Warn, timeout, purge, ban, hardban & Alt Shield')
                .setEmoji('🛡️')
                .setDefault(currentCategory === 'mod'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Ticket System')
                .setValue('tickets')
                .setDescription('Interactive button panels and ticket channel controls')
                .setEmoji('🎫')
                .setDefault(currentCategory === 'tickets'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Utility & Tools')
                .setValue('utility')
                .setDescription('Snipe (.s), AFK tracking, and channel auto-mod')
                .setEmoji('💬')
                .setDefault(currentCategory === 'utility')
        );

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('help_btn_overview')
            .setLabel('Overview')
            .setEmoji('🏠')
            .setStyle(currentCategory === 'overview' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('help_btn_casino')
            .setLabel('Casino')
            .setEmoji('🎲')
            .setStyle(currentCategory === 'casino' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('help_btn_music')
            .setLabel('Music')
            .setEmoji('🎵')
            .setStyle(currentCategory === 'music' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('help_btn_mod')
            .setLabel('Mod')
            .setEmoji('🛡️')
            .setStyle(currentCategory === 'mod' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('help_btn_tickets')
            .setLabel('Tickets')
            .setEmoji('🎫')
            .setStyle(currentCategory === 'tickets' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );

    return [
        new ActionRowBuilder().addComponents(selectMenu),
        buttons
    ];
}

// ----------------- INTERACTIVE TICKET & HELP LISTENER -----------------
client.on(Events.InteractionCreate, async interaction => {
    try {
        // Handle Help Menu Select Menu & Button Navigation
        if (interaction.isStringSelectMenu() && interaction.customId === 'help_category_select') {
            const selected = interaction.values[0] || 'overview';
            const embed = getHelpCategoryEmbed(selected, client.user.displayAvatarURL());
            const rows = getHelpActionRows(selected);
            return interaction.update({ embeds: [embed], components: rows });
        }

        if (interaction.isButton() && interaction.customId.startsWith('help_btn_')) {
            const selected = interaction.customId.replace('help_btn_', '');
            const embed = getHelpCategoryEmbed(selected, client.user.displayAvatarURL());
            const rows = getHelpActionRows(selected);
            return interaction.update({ embeds: [embed], components: rows });
        }

        if (!interaction.isButton()) return;
        const customId = interaction.customId;
        if (!customId.startsWith('ticket_')) return;

        const { guild, member, channel, user } = interaction;
        if (!guild) return;

        // 1. OPEN TICKET BUTTON (SUPPORT & STAFF APPS)
        if (customId === 'ticket_create' || customId === 'ticket_create_app') {
            const isStaffApp = customId === 'ticket_create_app';
            const ticketType = isStaffApp ? 'app' : 'support';

            // Check if staff applications are currently enabled
            if (isStaffApp && !tickets.areAppsOpen()) {
                return interaction.reply({
                    content: '🔒 Staff applications are currently closed. Please check back later when an announcement is made!',
                    ephemeral: true
                });
            }

            // Check if user already has an open ticket of this type
            const existing = tickets.getUserActiveTicket(user.id, ticketType);
            if (existing) {
                const existingChannel = guild.channels.cache.get(existing.channelId);
                if (existingChannel) {
                    return interaction.reply({
                        content: `⚠️ You already have an open ${isStaffApp ? 'staff application' : 'support ticket'}: <#${existing.channelId}>. Please resolve or close it first!`,
                        ephemeral: true
                    });
                } else {
                    // Stale channel that was manually deleted from Discord, clean it up
                    tickets.deleteTicket(existing.channelId);
                }
            }

            await interaction.deferReply({ ephemeral: true });

            // Create private text channel for ticket
            const sanitizedName = user.username.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 15) || 'user';
            const channelName = isStaffApp ? `app-${sanitizedName}` : `ticket-${sanitizedName}`;

            // Destination categories: Staff App: 1550381632396197908 | Support: 1550661181138669653
            const targetCategoryId = isStaffApp ? '1550381632396197908' : '1550661181138669653';
            const targetCategory = guild.channels.cache.get(targetCategoryId) || await guild.channels.fetch(targetCategoryId).catch(() => null);
            const parentCategory = targetCategory?.id || channel?.parentId || null;

            const ticketChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: parentCategory,
                permissionOverwrites: [
                    {
                        id: guild.id, // @everyone
                        deny: [PermissionsBitField.Flags.ViewChannel]
                    },
                    {
                        id: user.id, // Ticket Creator
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory,
                            PermissionsBitField.Flags.AttachFiles,
                            PermissionsBitField.Flags.EmbedLinks
                        ]
                    },
                    {
                        id: client.user.id, // Bot itself
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ManageChannels,
                            PermissionsBitField.Flags.ReadMessageHistory,
                            PermissionsBitField.Flags.EmbedLinks,
                            PermissionsBitField.Flags.AttachFiles
                        ]
                    }
                ]
            });

            // Store in ticket database
            const ticketNumber = tickets.createTicket(ticketChannel.id, user.id, ticketType);

            // Welcome embed & buttons inside new channel
            const welcomeEmbed = new EmbedBuilder()
                .setColor(isStaffApp ? COLORS.CASINO : COLORS.PRIMARY)
                .setAuthor({ name: `/bounded ${isStaffApp ? 'Staff Application' : 'Support Ticket'} #${ticketNumber}`, iconURL: client.user.displayAvatarURL() })
                .setTitle(isStaffApp ? `📝 Staff Application #${ticketNumber}` : `🎫 Support Ticket #${ticketNumber}`)
                .setDescription(
                    `Welcome <@${user.id}>!\n\n` +
                    (isStaffApp 
                        ? `Thank you for applying to the **/bounded** staff team!\n\n` +
                          `📋 **Application Instructions:**\n` +
                          `Please state your **age**, **timezone**, previous **moderation experience**, why you want to join, and what you can bring to the community.\n\n` +
                          `Staff will review your application shortly.`
                        : `Thank you for contacting support. Please describe your inquiry, question, or issue in detail below. Staff will be with you shortly.`) +
                    `\n\n🛠️ **Commands Available in this Ticket:**\n` +
                    `• \`${PREFIX}close [reason]\` — Close this ticket\n` +
                    `• \`${PREFIX}add <@user>\` — Add a user to this ticket\n` +
                    `• \`${PREFIX}remove <@user>\` — Remove a user from this ticket`
                )
                .setFooter({ text: `/bounded Ticket System • Click buttons below to manage` })
                .setTimestamp();

            const actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_close')
                    .setLabel('Close Ticket')
                    .setEmoji('🔒')
                    .setStyle(ButtonStyle.Danger)
            );

            await ticketChannel.send({
                content: `<@${user.id}> Welcome! ${isStaffApp ? 'Please fill out your staff application details above.' : 'Staff will assist you shortly.'}`,
                embeds: [welcomeEmbed],
                components: [actionRow]
            });

            return interaction.editReply({
                content: `✅ Your ${isStaffApp ? 'staff application' : 'ticket'} has been created: <#${ticketChannel.id}>`
            });
        }

        // 2. CLOSE TICKET REQUEST BUTTON
        if (customId === 'ticket_close') {
            const ticketInfo = tickets.getTicket(channel.id);
            if (!ticketInfo) {
                return interaction.reply({
                    content: '⚠️ This channel is not recognized as an active ticket.',
                    ephemeral: true
                });
            }

            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_confirm_close')
                    .setLabel('Yes, Close & Delete')
                    .setEmoji('🗑️')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('ticket_cancel_close')
                    .setLabel('Cancel')
                    .setEmoji('✖️')
                    .setStyle(ButtonStyle.Secondary)
            );

            const confirmEmbed = new EmbedBuilder()
                .setColor(COLORS.WARNING)
                .setTitle('🔒 Close Ticket Confirmation')
                .setDescription(`Are you sure you want to close and delete this ticket channel?`)
                .setFooter({ text: `Requested by ${user.tag}` });

            return interaction.reply({
                embeds: [confirmEmbed],
                components: [confirmRow]
            });
        }

        // 3. CANCEL CLOSE BUTTON
        if (customId === 'ticket_cancel_close') {
            await interaction.message.delete().catch(() => {});
            return interaction.reply({
                content: '✅ Ticket closure cancelled.',
                ephemeral: true
            });
        }

        // 4. CONFIRM CLOSE & DELETE BUTTON
        if (customId === 'ticket_confirm_close') {
            tickets.closeTicket(channel.id);
            tickets.deleteTicket(channel.id);

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(COLORS.DANGER)
                        .setTitle('🗑️ Ticket Closing')
                        .setDescription(`Ticket closed by <@${user.id}>.\nThis channel will be deleted in **5 seconds**...`)
                ]
            });

            setTimeout(() => {
                channel.delete(`Ticket closed by ${user.tag}`).catch(err => {
                    console.error('[TICKETS] Channel delete error:', err);
                });
            }, 5000);
        }
    } catch (btnErr) {
        console.error('[TICKET BUTTON ERROR]', btnErr);
        if (!interaction.replied && !interaction.deferred) {
            interaction.reply({ content: '⚠️ An error occurred while processing this ticket action.', ephemeral: true }).catch(() => {});
        }
    }
});

// Fast Message Command Handler
client.on(Events.MessageCreate, async message => {
    try {
        if (message.author.bot || !message.guild) return;

        const userId = message.author.id;
        const raw = message.content.trim().toLowerCase();

        // ----------------- MEDIA-ONLY CHANNELS ENFORCEMENT -----------------
        const MEDIA_ONLY_CHANNELS = new Set([
            '1557200905198112878',
            '1550381629992865888' // Selfies channel
        ]);

        if (MEDIA_ONLY_CHANNELS.has(message.channel.id)) {
            const hasAttachment = message.attachments.size > 0;
            const hasMediaLink = /(https?:\/\/[^\s]+?\.(?:png|jpe?g|gif|webp|mp4|mov|webm))/i.test(message.content);

            if (!hasAttachment && !hasMediaLink) {
                message.delete().catch(() => {});
                message.channel.send({
                    content: `⚠️ <@${userId}>, this channel is **Images / Media Only**! Text-only messages are not allowed here.`
                }).then(m => setTimeout(() => m.delete().catch(() => {}), 2000)).catch(() => {});
                return;
            }
        }

        // ----------------- AFK RETURN CHECK -----------------
        const userAfk = afk.getAfk(userId);
        if (userAfk && (Date.now() - userAfk.timestamp > 3000) && !raw.startsWith(`${PREFIX}afk`)) {
            afk.removeAfk(userId);
            const durationStr = afk.formatDuration(Date.now() - userAfk.timestamp);
            if (message.member && message.guild.members.me?.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
                if (message.member.manageable && message.member.displayName.startsWith('[AFK] ')) {
                    message.member.setNickname(userAfk.originalNick || null).catch(() => {});
                }
            }
            fastReply(message, {
                embeds: [
                    new EmbedBuilder()
                        .setColor(COLORS.SUCCESS)
                        .setDescription(`👋 Welcome back <@${userId}>! I have removed your AFK status.\n⏱️ You were away for: **${durationStr}**`)
                ]
            }).then(m => setTimeout(() => m?.delete().catch(() => {}), 8000));
        }

        // ----------------- AFK MENTIONS CHECK -----------------
        if (message.mentions.users.size > 0) {
            message.mentions.users.forEach(mentionedUser => {
                if (mentionedUser.bot || mentionedUser.id === userId) return;
                const targetAfk = afk.getAfk(mentionedUser.id);
                if (targetAfk) {
                    const durationStr = afk.formatDuration(Date.now() - targetAfk.timestamp);
                    fastReply(message, {
                        embeds: [
                            new EmbedBuilder()
                                .setColor(COLORS.WARNING)
                                .setDescription(`💤 **${mentionedUser.username}** is currently AFK: **${targetAfk.reason}**\n*(Away for ${durationStr})*`)
                        ]
                    }).then(m => setTimeout(() => m?.delete().catch(() => {}), 10000));
                }
            });
        }

        // Check if user has an active Blackjack game and typed an action (with or without prefix)
        if (activeBlackjackGames.has(userId)) {
            const game = activeBlackjackGames.get(userId);
            if (game.channelId === message.channel.id) {
                const isHit = raw === 'hit' || raw === 'h' || raw === `${PREFIX}hit`;
                const isStand = raw === 'stand' || raw === 's' || raw === `${PREFIX}stand`;
                const isDouble = raw === 'double' || raw === 'd' || raw === 'dd' || raw === `${PREFIX}double`;

                if (isHit) {
                    await game.hit();
                    return;
                } else if (isStand) {
                    await game.stand();
                    return;
                } else if (isDouble) {
                    await game.double();
                    return;
                }
            }
        }

        if (!message.content.startsWith(PREFIX)) return;

        const args = message.content.slice(PREFIX.length).trim().split(/ +/g);
        const cmd = args.shift()?.toLowerCase();
        if (!cmd) return;

        const voiceChannel = message.member?.voice?.channel;

        // Auto-audit check for expired server loans (seize funds if defaulted)
        const loanAudit = eco.checkUserLoanStatus(userId);
        if (loanAudit.defaulted) {
            if (loanAudit.resolved) {
                fastReply(message, {
                    embeds: [makeEmbed(
                        'Loan Defaulted & Settled ⚠️',
                        `Your 24-hour server loan expired! The community treasury automatically seized **${eco.formatMoney(loanAudit.seized)}** from your vault to settle the debt in full.\n💵 **Remaining Vault:** \`${eco.formatMoney(loanAudit.remainingBal)}\``,
                        COLORS.WARNING,
                        '🏛️'
                    )]
                }).catch(() => {});
            } else {
                fastReply(message, {
                    embeds: [makeEmbed(
                        'ASSETS SEIZED & ACCOUNT IN DEBT 🚨',
                        `Your 24-hour server loan expired without repayment!\nThe server treasury has **seized all ${eco.formatMoney(loanAudit.seized)}** from your vault into Server Funds.\n\n⚠️ **Unpaid Balance (Delinquent Debt):** \`${eco.formatMoney(loanAudit.debt)}\`\nUse \`${PREFIX}payloan\` once you earn money to clear your debt!`,
                        COLORS.DANGER,
                        '🚨'
                    )]
                }).catch(() => {});
            }
        }

        // ----------------- HELP COMMAND -----------------
        if (cmd === 'help' || cmd === 'cmds' || cmd === 'commands' || cmd === 'h') {
            const subArg = args[0]?.toLowerCase();
            let initialCategory = 'overview';
            if (['casino', 'gamble', 'eco', 'economy'].includes(subArg)) initialCategory = 'casino';
            else if (['music', 'song', 'audio', 'vc'].includes(subArg)) initialCategory = 'music';
            else if (['mod', 'moderation', 'admin'].includes(subArg)) initialCategory = 'mod';
            else if (['ticket', 'tickets', 'support'].includes(subArg)) initialCategory = 'tickets';
            else if (['util', 'utility', 'tools'].includes(subArg)) initialCategory = 'utility';

            const embed = getHelpCategoryEmbed(initialCategory, client.user.displayAvatarURL());
            const rows = getHelpActionRows(initialCategory);

            return fastReply(message, {
                embeds: [embed],
                components: rows
            });
        }

        // ----------------- UTILITY & AFK COMMANDS -----------------
        if (cmd === 'snipe' || cmd === 's' || cmd === 'snoop') {
            // If user typed ,s while a music queue is active in their voice channel, let skip take precedence only if requested
            const isSkipIntent = cmd === 's' && distube.getQueue(message) && message.member?.voice?.channel;
            if (!isSkipIntent) {
                const sniped = snipes.get(message.channel.id);
                if (!sniped) {
                    return fastReply(message, {
                        embeds: [makeEmbed('No Deleted Messages 🎯', 'There are no recently deleted messages recorded in this channel.', COLORS.WARNING)]
                    });
                }

                const timeAgoSec = Math.floor((Date.now() - sniped.timestamp) / 1000);
                const timeAgoText = timeAgoSec < 60 ? `${timeAgoSec}s ago` : `${Math.floor(timeAgoSec / 60)}m ago`;

                const embed = new EmbedBuilder()
                    .setColor(COLORS.PRIMARY)
                    .setAuthor({
                        name: sniped.author ? `${sniped.author.tag || sniped.author.username}` : 'Unknown Author',
                        iconURL: sniped.author ? sniped.author.displayAvatarURL?.() : null
                    })
                    .setDescription(sniped.content || '*[No text content (attachment or embed only)]*')
                    .setFooter({ text: `Deleted ${timeAgoText} in #${message.channel.name}` })
                    .setTimestamp(sniped.timestamp);

                if (sniped.image) {
                    embed.setImage(sniped.image);
                }

                return fastReply(message, { embeds: [embed] });
            }
        }

        if (cmd === 'afk') {
            const reason = args.join(' ') || 'AFK';
            const oldNick = message.member?.displayName || message.author.username;
            afk.setAfk(userId, reason, oldNick);

            if (message.member && message.guild.members.me?.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
                if (message.member.manageable && !message.member.displayName.startsWith('[AFK] ')) {
                    message.member.setNickname(`[AFK] ${message.member.displayName}`.slice(0, 32)).catch(() => {});
                }
            }

            const embed = new EmbedBuilder()
                .setColor(COLORS.PRIMARY)
                .setAuthor({ name: `${message.author.username} is now AFK`, iconURL: message.author.displayAvatarURL() })
                .setDescription(`💤 I have set your status to **AFK**.\n📝 **Reason:** ${reason}\n\n*Send a message anytime to automatically remove your AFK status.*`)
                .setFooter({ text: 'Status automatically clears on your next message' })
                .setTimestamp();

            return fastReply(message, { embeds: [embed] });
        }

        if (cmd === 'push' || cmd === 'gitpush') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return fastReply(message, { embeds: [makeEmbed('Permission Denied ⛔', 'Only server administrators can use the GitHub push command.', COLORS.DANGER)] });
            }

            const { exec } = require('child_process');
            const isForce = args.includes('--force') || args.includes('-f');
            const cleanArgs = args.filter(a => a !== '--force' && a !== '-f');

            if (cleanArgs[0] && (cleanArgs[0].includes('github.com') || cleanArgs[0].endsWith('.git'))) {
                repoUrl = cleanArgs[0];
                if (cleanArgs.slice(1).length > 0) commitMsg = cleanArgs.slice(1).join(' ');
            } else if (cleanArgs.length > 0) {
                commitMsg = cleanArgs.join(' ');
            }

            const statusMsg = await fastReply(message, {
                embeds: [makeEmbed('Pushing to GitHub 🚀', isForce ? 'Force-pushing codebase to GitHub...' : 'Staging files, committing, and pushing to remote repository...', COLORS.PRIMARY)]
            });

            const cleanMsg = commitMsg.replace(/["\\]/g, '');
            const forceFlag = isForce ? ' --force' : '';
            let cmdStr = `git add . && (git commit -m "${cleanMsg}" 2>nul || ver >nul)`;
            if (repoUrl) {
                cmdStr += ` && git branch -M main && (git remote remove origin 2>nul || ver >nul) && git remote add origin ${repoUrl} && git push -u origin main${forceFlag}`;
            } else {
                cmdStr += ` && git push${forceFlag}`;
            }

            exec(cmdStr, { cwd: __dirname }, (err, stdout, stderr) => {
                if (err) {
                    const outputText = stderr || err.message || stdout;
                    const errorDesc = outputText.slice(0, 1200);
                    const isRejected = outputText.includes('fetch first') || outputText.includes('rejected');
                    const hint = isRejected
                        ? `💡 **Notice:** The GitHub repository already contains files (e.g., initial README/License).\nTo overwrite it with your bot, run:\n\`${PREFIX}push ${repoUrl || ''} --force\``
                        : `**Usage:** \`${PREFIX}push [repo_url] [--force]\``;

                    const embed = new EmbedBuilder()
                        .setColor(COLORS.DANGER)
                        .setTitle('Push to GitHub Failed ❌')
                        .setDescription(`\`\`\`\n${errorDesc}\n\`\`\`\n${hint}`)
                        .setTimestamp();
                    return statusMsg ? statusMsg.edit({ embeds: [embed] }).catch(() => {}) : fastReply(message, { embeds: [embed] });
                }

                const embed = new EmbedBuilder()
                    .setColor(COLORS.SUCCESS)
                    .setAuthor({ name: 'GITHUB REPOSITORY PUSHED 🚀' })
                    .setTitle('Successfully Pushed to GitHub')
                    .setDescription(
                        `**Commit Message:** \`${commitMsg}\`\n` +
                        (repoUrl ? `**Remote Repository:** ${repoUrl}\n\n` : '\n') +
                        `\`\`\`\n${(stdout || 'Files staged & pushed to origin/main').slice(0, 800)}\n\`\`\``
                    )
                    .setFooter({ text: 'All sensitive files (.env, token) were securely excluded' })
                    .setTimestamp();

                return statusMsg ? statusMsg.edit({ embeds: [embed] }).catch(() => {}) : fastReply(message, { embeds: [embed] });
            });
            return;
        }

        // ----------------- CASINO & GAMBLING COMMANDS -----------------
        if (cmd === 'serverfunds' || cmd === 'funds' || cmd === 'treasury' || cmd === 'bank') {
            const stats = eco.getServerStats();
            const embed = new EmbedBuilder()
                .setColor(COLORS.GOLD)
                .setAuthor({ name: `${message.guild?.name || '/bounded'} Community Treasury 🏛️`, iconURL: message.guild?.iconURL() || client.user.displayAvatarURL() })
                .setTitle('🏛️ CENTRAL SERVER FUNDS & BANK')
                .setDescription(
                    `\`\`\`ansi\n` +
                    `\u001b[1;33m┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\u001b[0m\n` +
                    `\u001b[1;37m   SERVER TREASURY: \u001b[1;32m${eco.formatMoney(stats.serverFunds).padEnd(20)}\u001b[0m\n` +
                    `\u001b[1;37m   ACTIVE OUT LOANS:\u001b[1;36m${eco.formatMoney(stats.totalLoanAmount).padEnd(20)}\u001b[0m\n` +
                    `\u001b[1;37m   DELINQUENT DEBT: \u001b[1;31m${eco.formatMoney(stats.totalDelinquentDebt).padEnd(20)}\u001b[0m\n` +
                    `\u001b[1;33m┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\u001b[0m\n` +
                    `\`\`\`\n` +
                    `📊 **Treasury Health & Activity**\n` +
                    `• **Liquid Reserves:** \`${eco.formatMoney(stats.serverFunds)}\` *(Available for loans)*\n` +
                    `• **Borrowers on Loan:** \`${stats.totalActiveLoans}\` members currently borrowing\n` +
                    `• **Total Loans Issued:** \`${stats.totalLoansIssued}\`\n` +
                    `• **Total Seized / Recovered:** \`${eco.formatMoney(stats.totalFundsSeized)}\`\n\n` +
                    `💼 **Loan & Treasury Operations**\n` +
                    `• \`${PREFIX}loan <amount>\` — Borrow cash from server funds to gamble or trade\n` +
                    `• \`${PREFIX}payloan [amount]\` — Repay active loan (+5% interest) or delinquent debt\n` +
                    `• \`${PREFIX}depositfunds <amount>\` — Donate / invest cash into the server treasury\n\n` +
                    `⚠️ **Default Policy:** Loans must be repaid within **24 hours** (+5% interest fee). If you fail to repay, repo agents will **seize all your money** into server funds and place your account in debt!`
                )
                .setFooter({ text: 'The Community Treasury • Backed by server liquidity' })
                .setTimestamp();

            return fastReply(message, { embeds: [embed] });
        }

        if (cmd === 'loan' || cmd === 'borrow') {
            const rawAmount = args[0]?.toLowerCase();
            if (!rawAmount) {
                return fastReply(message, {
                    embeds: [makeEmbed('Loan Usage 🏛️', `\`${PREFIX}loan <amount>\`\nExample: \`${PREFIX}loan 5000\`\n\n• Borrow up to $50,000 from server funds\n• Must be repaid within 24 hours with \`${PREFIX}payloan\`\n• 5% flat loan fee applied\n• If defaulted, all your cash will be seized into server funds!`, COLORS.PRIMARY)]
                });
            }

            const currentFunds = eco.getServerFunds();
            let amount = rawAmount === 'all' || rawAmount === 'max' ? Math.min(50000, Math.floor(currentFunds * 0.5)) : parseInt(rawAmount, 10);

            if (isNaN(amount) || amount <= 0) {
                return fastReply(message, { embeds: [makeEmbed('Invalid Loan Amount ❌', 'Please specify a valid loan amount greater than 0!', COLORS.DANGER)] });
            }

            if (amount < 100) {
                return fastReply(message, { embeds: [makeEmbed('Minimum Loan ❌', 'Minimum loan amount is **$100**!', COLORS.DANGER)] });
            }

            const res = eco.takeLoan(userId, amount);
            if (!res.success) {
                if (res.reason === 'active_loan') {
                    const dueTimestamp = Math.floor(res.loan.dueAt / 1000);
                    return fastReply(message, {
                        embeds: [makeEmbed(
                            'Active Loan Pending ⚠️',
                            `You already have an active loan of **${eco.formatMoney(res.loan.owed)}** due <t:${dueTimestamp}:R>!\nYou must repay it with \`${PREFIX}payloan\` before taking another loan.`,
                            COLORS.WARNING,
                            '🏛️'
                        )]
                    });
                } else if (res.reason === 'unresolved_debt') {
                    return fastReply(message, {
                        embeds: [makeEmbed(
                            'Delinquent Debt Detected 🚨',
                            `Your account is in default with **${eco.formatMoney(res.debt)}** of unpaid debt!\nYou cannot borrow more funds until you clear this debt with \`${PREFIX}payloan\`.`,
                            COLORS.DANGER,
                            '🚨'
                        )]
                    });
                } else if (res.reason === 'insufficient_server_funds') {
                    return fastReply(message, {
                        embeds: [makeEmbed(
                            'Treasury Funds Depleted ❌',
                            `The server funds currently only have **${eco.formatMoney(res.available)}** available for borrowing.`,
                            COLORS.DANGER,
                            '🏛️'
                        )]
                    });
                } else if (res.reason === 'exceeds_max_loan') {
                    return fastReply(message, {
                        embeds: [makeEmbed(
                            'Loan Cap Exceeded ❌',
                            `The maximum allowed loan right now is **${eco.formatMoney(res.maxLoan)}** (up to 50% of available server funds or $50,000).`,
                            COLORS.DANGER,
                            '🏛️'
                        )]
                    });
                }
            }

            const dueTimestamp = Math.floor(res.dueAt / 1000);
            const embed = new EmbedBuilder()
                .setColor(COLORS.GOLD)
                .setAuthor({ name: 'LOAN APPROVED • FUNDS DISBURSED 🏛️', iconURL: message.author.displayAvatarURL() })
                .setDescription(
                    `\`\`\`ansi\n` +
                    `\u001b[1;33m┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\u001b[0m\n` +
                    `\u001b[1;37m   PRINCIPAL BORROWED: \u001b[1;32m+${eco.formatMoney(res.principal).padEnd(19)}\u001b[0m\n` +
                    `\u001b[1;37m   TOTAL REPAYMENT:    \u001b[1;31m-${eco.formatMoney(res.owed).padEnd(19)}\u001b[0m\n` +
                    `\u001b[1;37m   INTEREST FEE (5%):  \u001b[1;33m+${eco.formatMoney(res.owed - res.principal).padEnd(19)}\u001b[0m\n` +
                    `\u001b[1;33m┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\u001b[0m\n` +
                    `\`\`\`\n` +
                    `💰 **Deposited to Your Vault:** \`+${eco.formatMoney(res.principal)}\` *(Use it to gamble, bet, or trade!)*\n` +
                    `💵 **Your New Vault Balance:** \`${eco.formatMoney(res.newBalance)}\`\n` +
                    `🏛️ **Remaining Server Funds:** \`${eco.formatMoney(res.serverFunds)}\`\n\n` +
                    `⏳ **Due Date:** <t:${dueTimestamp}:F> (<t:${dueTimestamp}:R>)\n\n` +
                    `⚠️ **CRITICAL WARNING:** Repay before the deadline using \`${PREFIX}payloan\`.\n` +
                    `If you do not pay back on time, **the server will seize ALL your money** and put it into the server funds, leaving any remainder as delinquent debt!`
                )
                .setFooter({ text: 'Community Loan Facility • 24h Term • 5% Interest' })
                .setTimestamp();

            return fastReply(message, { embeds: [embed] });
        }

        if (cmd === 'payloan' || cmd === 'repay' || cmd === 'paydebt') {
            const rawAmount = args[0]?.toLowerCase();

            let amount = null;
            if (rawAmount && rawAmount !== 'all' && rawAmount !== 'max') {
                amount = parseInt(rawAmount, 10);
                if (isNaN(amount) || amount <= 0) {
                    return fastReply(message, { embeds: [makeEmbed('Invalid Payment Amount ❌', 'Please specify a valid payment amount greater than 0!', COLORS.DANGER)] });
                }
            }

            const res = eco.payLoan(userId, amount);
            if (!res.success) {
                if (res.reason === 'no_debt') {
                    return fastReply(message, {
                        embeds: [makeEmbed('No Outstanding Debt 🎉', 'You have no active loans or delinquent debt! You are completely debt-free.', COLORS.SUCCESS, '✨')]
                    });
                } else if (res.reason === 'no_balance') {
                    return fastReply(message, {
                        embeds: [makeEmbed('Insufficient Funds ❌', `You have **$0** in your vault! You owe **${eco.formatMoney(res.owed)}**.\nWork shifts (\`${PREFIX}work\`) or claim daily (\`${PREFIX}daily\`) to earn money!`, COLORS.DANGER)]
                    });
                }
            }

            const embed = new EmbedBuilder()
                .setColor(COLORS.EMERALD)
                .setAuthor({ name: 'LOAN REPAYMENT PROCESSED 💸', iconURL: message.author.displayAvatarURL() })
                .setDescription(
                    `\`\`\`ansi\n` +
                    `\u001b[1;32m┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\u001b[0m\n` +
                    `\u001b[1;37m   PAYMENT CREDITED:   \u001b[1;32m${eco.formatMoney(res.paid).padEnd(20)}\u001b[0m\n` +
                    `\u001b[1;37m   STATUS:             \u001b[1;33m${(res.cleared ? '100% PAID IN FULL' : 'PARTIALLY REPAID').padEnd(20)}\u001b[0m\n` +
                    `\u001b[1;32m┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\u001b[0m\n` +
                    `\`\`\`\n` +
                    (res.cleared
                        ? `🎉 **Congratulations!** Your ${res.type === 'debt' ? 'delinquent debt' : 'server loan'} has been **fully cleared**!\nYour account is in excellent standing.`
                        : `📝 **Partial Payment:** You paid **${eco.formatMoney(res.paid)}**.\nRemaining ${res.type === 'debt' ? 'debt' : 'loan'}: \`${eco.formatMoney(res.type === 'debt' ? res.remainingDebt : res.remainingOwed)}\``) +
                    `\n\n💵 **Remaining in Your Vault:** \`${eco.formatMoney(res.newBalance)}\`\n` +
                    `🏛️ **Updated Server Funds:** \`${eco.formatMoney(res.serverFunds)}\``
                )
                .setFooter({ text: 'Server Loan Settlement Facility' })
                .setTimestamp();

            return fastReply(message, { embeds: [embed] });
        }

        if (cmd === 'depositfunds' || cmd === 'donatefunds' || cmd === 'fundserver') {
            const currentBal = eco.getBalance(userId);
            let amount = args[0]?.toLowerCase() === 'all' ? currentBal : parseInt(args[0], 10);
            if (isNaN(amount) || amount <= 0) {
                return fastReply(message, { embeds: [makeEmbed('Deposit Funds Usage 🏛️', `\`${PREFIX}depositfunds <amount>\`\nExample: \`${PREFIX}depositfunds 1000\``, COLORS.PRIMARY)] });
            }

            const res = eco.depositFunds(userId, amount);
            if (!res.success) {
                return fastReply(message, { embeds: [makeEmbed('Insufficient Funds ❌', `You only have **${eco.formatMoney(res.balance)}** in your vault.`, COLORS.DANGER)] });
            }

            const embed = new EmbedBuilder()
                .setColor(COLORS.GOLD)
                .setAuthor({ name: 'COMMUNITY TREASURY DEPOSIT 🏛️', iconURL: message.author.displayAvatarURL() })
                .setDescription(
                    `Thank you for contributing to the central server funds!\n\n` +
                    `💵 **Amount Deposited:** \`+${eco.formatMoney(res.deposited)}\`\n` +
                    `🏛️ **Total Server Funds:** \`${eco.formatMoney(res.serverFunds)}\`\n` +
                    `💳 **Your Remaining Vault:** \`${eco.formatMoney(res.newBalance)}\``
                )
                .setFooter({ text: 'Community Bank Liquidity Provider' })
                .setTimestamp();

            return fastReply(message, { embeds: [embed] });
        }

        if (cmd === 'addfunds') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return fastReply(message, { embeds: [makeEmbed('Permission Denied ⛔', 'Only server administrators can inject money into server funds.', COLORS.DANGER)] });
            }
            const amount = parseInt(args[0], 10);
            if (isNaN(amount) || amount <= 0) {
                return fastReply(message, { embeds: [makeEmbed('Add Funds Usage 🏛️', `\`${PREFIX}addfunds <amount>\`\nExample: \`${PREFIX}addfunds 100000\``, COLORS.PRIMARY)] });
            }
            const newFunds = eco.addServerFunds(amount);
            return fastReply(message, {
                embeds: [makeEmbed('Server Funds Injected 🏛️', `Added **+${eco.formatMoney(amount)}** to the server treasury!\n🏛️ **New Server Funds:** \`${eco.formatMoney(newFunds)}\``, COLORS.SUCCESS)]
            });
        }

        if (cmd === 'forgiveloan' || cmd === 'cleardebt') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return fastReply(message, { embeds: [makeEmbed('Permission Denied ⛔', 'Only server administrators can forgive loans or debts.', COLORS.DANGER)] });
            }
            const target = await resolveMember(message, args[0]);
            if (!target) {
                return fastReply(message, { embeds: [makeEmbed('Target Required ❌', `\`${PREFIX}forgiveloan <@user>\``, COLORS.PRIMARY)] });
            }
            const forgiven = eco.forgiveLoan(target.id);
            if (!forgiven) {
                return fastReply(message, { embeds: [makeEmbed('No Loans or Debt ❌', `<@${target.id}> does not have any active loans or debt.`, COLORS.WARNING)] });
            }
            return fastReply(message, {
                embeds: [makeEmbed('Loan & Debt Forgiven 🤝', `Successfully pardoned all active loans and delinquent debts for <@${target.id}>.`, COLORS.SUCCESS)]
            });
        }

        if (cmd === 'balance' || cmd === 'bal' || cmd === 'b') {
            const target = (await resolveMember(message, args[0])) || message.member;
            const targetEco = eco.getUser(target.id);
            const top = eco.getLeaderboard(100);
            const rankIndex = top.findIndex(u => u.id === target.id);
            const rank = rankIndex !== -1 ? rankIndex + 1 : '100+';

            return fastReply(message, {
                embeds: [casinoBalanceEmbed(target.user, targetEco, rank)]
            });
        }

        if (cmd === 'daily') {
            const user = eco.getUser(userId);
            const now = Date.now();
            const cooldown = 24 * 60 * 60 * 1000;
            const streakTimeout = 48 * 60 * 60 * 1000;

            if (now - (user.lastDaily || 0) < cooldown) {
                const timeLeft = cooldown - (now - user.lastDaily);
                const hours = Math.floor(timeLeft / (60 * 60 * 1000));
                const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
                return fastReply(message, {
                    embeds: [makeEmbed('Daily Stipend Locked ⏳', `You have already collected today's VIP check!\nNext reward available in **${hours}h ${minutes}m**.\nCurrent streak: **${user.dailyStreak || 0} day(s)**.`, COLORS.WARNING, '🎁')]
                });
            }

            // Streak logic: if claimed within 48h, streak increments; otherwise resets to 1
            if (user.lastDaily && (now - user.lastDaily) <= streakTimeout) {
                user.dailyStreak = (user.dailyStreak || 0) + 1;
            } else {
                user.dailyStreak = 1;
            }
            user.lastDaily = now;

            // Tiered reward: Base $500 + $150 per day past day 1 up to max $1,100 (day 5)
            const streakBonus = Math.min(4, user.dailyStreak - 1) * 150;
            const reward = 500 + streakBonus;
            const newBal = eco.addBalance(userId, reward);
            eco.scheduleSave();

            const embed = new EmbedBuilder()
                .setColor(COLORS.GOLD)
                .setAuthor({ name: 'VIP DAILY STIPEND CLAIMED 🎁', iconURL: message.author.displayAvatarURL() })
                .setDescription(
                    `\`\`\`\n` +
                    `╔══════════════════════════════════╗\n` +
                    `║        DIRECT DEPOSIT RECEIPT    ║\n` +
                    `╠══════════════════════════════════╣\n` +
                    `║ Base Pay:       $500.00          ║\n` +
                    `║ Streak Bonus:  +$${streakBonus.toString().padEnd(6, ' ')}          ║\n` +
                    `║ Total Credited:+$${reward.toString().padEnd(6, ' ')}          ║\n` +
                    `║ Streak Level:   ${user.dailyStreak} Day(s)         ║\n` +
                    `║ Status:         CLEARED & PAID   ║\n` +
                    `╚══════════════════════════════════╝\n` +
                    `\`\`\`\n` +
                    `🔥 **Daily Streak:** \`${user.dailyStreak} Day${user.dailyStreak > 1 ? 's' : ''}\` ${user.dailyStreak >= 5 ? '(MAX BONUS REACHED!)' : `(Next: +$${reward + 150})`}\n` +
                    `💵 **New Vault Balance:** \`${eco.formatMoney(newBal)}\``
                )
                .setFooter({ text: 'Keep claiming every 24h to maintain your daily streak boost!' })
                .setTimestamp();

            return fastReply(message, { embeds: [embed] });
        }

        if (cmd === 'work') {
            const user = eco.getUser(userId);
            const now = Date.now();
            const cooldown = 15 * 60 * 1000;

            if (now - (user.lastWork || 0) < cooldown) {
                const timeLeft = cooldown - (now - user.lastWork);
                const minutes = Math.floor(timeLeft / (60 * 1000));
                const seconds = Math.floor((timeLeft % (60 * 1000)) / 1000);
                return fastReply(message, {
                    embeds: [makeEmbed('Shift Cooldown ⏳', `Take a breather in the staff lounge!\nNext shift starts in **${minutes}m ${seconds}s**.`, COLORS.WARNING, '💼')]
                });
            }

            user.lastWork = now;
            user.workCount = (user.workCount || 0) + 1;

            let minPay = 120, maxPay = 220, roleName = 'Lounge Apprentice';
            if (user.workCount >= 31) {
                minPay = 450; maxPay = 700; roleName = '👑 VIP Pit Boss';
            } else if (user.workCount >= 16) {
                minPay = 300; maxPay = 500; roleName = '🥇 Senior Card Dealer';
            } else if (user.workCount >= 6) {
                minPay = 200; maxPay = 350; roleName = '🥈 VIP Floor Host';
            }

            const baseWage = Math.floor(Math.random() * (maxPay - minPay + 1)) + minPay;
            const hadTip = Math.random() < 0.20; // 20% chance of tip
            const tip = hadTip ? Math.floor(Math.random() * 150) + 100 : 0;
            const totalEarned = baseWage + tip;

            const newBal = eco.addBalance(userId, totalEarned);
            eco.scheduleSave();

            const jobs = [
                'Dealt cards at the high-stakes VIP Blackjack table',
                'Managed executive salon reservations for high rollers',
                'Spinning the European Roulette wheel for casino VIPs',
                'Audited security tapes and guarded the central gold vault',
                'Served chilled champagne to whale gamblers in the penthouse'
            ];
            const randomJob = jobs[Math.floor(Math.random() * jobs.length)];

            const embed = new EmbedBuilder()
                .setColor(COLORS.EMERALD)
                .setAuthor({ name: 'SHIFT COMPLETED • PAYSLIP CLEARED 💼', iconURL: message.author.displayAvatarURL() })
                .setDescription(
                    `**Career Level:** \`${roleName}\` *(Shift #${user.workCount})*\n` +
                    `**Assignment:** ${randomJob}\n\n` +
                    `💵 **Shift Wage:** \`+${eco.formatMoney(baseWage)}\`\n` +
                    (hadTip ? `🎁 **VIP Guest Tip:** \`+${eco.formatMoney(tip)}\` *(Generous High Roller!)*\n` : '') +
                    `✨ **Total Deposited:** \`+${eco.formatMoney(totalEarned)}\`\n` +
                    `🏦 **Total Vault:** \`${eco.formatMoney(newBal)}\``
                )
                .setFooter({ text: 'Clock in again in 15 minutes • Complete more shifts for promotion!' })
                .setTimestamp();

            return fastReply(message, { embeds: [embed] });
        }

        if (cmd === 'coinflip' || cmd === 'cf') {
            const choice = args[0]?.toLowerCase();
            if (choice !== 'heads' && choice !== 'tails' && choice !== 'h' && choice !== 't') {
                return fastReply(message, { embeds: [makeEmbed('Coinflip Usage 🪙', `\`${PREFIX}coinflip <heads|tails> <bet>\`\nExample: \`${PREFIX}coinflip heads 100\``, COLORS.PRIMARY)] });
            }

            const pickedHeads = choice === 'heads' || choice === 'h';
            const currentBal = eco.getBalance(userId);

            let bet = args[1]?.toLowerCase() === 'all' ? currentBal : parseInt(args[1], 10);
            if (isNaN(bet) || bet <= 0) return fastReply(message, { embeds: [makeEmbed('Invalid Bet ❌', 'Please specify a bet amount greater than 0!', COLORS.DANGER)] });
            if (bet > currentBal) return fastReply(message, { embeds: [makeEmbed('Insufficient Funds ❌', `You only have **${eco.formatMoney(currentBal)}**.`, COLORS.DANGER)] });

            // Deduct wager upfront to prevent exploit during animation
            eco.removeBalance(userId, bet);

            // True cryptographically uniform random toss (strictly 50/50)
            const isHeads = secureRandomInt(0, 1) === 1;
            const won = (pickedHeads && isHeads) || (!pickedHeads && !isHeads);
            const user = eco.getUser(userId);

            let profit = 0;
            let endBal = 0;
            let streak = user.cfStreak || 0;

            if (won) {
                user.cfStreak = streak + 1;
                streak = user.cfStreak;
                const bonusRate = streak === 1 ? 1.0 : streak === 2 ? 1.10 : streak === 3 ? 1.25 : streak === 4 ? 1.40 : 1.50;
                profit = Math.floor(bet * bonusRate);
                endBal = eco.addBalance(userId, bet + profit);
            } else {
                user.cfStreak = 0;
                endBal = eco.getBalance(userId);
            }
            eco.scheduleSave();

            const ticketId = generateFairTicket();

            const spinEmbed = new EmbedBuilder()
                .setColor(COLORS.PRIMARY)
                .setAuthor({ name: `${message.author.username}'s Double-or-Nothing 🪙`, iconURL: message.author.displayAvatarURL() })
                .setDescription(
                    `\`\`\`\n` +
                    `    .--------.   \n` +
                    `   /  FLIP... \\  \n` +
                    `  |     🪙     | \n` +
                    `   \\   ↺ ↻    /  \n` +
                    `    '--------'   \n` +
                    `\`\`\`\n` +
                    `🪙 **Tossing coin in the air...**\n` +
                    `🎯 **Your Pick:** \`${pickedHeads ? 'HEADS' : 'TAILS'}\` • **Wager:** \`${eco.formatMoney(bet)}\`\n\n` +
                    `*Generating CSPRNG cryptographic verification (Roll #${ticketId})...*`
                );

            const statusMsg = await fastReply(message, { embeds: [spinEmbed] });

            setTimeout(async () => {
                const finalEmbed = casinoCoinflipEmbed(
                    message.author.username,
                    message.author.displayAvatarURL(),
                    pickedHeads ? 'heads' : 'tails',
                    isHeads,
                    won,
                    bet,
                    streak,
                    profit,
                    endBal,
                    ticketId
                );
                if (statusMsg) await statusMsg.edit({ embeds: [finalEmbed] }).catch(() => {});
                else await fastReply(message, { embeds: [finalEmbed] });
            }, 650);
            return;
        }

        if (cmd === 'slots' || cmd === 'slot') {
            const currentBal = eco.getBalance(userId);
            let bet = args[0]?.toLowerCase() === 'all' ? currentBal : parseInt(args[0], 10);
            if (isNaN(bet) || bet <= 0) return fastReply(message, { embeds: [makeEmbed('Slots Usage 🎰', `\`${PREFIX}slots <bet>\`\nExample: \`${PREFIX}slots 50\``, COLORS.PRIMARY)] });
            if (bet > currentBal) return fastReply(message, { embeds: [makeEmbed('Insufficient Funds ❌', `You only have **${eco.formatMoney(currentBal)}**.`, COLORS.DANGER)] });

            // Deduct wager upfront
            eco.removeBalance(userId, bet);

            // Rebalanced reel weights for realistic casino entertainment & ~48% hit rate
            const reelWeights = [
                { symbol: '🍒', weight: 26 },
                { symbol: '🍋', weight: 22 },
                { symbol: '🍇', weight: 20 },
                { symbol: '🔔', weight: 16 },
                { symbol: '💎', weight: 10 },
                { symbol: '7️⃣', weight: 6 }
            ];

            const totalWeight = reelWeights.reduce((acc, r) => acc + r.weight, 0); // 100
            function spinReel() {
                let r = secureRandomInt(0, totalWeight - 1);
                for (const item of reelWeights) {
                    if (r < item.weight) return item.symbol;
                    r -= item.weight;
                }
                return '🍒';
            }

            const r1 = spinReel();
            const r2 = spinReel();
            const r3 = spinReel();

            let outcome = { multiplier: 0, banner: '★ TRY AGAIN ★', desc: '' };

            if (r1 === r2 && r2 === r3) {
                if (r1 === '7️⃣') {
                    outcome = { multiplier: 35, banner: '★ ★ ★ GRAND JACKPOT ★ ★ ★', desc: 'TRIPLE LUCKY 7s (35x)' };
                } else if (r1 === '💎') {
                    outcome = { multiplier: 20, banner: '★ ★ DIAMOND JACKPOT ★ ★', desc: 'TRIPLE DIAMONDS (20x)' };
                } else if (r1 === '🔔') {
                    outcome = { multiplier: 12, banner: '★ ★ GOLDEN BELLS ★ ★', desc: 'TRIPLE BELLS (12x)' };
                } else if (r1 === '🍇') {
                    outcome = { multiplier: 8, banner: '★ ★ ROYAL GRAPES ★ ★', desc: 'TRIPLE GRAPES (8x)' };
                } else if (r1 === '🍋') {
                    outcome = { multiplier: 6, banner: '★ LEMON HARVEST ★', desc: 'TRIPLE LEMONS (6x)' };
                } else {
                    outcome = { multiplier: 5, banner: '★ TRIPLE CHERRIES ★', desc: 'TRIPLE CHERRIES (5x)' };
                }
            } else if (r1 === r2 || r2 === r3 || r1 === r3) {
                const pairSym = (r1 === r2 || r1 === r3) ? r1 : r2;
                if (pairSym === '7️⃣' || pairSym === '💎') {
                    outcome = { multiplier: 3.0, banner: '★ HIGH-ROLLER PAIR ★', desc: `PAIR OF ${pairSym} (3x)` };
                } else if (pairSym === '🔔' || pairSym === '🍇') {
                    outcome = { multiplier: 2.0, banner: '★ LUCKY PAIR ★', desc: `PAIR OF ${pairSym} (2x)` };
                } else {
                    outcome = { multiplier: 1.5, banner: '★ FRUIT PAIR ★', desc: `PAIR OF ${pairSym} (1.5x)` };
                }
            } else if ([r1, r2, r3].filter(s => ['🍒', '🍋', '🍇'].includes(s)).length === 3) {
                outcome = { multiplier: 1.2, banner: '★ FRUIT SALAD COMBO ★', desc: 'ALL-FRUIT SALAD MIX (1.2x)' };
            } else if (r1 === '🍒' || r2 === '🍒' || r3 === '🍒') {
                outcome = { multiplier: 1, banner: '★ SAFE SPIN REFUND ★', desc: 'SINGLE CHERRY CONSOLATION' };
            }

            let newBal = 0;
            if (outcome.multiplier > 0) {
                const totalReturn = Math.floor(bet * outcome.multiplier);
                newBal = eco.addBalance(userId, totalReturn);
            } else {
                newBal = eco.getBalance(userId);
            }

            const spinEmbed = new EmbedBuilder()
                .setColor(COLORS.PRIMARY)
                .setAuthor({ name: `${message.author.username}'s Bellagio Slots 🎰`, iconURL: message.author.displayAvatarURL() })
                .setDescription(
                    `\`\`\`\n` +
                    `╔══════════════════════════════════╗\n` +
                    `║      ★ BELLAGIO CASINO ★         ║\n` +
                    `╠══════════════════════════════════╣\n` +
                    `║      [  🌀  │  🌀  │  🌀  ]       ║ ◀ SPINNING\n` +
                    `╠══════════════════════════════════╣\n` +
                    `║       PULLING REEL LEVER...      ║\n` +
                    `╚══════════════════════════════════╝\n` +
                    `\`\`\`\n` +
                    `🎰 **Spinning the 3-Reel Slots...**\n` +
                    `💰 **Wager Placed:** \`${eco.formatMoney(bet)}\``
                );

            const statusMsg = await fastReply(message, { embeds: [spinEmbed] });

            setTimeout(async () => {
                const finalEmbed = casinoSlotsEmbed(message.author.username, message.author.displayAvatarURL(), r1, r2, r3, outcome, bet, newBal);
                if (statusMsg) await statusMsg.edit({ embeds: [finalEmbed] }).catch(() => {});
                else await fastReply(message, { embeds: [finalEmbed] });
            }, 750);
            return;
        }

        // ----------------- BLACKJACK (HIT / STAND WITH BOTH BUTTONS & TEXT) -----------------
        if (cmd === 'blackjack' || cmd === 'bj') {
            if (activeBlackjackGames.has(userId)) {
                return fastReply(message, { embeds: [makeEmbed('Game In Progress 🃏', 'You already have an active Blackjack hand! Click **Hit 🟢** / **Stand 🛑** or type `hit` / `stand`.', COLORS.WARNING)] });
            }

            const currentBal = eco.getBalance(userId);
            let bet = args[0]?.toLowerCase() === 'all' ? currentBal : parseInt(args[0], 10);
            if (isNaN(bet) || bet <= 0) return fastReply(message, { embeds: [makeEmbed('Blackjack Usage 🃏', `\`${PREFIX}blackjack <bet>\`\nExample: \`${PREFIX}blackjack 100\``, COLORS.PRIMARY)] });
            if (bet > currentBal) return fastReply(message, { embeds: [makeEmbed('Insufficient Funds ❌', `You only have **${eco.formatMoney(currentBal)}**.`, COLORS.DANGER)] });

            eco.removeBalance(userId, bet);

            // 6-Deck Shuffled Shoe for authentic casino distribution
            const suits = ['♠', '♥', '♦', '♣'];
            const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
            const shoe = [];
            for (let d = 0; d < 6; d++) {
                for (const s of suits) {
                    for (const v of values) {
                        shoe.push({ val: v, suit: s, text: `${v}${s}` });
                    }
                }
            }
            // Fisher-Yates shuffle with cryptographic randomness
            for (let i = shoe.length - 1; i > 0; i--) {
                const j = secureRandomInt(0, i);
                [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
            }

            function drawCard() {
                return shoe.pop() || { val: '10', suit: '♠', text: '10♠' };
            }

            function calcHand(cards) {
                let total = 0;
                let aces = 0;
                for (const c of cards) {
                    if (c.val === 'A') { aces++; total += 11; }
                    else if (['K', 'Q', 'J'].includes(c.val)) { total += 10; }
                    else { total += parseInt(c.val, 10); }
                }
                while (total > 21 && aces > 0) { total -= 10; aces--; }
                return total;
            }

            const playerCards = [drawCard(), drawCard()];
            const dealerCards = [drawCard(), drawCard()];
            let playerTotal = calcHand(playerCards);
            let dealerTotal = calcHand(dealerCards);

            const playerHasNatural = playerTotal === 21;
            const dealerHasNatural = dealerTotal === 21;

            // Authentic Casino Rule: Immediate Hole Card Peek on 21
            if (dealerHasNatural && playerHasNatural) {
                const endBal = eco.addBalance(userId, bet);
                return fastReply(message, {
                    embeds: [casinoBlackjackEmbed(
                        message.author.username,
                        message.author.displayAvatarURL(),
                        playerCards,
                        dealerCards,
                        21,
                        21,
                        bet,
                        false,
                        `🤝 **BOTH HOLD NATURAL 21! PUSH!**\nDealer also held Blackjack! Your wager of \`${eco.formatMoney(bet)}\` was safely refunded.\n💵 **Vault:** \`${eco.formatMoney(endBal)}\``
                    )]
                });
            } else if (dealerHasNatural) {
                const endBal = eco.getBalance(userId);
                return fastReply(message, {
                    embeds: [casinoBlackjackEmbed(
                        message.author.username,
                        message.author.displayAvatarURL(),
                        playerCards,
                        dealerCards,
                        playerTotal,
                        21,
                        bet,
                        false,
                        `💀 **DEALER REVEALS NATURAL 21! BLACKJACK!**\nDealer checked hole card. Lost **-${eco.formatMoney(bet)}**.\n💵 **Vault:** \`${eco.formatMoney(endBal)}\``
                    )]
                });
            } else if (playerHasNatural) {
                // Natural 21 pays 3:2 (+150% profit = 2.5x total payout)
                const winAmount = Math.floor(bet * 2.5);
                const endBal = eco.addBalance(userId, winAmount);
                return fastReply(message, {
                    embeds: [casinoBlackjackEmbed(
                        message.author.username,
                        message.author.displayAvatarURL(),
                        playerCards,
                        dealerCards,
                        21,
                        dealerTotal,
                        bet,
                        false,
                        `👑 **NATURAL 21! BLACKJACK PAYS 3:2!**\nDealer checked hole card and did not hold 21.\nWon **+${eco.formatMoney(Math.floor(bet * 1.5))}**!\n💵 **Vault:** \`${eco.formatMoney(endBal)}\``
                    )]
                });
            }

            const getControls = (canDouble = true) => {
                const components = [
                    new ButtonBuilder().setCustomId('hit').setLabel('Hit').setStyle(ButtonStyle.Success).setEmoji('🟢'),
                    new ButtonBuilder().setCustomId('stand').setLabel('Stand').setStyle(ButtonStyle.Danger).setEmoji('🛑')
                ];
                if (canDouble) {
                    components.push(new ButtonBuilder().setCustomId('double').setLabel('Double Down').setStyle(ButtonStyle.Primary).setEmoji('⚡'));
                }
                return new ActionRowBuilder().addComponents(components);
            };

            const gameMsg = await fastReply(message, {
                embeds: [casinoBlackjackEmbed(message.author.username, message.author.displayAvatarURL(), playerCards, dealerCards, playerTotal, dealerTotal, bet, true, '')],
                components: [getControls(true)]
            });
            if (!gameMsg) return;

            const collector = gameMsg.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 60000
            });

            // Unified Game Controller (supports BOTH button click and text command)
            const gameState = {
                userId,
                channelId: message.channel.id,
                bet,
                playerCards,
                dealerCards,
                playerTotal,
                dealerTotal,
                gameMsg,
                collector,
                hit: async () => {
                    playerCards.push(drawCard());
                    playerTotal = calcHand(playerCards);

                    if (playerTotal > 21) {
                        activeBlackjackGames.delete(userId);
                        collector.stop('bust');
                        const endBal = eco.getBalance(userId);
                        return gameMsg.edit({
                            embeds: [casinoBlackjackEmbed(
                                message.author.username,
                                message.author.displayAvatarURL(),
                                playerCards,
                                dealerCards,
                                playerTotal,
                                dealerTotal,
                                bet,
                                false,
                                `💀 **BUSTED OVER 21!** Hand Total: \`${playerTotal}\`\nLost **-${eco.formatMoney(bet)}**.\n💵 **Vault:** \`${eco.formatMoney(endBal)}\``
                            )],
                            components: []
                        }).catch(() => {});
                    }

                    // 5-Card Charlie Rule: 5 cards without busting pays 2:1 profit!
                    if (playerCards.length >= 5 && playerTotal <= 21) {
                        activeBlackjackGames.delete(userId);
                        collector.stop('charlie');
                        const won = bet * 3;
                        const endBal = eco.addBalance(userId, won);
                        return gameMsg.edit({
                            embeds: [casinoBlackjackEmbed(
                                message.author.username,
                                message.author.displayAvatarURL(),
                                playerCards,
                                dealerCards,
                                playerTotal,
                                dealerTotal,
                                bet,
                                false,
                                `🌟 **5-CARD CHARLIE! LEGENDARY HAND!**\nDrew 5 cards without busting (Total: \`${playerTotal}\`)!\nPays 2:1 profit! Won **+${eco.formatMoney(bet * 2)}**!\n💵 **Vault:** \`${eco.formatMoney(endBal)}\``
                            )],
                            components: []
                        }).catch(() => {});
                    }

                    if (playerTotal === 21) {
                        return await gameState.stand();
                    }

                    return gameMsg.edit({
                        embeds: [casinoBlackjackEmbed(message.author.username, message.author.displayAvatarURL(), playerCards, dealerCards, playerTotal, dealerTotal, bet, true, '')],
                        components: [getControls(false)]
                    }).catch(() => {});
                },
                stand: async () => {
                    activeBlackjackGames.delete(userId);
                    collector.stop('stand');

                    // Standard Dealer Rules: Dealer hits on all totals < 17, stands on all 17s
                    while (calcHand(dealerCards) < 17) dealerCards.push(drawCard());
                    dealerTotal = calcHand(dealerCards);

                    let finalMsg = '';
                    if (dealerTotal > 21) {
                        const won = bet * 2;
                        const endBal = eco.addBalance(userId, won);
                        finalMsg = `🎉 **DEALER BUSTED!** (Dealer: \`${dealerTotal}\` vs Player: \`${playerTotal}\`)\nYou won **+${eco.formatMoney(bet)}**!\n💵 **Vault:** \`${eco.formatMoney(endBal)}\``;
                    } else if (playerTotal > dealerTotal) {
                        const won = bet * 2;
                        const endBal = eco.addBalance(userId, won);
                        finalMsg = `🎉 **YOU WIN!** (Player: \`${playerTotal}\` vs Dealer: \`${dealerTotal}\`)\nYou won **+${eco.formatMoney(bet)}**!\n💵 **Vault:** \`${eco.formatMoney(endBal)}\``;
                    } else if (playerTotal < dealerTotal) {
                        const endBal = eco.getBalance(userId);
                        finalMsg = `💀 **DEALER WINS!** (Dealer: \`${dealerTotal}\` vs Player: \`${playerTotal}\`)\nLost **-${eco.formatMoney(bet)}**.\n💵 **Vault:** \`${eco.formatMoney(endBal)}\``;
                    } else {
                        const endBal = eco.addBalance(userId, bet);
                        finalMsg = `🤝 **PUSH (TIE)!** Both hold \`${playerTotal}\`.\nWager refunded.\n💵 **Vault:** \`${eco.formatMoney(endBal)}\``;
                    }

                    return gameMsg.edit({
                        embeds: [casinoBlackjackEmbed(message.author.username, message.author.displayAvatarURL(), playerCards, dealerCards, playerTotal, dealerTotal, bet, false, finalMsg)],
                        components: []
                    }).catch(() => {});
                },
                double: async () => {
                    const balLeft = eco.getBalance(userId);
                    if (balLeft < bet) {
                        return message.channel.send({ content: `<@${userId}> ❌ Not enough cash in vault to double down!` }).then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
                    }
                    eco.removeBalance(userId, bet);
                    bet *= 2;
                    playerCards.push(drawCard());
                    playerTotal = calcHand(playerCards);

                    if (playerTotal > 21) {
                        activeBlackjackGames.delete(userId);
                        collector.stop('bust');
                        const endBal = eco.getBalance(userId);
                        return gameMsg.edit({
                            embeds: [casinoBlackjackEmbed(
                                message.author.username,
                                message.author.displayAvatarURL(),
                                playerCards,
                                dealerCards,
                                playerTotal,
                                dealerTotal,
                                bet,
                                false,
                                `💀 **DOUBLE DOWN BUSTED!** Hand Total: \`${playerTotal}\`\nLost **-${eco.formatMoney(bet)}**.\n💵 **Vault:** \`${eco.formatMoney(endBal)}\``
                            )],
                            components: []
                        }).catch(() => {});
                    }

                    return await gameState.stand();
                }
            };

            activeBlackjackGames.set(userId, gameState);

            collector.on('collect', async i => {
                if (i.user.id !== userId) return i.reply({ content: '❌ This is not your game of Blackjack!', ephemeral: true });
                await i.deferUpdate().catch(() => {});

                if (i.customId === 'hit') await gameState.hit();
                else if (i.customId === 'stand') await gameState.stand();
                else if (i.customId === 'double') await gameState.double();
            });

            collector.on('end', async (_, reason) => {
                if (activeBlackjackGames.has(userId)) {
                    await gameState.stand();
                }
            });
            return;
        }

        if (cmd === 'roulette' || cmd === 'roul') {
            const choice = args[0]?.toLowerCase();
            const validChoices = ['red', 'black', 'even', 'odd', 'low', 'high', '1st12', '2nd12', '3rd12', 'green', '0'];
            const isNumberChoice = /^(?:[0-9]|[12][0-9]|3[0-6])$/.test(choice);

            if (!choice || (!validChoices.includes(choice) && !isNumberChoice)) {
                return fastReply(message, {
                    embeds: [makeEmbed(
                        'Roulette Usage 🎡',
                        `\`${PREFIX}roulette <choice> <bet>\`\n\n` +
                        `**Fair Bet Choices & Payouts:**\n` +
                        `• \`red\` / \`black\` — **2x Payout** *(48.6% odds • La Partage protection)*\n` +
                        `• \`even\` / \`odd\` — **2x Payout** *(48.6% odds • La Partage protection)*\n` +
                        `• \`low\` (1-18) / \`high\` (19-36) — **2x Payout** *(48.6% odds • La Partage protection)*\n` +
                        `• \`1st12\` / \`2nd12\` / \`3rd12\` — **3x Payout** *(32.4% odds)*\n` +
                        `• \`green\` or \`0\` — **36x Jackpot Payout** *(European single zero)*\n` +
                        `• \`0\` to \`36\` (Exact Number) — **36x Jackpot Payout**\n\n` +
                        `*Notice: When ball lands on 0, European "La Partage" refunds 50% of even bets!*\n` +
                        `*Example:* \`${PREFIX}roulette red 100\` or \`${PREFIX}roulette 1st12 250\``,
                        COLORS.PRIMARY
                    )]
                });
            }

            const currentBal = eco.getBalance(userId);
            let bet = args[1]?.toLowerCase() === 'all' ? currentBal : parseInt(args[1], 10);
            if (isNaN(bet) || bet <= 0) return fastReply(message, { embeds: [makeEmbed('Invalid Bet ❌', 'Please specify a bet amount greater than 0!', COLORS.DANGER)] });
            if (bet > currentBal) return fastReply(message, { embeds: [makeEmbed('Insufficient Funds ❌', `You only have **${eco.formatMoney(currentBal)}**.`, COLORS.DANGER)] });

            eco.removeBalance(userId, bet);

            const roll = secureRandomInt(0, 36);
            const redNumbers = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
            const isRed = redNumbers.includes(roll);
            const isBlack = roll !== 0 && !isRed;
            const isGreen = roll === 0;

            const isEvenMoney = ['red', 'black', 'even', 'odd', 'low', 'high'].includes(choice);
            let won = false;
            let multiplier = 0;
            let isLaPartage = false;

            if (choice === 'red' && isRed) { won = true; multiplier = 2; }
            else if (choice === 'black' && isBlack) { won = true; multiplier = 2; }
            else if (choice === 'even' && roll !== 0 && roll % 2 === 0) { won = true; multiplier = 2; }
            else if (choice === 'odd' && roll % 2 !== 0) { won = true; multiplier = 2; }
            else if (choice === 'low' && roll >= 1 && roll <= 18) { won = true; multiplier = 2; }
            else if (choice === 'high' && roll >= 19 && roll <= 36) { won = true; multiplier = 2; }
            else if (choice === '1st12' && roll >= 1 && roll <= 12) { won = true; multiplier = 3; }
            else if (choice === '2nd12' && roll >= 13 && roll <= 24) { won = true; multiplier = 3; }
            else if (choice === '3rd12' && roll >= 25 && roll <= 36) { won = true; multiplier = 3; }
            else if ((choice === 'green' || choice === '0') && isGreen) { won = true; multiplier = 36; }
            else if (parseInt(choice, 10) === roll) { won = true; multiplier = 36; }
            else if (isGreen && isEvenMoney) {
                isLaPartage = true;
            }

            const rollColor = isGreen ? '🟩 ZERO' : isRed ? '🟥 RED' : '⬛ BLACK';
            let newBal = 0;
            if (won) {
                newBal = eco.addBalance(userId, bet * multiplier);
            } else if (isLaPartage) {
                newBal = eco.addBalance(userId, Math.floor(bet * 0.5));
            } else {
                newBal = eco.getBalance(userId);
            }

            const spinEmbed = new EmbedBuilder()
                .setColor(COLORS.PRIMARY)
                .setAuthor({ name: `${message.author.username}'s European Roulette 🎡`, iconURL: message.author.displayAvatarURL() })
                .setDescription(
                    `🎡 **Spinning the European Roulette wheel...**\n` +
                    `⚪ *The ivory ball is bouncing across the 37 numbered pockets...*\n\n` +
                    `🎯 **Your Call:** \`${choice.toUpperCase()}\` • **Wager:** \`${eco.formatMoney(bet)}\``
                );

            const statusMsg = await fastReply(message, { embeds: [spinEmbed] });

            setTimeout(async () => {
                const finalEmbed = casinoRouletteEmbed(message.author.username, message.author.displayAvatarURL(), choice, roll, rollColor, won, bet, multiplier, newBal, isLaPartage);
                if (statusMsg) await statusMsg.edit({ embeds: [finalEmbed] }).catch(() => {});
                else await fastReply(message, { embeds: [finalEmbed] });
            }, 750);
            return;
        }

        if (cmd === 'dice' || cmd === 'roll') {
            const currentBal = eco.getBalance(userId);
            let bet = args[0]?.toLowerCase() === 'all' ? currentBal : parseInt(args[0], 10);
            if (isNaN(bet) || bet <= 0) return fastReply(message, { embeds: [makeEmbed('Dice Usage 🎲', `\`${PREFIX}dice <bet>\`\nExample: \`${PREFIX}dice 100\``, COLORS.PRIMARY)] });
            if (bet > currentBal) return fastReply(message, { embeds: [makeEmbed('Insufficient Funds ❌', `You only have **${eco.formatMoney(currentBal)}**.`, COLORS.DANGER)] });

            eco.removeBalance(userId, bet);

            const p1 = secureRandomInt(1, 6);
            const p2 = secureRandomInt(1, 6);
            const d1 = secureRandomInt(1, 6);
            const d2 = secureRandomInt(1, 6);

            const pTotal = p1 + p2;
            const dTotal = d1 + d2;

            let resultType = 'loss';
            let multiplier = 0;

            if (pTotal === dTotal) {
                resultType = 'tie';
                multiplier = 1;
            } else if (pTotal > dTotal) {
                if (p1 === p2) {
                    resultType = 'doubles';
                    multiplier = 2.5;
                } else if (pTotal === 7 || pTotal === 11) {
                    resultType = 'natural';
                    multiplier = 2.2;
                } else {
                    resultType = 'win';
                    multiplier = 2.0;
                }
            }

            let newBal = 0;
            if (resultType === 'tie') {
                newBal = eco.addBalance(userId, bet);
            } else if (resultType !== 'loss') {
                newBal = eco.addBalance(userId, Math.floor(bet * multiplier));
            } else {
                newBal = eco.getBalance(userId);
            }

            const rollEmbed = new EmbedBuilder()
                .setColor(COLORS.PRIMARY)
                .setAuthor({ name: `${message.author.username}'s High-Stakes Craps Dice 🎲`, iconURL: message.author.displayAvatarURL() })
                .setDescription(
                    `🎲 **Shaking the dice cup on the felt table...**\n` +
                    `\`[ 🎲 🎲  vs  🎲 🎲 ]\`\n\n` +
                    `💰 **Wager Placed:** \`${eco.formatMoney(bet)}\`\n` +
                    `*Rolling with cryptographically secure physics...*`
                );

            const statusMsg = await fastReply(message, { embeds: [rollEmbed] });

            setTimeout(async () => {
                const finalEmbed = casinoDiceEmbed(message.author.username, message.author.displayAvatarURL(), [p1, p2], [d1, d2], pTotal, dTotal, resultType, multiplier, bet, newBal);
                if (statusMsg) await statusMsg.edit({ embeds: [finalEmbed] }).catch(() => {});
                else await fastReply(message, { embeds: [finalEmbed] });
            }, 650);
            return;
        }

        if (cmd === 'pay' || cmd === 'give') {
            const target = await resolveMember(message, args[0]);
            if (!target || target.id === userId) return fastReply(message, { embeds: [makeEmbed('Pay Usage 💸', `\`${PREFIX}pay <@user> <amount>\``, COLORS.PRIMARY)] });

            const amount = parseInt(args[1], 10);
            if (isNaN(amount) || amount <= 0) return fastReply(message, { embeds: [makeEmbed('Invalid Amount ❌', 'Please specify a valid amount greater than 0!', COLORS.DANGER)] });

            const currentBal = eco.getBalance(userId);
            if (amount > currentBal) return fastReply(message, { embeds: [makeEmbed('Insufficient Funds ❌', `You only have **${eco.formatMoney(currentBal)}**.`, COLORS.DANGER)] });

            eco.transferBalance(userId, target.id, amount);
            const embed = new EmbedBuilder()
                .setColor(COLORS.EMERALD)
                .setAuthor({ name: 'TRANSACTION COMPLETED 💸' })
                .setDescription(
                    `Transferred **${eco.formatMoney(amount)}** from <@${userId}> to <@${target.id}>.\n` +
                    `💵 **Your Remaining Vault:** \`${eco.formatMoney(eco.getBalance(userId))}\``
                )
                .setTimestamp();

            return fastReply(message, { embeds: [embed] });
        }

        if (cmd === 'rob' || cmd === 'steal') {
            const target = await resolveMember(message, args[0]);
            if (!target) {
                return fastReply(message, {
                    embeds: [makeEmbed('Robbery Target Required 🕵️', `\`${PREFIX}rob <@user>\`\nExample: \`${PREFIX}rob @user\``, COLORS.PRIMARY)]
                });
            }

            if (target.id === userId) {
                return fastReply(message, {
                    embeds: [makeEmbed('Invalid Target ❌', 'You cannot rob yourself!', COLORS.DANGER)]
                });
            }

            if (target.user.bot) {
                return fastReply(message, {
                    embeds: [makeEmbed('Invalid Target 🤖', 'You cannot rob casino bot dealers!', COLORS.DANGER)]
                });
            }

            const robberEco = eco.getUser(userId);
            const victimEco = eco.getUser(target.id);
            const now = Date.now();

            // Robber cooldown: 30 minutes
            const robCooldown = 30 * 60 * 1000;
            if (now - (robberEco.lastRob || 0) < robCooldown) {
                const remaining = robCooldown - (now - robberEco.lastRob);
                const minutes = Math.floor(remaining / (60 * 1000));
                const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
                return fastReply(message, {
                    embeds: [makeEmbed('Laying Low ⏳', `The police and casino security are on alert! You must lay low for **${minutes}m ${seconds}s** before attempting another heist.`, COLORS.WARNING, '🚨')]
                });
            }

            // Minimum robber balance: must have at least $300 to pay compensation/bail if caught
            const minRobberBal = 300;
            if (robberEco.balance < minRobberBal) {
                return fastReply(message, {
                    embeds: [makeEmbed('Too Broke to Heist ❌', `You need at least **${eco.formatMoney(minRobberBal)}** in your vault to cover bail if you get caught by casino security!`, COLORS.DANGER, '👮')]
                });
            }

            // Minimum victim balance: at least $300 worth robbing
            const minVictimBal = 300;
            if (victimEco.balance < minVictimBal) {
                return fastReply(message, {
                    embeds: [makeEmbed('Pockets Empty 💨', `<@${target.id}> doesn't have enough cash worth robbing (minimum **${eco.formatMoney(minVictimBal)}**)!`, COLORS.WARNING, '👛')]
                });
            }

            // Victim robbery immunity protection: 15 minutes
            const victimProtection = 15 * 60 * 1000;
            if (now - (victimEco.lastRobbed || 0) < victimProtection) {
                const rem = victimProtection - (now - victimEco.lastRobbed);
                const mins = Math.ceil(rem / (60 * 1000));
                return fastReply(message, {
                    embeds: [makeEmbed('Target Under Police Guard 🛡️', `<@${target.id}> was recently robbed and is currently under VIP casino security escort for another **${mins}m**!`, COLORS.WARNING, '🛡️')]
                });
            }

            // Mark robber attempt timestamp
            robberEco.lastRob = now;

            // Success odds: 45% success rate (fair high-stakes heist)
            const success = Math.random() < 0.45;

            if (success) {
                victimEco.lastRobbed = now;
                // Steal between 20% and 45% of victim's cash (capped at $3,500)
                const percent = (Math.floor(Math.random() * 26) + 20) / 100;
                let stolen = Math.floor(victimEco.balance * percent);
                stolen = Math.min(stolen, 3500);
                stolen = Math.max(stolen, 150);

                eco.transferBalance(target.id, userId, stolen);

                const heistStories = [
                    `You silently pickpocketed their platinum wallet outside the VIP salon!`,
                    `You slipped a pair of loaded dice onto their table and grabbed their chip stack!`,
                    `You snuck into their penthouse suite and cracked their mini-safe!`,
                    `You distracted them at the roulette table and snatched their designer briefcase!`
                ];
                const story = heistStories[Math.floor(Math.random() * heistStories.length)];

                const embed = new EmbedBuilder()
                    .setColor(COLORS.EMERALD)
                    .setAuthor({ name: `${message.author.username.toUpperCase()}'S CASINO HEIST 💰`, iconURL: message.author.displayAvatarURL() })
                    .setTitle('🎉 HEIST SUCCESSFUL! CASH ESCAPED')
                    .setDescription(
                        `\`\`\`ansi\n` +
                        `\u001b[1;30m╭────────────────────────────────────────╮\u001b[0m\n` +
                        `\u001b[1;32m  💰 LOOT STOLEN:  +${eco.formatMoney(stolen).padEnd(20)}\u001b[0m\n` +
                        `\u001b[1;37m  🎯 VICTIM:       ${target.user.username.padEnd(22)}\u001b[0m\n` +
                        `\u001b[1;30m╰────────────────────────────────────────╯\u001b[0m\n` +
                        `\`\`\`\n` +
                        `🕵️ **Heist Details:** ${story}\n\n` +
                        `💵 **Your New Vault:** \`${eco.formatMoney(robberEco.balance)}\`\n` +
                        `📉 **Victim Remaining:** \`${eco.formatMoney(victimEco.balance)}\``
                    )
                    .setFooter({ text: 'Target is now immune for 15 minutes • Lay low for 30 minutes' })
                    .setTimestamp();

                return fastReply(message, { embeds: [embed] });
            } else {
                // Caught! Penalty fine paid directly to the victim
                const finePercent = (Math.floor(Math.random() * 20) + 15) / 100; // 15% - 35% fine
                let fine = Math.floor(robberEco.balance * finePercent);
                fine = Math.min(fine, 2500);
                fine = Math.max(fine, 200);

                eco.transferBalance(userId, target.id, fine);

                const bustStories = [
                    `Casino security tackled you in the lobby before you reached the exit!`,
                    `The laser security alarm tripped and the Pit Boss caught you red-handed!`,
                    `The victim noticed your hand in their coat pocket and summoned the bouncers!`,
                    `Facial recognition cameras flagged you and guards surrounded you on the floor!`
                ];
                const story = bustStories[Math.floor(Math.random() * bustStories.length)];

                const embed = new EmbedBuilder()
                    .setColor(COLORS.RUBY)
                    .setAuthor({ name: `${message.author.username.toUpperCase()}'S FAILED HEIST 🚨`, iconURL: message.author.displayAvatarURL() })
                    .setTitle('💀 BUSTED BY CASINO SECURITY!')
                    .setDescription(
                        `\`\`\`ansi\n` +
                        `\u001b[1;30m╭────────────────────────────────────────╮\u001b[0m\n` +
                        `\u001b[1;31m  🚨 PENALTY PAID: -${eco.formatMoney(fine).padEnd(20)}\u001b[0m\n` +
                        `\u001b[1;37m  👮 SECURITY:     APPREHENDED & FINED  \u001b[0m\n` +
                        `\u001b[1;30m╰────────────────────────────────────────╯\u001b[0m\n` +
                        `\`\`\`\n` +
                        `🚨 **Incident Report:** ${story}\n` +
                        `You were fined **${eco.formatMoney(fine)}**, which was awarded directly to <@${target.id}> as compensation!\n\n` +
                        `💵 **Your Vault Balance:** \`${eco.formatMoney(robberEco.balance)}\`\n` +
                        `🏦 **Victim Vault Balance:** \`${eco.formatMoney(victimEco.balance)}\``
                    )
                    .setFooter({ text: 'Crime doesn\'t always pay • Lay low for 30 minutes' })
                    .setTimestamp();

                return fastReply(message, { embeds: [embed] });
            }
        }

        if (cmd === 'leaderboard' || cmd === 'lb' || cmd === 'top') {
            const top = eco.getLeaderboard(10);
            let desc = '';
            top.forEach((item, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `\`#${(index + 1).toString().padStart(2, '0')}\``;
                const tier = getTier(item.balance);
                desc += `${medal} <@${item.id}> • **${eco.formatMoney(item.balance)}** [${tier}]\n`;
            });

            const embed = new EmbedBuilder()
                .setColor(COLORS.GOLD)
                .setAuthor({ name: `${message.guild.name} • Wealth Hall of Fame 🏆` })
                .setTitle('👑 High-Roller Server Leaderboard')
                .setDescription(desc || '*No registered casino balances yet!*')
                .setFooter({ text: 'Top 10 High Rollers' })
                .setTimestamp();

            return fastReply(message, { embeds: [embed] });
        }

        // ----------------- MUSIC COMMANDS -----------------
        if (cmd === 'play' || cmd === 'p') {
            if (!voiceChannel) {
                return fastReply(message, { embeds: [makeEmbed('Voice Channel Required', 'You must be connected to a voice channel to play music!', COLORS.WARNING, '⚠️')] });
            }
            const permissions = voiceChannel.permissionsFor(message.guild.members.me);
            if (permissions && (!permissions.has(PermissionsBitField.Flags.Connect) || !permissions.has(PermissionsBitField.Flags.Speak))) {
                return fastReply(message, { embeds: [makeEmbed('Permission Denied ⛔', 'I need **Connect** and **Speak** permissions in your voice channel to play music!', COLORS.DANGER)] });
            }
            const query = args.join(' ');
            if (!query) {
                return fastReply(message, { embeds: [makeEmbed('Missing Song Name or URL', `Usage: \`${PREFIX}play <song title or URL>\`\nSupports YouTube, Spotify, SoundCloud, and direct audio files.`, COLORS.WARNING, '🔎')] });
            }

            // Instant feedback (<50ms) so user never feels lag while searching
            const statusMsg = await fastReply(message, { embeds: [makeEmbed('Searching Track 🔎', `Searching for: **${query}**...`, COLORS.MUSIC)] });

            try {
                await distube.play(voiceChannel, query, {
                    message,
                    textChannel: message.channel,
                    member: message.member
                });
                if (statusMsg && statusMsg.deletable) {
                    statusMsg.delete().catch(() => {});
                }
            } catch (err) {
                console.error('[PLAY ERROR]', err);
                const errMsg = err.message || err.toString();
                if (statusMsg) {
                    statusMsg.edit({ embeds: [makeEmbed('Playback Failed', `\`${errMsg}\``, COLORS.DANGER, '❌')] }).catch(() => {});
                } else {
                    fastReply(message, { embeds: [makeEmbed('Playback Failed', `\`${errMsg}\``, COLORS.DANGER, '❌')] });
                }
            }
            return;
        }

        if (cmd === 'skip' || cmd === 's' || cmd === 'next') {
            const queue = distube.getQueue(message);
            if (!queue) {
                return fastReply(message, { embeds: [makeEmbed('No Music Playing', 'There is no active music queue to skip!', COLORS.WARNING, '⚠️')] });
            }
            try {
                const song = await queue.skip();
                return fastReply(message, { embeds: [makeEmbed('Track Skipped', `Now playing: **${song.name}**`, COLORS.SUCCESS, '⏭️')] });
            } catch (_) {
                queue.stop();
                return fastReply(message, { embeds: [makeEmbed('Queue Ended', 'No more tracks in queue. Playback stopped.', COLORS.PRIMARY, '⏹️')] });
            }
        }

        if (cmd === 'stop' || cmd === 'leave' || cmd === 'dc') {
            const queue = distube.getQueue(message);
            if (!queue) {
                return fastReply(message, { embeds: [makeEmbed('No Music Playing', 'There is no active music session to stop.', COLORS.WARNING, '⚠️')] });
            }
            queue.stop();
            distube.voices.leave(message);
            return fastReply(message, { embeds: [makeEmbed('Playback Stopped', 'Queue cleared and left voice channel.', COLORS.PRIMARY, '⏹️')] });
        }

        if (cmd === 'pause') {
            const queue = distube.getQueue(message);
            if (!queue) return fastReply(message, { embeds: [makeEmbed('No Music Playing', 'No active track to pause.', COLORS.WARNING, '⚠️')] });
            if (queue.paused) return fastReply(message, { embeds: [makeEmbed('Already Paused', 'Audio is already paused!', COLORS.WARNING, '⏸️')] });

            queue.pause();
            return fastReply(message, { embeds: [makeEmbed('Audio Paused', `Type \`${PREFIX}resume\` to continue playback.`, COLORS.SUCCESS, '⏸️')] });
        }

        if (cmd === 'resume' || cmd === 'unpause') {
            const queue = distube.getQueue(message);
            if (!queue) return fastReply(message, { embeds: [makeEmbed('No Music Playing', 'No active track to resume.', COLORS.WARNING, '⚠️')] });
            if (!queue.paused) return fastReply(message, { embeds: [makeEmbed('Not Paused', 'Music is currently playing.', COLORS.WARNING, '▶️')] });

            queue.resume();
            return fastReply(message, { embeds: [makeEmbed('Audio Resumed', 'Playback has resumed.', COLORS.SUCCESS, '▶️')] });
        }

        if (cmd === 'queue' || cmd === 'q') {
            const queue = distube.getQueue(message);
            if (!queue || !queue.songs.length) {
                return fastReply(message, { embeds: [makeEmbed('Queue Empty', 'There are no songs in queue.', COLORS.PRIMARY, '📑')] });
            }

            const current = queue.songs[0];
            const upcoming = queue.songs.slice(1, 11).map((s, idx) => `**#${idx + 1}** [${s.name}](${s.url}) — \`${s.formattedDuration}\``).join('\n');

            const embed = new EmbedBuilder()
                .setColor(COLORS.MUSIC)
                .setTitle(`🎶 Music Queue (${queue.songs.length} song${queue.songs.length > 1 ? 's' : ''})`)
                .setDescription(`**Now Playing:**\n[${current.name}](${current.url}) — \`${current.formattedDuration}\` (Requested by <@${current.user.id}>)\n\n**Upcoming:**\n${upcoming || '*No more tracks queued.*'}`)
                .setFooter({ text: `Total Duration: ${queue.formattedDuration} | Volume: ${queue.volume}%` })
                .setTimestamp();

            return fastReply(message, { embeds: [embed] });
        }

        if (cmd === 'nowplaying' || cmd === 'np') {
            const queue = distube.getQueue(message);
            if (!queue || !queue.songs[0]) {
                return fastReply(message, { embeds: [makeEmbed('Nothing Playing', 'No song is currently playing.', COLORS.WARNING, '⚠️')] });
            }

            const song = queue.songs[0];
            const progress = Math.min(100, Math.floor((queue.currentTime / song.duration) * 100)) || 0;
            const totalBars = 16;
            const filledBars = Math.round((progress / 100) * totalBars);
            const bar = '▬'.repeat(filledBars) + '🔘' + '▬'.repeat(Math.max(0, totalBars - filledBars));

            const embed = new EmbedBuilder()
                .setColor(COLORS.MUSIC)
                .setAuthor({ name: 'NOW PLAYING 🎵' })
                .setTitle(song.name)
                .setURL(song.url)
                .setThumbnail(song.thumbnail)
                .setDescription(`\`${queue.formattedCurrentTime}\` ${bar} \`${song.formattedDuration}\``)
                .addFields(
                    { name: '👤 Requester', value: `<@${song.user.id}>`, inline: true },
                    { name: '🔊 Volume', value: `\`${queue.volume}%\``, inline: true },
                    { name: '🔄 Loop', value: `\`${queue.repeatMode ? (queue.repeatMode === 2 ? 'Queue' : 'Song') : 'Off'}\``, inline: true }
                )
                .setTimestamp();

            return fastReply(message, { embeds: [embed] });
        }

        if (cmd === 'volume' || cmd === 'vol' || cmd === 'v') {
            const queue = distube.getQueue(message);
            if (!queue) return fastReply(message, { embeds: [makeEmbed('No Music Playing', 'No active music queue to change volume.', COLORS.WARNING, '⚠️')] });

            const vol = parseInt(args[0], 10);
            if (isNaN(vol) || vol < 1 || vol > 100) {
                return fastReply(message, { embeds: [makeEmbed('Invalid Volume', `Usage: \`${PREFIX}volume <1-100>\`\nCurrent volume: **${queue.volume}%**`, COLORS.WARNING, '🔊')] });
            }

            queue.setVolume(vol);
            return fastReply(message, { embeds: [makeEmbed('Volume Adjusted', `Volume set to **${vol}%**`, COLORS.SUCCESS, '🔊')] });
        }

        if (cmd === 'loop') {
            const queue = distube.getQueue(message);
            if (!queue) return fastReply(message, { embeds: [makeEmbed('No Music Playing', 'No active queue to loop.', COLORS.WARNING, '⚠️')] });

            let mode = args[0]?.toLowerCase();
            let loopNum = 0;
            if (mode === 'song' || mode === 'track' || mode === '1') loopNum = 1;
            else if (mode === 'queue' || mode === 'all' || mode === '2') loopNum = 2;
            else if (mode === 'off' || mode === '0') loopNum = 0;
            else loopNum = (queue.repeatMode + 1) % 3;

            queue.setRepeatMode(loopNum);
            const modeName = loopNum === 1 ? 'Song (Repeat Current)' : loopNum === 2 ? 'Queue (Repeat All)' : 'Disabled';
            return fastReply(message, { embeds: [makeEmbed('Loop Mode Updated', `Repeat mode is now: **${modeName}**`, COLORS.SUCCESS, '🔄')] });
        }

        if (cmd === 'shuffle' || cmd === 'shuff') {
            const queue = distube.getQueue(message);
            if (!queue || queue.songs.length <= 1) {
                return fastReply(message, { embeds: [makeEmbed('Cannot Shuffle', 'Not enough songs in the queue to shuffle.', COLORS.WARNING, '🔀')] });
            }

            queue.shuffle();
            return fastReply(message, { embeds: [makeEmbed('Queue Shuffled', `Shuffled **${queue.songs.length - 1}** upcoming songs!`, COLORS.SUCCESS, '🔀')] });
        }

        // ----------------- MODERATION COMMANDS -----------------
        if (cmd === 'kick') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
                return fastReply(message, { embeds: [makeEmbed('Permission Denied', 'You lack permission to kick members.', COLORS.DANGER, '⛔')] });
            }

            const target = await resolveMember(message, args[0]);
            if (!target) return fastReply(message, { embeds: [makeEmbed('Kick Usage', `\`${PREFIX}kick <@user|ID> [reason]\``, COLORS.PRIMARY, '👢')] });
            if (!target.kickable) return fastReply(message, { embeds: [makeEmbed('Cannot Kick', 'Target has higher or equal permissions than the bot.', COLORS.DANGER, '❌')] });

            const reason = args.slice(1).join(' ') || 'No reason provided';
            try { await target.send(`You were kicked from **${message.guild.name}** | Reason: ${reason}`); } catch (_) {}
            await target.kick(`${message.author.tag}: ${reason}`);

            return fastReply(message, {
                embeds: [makeEmbed('Member Kicked 👢', `**User:** <@${target.id}>\n**Moderator:** <@${message.author.id}>\n**Reason:** ${reason}`, COLORS.DANGER)]
            });
        }

        if (cmd === 'ban') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
                return fastReply(message, { embeds: [makeEmbed('Permission Denied', 'You lack permission to ban members.', COLORS.DANGER, '⛔')] });
            }

            const target = await resolveMember(message, args[0]);
            const targetId = target?.id || args[0]?.replace(/[<@!>]/g, '');

            if (!targetId || !/^\d{17,20}$/.test(targetId)) {
                return fastReply(message, { embeds: [makeEmbed('Ban Usage', `\`${PREFIX}ban <@user|ID> [reason]\``, COLORS.PRIMARY, '🔨')] });
            }
            if (target && !target.bannable) {
                return fastReply(message, { embeds: [makeEmbed('Cannot Ban', 'Target has higher or equal permissions than the bot.', COLORS.DANGER, '❌')] });
            }

            const reason = args.slice(1).join(' ') || 'No reason provided';
            if (target) {
                try { await target.send(`You were banned from **${message.guild.name}** | Reason: ${reason}`); } catch (_) {}
            }

            await message.guild.bans.create(targetId, { reason: `${message.author.tag}: ${reason}` });

            return fastReply(message, {
                embeds: [makeEmbed('Member Banned 🔨', `**User:** <@${targetId}>\n**Moderator:** <@${message.author.id}>\n**Reason:** ${reason}`, COLORS.DANGER)]
            });
        }

        if (cmd === 'hardban' || cmd === 'forceban') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
                return fastReply(message, { embeds: [makeEmbed('Permission Denied', 'You lack permission to hard-ban members.', COLORS.DANGER, '⛔')] });
            }

            const target = await resolveMember(message, args[0]);
            const targetId = target?.id || args[0]?.replace(/[<@!>]/g, '');

            if (!targetId || !/^\d{17,20}$/.test(targetId)) {
                return fastReply(message, { embeds: [makeEmbed('Hardban Usage', `\`${PREFIX}hardban <@user|ID> [reason]\``, COLORS.PRIMARY, '🚫')] });
            }
            if (target && !target.bannable) {
                return fastReply(message, { embeds: [makeEmbed('Cannot Hardban', 'Target has higher or equal permissions than the bot.', COLORS.DANGER, '❌')] });
            }

            const reason = args.slice(1).join(' ') || 'Violating server rules';
            const userObj = target?.user || await client.users.fetch(targetId).catch(() => null);

            // Record in Alt Shield fingerprint database
            if (userObj) {
                altshield.recordHardban(userObj, message.author.id, reason);
            }

            if (target) {
                try {
                    await target.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(COLORS.RUBY)
                                .setTitle(`🚫 Permanent Hardban & Alt Blacklist Notice`)
                                .setDescription(`You have been **permanently hard-banned** from **${message.guild.name}**.\n\n**Reason:** ${reason}\n**Message Action:** All messages from the past 7 days have been purged.\n**Alt Shield:** All associated alts and new accounts are permanently blacklisted from entering this server.`)
                                .setTimestamp()
                        ]
                    });
                } catch (_) {}
            }

            // deleteMessageSeconds: 604800 (wipes all messages from the past 7 days across all channels)
            await message.guild.bans.create(targetId, {
                deleteMessageSeconds: 604800,
                reason: `[HARDBAN] ${message.author.tag}: ${reason}`
            });

            // Scan current guild members for any alts already present in the server
            const caughtAlts = [];
            for (const [mid, m] of message.guild.members.cache) {
                if (mid !== targetId && !m.user.bot && m.bannable) {
                    const check = altshield.checkMemberIsAlt(m);
                    if (check.isAlt && check.original?.id === targetId) {
                        try {
                            await message.guild.bans.create(mid, {
                                deleteMessageSeconds: 604800,
                                reason: `[ALT SHIELD AUTO-BAN] Detected alt of hardbanned user ${userObj?.username || targetId}`
                            });
                            caughtAlts.push(`<@${mid}> (\`${m.user.tag}\`)`);
                        } catch (_) {}
                    }
                }
            }

            const embed = new EmbedBuilder()
                .setColor(COLORS.RUBY)
                .setAuthor({ name: 'PERMANENT HARDBAN & ALT SHIELD ACTIVE 🚫', iconURL: message.guild.iconURL() })
                .setDescription(
                    `\`\`\`ansi\n` +
                    `\u001b[1;31m╔════════════════════════════════════════╗\u001b[0m\n` +
                    `\u001b[1;31m║    PERMANENT HARDBAN & ALT SHIELD      ║\u001b[0m\n` +
                    `\u001b[1;31m╚════════════════════════════════════════╝\u001b[0m\n` +
                    `\`\`\`\n` +
                    `👤 **Hardbanned User:** <@${targetId}> \`(${targetId})\`\n` +
                    `🛡️ **Moderator:** <@${message.author.id}>\n` +
                    `🗑️ **Message Purge:** Past 7 days (604,800s) deleted across all channels\n` +
                    `👁️ **Alt Shield Status:** \`ACTIVATED\` *(48h high-alert watchdog for avatar, name patterns, & fresh accounts)*\n` +
                    (caughtAlts.length > 0 ? `🚨 **Collateral Alts Banned:** ${caughtAlts.join(', ')}\n` : '') +
                    `📝 **Reason:** ${reason}`
                )
                .setFooter({ text: 'Alt Shield will auto-ban any alts or fresh accounts attempting to join' })
                .setTimestamp();

            return fastReply(message, { embeds: [embed] });
        }

        if (cmd === 'linkalt' || cmd === 'addalt') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
                return fastReply(message, { embeds: [makeEmbed('Permission Denied', 'You lack permission to manage bans.', COLORS.DANGER, '⛔')] });
            }

            const mainId = args[0]?.replace(/[<@!>]/g, '');
            const altId = args[1]?.replace(/[<@!>]/g, '');
            if (!mainId || !altId || !/^\d{17,20}$/.test(mainId) || !/^\d{17,20}$/.test(altId)) {
                return fastReply(message, { embeds: [makeEmbed('Link Alt Usage 🔗', `\`${PREFIX}linkalt <hardbannedID> <altID>\`\nExample: \`${PREFIX}linkalt 123456789 987654321\``, COLORS.PRIMARY)] });
            }

            const linked = altshield.linkAlt(mainId, altId);
            if (!linked) {
                return fastReply(message, { embeds: [makeEmbed('Record Not Found ⚠️', `User ID \`${mainId}\` is not in the hardban registry. Hardban them first with \`${PREFIX}hardban\` or check the ID.`, COLORS.WARNING)] });
            }

            // If the alt is currently in the server, auto-ban immediately
            const altMember = message.guild.members.cache.get(altId);
            if (altMember && altMember.bannable) {
                await message.guild.bans.create(altId, {
                    deleteMessageSeconds: 604800,
                    reason: `[LINKED ALT AUTO-BAN] Linked to hardbanned user ${mainId}`
                }).catch(() => {});
            }

            return fastReply(message, {
                embeds: [makeEmbed('Alt Linked & Blacklisted 🛡️', `Alt ID \`${altId}\` is now permanently linked to hardbanned record \`${mainId}\`.\nThis account is permanently banned and blocked from ever joining this server!`, COLORS.SUCCESS)]
            });
        }

        if (cmd === 'unban') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
                return fastReply(message, { embeds: [makeEmbed('Permission Denied', 'You lack permission to unban members.', COLORS.DANGER, '⛔')] });
            }

            const targetId = args[0]?.replace(/[<@!>]/g, '');
            if (!targetId || !/^\d{17,20}$/.test(targetId)) {
                return fastReply(message, { embeds: [makeEmbed('Unban Usage', `\`${PREFIX}unban <userID> [reason]\``, COLORS.PRIMARY, '🔓')] });
            }

            const reason = args.slice(1).join(' ') || 'No reason provided';
            try {
                await message.guild.bans.remove(targetId, `${message.author.tag}: ${reason}`);
                return fastReply(message, {
                    embeds: [makeEmbed('Ban Revoked 🔓', `Successfully unbanned user ID: \`${targetId}\`\n**Reason:** ${reason}`, COLORS.SUCCESS)]
                });
            } catch (err) {
                return fastReply(message, { embeds: [makeEmbed('Unban Failed', `\`${err.message || err}\``, COLORS.DANGER, '❌')] });
            }
        }

        if (cmd === 'timeout' || cmd === 'mute' || cmd === 'to') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                return fastReply(message, { embeds: [makeEmbed('Permission Denied', 'You lack permission to timeout members.', COLORS.DANGER, '⛔')] });
            }

            const target = await resolveMember(message, args[0]);
            if (!target) return fastReply(message, { embeds: [makeEmbed('Timeout Usage', `\`${PREFIX}timeout <@user|ID> <duration> [reason]\`\nExample: \`${PREFIX}timeout @user 10m Spamming\``, COLORS.PRIMARY, '🔇')] });

            const durationStr = args[1];
            const durationMs = parseDuration(durationStr);
            if (!durationMs || durationMs < 5000 || durationMs > 28 * 24 * 60 * 60 * 1000) {
                return fastReply(message, { embeds: [makeEmbed('Invalid Duration', 'Duration must be between 5 seconds and 28 days (e.g. `10m`, `1h`, `1d`).', COLORS.WARNING, '⏳')] });
            }

            const reason = args.slice(2).join(' ') || 'No reason provided';
            try {
                await target.timeout(durationMs, `${message.author.tag}: ${reason}`);
                return fastReply(message, {
                    embeds: [makeEmbed('Member Timed Out 🔇', `**User:** <@${target.id}>\n**Moderator:** <@${message.author.id}>\n**Duration:** \`${durationStr}\`\n**Reason:** ${reason}`, COLORS.WARNING)]
                });
            } catch (err) {
                return fastReply(message, { embeds: [makeEmbed('Timeout Failed', `\`${err.message || err}\``, COLORS.DANGER, '❌')] });
            }
        }

        if (cmd === 'untimeout' || cmd === 'unmute') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                return fastReply(message, { embeds: [makeEmbed('Permission Denied', 'You lack permission to remove timeouts.', COLORS.DANGER, '⛔')] });
            }

            const target = await resolveMember(message, args[0]);
            if (!target) return fastReply(message, { embeds: [makeEmbed('Untimeout Usage', `\`${PREFIX}untimeout <@user|ID>\``, COLORS.PRIMARY, '🔊')] });

            try {
                await target.timeout(null, `Timeout removed by ${message.author.tag}`);
                return fastReply(message, {
                    embeds: [makeEmbed('Timeout Removed 🔊', `Restored speak permissions for <@${target.id}>.`, COLORS.SUCCESS)]
                });
            } catch (err) {
                return fastReply(message, { embeds: [makeEmbed('Untimeout Failed', `\`${err.message || err}\``, COLORS.DANGER, '❌')] });
            }
        }

        if (cmd === 'purge' || cmd === 'clear') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return fastReply(message, { embeds: [makeEmbed('Permission Denied', 'You lack permission to manage messages.', COLORS.DANGER, '⛔')] });
            }

            const amount = parseInt(args[0], 10);
            if (isNaN(amount) || amount < 1 || amount > 100) {
                return fastReply(message, { embeds: [makeEmbed('Purge Usage', `\`${PREFIX}purge <1-100>\``, COLORS.PRIMARY, '🧹')] });
            }

            try {
                const toDelete = Math.min(amount + 1, 100);
                const deleted = await message.channel.bulkDelete(toDelete, true);
                const confirmation = await message.channel.send({
                    embeds: [makeEmbed('Messages Purged 🧹', `Deleted **${deleted.size - 1}** messages.`, COLORS.SUCCESS)]
                });
                setTimeout(() => confirmation.delete().catch(() => {}), 3000);
            } catch (err) {
                return fastReply(message, { embeds: [makeEmbed('Purge Failed', `\`${err.message || err}\``, COLORS.DANGER, '❌')] });
            }
            return;
        }

        if (cmd === 'warn') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                return fastReply(message, { embeds: [makeEmbed('Permission Denied', 'You lack permission to warn members.', COLORS.DANGER, '⛔')] });
            }

            const target = await resolveMember(message, args[0]);
            if (!target) return fastReply(message, { embeds: [makeEmbed('Warn Usage', `\`${PREFIX}warn <@user|ID> [reason]\``, COLORS.PRIMARY, '⚠️')] });

            const reason = args.slice(1).join(' ') || 'No reason provided';
            eco.addWarning(target.id, message.author.id, reason);
            const totalWarns = eco.getWarnings(target.id).length;

            try {
                await target.send(`⚠️ You received a formal strike in **${message.guild.name}**\n**Reason:** ${reason}\n**Total Strikes:** ${totalWarns}`);
            } catch (_) {}

            return fastReply(message, {
                embeds: [makeEmbed('Member Warned ⚠️', `**User:** <@${target.id}>\n**Moderator:** <@${message.author.id}>\n**Reason:** ${reason}\n**Total Strikes:** ${totalWarns}`, COLORS.WARNING)]
            });
        }

        if (cmd === 'warnings' || cmd === 'warns') {
            const target = (await resolveMember(message, args[0])) || message.member;
            const warns = eco.getWarnings(target.id);

            if (!warns.length) {
                return fastReply(message, { embeds: [makeEmbed('Clean Record ✨', `<@${target.id}> has 0 recorded strikes.`, COLORS.SUCCESS)] });
            }

            const list = warns.slice(-10).map((w, idx) => `**#${w.id || idx + 1}** — *${w.reason}* (by <@${w.moderator}> on ${new Date(w.timestamp).toLocaleDateString()})`).join('\n');

            const embed = new EmbedBuilder()
                .setColor(COLORS.WARNING)
                .setTitle(`Strike History • ${target.user.username}`)
                .setDescription(`**Total Violations:** ${warns.length}\n\n${list}`)
                .setTimestamp();

            return fastReply(message, { embeds: [embed] });
        }

        if (cmd === 'clearwarns' || cmd === 'cw') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                return fastReply(message, { embeds: [makeEmbed('Permission Denied', 'You lack permission to clear warnings.', COLORS.DANGER, '⛔')] });
            }

            const target = await resolveMember(message, args[0]);
            if (!target) return fastReply(message, { embeds: [makeEmbed('Clearwarns Usage', `\`${PREFIX}clearwarns <@user|ID>\``, COLORS.PRIMARY, '✨')] });

            eco.clearWarnings(target.id);
            return fastReply(message, {
                embeds: [makeEmbed('Record Cleared ✨', `Wiped all strikes for <@${target.id}>.`, COLORS.SUCCESS)]
            });
        }

        // ----------------- TICKET SYSTEM COMMANDS -----------------
        if (cmd === 'openapps' || cmd === 'closeapps' || cmd === 'toggleapps') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild) && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return fastReply(message, { embeds: [makeEmbed('Permission Denied', 'You need `Manage Server` permission to toggle staff applications.', COLORS.DANGER, '⛔')] });
            }

            const newState = cmd === 'openapps' ? true : cmd === 'closeapps' ? false : !tickets.areAppsOpen();
            tickets.setAppsOpen(newState);

            const statusText = newState
                ? '🟢 **Staff Applications are now OPEN!**\nMembers can click **Apply for Staff** on the ticket panel to submit an application.'
                : '🔴 **Staff Applications are now CLOSED.**\nThe application button on the ticket panel will alert members that applications are currently closed.';

            return fastReply(message, {
                embeds: [makeEmbed(newState ? 'Applications Opened 📝' : 'Applications Closed 🔒', statusText, newState ? COLORS.SUCCESS : COLORS.WARNING)]
            });
        }

        if (cmd === 'ticketpanel' || cmd === 'ticketsetup') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild) && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return fastReply(message, { embeds: [makeEmbed('Permission Denied', 'You need `Manage Server` permission to setup the ticket panel.', COLORS.DANGER, '⛔')] });
            }

            const targetChannel = message.mentions.channels.first() || message.channel;

            const panelEmbed = new EmbedBuilder()
                .setColor(COLORS.PRIMARY)
                .setAuthor({ name: `/bounded • Support & Staff Portal`, iconURL: client.user.displayAvatarURL() })
                .setTitle('📩 Open a Ticket or Apply for Staff')
                .setDescription(
                    `Welcome to the **/bounded** support hub. Select the relevant option below:\n\n` +
                    `🎫 **Support Ticket:** Need assistance, report an issue, or speak to staff.\n` +
                    `📝 **Staff Application:** Submit an application to join our moderation staff team.\n\n` +
                    `📌 *Please only open one ticket at a time. Misuse may result in moderation actions.*`
                )
                .setFooter({ text: '/bounded Automated Portal • Click buttons below' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_create')
                    .setLabel('Open Support Ticket')
                    .setEmoji('🎫')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('ticket_create_app')
                    .setLabel('Apply for Staff')
                    .setEmoji('📝')
                    .setStyle(ButtonStyle.Success)
            );

            await targetChannel.send({
                embeds: [panelEmbed],
                components: [row]
            });

            if (targetChannel.id !== message.channel.id) {
                return fastReply(message, {
                    embeds: [makeEmbed('Ticket Panel Deployed ✅', `Portal panel has been posted in <#${targetChannel.id}>.`, COLORS.SUCCESS)]
                });
            }
            return;
        }

        if (cmd === 'close') {
            const ticketInfo = tickets.getTicket(message.channel.id);
            if (!ticketInfo) {
                return fastReply(message, { embeds: [makeEmbed('Not a Ticket ⚠️', 'This command can only be used inside an active ticket channel.', COLORS.WARNING)] });
            }

            const reason = args.join(' ') || 'No reason specified';

            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_confirm_close')
                    .setLabel('Yes, Close & Delete')
                    .setEmoji('🗑️')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('ticket_cancel_close')
                    .setLabel('Cancel')
                    .setEmoji('✖️')
                    .setStyle(ButtonStyle.Secondary)
            );

            const confirmEmbed = new EmbedBuilder()
                .setColor(COLORS.WARNING)
                .setTitle('🔒 Close Ticket Confirmation')
                .setDescription(`Are you sure you want to close this ticket?\n**Reason:** ${reason}`)
                .setFooter({ text: `Requested by ${message.author.tag}` });

            return fastReply(message, {
                embeds: [confirmEmbed],
                components: [confirmRow]
            });
        }

        if (cmd === 'add' || cmd === 'ticketadd') {
            const ticketInfo = tickets.getTicket(message.channel.id);
            if (!ticketInfo) {
                return fastReply(message, { embeds: [makeEmbed('Not a Ticket ⚠️', 'This command can only be used inside an active ticket channel.', COLORS.WARNING)] });
            }

            const target = await resolveMember(message, args[0]);
            if (!target) {
                return fastReply(message, { embeds: [makeEmbed('Usage', `\`${PREFIX}add <@user|ID>\``, COLORS.PRIMARY, 'ℹ️')] });
            }

            await message.channel.permissionOverwrites.edit(target.id, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                AttachFiles: true,
                EmbedLinks: true
            });

            return fastReply(message, {
                embeds: [makeEmbed('User Added 👥', `Added <@${target.id}> to this ticket channel.`, COLORS.SUCCESS)]
            });
        }

        if (cmd === 'remove' || cmd === 'ticketremove') {
            const ticketInfo = tickets.getTicket(message.channel.id);
            if (!ticketInfo) {
                return fastReply(message, { embeds: [makeEmbed('Not a Ticket ⚠️', 'This command can only be used inside an active ticket channel.', COLORS.WARNING)] });
            }

            const target = await resolveMember(message, args[0]);
            if (!target) {
                return fastReply(message, { embeds: [makeEmbed('Usage', `\`${PREFIX}remove <@user|ID>\``, COLORS.PRIMARY, 'ℹ️')] });
            }

            if (target.id === ticketInfo.userId) {
                return fastReply(message, { embeds: [makeEmbed('Action Denied ⚠️', 'You cannot remove the ticket creator from their own ticket.', COLORS.WARNING)] });
            }

            await message.channel.permissionOverwrites.delete(target.id).catch(() => {});

            return fastReply(message, {
                embeds: [makeEmbed('User Removed 👤', `Removed <@${target.id}> from this ticket channel.`, COLORS.SUCCESS)]
            });
        }
    } catch (cmdError) {
        console.error('[COMMAND RUNTIME ERROR]', cmdError);
        fastReply(message, {
            embeds: [makeEmbed('Execution Error ⚠️', `An error occurred while running this command: \`${cmdError.message || cmdError}\``, COLORS.DANGER)]
        });
    }
});

// Login
client.login(TOKEN).catch(err => {
    console.error('\x1b[31m[LOGIN FAILED]\x1b[0m Error connecting to Discord:');
    console.error(err.message || err);
});
