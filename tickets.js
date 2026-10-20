const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'tickets.json');
let ticketData = {
    ticketCounter: 1,
    activeTickets: {},
    appsOpen: false
};

function loadData() {
    try {
        if (fs.existsSync(DB_PATH)) {
            ticketData = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
            if (!ticketData.activeTickets) ticketData.activeTickets = {};
            if (!ticketData.ticketCounter) ticketData.ticketCounter = 1;
            if (typeof ticketData.appsOpen !== 'boolean') ticketData.appsOpen = false;
        }
    } catch (err) {
        console.error('[TICKETS] Load error:', err);
    }
}

function saveData() {
    try {
        fs.writeFile(DB_PATH, JSON.stringify(ticketData, null, 2), () => {});
    } catch (_) {}
}

loadData();

function createTicket(channelId, userId, type = 'support') {
    const num = ticketData.ticketCounter++;
    ticketData.activeTickets[channelId] = {
        ticketId: num,
        userId,
        type,
        createdAt: Date.now(),
        closed: false
    };
    saveData();
    return num;
}

function getTicket(channelId) {
    return ticketData.activeTickets[channelId] || null;
}

function getUserActiveTicket(userId, type = null) {
    for (const [channelId, t] of Object.entries(ticketData.activeTickets)) {
        if (t.userId === userId && !t.closed) {
            if (!type || t.type === type) {
                return { channelId, ...t };
            }
        }
    }
    return null;
}

function closeTicket(channelId) {
    if (ticketData.activeTickets[channelId]) {
        ticketData.activeTickets[channelId].closed = true;
        saveData();
        return true;
    }
    return false;
}

function deleteTicket(channelId) {
    if (ticketData.activeTickets[channelId]) {
        delete ticketData.activeTickets[channelId];
        saveData();
        return true;
    }
    return false;
}

function areAppsOpen() {
    return !!ticketData.appsOpen;
}

function setAppsOpen(state) {
    ticketData.appsOpen = !!state;
    saveData();
    return ticketData.appsOpen;
}

module.exports = {
    createTicket,
    getTicket,
    getUserActiveTicket,
    closeTicket,
    deleteTicket,
    areAppsOpen,
    setAppsOpen
};
