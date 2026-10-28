const {
    ChannelType,
    PermissionsBitField,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const guildSettings = require('./guildSettings');

const DATA_PATH = path.join(__dirname, 'tempVoice.json');

// Memory map: channelId -> { ownerId, guildId, createdAt, locked, hidden, muted }
const activeTempChannels = new Map();

function loadTempData() {
    try {
        if (fs.existsSync(DATA_PATH)) {
            const raw = fs.readFileSync(DATA_PATH, 'utf-8');
            const data = JSON.parse(raw);
            for (const [chId, info] of Object.entries(data)) {
                activeTempChannels.set(chId, info);
            }
        }
    } catch (e) {
        console.error('[TEMP_VOICE] Error loading tempVoice.json:', e);
    }
}

function saveTempData() {
    try {
        const obj = {};
        for (const [chId, info] of activeTempChannels.entries()) {
            obj[chId] = info;
        }
        fs.writeFile(DATA_PATH, JSON.stringify(obj, null, 2), () => {});
    } catch (_) {}
}

loadTempData();

// Build Voice Control Panel Embed & Action Rows
function buildControlPanel(owner, channel) {
    const embed = new EmbedBuilder()
        .setColor(0x8a2be2)
        .setTitle(`🔊 Voice Control Hub • ${channel.name}`)
        .setDescription(
            `\`\`\`ansi\n` +
            `\u001b[1;35m╔════════════════════════════════════════╗\u001b[0m\n` +
            `\u001b[1;35m║       VOICE CONTROL PANEL              ║\u001b[0m\n` +
            `\u001b[1;35m╚════════════════════════════════════════╝\u001b[0m\n` +
            `\`\`\`\n` +
            `👑 **Room Owner:** <@${owner.id}>\n` +
            `📍 **Channel:** <#${channel.id}>\n\n` +
            `Use the interactive buttons below to customize and control your private voice channel in real time:`
        )
        .addFields(
            { name: '🔒 Security', value: '`Lock` / `Unlock` &bull; `Hide` / `Unhide` room', inline: true },
            { name: '⚙️ Settings', value: '`Rename` channel &bull; Set `Limit` (0-99)', inline: true },
            { name: '🛡️ Moderation', value: '`Mute All` &bull; `Kick User` &bull; `Claim` room', inline: true }
        )
        .setFooter({ text: 'Only the channel owner or server staff can use these controls' })
        .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`btn_vc_lock_${channel.id}`)
            .setLabel('Lock')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`btn_vc_unlock_${channel.id}`)
            .setLabel('Unlock')
            .setEmoji('🔓')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`btn_vc_hide_${channel.id}`)
            .setLabel('Hide')
            .setEmoji('👁️')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`btn_vc_unhide_${channel.id}`)
            .setLabel('Unhide')
            .setEmoji('👁️‍🗨️')
            .setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`btn_vc_rename_${channel.id}`)
            .setLabel('Rename')
            .setEmoji('✏️')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`btn_vc_limit_${channel.id}`)
            .setLabel('Limit')
            .setEmoji('👥')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`btn_vc_mute_${channel.id}`)
            .setLabel('Mute Room')
            .setEmoji('🔇')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`btn_vc_claim_${channel.id}`)
            .setLabel('Claim')
            .setEmoji('👑')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`btn_vc_kick_${channel.id}`)
            .setLabel('Kick User')
            .setEmoji('🚪')
            .setStyle(ButtonStyle.Danger)
    );

    return { embeds: [embed], components: [row1, row2] };
}

