const { Collection, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const { createEmbed, createApplicationModal, createPrefilledApplicationModal, createAllowResubmitModal, createResubmitDecisionEmbed, createAcceptanceEmbed } = require('../utils/embedUtils');
const { isAdmin } = require('../utils/permissionUtils');
const Application = require('../models/Application');
const Submission = require('../models/Submission');
const { handleReloadButton, syncAllPanels } = require('./panelSync');
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
                flags: MessageFlags.Ephemeral
            });
        }

        // Check permissions
        if (!await isAdmin(interaction.member)) {
            return interaction.reply({
                content: '❌ You do not have permission to accept applications.',
                flags: MessageFlags.Ephemeral
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
                // Don't return early, just notify about the role issue and continue
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: '⚠️ Application accepted, but I could not assign the role. Please assign it manually.',
                        ephemeral: true
                    });
                    replied = true;
                } else {
                    await interaction.followUp({
                        content: '⚠️ Application accepted, but I could not assign the role. Please assign it manually.',
                        ephemeral: true
                    });
                    replied = true;
                }
            }
        }

        // Try to DM the user
        try {
            await member.send({
                embeds: [createAcceptanceEmbed(
                    `<@${submission.userId}>`,
                    submission.applicationId.positionName
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
            const historyEmbed = createAcceptanceEmbed(
                `<@${submission.userId}>`,
                submission.applicationId.positionName,
                `<@${interaction.user.id}>`,
                submission.applicationId.openPositions
            );

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

        // Only send success message if we haven't already replied
        if (!replied) {
            await interaction.reply({
                content: '✅ Application accepted successfully!',
                ephemeral: true
            });
            replied = true;
        }
        
        // Decrement openPositions count after we've replied to the interaction
        const application = submission.applicationId;
        if (application.openPositions > 0) {
            application.openPositions -= 1;
            
            // If no more positions are available, set application to inactive
            if (application.openPositions <= 0) {
                application.active = false;
            }
            
            await application.save();
            
            // Sync panels to update the UI
            await syncAllPanels(interaction.client);
        }
    } catch (error) {
        console.error('Error in accept button:', error);
        // Only attempt to reply if we haven't already replied and the interaction is still valid
        if (!replied && !interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({
                    content: '❌ An error occurred while accepting the application.',
                    ephemeral: true
                });
            } catch (replyError) {
                console.error('Failed to send error reply:', replyError);
                // If the interaction is no longer valid, we can't do anything about it
            }
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
            try {
                await interaction.reply({
                    content: '❌ An error occurred while processing the rejection.',
                    ephemeral: true
                });
            } catch (replyError) {
                console.error('Failed to send error reply:', replyError);
                // If the interaction is no longer valid, we can't do anything about it
            }
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
            // Create an embed to show the previous configuration
            const configEmbed = createEmbed(
                "Previous Configuration",
                `**Position:** ${lastApplication.positionName}\n` +
                `**Panel Channel:** <#${lastApplication.channels.panel}>\n` +
                `**Notifications:** <#${lastApplication.channels.notifications}>\n` +
                `**History:** <#${lastApplication.channels.history}>\n` +
                `**Management Roles:** ${lastApplication.managementRoles?.map((r) => `<@&${r}>`).join(", ") || "None set"}`
            ).setFooter({ 
                text: "Configuration management • Made with ♥ by BitCraft Network",
                iconURL: "https://i.imgur.com/OMqZfgz.png"
            });

            // Send the message with the configuration details
            const sentMessage = await interaction.reply({
                content: "Would you like to use the previous management roles and application configuration?",
                embeds: [configEmbed],
                fetchReply: true,
                ephemeral: false // Make it visible so reactions can be added
            });

            // Add reactions for the admin to choose
            await sentMessage.react('✅'); // Tick reaction
            await sentMessage.react('❌'); // X reaction

            // Create a filter to only collect reactions from the admin who initiated
            const filter = (reaction, user) => {
                return ['✅', '❌'].includes(reaction.emoji.name) && user.id === interaction.user.id;
            };

            // Wait for the admin's reaction
            try {
                const collected = await sentMessage.awaitReactions({ filter, max: 1, time: 60000, errors: ['time'] });
                const reaction = collected.first();

                // If admin reacts with tick, use previous configuration
                if (reaction.emoji.name === '✅') {
                    // Show loading message
                    await sentMessage.edit({
                        content: "⏳ Creating application and setting up channels... Please wait.",
                        embeds: [],
                    });

                    // Create a new application with previous configuration
                    const application = new Application({
                        ...lastApplication.toObject(),
                        _id: undefined, // Remove the _id to create a new document
                        active: true,
                    });

                    await application.save();
                    
                    // Sync panels after creating the application
                    const { syncAllPanels } = require('./panelSync');
                    await syncAllPanels(interaction.client);

                    // Clean up messages in the channel
                    try {
                        // Fetch messages in the channel
                        const messages = await interaction.channel.messages.fetch({ limit: 100 });
                        
                        // Find the original !sa command message and its response
                        const saCommandMessage = messages.find(msg => 
                            !msg.author.bot && 
                            msg.content.startsWith('!sa') && 
                            msg.content.trim() === '!sa'
                        );
                        
                        // If we found the !sa command message
                        if (saCommandMessage) {
                            // Find the bot's response to the !sa command (the embed with the button)
                            const saResponseMessage = messages.find(msg => 
                                msg.author.bot && 
                                msg.embeds.length > 0 && 
                                msg.embeds[0].title && 
                                msg.embeds[0].title.includes('Create Staff Application')
                            );
                            
                            // Delete all messages between the !sa command response and the current time
                            // except for the !sa command and its response and the sentMessage
                            const messagesToDelete = messages.filter(msg => 
                                msg.id !== saCommandMessage.id && 
                                (saResponseMessage ? msg.id !== saResponseMessage.id : true) && 
                                msg.id !== sentMessage.id && 
                                msg.createdTimestamp > (saResponseMessage ? saResponseMessage.createdTimestamp : 0)
                            );
                            
                            // Delete messages in batches if possible, or one by one
                            if (messagesToDelete.size > 0) {
                                // Use bulkDelete for messages less than 14 days old
                                const recentMessages = messagesToDelete.filter(msg => 
                                    (Date.now() - msg.createdTimestamp) < 1209600000 // 14 days in milliseconds
                                );
                                
                                if (recentMessages.size > 0) {
                                    await interaction.channel.bulkDelete(recentMessages);
                                }
                                
                                // Delete older messages individually
                                const olderMessages = messagesToDelete.filter(msg => 
                                    (Date.now() - msg.createdTimestamp) >= 1209600000
                                );
                                
                                for (const msg of olderMessages.values()) {
                                    try {
                                        await msg.delete();
                                    } catch (err) {
                                        console.error('Error deleting older message:', err);
                                    }
                                }
                            }
                        }
                    } catch (cleanupError) {
                        console.error('Error cleaning up messages:', cleanupError);
                    }

                    await sentMessage.edit({
                        content: "✅ Previous configuration has been used to create a new application.",
                        embeds: [],
                    });
                    
                    // Set a timeout to remove the success message after 7 seconds
                    setTimeout(async () => {
                        try {
                            await sentMessage.delete();
                        } catch (error) {
                            console.error('Error deleting success message:', error);
                        }
                    }, 7000);
                } 
                // If admin reacts with X, show the application creation modal
                else if (reaction.emoji.name === '❌') {
                    await sentMessage.edit({
                        content: "You chose to configure manually. Please fill out the application details.",
                        embeds: [],
                    });
                    
                    const modal = createApplicationModal();
                    await interaction.followUp({
                        content: "Please fill out the application details in the modal.",
                        ephemeral: true,
                    });
                    await interaction.showModal(modal);
                }
            } catch (error) {
                // If no reaction after timeout
                await sentMessage.edit({
                    content: "⏱️ No reaction received. Application creation cancelled.",
                    embeds: [],
                });
            }
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
    try {
        if (!(await isAdmin(interaction.member))) {
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({
                    content: "❌ You do not have permission to manage staff applications.",
                    ephemeral: true,
                });
            }
            return;
        }

        const modal = createApplicationModal();
        await interaction.showModal(modal);
    } catch (error) {
        console.error("Error in sa_create_modal button:", error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: "❌ An error occurred while showing the application modal.",
                ephemeral: true,
            });
        }
    }
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
        
        // Delete all !sau messages and clear cache after interaction
        if (sauMessageCache && sauMessageCache.length) {
            // Wait a moment to ensure the modal is shown before deleting messages
            setTimeout(async () => {
                try {
                    // Send confirmation message
                    await interaction.followUp({
                        content: '✅ Update modal opened. Original messages have been cleaned up.',
                        ephemeral: true
                    });
                    
                    // Delete all messages in the cache
                    for (const msg of sauMessageCache) {
                        try { await msg.delete(); } catch (e) {}
                    }
                    sauMessageCache.length = 0;
                } catch (e) { /* ignore errors */ }
            }, 1000);
        }
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
        
        // Send confirmation message before deleting messages
        await interaction.reply({
            content: `🗑️ Application "${application.positionName}" has been deleted and panels updated. Original messages have been cleaned up.`,
            ephemeral: true
        });
        
        // Delete all !sau messages and clear cache
        if (sauMessageCache && sauMessageCache.length) {
          // Short delay to ensure the confirmation message is sent first
          setTimeout(async () => {
            for (const msg of sauMessageCache) {
              try { await msg.delete(); } catch (e) {}
            }
            sauMessageCache.length = 0;
          }, 500);
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

/**
 * Collect resubmission decision from the admin via message collector.
 * @param {TextChannel} channel - The channel to collect in
 * @param {User} user - The admin user
 * @returns {Promise<boolean>} - Whether to allow resubmission
 */
async function collectResubmissionDecision(channel, user) {
  const promptEmbed = createEmbed(
    '🔄 Resubmission Option',
    'Do you want to let users **resubmit** after their application is rejected?\n\nType `yes` to allow resubmission or `no` to disallow resubmission.\nType `cancel` to abort the setup process.'
  ).setColor('#5865F2')
   .setFooter({ 
     text: "This setting controls if rejected users can re-apply • Made with ♥ by BitCraft Network",
     iconURL: "https://i.imgur.com/OMqZfgz.png"
   });

  while (true) {
    await channel.send({ content: `<@${user.id}>`, embeds: [promptEmbed] });
    const filter = m => m.author.id === user.id;
    const collected = await channel.awaitMessages({ filter, max: 1, time: 120000 });
    const response = collected.first();
    if (!response) throw new Error('No response received.');
    const content = response.content.trim().toLowerCase();
    
    if (content === 'cancel') throw new Error('Cancelled by user.');
    if (content === 'yes') return true;
    if (content === 'no') return false;
    
    // If invalid, prompt again
    await channel.send({ content: `<@${user.id}>`, embeds: [createEmbed('❌ Invalid Input', 'Please type `yes`, `no`, or `cancel`.')] });
  }
}

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
        
        // Store the collected data
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
        
        // Inform the user that we're proceeding to the next step
        await interaction.editReply({
            content: "✅ Management roles and channels configured. Please answer the next question in the chat.",
            ephemeral: true
        });
        
        // Collect resubmission decision via chat
        try {
            const allowResubmit = await collectResubmissionDecision(
                interaction.channel,
                interaction.user
            );
            
            // Create and save the application
            await handleResubmissionSetting(interaction, allowResubmit, cacheKey);
        } catch (error) {
            if (error.message === 'Cancelled by user.') {
                await interaction.followUp({
                    content: "❌ Application creation cancelled.",
                    ephemeral: true,
                });
                applicationCreationCache.delete(cacheKey);
                return;
            }
            throw error; // Re-throw for the outer catch block
        }
    } catch (error) {
        console.error('Error in continue_setup button:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ An error occurred while continuing setup.',
                ephemeral: true
            });
        } else {
            await interaction.followUp({
                content: '❌ An error occurred while continuing setup.',
                ephemeral: true
            });
        }
    }
});

