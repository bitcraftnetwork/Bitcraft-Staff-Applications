const { Collection, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { createEmbed, createApplicationModal, createPrefilledApplicationModal, createAllowResubmitModal, createResubmitDecisionEmbed } = require('../utils/embedUtils');
const { isAdmin } = require('../utils/permissionUtils');
const Application = require('../models/Application');
const Submission = require('../models/Submission');
const { handleReloadButton } = require('./panelSync');
const { sauMessageCache } = require('../events/messageCreate');
const { collectManagementRoles, collectChannels } = require('./collectorHandlers');
const { applicationCreationCache } = require('./modalHandlers');

const buttonHandlers = new Collection();

buttonHandlers.set('accept', async (interaction, submissionId) => {
    let replied = false;
    try {
        const submission = await Submission.findById(submissionId).populate('applicationId');
        if (!submission) {
            return interaction.reply({
                content: '❌ Application not found.',
                ephemeral: true
            });
        }

        // Check permissions
        if (!await isAdmin(interaction.member)) {
            return interaction.reply({
                content: '❌ You do not have permission to accept applications.',
                ephemeral: true
            });
        }

        // Update submission status
        submission.status = 'accepted';
        submission.handledBy = {
            userId: interaction.user.id,
            username: interaction.user.tag,
            timestamp: new Date()
        };
        await submission.save();

        // Try to assign role
        const member = await interaction.guild.members.fetch(submission.userId);
        if (member) {
            try {
                await member.roles.add(submission.applicationId.roleId);
            } catch (error) {
                console.error('Error assigning role:', error);
                await interaction.reply({
                    content: '⚠️ Application accepted, but I could not assign the role. Please assign it manually.',
                    ephemeral: true
                });
                return;
            }
        }

        // Try to DM the user
        try {
            await member.send({
                embeds: [createEmbed(
                    '🎉 Application Accepted!',
                    `Congratulations! Your application for ${submission.applicationId.positionName} has been accepted!\n\n` +
                    'You have been given the appropriate role. Welcome to the team! 🎊'
                )]
            });
        } catch (error) {
            console.error('Could not DM user:', error);
            // Send a public message instead
            const channel = interaction.guild.channels.cache.get(submission.applicationId.channels.panel);
            if (channel) {
                await channel.send({
                    content: `${member} Congratulations! Your application for ${submission.applicationId.positionName} has been accepted! 🎉`,
                    allowedMentions: { users: [submission.userId] }
                });
            }
        }

        // Log to history channel
        const historyChannel = interaction.guild.channels.cache.get(submission.applicationId.channels.history);
        if (historyChannel) {
            const historyEmbed = createEmbed(
                '✅ Application Accepted',
                `**Applicant:** ${member.user.tag}\n` +
                `**Position:** ${submission.applicationId.positionName}\n` +
                `**Accepted by:** ${interaction.user.tag}\n` +
                `**Date:** ${new Date().toLocaleString()}`
            ).setColor('#00FF00');

            await historyChannel.send({ embeds: [historyEmbed] });
        }

        // Delete the notification message (the one with the buttons)
        try {
            if (interaction.message && interaction.message.deletable) {
                await interaction.message.delete();
            }
        } catch (error) {
            console.error('Error deleting notification message:', error);
        }

        await interaction.reply({
            content: '✅ Application accepted successfully!',
            ephemeral: true
        });
        replied = true;
    } catch (error) {
        console.error('Error in accept button:', error);
        if (!replied && !interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ An error occurred while accepting the application.',
                ephemeral: true
            });
        }
    }
});

buttonHandlers.set('reject', async (interaction, submissionId) => {
    try {
        const modal = new ModalBuilder()
            .setCustomId(`reject_${submissionId}`)
            .setTitle('Reject Application');

        const reasonInput = new TextInputBuilder()
            .setCustomId('reject_reason')
            .setLabel('Rejection Reason')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setPlaceholder('Please provide a reason for rejection');

        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        await interaction.showModal(modal);
    } catch (error) {
        console.error('Error in reject button:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ An error occurred while processing the rejection.',
                ephemeral: true
            });
        }
    }
});

buttonHandlers.set('create_position', async (interaction) => {
    try {
        if (!(await isAdmin(interaction.member))) {
            return interaction.reply({
                content: '❌ You do not have permission to manage staff applications.',
                ephemeral: true
            });
        }

        const lastApplication = await Application.findOne({
            guildId: interaction.guildId
        }).sort({ createdAt: -1 });

        if (lastApplication) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('new_application_config')
                    .setLabel('New Configuration')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⚙️'),
                new ButtonBuilder()
                    .setCustomId('use_previous_config')
                    .setLabel('Use Previous Settings')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('✨')
            );

            await interaction.reply({
                content: 'Would you like to use the previous channel and role configuration?',
                components: [row],
                ephemeral: true
            });
        } else {
            const modal = createApplicationModal();
            await interaction.showModal(modal);
        }
    } catch (error) {
        console.error('Error in create_position button:', error);
        await interaction.reply({
            content: '❌ An error occurred while creating the position.',
            ephemeral: true
        });
    }
});

buttonHandlers.set('sa_create_modal', async (interaction) => {
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({
            content: '❌ You do not have permission to manage staff applications.',
            ephemeral: true,
        });
    }
    const modal = createApplicationModal();
    await interaction.showModal(modal);
});

