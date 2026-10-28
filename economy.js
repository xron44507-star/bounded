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
    if (data.serverFunds === undefined) data.serverFunds = 250000;
    if (!data.stats) data.stats = { totalLoansIssued: 0, totalLoansRepaid: 0, totalFundsSeized: 0 };
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
            loan: null,
            debt: 0,
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
    if (u.loan === undefined) u.loan = null;
    if (u.debt === undefined) u.debt = 0;
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

function getGuildEconomyData(guildId = null) {
    if (!guildId) {
        if (data.serverFunds === undefined) data.serverFunds = 250000;
        if (!data.stats) data.stats = { totalLoansIssued: 0, totalLoansRepaid: 0, totalFundsSeized: 0 };
        return {
            get funds() { return data.serverFunds; },
            set funds(val) { data.serverFunds = val; },
            get stats() { return data.stats; }
        };
    }

    if (!data.guilds) data.guilds = {};
    if (!data.guilds[guildId]) {
        const initialFunds = (guildId === '1550381628063223938' && data.serverFunds !== undefined)
            ? data.serverFunds
            : 250000;
        data.guilds[guildId] = {
            serverFunds: initialFunds,
            stats: { totalLoansIssued: 0, totalLoansRepaid: 0, totalFundsSeized: 0 }
        };
    }
    const g = data.guilds[guildId];
    if (g.serverFunds === undefined) g.serverFunds = 250000;
    if (!g.stats) g.stats = { totalLoansIssued: 0, totalLoansRepaid: 0, totalFundsSeized: 0 };

    return {
        get funds() { return g.serverFunds; },
        set funds(val) { g.serverFunds = val; data.serverFunds = val; },
        get stats() { return g.stats; }
    };
}

function getServerFunds(guildId = null) {
    const eco = getGuildEconomyData(guildId);
    return eco.funds;
}

function addServerFunds(amount, guildId = null) {
    const eco = getGuildEconomyData(guildId);
    eco.funds += Math.floor(amount);
    scheduleSave();
    return eco.funds;
}

function removeServerFunds(amount, guildId = null) {
    const eco = getGuildEconomyData(guildId);
    eco.funds = Math.max(0, eco.funds - Math.floor(amount));
    scheduleSave();
    return eco.funds;
}

function takeLoan(userId, amount, guildId = null) {
    const user = getUser(userId);
    const eco = getGuildEconomyData(guildId);

    // Check overdue first
    const overdueCheck = checkUserLoanStatus(userId, guildId);
    if (overdueCheck.defaulted) {
        return { success: false, reason: 'defaulted_seized', details: overdueCheck };
    }

    if (user.loan) {
        return { success: false, reason: 'active_loan', loan: user.loan };
    }
    if (user.debt > 0) {
        return { success: false, reason: 'unresolved_debt', debt: user.debt };
    }

    if (amount <= 0 || isNaN(amount)) {
        return { success: false, reason: 'invalid_amount' };
    }

    if (amount > eco.funds) {
        return { success: false, reason: 'insufficient_server_funds', available: eco.funds };
    }

    // Maximum loan cap: min($50,000, 50% of server funds)
    const maxLoan = Math.min(50000, Math.floor(eco.funds * 0.5));
    if (amount > maxLoan) {
        return { success: false, reason: 'exceeds_max_loan', maxLoan };
    }

    // Disburse from server funds to user vault
    eco.funds -= amount;
    user.balance += amount;

    // 5% interest fee, 24 hours deadline
    const owed = Math.floor(amount * 1.05);
    const borrowedAt = Date.now();
    const dueAt = borrowedAt + (24 * 60 * 60 * 1000);

    user.loan = {
        principal: amount,
        owed,
        borrowedAt,
        dueAt,
        guildId: guildId || null
    };

    eco.stats.totalLoansIssued = (eco.stats.totalLoansIssued || 0) + 1;

    scheduleSave();
    return {
        success: true,
        principal: amount,
        owed,
        dueAt,
        newBalance: user.balance,
        serverFunds: eco.funds
    };
}

