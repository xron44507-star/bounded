const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(__dirname, 'guildSettings.json');

// Historical defaults for the original main guild (/bounded)
const MAIN_GUILD_ID = '1550381628063223938';

let guildData = {};

function getDefaultSettings(guildId) {
    if (guildId === MAIN_GUILD_ID) {
        return {
            logChannelId: '1561898213890465954',
            mediaChannels: ['1557200905198112878', '1550381629992865888'],
            ticketCategoryId: '1550661181138669653',
            appCategoryId: '1550381632396197908',
            jtcChannelId: null,
            jtcCategoryId: null,
            appsOpen: false,
            prefix: '.'
        };
    }
    return {
        logChannelId: null,
        mediaChannels: [],
        ticketCategoryId: null,
        appCategoryId: null,
        jtcChannelId: null,
        jtcCategoryId: null,
        appsOpen: false,
        prefix: '.'
    };
}

function loadData() {
    try {
        if (fs.existsSync(SETTINGS_PATH)) {
            const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
            guildData = JSON.parse(raw);
        } else {
            guildData = {};
        }
    } catch (err) {
        console.error('[GUILD_SETTINGS] Failed to load guildSettings.json:', err);
        guildData = {};
    }

    // Ensure main guild has its defaults
    if (!guildData[MAIN_GUILD_ID]) {
        guildData[MAIN_GUILD_ID] = getDefaultSettings(MAIN_GUILD_ID);
        saveData();
    }
}

function saveData() {
    try {
        fs.writeFile(SETTINGS_PATH, JSON.stringify(guildData, null, 2), () => {});
    } catch (_) {}
}

loadData();

function getGuildSettings(guildId) {
    if (!guildId) return getDefaultSettings(null);
    if (!guildData[guildId]) {
        guildData[guildId] = getDefaultSettings(guildId);
        saveData();
    }
    return guildData[guildId];
}

function setGuildSetting(guildId, key, value) {
    if (!guildId) return;
    const settings = getGuildSettings(guildId);
    settings[key] = value;
    saveData();
    return settings;
}

function getLogChannel(guild) {
    if (!guild) return null;
    const settings = getGuildSettings(guild.id);
    if (!settings.logChannelId) return null;
    const ch = guild.channels.cache.get(settings.logChannelId);
    if (ch && ch.isTextBased()) return ch;
    return null;
}

function setLogChannelId(guildId, channelId) {
    return setGuildSetting(guildId, 'logChannelId', channelId);
}

function isMediaOnlyChannel(guildId, channelId) {
    if (!guildId || !channelId) return false;
    const settings = getGuildSettings(guildId);
    return Array.isArray(settings.mediaChannels) && settings.mediaChannels.includes(channelId);
}

function addMediaChannel(guildId, channelId) {
    if (!guildId || !channelId) return false;
    const settings = getGuildSettings(guildId);
    if (!Array.isArray(settings.mediaChannels)) settings.mediaChannels = [];
    if (!settings.mediaChannels.includes(channelId)) {
        settings.mediaChannels.push(channelId);
        saveData();
        return true;
    }
    return false;
}

function removeMediaChannel(guildId, channelId) {
    if (!guildId || !channelId) return false;
    const settings = getGuildSettings(guildId);
    if (!Array.isArray(settings.mediaChannels)) return false;
    const idx = settings.mediaChannels.indexOf(channelId);
    if (idx !== -1) {
        settings.mediaChannels.splice(idx, 1);
        saveData();
        return true;
    }
    return false;
}

function areAppsOpen(guildId) {
    const settings = getGuildSettings(guildId);
    return !!settings.appsOpen;
}

function setAppsOpen(guildId, state) {
    setGuildSetting(guildId, 'appsOpen', !!state);
    return !!state;
}

function getTicketCategoryId(guildId) {
    const settings = getGuildSettings(guildId);
    return settings.ticketCategoryId || null;
}

function setTicketCategoryId(guildId, categoryId) {
    return setGuildSetting(guildId, 'ticketCategoryId', categoryId);
}

function getAppCategoryId(guildId) {
    const settings = getGuildSettings(guildId);
    return settings.appCategoryId || null;
}

function setAppCategoryId(guildId, categoryId) {
    return setGuildSetting(guildId, 'appCategoryId', categoryId);
}

function getJtcSettings(guildId) {
    const settings = getGuildSettings(guildId);
    return {
        channelId: settings.jtcChannelId || null,
        categoryId: settings.jtcCategoryId || null
    };
}

function setJtcSettings(guildId, channelId, categoryId) {
    setGuildSetting(guildId, 'jtcChannelId', channelId);
    setGuildSetting(guildId, 'jtcCategoryId', categoryId);
    return { channelId, categoryId };
}

module.exports = {
    MAIN_GUILD_ID,
    getGuildSettings,
    setGuildSetting,
    getLogChannel,
    setLogChannelId,
    isMediaOnlyChannel,
    addMediaChannel,
    removeMediaChannel,
    areAppsOpen,
    setAppsOpen,
    getTicketCategoryId,
    setTicketCategoryId,
    getAppCategoryId,
    setAppCategoryId,
    getJtcSettings,
    setJtcSettings
};
