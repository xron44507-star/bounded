const fs = require('fs');
const path = require('path');

const HARDBANS_PATH = path.join(__dirname, 'hardbans.json');

let hardbanData = {
    bannedUsers: {},
    settings: {
        minAccountAgeDays: 3, // New accounts younger than 3 days joining during watchdog are auto-banned
        watchdogHours: 48,     // High-alert watchdog duration after a hardban
        similarityThreshold: 0.82
    }
};

function loadData() {
    try {
        if (fs.existsSync(HARDBANS_PATH)) {
            const raw = fs.readFileSync(HARDBANS_PATH, 'utf-8');
            hardbanData = JSON.parse(raw);
            if (!hardbanData.bannedUsers) hardbanData.bannedUsers = {};
            if (!hardbanData.settings) {
                hardbanData.settings = { minAccountAgeDays: 3, watchdogHours: 48, similarityThreshold: 0.82 };
            }
        }
    } catch (err) {
        console.error('[ALTSHIELD] Failed to load hardbans.json:', err);
    }
}

function saveData() {
    try {
        fs.writeFile(HARDBANS_PATH, JSON.stringify(hardbanData, null, 2), err => {
            if (err) console.error('[ALTSHIELD] Error saving hardbans.json:', err);
        });
    } catch (_) {}
}

loadData();

// String similarity calculation (Jaro-Winkler / Levenshtein hybrid)
function similarity(s1, s2) {
    if (!s1 || !s2) return 0;
    const clean1 = s1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const clean2 = s2.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (clean1 === clean2) return 1.0;
    if (clean1.includes(clean2) || clean2.includes(clean1)) {
        const minLen = Math.min(clean1.length, clean2.length);
        const maxLen = Math.max(clean1.length, clean2.length);
        if (minLen >= 4 && minLen / maxLen >= 0.7) return 0.88;
    }

    const longer = clean1.length > clean2.length ? clean1 : clean2;
    const shorter = clean1.length > clean2.length ? clean2 : clean1;
    if (longer.length === 0) return 1.0;

    const costs = [];
    for (let i = 0; i <= longer.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= shorter.length; j++) {
            if (i === 0) costs[j] = j;
            else if (j > 0) {
                let newValue = costs[j - 1];
                if (longer.charAt(i - 1) !== shorter.charAt(j - 1)) {
                    newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                }
                costs[j - 1] = lastValue;
                lastValue = newValue;
            }
        }
        if (i > 0) costs[shorter.length] = lastValue;
    }
    return (longer.length - costs[shorter.length]) / longer.length;
}

function recordHardban(user, moderatorId, reason) {
    const userId = user.id;
    hardbanData.bannedUsers[userId] = {
        id: userId,
        username: user.username || user.tag || 'Unknown',
        displayName: user.displayName || user.globalName || user.username || '',
        avatar: user.avatar || null,
        createdTimestamp: user.createdTimestamp || null,
        hardbannedAt: Date.now(),
        moderatorId,
        reason: reason || 'Hardbanned from server',
        knownAlts: []
    };
    saveData();
    return hardbanData.bannedUsers[userId];
}

function linkAlt(hardbannedId, altId) {
    if (hardbanData.bannedUsers[hardbannedId]) {
        if (!hardbanData.bannedUsers[hardbannedId].knownAlts.includes(altId)) {
            hardbanData.bannedUsers[hardbannedId].knownAlts.push(altId);
            saveData();
            return true;
        }
    }
    return false;
}

function removeHardban(userId) {
    let wasHardbanned = false;
    let record = null;

    if (hardbanData.bannedUsers[userId]) {
        wasHardbanned = true;
        record = hardbanData.bannedUsers[userId];
        delete hardbanData.bannedUsers[userId];
    }

    // Also remove from any other record's knownAlts list
    for (const [mainId, rec] of Object.entries(hardbanData.bannedUsers)) {
        if (rec.knownAlts && rec.knownAlts.includes(userId)) {
            rec.knownAlts = rec.knownAlts.filter(id => id !== userId);
            wasHardbanned = true;
        }
    }

    if (wasHardbanned) {
        saveData();
    }

    return { wasHardbanned, record };
}

function checkMemberIsAlt(member) {
    const user = member.user;
    const now = Date.now();
    const accountAgeDays = (now - user.createdTimestamp) / (24 * 60 * 60 * 1000);
    const watchdogLimitMs = (hardbanData.settings.watchdogHours || 48) * 60 * 60 * 1000;

    for (const [id, record] of Object.entries(hardbanData.bannedUsers)) {
        // 1. Direct ID or Linked Alt match
        if (user.id === id || record.knownAlts?.includes(user.id)) {
            return {
                isAlt: true,
                matchType: 'Direct Known Alt Match',
                confidence: '100%',
                original: record,
                reason: `Explicitly linked alt of hardbanned user ${record.username} (${id})`
            };
        }

        // 2. Exact Avatar Match (same custom avatar hash)
        if (record.avatar && user.avatar && record.avatar === user.avatar) {
            return {
                isAlt: true,
                matchType: 'Identical Avatar Hash Match',
                confidence: '95%',
                original: record,
                reason: `Reused identical avatar image as hardbanned user ${record.username}`
            };
        }

        // 3. Username / Handle High Similarity Match
        const nameSim = Math.max(
            similarity(user.username, record.username),
            similarity(user.displayName, record.displayName || record.username)
        );

        if (nameSim >= (hardbanData.settings.similarityThreshold || 0.82)) {
            return {
                isAlt: true,
                matchType: `Name Pattern Match (${Math.round(nameSim * 100)}% match)`,
                confidence: '90%',
                original: record,
                reason: `Username/display name matches hardbanned user ${record.username} (${Math.round(nameSim * 100)}% similarity)`
            };
        }

        // 4. Fresh Account Joining During Active Watchdog (Account < 3 days old within 48h of hardban)
        const isRecentHardban = (now - record.hardbannedAt) < watchdogLimitMs;
        if (isRecentHardban && accountAgeDays < (hardbanData.settings.minAccountAgeDays || 3)) {
            return {
                isAlt: true,
                matchType: 'Fresh Account Alt Shield Trigger',
                confidence: '85%',
                original: record,
                reason: `Fresh account created only ${accountAgeDays.toFixed(1)} days ago joining during active watchdog for ${record.username}`
            };
        }
    }

    return { isAlt: false };
}

function getHardbanStats() {
    return {
        totalHardbanned: Object.keys(hardbanData.bannedUsers).length,
        settings: hardbanData.settings
    };
}

module.exports = {
    recordHardban,
    linkAlt,
    removeHardban,
    checkMemberIsAlt,
    getHardbanStats,
    hardbanData
};