// ----------------- Setup JTC Command -----------------
async function setupJtc(message) {
    const guild = message.guild;

    // Check staff permissions
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels) &&
        !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply({
            embeds: [new EmbedBuilder()
                .setColor(0xef4444)
                .setTitle('⛔ Permission Denied')
                .setDescription('You need **Manage Channels** or **Administrator** permissions to set up the Join-to-Create voice system.')
            ]
        });
    }

    const botMember = guild.members.me;
    if (!botMember.permissions.has(PermissionsBitField.Flags.ManageChannels) ||
        !botMember.permissions.has(PermissionsBitField.Flags.MoveMembers)) {
        return message.reply({
            embeds: [new EmbedBuilder()
                .setColor(0xef4444)
                .setTitle('❌ Missing Bot Permissions')
                .setDescription('I require **Manage Channels** and **Move Members** permissions to create and manage temporary voice channels.')
            ]
        });
    }

    try {
        const jtcSettings = guildSettings.getJtcSettings(guild.id);
        let category = jtcSettings.categoryId ? guild.channels.cache.get(jtcSettings.categoryId) : null;

        // If category doesn't exist, create it
        if (!category) {
            category = await guild.channels.create({
                name: '🔊 TEMP VOICE',
                type: ChannelType.GuildCategory,
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone.id,
                        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect]
                    },
                    {
                        id: botMember.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.ManageChannels,
                            PermissionsBitField.Flags.MoveMembers,
                            PermissionsBitField.Flags.Connect,
                            PermissionsBitField.Flags.Speak
                        ]
                    }
                ]
            });
        }

        // Create the JTC Hub Voice Channel
        const hubChannel = await guild.channels.create({
            name: '➕・Join to Create',
            type: ChannelType.GuildVoice,
            parent: category.id,
            userLimit: 0,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect]
                },
                {
                    id: botMember.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.ManageChannels,
                        PermissionsBitField.Flags.MoveMembers,
                        PermissionsBitField.Flags.Connect
                    ]
                }
            ]
        });

        guildSettings.setJtcSettings(guild.id, hubChannel.id, category.id);

        const embed = new EmbedBuilder()
            .setColor(0x10b981)
            .setTitle('✅ Join-to-Create Initialized!')
            .setDescription(
                `\`\`\`ansi\n` +
                `\u001b[1;32m╔════════════════════════════════════════╗\u001b[0m\n` +
                `\u001b[1;32m║    JOIN-TO-CREATE SYSTEM DEPLOYED      ║\u001b[0m\n` +
                `\u001b[1;32m╚════════════════════════════════════════╝\u001b[0m\n` +
                `\`\`\`\n` +
                `🔊 **Hub Channel:** <#${hubChannel.id}> \`(${hubChannel.name})\`\n` +
                `📂 **Category:** \`${category.name}\`\n\n` +
                `✨ **How It Works:**\n` +
                `1. Any member joins <#${hubChannel.id}>.\n` +
                `2. The bot instantly generates a private voice channel for them.\n` +
                `3. The member is automatically moved in.\n` +
                `4. An **interactive control panel** is sent inside the channel's text chat (Lock, Hide, Rename, User Limit, Mute, Kick).\n` +
                `5. When everyone leaves, the room is deleted automatically to keep the server clean!`
            )
            .setFooter({ text: `${guild.name} • High-Performance Voice Engine` })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    } catch (err) {
        console.error('[TEMP_VOICE] Setup failed:', err);
        return message.reply({
            embeds: [new EmbedBuilder()
                .setColor(0xef4444)
                .setTitle('❌ Setup Failed')
                .setDescription(`An error occurred while creating channels: \`${err.message || err}\``)
            ]
        });
    }
}