// Helper function to handle resubmission settings
async function handleResubmissionSetting(interaction, allowResubmit, cacheKey = null) {
    let replied = false;
    try {
        // If cacheKey is not provided, extract it from the interaction customId
        if (!cacheKey && interaction.customId) {
            cacheKey = interaction.customId.split(':')[1];
        }
        
        if (!cacheKey) {
            if (!replied && !interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ Invalid session. Please start the application creation process again.',
                    ephemeral: true
                });
                replied = true;
            }
            return;
        }
        
        const appData = applicationCreationCache.get(cacheKey);
        if (!appData) {
            // User-friendly error if session expired or cache missing
            if (!replied && !interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ Session expired or invalid. Please start the application creation process again.',
                    ephemeral: true
                });
                replied = true;
            } else {
                await interaction.followUp({
                    content: '❌ Session expired or invalid. Please start the application creation process again.',
                    ephemeral: true
                });
            }
            return;
        }
        const Application = require('../models/Application');
        const Panel = require('../models/Panel');
        const application = new Application({
            ...appData,
            allowResubmit,
            active: true
        });
        await application.save();
        // Sync panels
        const { syncAllPanels } = require('./panelSync');
        await syncAllPanels(interaction.client);
        applicationCreationCache.delete(cacheKey);
        
        if (!replied && !interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: `✅ Application for **${appData.positionName}** has been created successfully!`,
                ephemeral: true
            });
            replied = true;
        } else {
            await interaction.followUp({
                content: `✅ Application for **${appData.positionName}** has been created successfully!`,
                ephemeral: true
            });
        }
    } catch (error) {
        console.error(`Error in resubmission setting (allowResubmit=${allowResubmit}):`, error);
        if (!replied && !interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ An error occurred while creating the application.',
                ephemeral: true
            });
        } else {
            await interaction.followUp({
                content: '❌ An error occurred while creating the application.',
                ephemeral: true
            });
        }
    }
}

// Register handlers using the shared function
buttonHandlers.set('resubmit_yes', async (interaction) => {
    await handleResubmissionSetting(interaction, true);
});

buttonHandlers.set('resubmit_no', async (interaction) => {
    await handleResubmissionSetting(interaction, false);
});

module.exports = buttonHandlers;