buttonHandlers.set('update_app', async (interaction, applicationId) => {
    try {
        if (!(await isAdmin(interaction.member))) {
            return interaction.reply({
                content: '❌ You do not have permission to update staff applications.',
                ephemeral: true
            });
        }
        const application = await Application.findById(applicationId);
        if (!application) {
            return interaction.reply({
                content: '❌ Application not found.',
                ephemeral: true
            });
        }
        const modal = createPrefilledApplicationModal(application);
        await interaction.showModal(modal);
        // After update, delete all !sau messages after 120s (handled in modal handler)
    } catch (error) {
        console.error('Error in update_app button:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ An error occurred while opening the update modal.',
                ephemeral: true
            });
        }
    }
});

buttonHandlers.set('delete_app', async (interaction, applicationId) => {
    try {
        if (!(await isAdmin(interaction.member))) {
            return interaction.reply({
                content: '❌ You do not have permission to delete staff applications.',
                ephemeral: true
            });
        }
        const application = await Application.findById(applicationId);
        if (!application) {
            return interaction.reply({
                content: '❌ Application not found.',
                ephemeral: true
            });
        }
        await Application.findByIdAndDelete(applicationId);
        await Submission.deleteMany({ applicationId });
        const { syncAllPanels } = require('./panelSync');
        await syncAllPanels(interaction.client);
        await interaction.reply({
            content: `🗑️ Application "${application.positionName}" has been deleted and panels updated.`,
            ephemeral: true
        });
        // Delete all !sau messages and clear cache
        if (sauMessageCache && sauMessageCache.length) {
          for (const msg of sauMessageCache) {
            try { await msg.delete(); } catch (e) {}
          }
          sauMessageCache.length = 0;
        }
    } catch (error) {
        console.error('Error in delete_app button:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ An error occurred while deleting the application.',
                ephemeral: true
            });
        }
    }
});

// Add reload button handler
buttonHandlers.set('reload_panel', handleReloadButton);

buttonHandlers.set('continue_setup', async (interaction) => {
    await interaction.deferReply({ ephemeral: true });
    try {
        const cacheKey = interaction.customId.split(':')[1];
        const initialData = applicationCreationCache.get(cacheKey);
        if (!initialData) {
            return interaction.reply({
                content: '❌ Session expired or invalid. Please start again.',
                ephemeral: true
            });
        }
        // Collect management roles and channels as in the original flow
        const validateRole = (roleId) => interaction.guild.roles.cache.has(roleId);
        const validateChannel = (channelId) => interaction.guild.channels.cache.has(channelId);
        // Collect management roles
        const managementRoles = await collectManagementRoles(
            interaction,
            interaction.channel,
            interaction.user,
            validateRole
        );
        if (managementRoles === 'cancel') {
            await interaction.editReply({
                content: "❌ Application creation cancelled.",
                ephemeral: true,
            });
            applicationCreationCache.delete(cacheKey);
            return;
        }
        // Collect channel IDs
        const channels = await collectChannels(
            interaction,
            interaction.channel,
            interaction.user,
            validateChannel
        );
        if (channels === 'cancel') {
            await interaction.editReply({
                content: "❌ Application creation cancelled.",
                ephemeral: true,
            });
            applicationCreationCache.delete(cacheKey);
            return;
        }
        // Send the resubmit decision embed
        const appData = {
            ...initialData,
            managementRoles: typeof managementRoles === 'string' ? [] : managementRoles,
            acceptingRoles: typeof managementRoles === 'string' ? [] : managementRoles,
            channels: typeof channels === 'string' ? {
                panel: '', notifications: '', history: ''
            } : channels,
            guildId: interaction.guildId
        };
        applicationCreationCache.set(cacheKey, appData);
        const { embed, components } = createResubmitDecisionEmbed(cacheKey);
        await interaction.editReply({ embeds: [embed], components, ephemeral: true });
    } catch (error) {
        console.error('Error in continue_setup button:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ An error occurred while continuing setup.',
                ephemeral: true
            });
        }
    }
});

buttonHandlers.set('resubmit_yes', async (interaction) => {
    try {
        const cacheKey = interaction.customId.split(':')[1];
        const appData = applicationCreationCache.get(cacheKey);
        if (!appData) {
            return interaction.reply({
                content: '❌ Session expired or invalid. Please start again.',
                ephemeral: true
            });
        }
        const Application = require('../models/Application');
        const Panel = require('../models/Panel');
        const application = new Application({
            ...appData,
            allowResubmit: true,
            active: true
        });
        await application.save();
        // Sync panels
        const { syncAllPanels } = require('./panelSync');
        await syncAllPanels(interaction.client);
        applicationCreationCache.delete(cacheKey);
        await interaction.reply({
            content: `✅ Application for **${appData.positionName}** has been created successfully!`,
            ephemeral: true
        });
    } catch (error) {
        console.error('Error in resubmit_yes button:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ An error occurred while creating the application.',
                ephemeral: true
            });
        }
    }
});

buttonHandlers.set('resubmit_no', async (interaction) => {
    try {
        const cacheKey = interaction.customId.split(':')[1];
        const appData = applicationCreationCache.get(cacheKey);
        if (!appData) {
            return interaction.reply({
                content: '❌ Session expired or invalid. Please start again.',
                ephemeral: true
            });
        }
        const Application = require('../models/Application');
        const Panel = require('../models/Panel');
        const application = new Application({
            ...appData,
            allowResubmit: false,
            active: true
        });
        await application.save();
        // Sync panels
        const { syncAllPanels } = require('./panelSync');
        await syncAllPanels(interaction.client);
        applicationCreationCache.delete(cacheKey);
        await interaction.reply({
            content: `✅ Application for **${appData.positionName}** has been created successfully!`,
            ephemeral: true
        });
    } catch (error) {
        console.error('Error in resubmit_no button:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ An error occurred while creating the application.',
                ephemeral: true
            });
        }
    }
});

module.exports = buttonHandlers;