// ----------------- Voice State Update Event -----------------
async function handleVoiceStateUpdate(oldState, newState) {
    const guild = newState.guild || oldState.guild;
    if (!guild) return;

    const jtcSettings = guildSettings.getJtcSettings(guild.id);
    const hubChannelId = jtcSettings.channelId;
    const targetChannel = newState.channel;

    // 1. Check if member joined the JTC Hub (either explicitly configured or named 'join to create' / 'create vc')
    const isExplicitHub = hubChannelId && newState.channelId === hubChannelId;
    const isNamedHub = targetChannel && (
        /join\s*to\s*create/i.test(targetChannel.name) ||
        /create\s*vc/i.test(targetChannel.name) ||
        /➕.*create/i.test(targetChannel.name)
    );

    if (newState.channelId && (isExplicitHub || isNamedHub)) {
        const member = newState.member;
        if (!member || member.user.bot) return;

        // Auto-save hub if it was auto-detected so future checks are instant
        if (!hubChannelId && targetChannel) {
            guildSettings.setJtcSettings(guild.id, targetChannel.id, targetChannel.parentId || null);
        }

        try {
            const categoryId = jtcSettings.categoryId || targetChannel?.parentId;
            const category = categoryId ? guild.channels.cache.get(categoryId) : null;
            const channelName = `🔊・${member.displayName.slice(0, 18)}'s Room`;

            // Create new temp voice channel with FULL text and voice permissions
            const tempChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildVoice,
                parent: category ? category.id : undefined,
                userLimit: 0,
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.Connect,
                            PermissionsBitField.Flags.Speak,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory,
                            PermissionsBitField.Flags.EmbedLinks,
                            PermissionsBitField.Flags.AttachFiles
                        ]
                    },
                    {
                        id: member.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.Connect,
                            PermissionsBitField.Flags.Speak,
                            PermissionsBitField.Flags.MoveMembers,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory,
                            PermissionsBitField.Flags.EmbedLinks,
                            PermissionsBitField.Flags.AttachFiles,
                            PermissionsBitField.Flags.ManageChannels
                        ]
                    },
                    {
                        id: guild.members.me.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.ManageChannels,
                            PermissionsBitField.Flags.MoveMembers,
                            PermissionsBitField.Flags.Connect,
                            PermissionsBitField.Flags.Speak,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.EmbedLinks,
                            PermissionsBitField.Flags.ReadMessageHistory,
                            PermissionsBitField.Flags.AttachFiles
                        ]
                    }
                ]
            });

            // Move the member to their new channel
            try {
                await member.voice.setChannel(tempChannel);
            } catch (moveErr) {
                console.error('[TEMP_VOICE] Could not move member to temp VC:', moveErr.message);
            }

            // Register in tracking map
            activeTempChannels.set(tempChannel.id, {
                ownerId: member.id,
                guildId: guild.id,
                createdAt: Date.now(),
                locked: false,
                hidden: false,
                muted: false
            });
            saveTempData();

            // Send interactive control panel in the voice channel's text chat
            const panel = buildControlPanel(member.user, tempChannel);
            const panelPayload = {
                content: `🔔 <@${member.id}> **Welcome to your voice channel!** Use the interactive controls below to configure your room:`,
                embeds: panel.embeds,
                components: panel.components
            };

            // Send with retry to handle Discord voice text propagation
            tempChannel.send(panelPayload)
                .then(() => console.log(`[TEMP_VOICE] Panel successfully posted in ${tempChannel.name} for ${member.user.tag}`))
                .catch(async (sendErr) => {
                    console.error('[TEMP_VOICE] Initial panel send failed, retrying in 300ms:', sendErr.message);
                    setTimeout(() => {
                        tempChannel.send(panelPayload).catch(e => console.error('[TEMP_VOICE] Panel retry failed:', e.message));
                    }, 300);
                });

        } catch (err) {
            console.error('[TEMP_VOICE] Error creating temp channel:', err);
        }
        return;
    }

    // 2. Check if a member left a temp channel and if it's now empty
    if (oldState.channelId && oldState.channelId !== newState.channelId) {
        const oldChannelId = oldState.channelId;
        if (activeTempChannels.has(oldChannelId)) {
            const ch = guild.channels.cache.get(oldChannelId);
            if (ch && ch.members.size === 0) {
                activeTempChannels.delete(oldChannelId);
                saveTempData();
                try {
                    await ch.delete('Temp Voice Channel empty');
                } catch (err) {
                    console.error('[TEMP_VOICE] Failed to delete empty channel:', err);
                }
            }
        }
    }
}