function payLoan(userId, amount = null, guildId = null) {
    const user = getUser(userId);
    const eco = getGuildEconomyData(guildId || user.loan?.guildId || null);

    // First check overdue
    checkUserLoanStatus(userId, guildId || user.loan?.guildId || null);

    if (!user.loan && (!user.debt || user.debt <= 0)) {
        return { success: false, reason: 'no_debt' };
    }

    if (user.balance <= 0) {
        return { success: false, reason: 'no_balance', balance: 0, owed: user.loan ? user.loan.owed : user.debt };
    }

    // If user has delinquent debt
    if (user.debt > 0) {
        const toPay = amount ? Math.min(amount, user.debt, user.balance) : Math.min(user.debt, user.balance);
        if (toPay <= 0) return { success: false, reason: 'invalid_amount' };

        user.balance -= toPay;
        eco.funds += toPay;
        user.debt -= toPay;

        eco.stats.totalLoansRepaid = (eco.stats.totalLoansRepaid || 0) + toPay;

        scheduleSave();
        return {
            success: true,
            type: 'debt',
            paid: toPay,
            cleared: user.debt <= 0,
            remainingDebt: user.debt,
            newBalance: user.balance,
            serverFunds: eco.funds
        };
    }

    // If user has active loan
    if (user.loan) {
        const toPay = amount ? Math.min(amount, user.loan.owed, user.balance) : Math.min(user.loan.owed, user.balance);
        if (toPay <= 0) return { success: false, reason: 'invalid_amount' };

        user.balance -= toPay;
        eco.funds += toPay;
        user.loan.owed -= toPay;

        eco.stats.totalLoansRepaid = (eco.stats.totalLoansRepaid || 0) + toPay;

        const cleared = user.loan.owed <= 0;
        if (cleared) {
            user.loan = null;
        }

        scheduleSave();
        return {
            success: true,
            type: 'loan',
            paid: toPay,
            cleared,
            remainingOwed: cleared ? 0 : user.loan.owed,
            newBalance: user.balance,
            serverFunds: eco.funds
        };
    }
}

function checkUserLoanStatus(userId, guildId = null) {
    const user = getUser(userId);
    if (!user.loan) return { defaulted: false };

    const effectiveGuildId = guildId || user.loan.guildId || null;
    const eco = getGuildEconomyData(effectiveGuildId);

    const now = Date.now();
    if (now <= user.loan.dueAt) {
        return { defaulted: false };
    }

    // LOAN IS OVERDUE -> Seize funds into server treasury!
    const owed = user.loan.owed;
    const userBal = user.balance;

    if (userBal >= owed) {
        // Full repossession from user balance
        user.balance -= owed;
        eco.funds += owed;
        user.loan = null;
        scheduleSave();
        return {
            defaulted: true,
            resolved: true,
            seized: owed,
            remainingBal: user.balance,
            debt: 0
        };
    } else {
        // User does not have enough -> Seize ALL their money into server funds!
        const seized = userBal;
        user.balance = 0;
        const remainingDebt = owed - seized;
        user.debt = (user.debt || 0) + remainingDebt;
        eco.funds += seized;

        eco.stats.totalFundsSeized = (eco.stats.totalFundsSeized || 0) + seized;

        user.loan = null;
        scheduleSave();
        return {
            defaulted: true,
            resolved: false,
            seized,
            remainingBal: 0,
            debt: user.debt
        };
    }
}

function depositFunds(userId, amount, guildId = null) {
    const user = getUser(userId);
    if (amount <= 0 || isNaN(amount)) return { success: false, reason: 'invalid_amount' };
    if (user.balance < amount) return { success: false, reason: 'insufficient_funds', balance: user.balance };

    const eco = getGuildEconomyData(guildId);
    user.balance -= amount;
    eco.funds += amount;
    scheduleSave();
    return {
        success: true,
        deposited: amount,
        newBalance: user.balance,
        serverFunds: eco.funds
    };
}

function forgiveLoan(userId) {
    const user = getUser(userId);
    const hadLoan = !!user.loan;
    const hadDebt = (user.debt || 0) > 0;
    if (!hadLoan && !hadDebt) return false;

    user.loan = null;
    user.debt = 0;
    scheduleSave();
    return true;
}

function getServerStats(guildId = null) {
    const eco = getGuildEconomyData(guildId);
    let totalActiveLoans = 0;
    let totalLoanAmount = 0;
    let totalDelinquentDebt = 0;

    for (const [id, u] of Object.entries(data.users)) {
        if (u.loan && (!guildId || u.loan.guildId === guildId)) {
            totalActiveLoans++;
            totalLoanAmount += u.loan.owed;
        }
        if (u.debt) {
            totalDelinquentDebt += u.debt;
        }
    }

    return {
        serverFunds: eco.funds,
        totalActiveLoans,
        totalLoanAmount,
        totalDelinquentDebt,
        totalLoansIssued: eco.stats?.totalLoansIssued || 0,
        totalLoansRepaid: eco.stats?.totalLoansRepaid || 0,
        totalFundsSeized: eco.stats?.totalFundsSeized || 0
    };
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
    getServerFunds,
    addServerFunds,
    removeServerFunds,
    takeLoan,
    payLoan,
    checkUserLoanStatus,
    depositFunds,
    forgiveLoan,
    getServerStats,
    scheduleSave,
    saveData: saveDataNow
};
