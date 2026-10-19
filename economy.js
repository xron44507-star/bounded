const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'economy.json');
let data = { users: {} };
let saveTimeout = null;

function loadData() {
    try {
        if (fs.existsSync(DB_PATH)) {
            data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
            if (!data.users) data.users = {};
        }
    } catch (err) {
        console.error('[ECONOMY] Failed to load economy.json:', err);
        data = { users: {} };
    }
}

function saveDataNow() {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
        console.error('[ECONOMY] Failed to save economy.json:', err);
    }
}

// Non-blocking debounced save (instant in-memory response, safe disk write)
function scheduleSave() {
    if (saveTimeout) return;
    saveTimeout = setTimeout(() => {
        saveTimeout = null;
        fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), 'utf-8', (err) => {
            if (err) console.error('[ECONOMY] Save error:', err);
        });
    }, 1000);
}

process.on('beforeExit', saveDataNow);
process.on('exit', saveDataNow);

loadData();

function getUser(userId) {
    if (!data.users[userId]) {
        data.users[userId] = {
            balance: 1000, // $1,000 starter cash
            lastDaily: 0,
            dailyStreak: 0,
            lastWork: 0,
            workCount: 0,
            cfStreak: 0,
            lastRob: 0,
            lastRobbed: 0,
            warnings: []
        };
        scheduleSave();
    }
    const u = data.users[userId];
    if (u.dailyStreak === undefined) u.dailyStreak = 0;
    if (u.workCount === undefined) u.workCount = 0;
    if (u.cfStreak === undefined) u.cfStreak = 0;
    if (u.lastRob === undefined) u.lastRob = 0;
    if (u.lastRobbed === undefined) u.lastRobbed = 0;
    return u;
}

function addBalance(userId, amount) {
    const user = getUser(userId);
    user.balance = Math.max(0, user.balance + Math.floor(amount));
    scheduleSave();
    return user.balance;
}

function removeBalance(userId, amount) {
    const user = getUser(userId);
    user.balance = Math.max(0, user.balance - Math.floor(amount));
    scheduleSave();
    return user.balance;
}

function getBalance(userId) {
    return getUser(userId).balance;
}

function transferBalance(fromUserId, toUserId, amount) {
    const fromUser = getUser(fromUserId);
    const toUser = getUser(toUserId);
    if (fromUser.balance < amount) return false;
    fromUser.balance -= amount;
    toUser.balance += amount;
    scheduleSave();
    return true;
}

function addWarning(userId, moderatorId, reason) {
    const user = getUser(userId);
    if (!user.warnings) user.warnings = [];
    const warnObj = {
        id: user.warnings.length + 1,
        moderator: moderatorId,
        reason: reason || 'No reason provided',
        timestamp: Date.now()
    };
    user.warnings.push(warnObj);
    scheduleSave();
    return warnObj;
}

function getWarnings(userId) {
    return getUser(userId).warnings || [];
}

function clearWarnings(userId) {
    const user = getUser(userId);
    user.warnings = [];
    scheduleSave();
    return true;
}

function getLeaderboard(limit = 10) {
    return Object.entries(data.users)
        .map(([id, u]) => ({ id, balance: u.balance }))
        .sort((a, b) => b.balance - a.balance)
        .slice(0, limit);
}

function formatMoney(amount) {
    return `$${Number(amount).toLocaleString('en-US')}`;
}

module.exports = {
    getUser,
    getBalance,
    addBalance,
    removeBalance,
    transferBalance,
    addWarning,
    getWarnings,
    clearWarnings,
    getLeaderboard,
    formatMoney,
    scheduleSave,
    saveData: saveDataNow
};