// ----------------- Interaction Handler (Buttons & Modals) -----------------
async function handleInteraction(interaction) {
    // 1. Button Handling
    if (interaction.isButton() && interaction.customId.startsWith('btn_vc_')) {
        const parts = interaction.customId.split('_'); // btn, vc, action, channelId
        const action = parts[2];
        const channelId = parts[3];

        const tempInfo = activeTempChannels.get(channelId);
        const channel = interaction.guild?.channels.cache.get(channelId);

        if (!channel) {
            return interaction.reply({ content: '❌ This voice channel no longer exists.', ephemeral: true });
        }

        const isOwner = tempInfo && tempInfo.ownerId === interaction.user.id;
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels) ||
                        interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

        // Claim action can be used by anyone currently in the channel if owner is gone
        if (action === 'claim') {
            if (!interaction.member.voice.channel || interaction.member.voice.channel.id !== channelId) {
                return interaction.reply({ content: '❌ You must be inside this voice channel to claim it.', ephemeral: true });
            }
            if (tempInfo && tempInfo.ownerId === interaction.user.id) {
                return interaction.reply({ content: '👑 You are already the owner of this voice channel!', ephemeral: true });
            }
            // Check if current owner is still in the channel
            const currentOwnerInRoom = tempInfo && channel.members.has(tempInfo.ownerId);
            if (currentOwnerInRoom) {
                return interaction.reply({ content: `❌ The current owner (<@${tempInfo.ownerId}>) is still connected in this room.`, ephemeral: true });
            }

            tempInfo.ownerId = interaction.user.id;
            saveTempData();

            await channel.permissionOverwrites.edit(interaction.user.id, {
                ViewChannel: true,
                Connect: true,
                Speak: true,
                MoveMembers: true
            }).catch(() => {});

            return interaction.reply({ content: `👑 <@${interaction.user.id}> has claimed ownership of this voice channel!`, ephemeral: false });
        }

        // All other actions require owner or admin
        if (!isOwner && !isAdmin) {
            const ownerTag = tempInfo?.ownerId ? `<@${tempInfo.ownerId}>` : 'the channel creator';
            return interaction.reply({
                content: `⛔ Only the room owner (${ownerTag}) or server staff can configure this voice channel.`,
                ephemeral: true
            });
        }

        switch (action) {
            case 'lock': {
                await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { Connect: false });
                tempInfo.locked = true;
                saveTempData();
                return interaction.reply({ content: '🔒 **Voice channel locked.** Other members can no longer connect without permission.', ephemeral: true });
            }
            case 'unlock': {
                await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { Connect: null });
                tempInfo.locked = false;
                saveTempData();
                return interaction.reply({ content: '🔓 **Voice channel unlocked.** Everyone can now connect freely.', ephemeral: true });
            }
            case 'hide': {
                await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { ViewChannel: false });
                tempInfo.hidden = true;
                saveTempData();
                return interaction.reply({ content: '👁️ **Voice channel hidden.** Only members already inside or with permissions can see it.', ephemeral: true });
            }
            case 'unhide': {
                await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { ViewChannel: null });
                tempInfo.hidden = false;
                saveTempData();
                return interaction.reply({ content: '👁️‍🗨️ **Voice channel visible.** The room is now visible on the server list.', ephemeral: true });
            }
            case 'mute': {
                const newMuteState = !tempInfo.muted;
                await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { Speak: newMuteState ? false : null });
                tempInfo.muted = newMuteState;
                saveTempData();
                return interaction.reply({
                    content: newMuteState
                        ? '🔇 **Room muted.** Regular members cannot speak until unmuted.'
                        : '🔊 **Room unmuted.** Members can speak freely again.',
                    ephemeral: true
                });
            }
            case 'rename': {
                const modal = new ModalBuilder()
                    .setCustomId(`modal_vc_rename_${channelId}`)
                    .setTitle('Rename Voice Channel');

                const nameInput = new TextInputBuilder()
                    .setCustomId('new_name')
                    .setLabel('New Channel Name')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('e.g. Chill Lounge')
                    .setMinLength(1)
                    .setMaxLength(32)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
                return interaction.showModal(modal);
            }
            case 'limit': {
                const modal = new ModalBuilder()
                    .setCustomId(`modal_vc_limit_${channelId}`)
                    .setTitle('Set User Limit');

                const limitInput = new TextInputBuilder()
                    .setCustomId('new_limit')
                    .setLabel('User Limit (0 - 99, 0 = Unlimited)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('0')
                    .setMinLength(1)
                    .setMaxLength(2)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(limitInput));
                return interaction.showModal(modal);
            }
            case 'kick': {
                const modal = new ModalBuilder()
                    .setCustomId(`modal_vc_kick_${channelId}`)
                    .setTitle('Disconnect Member');

                const targetInput = new TextInputBuilder()
                    .setCustomId('target_id')
                    .setLabel('Member ID or @mention')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter User ID or mention...')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(targetInput));
                return interaction.showModal(modal);
            }
            default:
                return interaction.reply({ content: 'Unknown action.', ephemeral: true });
        }
    }

    // 2. Modal Submission Handling
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_vc_')) {
        const parts = interaction.customId.split('_'); // modal, vc, action, channelId
        const action = parts[2];
        const channelId = parts[3];

        const channel = interaction.guild?.channels.cache.get(channelId);
        if (!channel) {
            return interaction.reply({ content: '❌ This voice channel no longer exists.', ephemeral: true });
        }

        if (action === 'rename') {
            const newName = interaction.fields.getTextInputValue('new_name').trim();
            try {
                await channel.setName(newName);
                return interaction.reply({ content: `✏️ Voice channel renamed to **${newName}**!`, ephemeral: true });
            } catch (err) {
                return interaction.reply({ content: `❌ Failed to rename channel: \`${err.message || err}\``, ephemeral: true });
            }
        }

        if (action === 'limit') {
            const raw = interaction.fields.getTextInputValue('new_limit').trim();
            const limit = parseInt(raw, 10);
            if (isNaN(limit) || limit < 0 || limit > 99) {
                return interaction.reply({ content: '❌ Invalid limit. Please enter a number between 0 and 99.', ephemeral: true });
            }
            try {
                await channel.setUserLimit(limit);
                return interaction.reply({
                    content: limit === 0 ? '👥 User limit removed (unlimited).' : `👥 User limit set to **${limit}** members.`,
                    ephemeral: true
                });
            } catch (err) {
                return interaction.reply({ content: `❌ Failed to set user limit: \`${err.message || err}\``, ephemeral: true });
            }
        }

        if (action === 'kick') {
            const rawTarget = interaction.fields.getTextInputValue('target_id').trim();
            const cleanId = rawTarget.replace(/[<@!>]/g, '');
            const targetMember = channel.members.get(cleanId);

            if (!targetMember) {
                return interaction.reply({ content: `❌ User <@${cleanId}> is not currently inside this voice channel.`, ephemeral: true });
            }

            if (targetMember.id === interaction.user.id) {
                return interaction.reply({ content: '❌ You cannot disconnect yourself using the kick tool.', ephemeral: true });
            }

            try {
                await targetMember.voice.disconnect(`Disconnected by room owner ${interaction.user.tag}`);
                return interaction.reply({ content: `🚪 Disconnected <@${cleanId}> from the voice channel.`, ephemeral: true });
            } catch (err) {
                return interaction.reply({ content: `❌ Failed to disconnect member: \`${err.message || err}\``, ephemeral: true });
            }
        }
    }
}

// Manual .vcpanel / .panel command to re-send the panel at any time
async function sendManualPanel(message) {
    const member = message.member;
    const voiceChannel = member?.voice?.channel;
    if (!voiceChannel) {
        return message.reply({ content: '❌ You must be connected to a voice channel to open the voice control panel!' });
    }

    const panel = buildControlPanel(member.user, voiceChannel);
    const targetChannel = voiceChannel.isTextBased() ? voiceChannel : message.channel;

    try {
        await targetChannel.send({
            content: `🔔 <@${member.id}> Here is your Voice Channel Control Panel:`,
            embeds: panel.embeds,
            components: panel.components
        });
        if (targetChannel.id !== message.channel.id) {
            message.reply({ content: `✅ Voice Control Panel sent in <#${voiceChannel.id}>!` }).then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
        }
    } catch (err) {
        message.channel.send({
            content: `🔔 <@${member.id}> Here is your Voice Channel Control Panel (for <#${voiceChannel.id}>):`,
            embeds: panel.embeds,
            components: panel.components
        });
    }
}

module.exports = {
    setupJtc,
    handleVoiceStateUpdate,
    handleInteraction,
    sendManualPanel,
    activeTempChannels
};
