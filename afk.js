const fs = require('fs');
const path = require('path');

const AFK_PATH = path.join(__dirname, 'afk.json');
let afkUsers = {};

function loadAfk() {
    try {
        if (fs.existsSync(AFK_PATH)) {
            afkUsers = JSON.parse(fs.readFileSync(AFK_PATH, 'utf-8'));
        }
    } catch (err) {
        console.error('[AFK] Error loading afk.json:', err);
        afkUsers = {};
    }
}

function saveAfk() {
    fs.writeFile(AFK_PATH, JSON.stringify(afkUsers, null, 2), (err) => {
        if (err) console.error('[AFK] Error saving afk.json:', err);
    });
}

loadAfk();

function setAfk(userId, reason, originalNick = null) {
    afkUsers[userId] = {
        reason: reason || 'AFK',
        timestamp: Date.now(),
        originalNick
    };
    saveAfk();
}

function getAfk(userId) {
    return afkUsers[userId] || null;
}

function removeAfk(userId) {
    if (afkUsers[userId]) {
        const data = afkUsers[userId];
        delete afkUsers[userId];
        saveAfk();
        return data;
    }
    return null;
}

function formatDuration(ms) {
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

module.exports = {
    setAfk,
    getAfk,
    removeAfk,
    formatDuration
};
