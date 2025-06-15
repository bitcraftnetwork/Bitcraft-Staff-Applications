const {
  Collection,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
} = require("discord.js");
const Application = require("../models/Application");
const Submission = require("../models/Submission");
const { createEmbed, createApplicationModal, createAllowResubmitModal, createResubmitDecisionEmbed } = require("../utils/embedUtils");
const {
  isAdmin,
  isValidChannel,
  isValidRole,
} = require("../utils/permissionUtils");
// Add this import at the top with the other imports
const { syncAllPanels } = require('./panelSync');
const Panel = require("../models/Panel");
// Import sauMessageCache from messageCreate.js
const { sauMessageCache } = require('../events/messageCreate');

const modalHandlers = new Collection();

// Global cache for application creation steps
const applicationCreationCache = new Map();

modalHandlers.set("create_application", async (interaction) => {
  try {
    // Defer immediately to avoid Discord timeout
    await interaction.deferReply({ ephemeral: true });

    let errorMsg = null;

    if (!(await isAdmin(interaction.member))) {
      errorMsg = "❌ You do not have permission to manage staff applications.";
    }

    const positionName = interaction.fields.getTextInputValue("position_name");
    const description = interaction.fields.getTextInputValue("description");
    const openPositions = parseInt(interaction.fields.getTextInputValue("open_positions"));
    const durationDays = parseInt(interaction.fields.getTextInputValue("duration_days"));
    const roleId = interaction.fields.getTextInputValue("role_id");

    if (!errorMsg && (isNaN(openPositions) || openPositions < 1)) {
      errorMsg = "❌ Number of open positions must be a positive number.";
    }
    if (!errorMsg && (isNaN(durationDays) || durationDays < 0)) {
      errorMsg = "❌ Duration days must be 0 or a positive number.";
    }
    if (!errorMsg && !interaction.guild.roles.cache.has(roleId)) {
      errorMsg = "❌ The specified role ID is invalid.";
    }

    if (errorMsg) {
      await interaction.followUp({ content: errorMsg, ephemeral: true });
      return;
    }

    // Immediately collect management roles and channels
    const cacheKey = `${interaction.user.id}_${Date.now()}`;
    const duration = {
      type: durationDays > 0 ? 'days' : 'untilFilled',
      days: durationDays,
      endDate: durationDays > 0 ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000) : null
    };
    const initialData = {
      positionName,
      description,
      openPositions,
      duration,
      roleId
    };
    applicationCreationCache.set(cacheKey, initialData);

    // Collect management roles and channels
    const { collectManagementRoles, collectChannels } = require('./collectorHandlers');
    const validateRole = (roleId) => interaction.guild.roles.cache.has(roleId);
    const validateChannel = (channelId) => interaction.guild.channels.cache.has(channelId);

    // Edit the deferred reply for the first message
    await interaction.editReply({ content: 'Please complete the management roles and channel configuration in the next steps...' });

    try {
      // Collect management roles
      const managementRoles = await collectManagementRoles(
        interaction,
        interaction.channel,
        interaction.user,
        validateRole
      );
      if (managementRoles === 'cancel') {
        await interaction.followUp({
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
        await interaction.followUp({
          content: "❌ Application creation cancelled.",
          ephemeral: true,
        });
        applicationCreationCache.delete(cacheKey);
        return;
      }
      // Prepare for resubmit decision
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
      await interaction.followUp({ embeds: [embed], components, ephemeral: true });
    } catch (error) {
      console.error('Error in management/channel collection:', error);
      await interaction.followUp({
        content: '❌ An error occurred during management/channel configuration.',
        ephemeral: true
      });
      applicationCreationCache.delete(cacheKey);
    }
  } catch (error) {
    console.error("Error in create_application modal:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ An error occurred while creating the application.",
        ephemeral: true,
      });
    }
  }
});

// Update continue_setup button handler logic to collect management roles and channels, then send the resubmit decision embed
// Remove allow_resubmit_modal handler

modalHandlers.set("submit_application", async (interaction, applicationId) => {
  try {
    // Validation and data fetching first
    const application = await Application.findById(applicationId);
    if (!application) {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ Application not found.",
          ephemeral: true,
        });
      }
      return;
    }

    // Check if user already has a submission for this application
    const existingSubmission = await Submission.findOne({
      userId: interaction.user.id,
      applicationId: applicationId,
    });
    if (existingSubmission) {
      let statusMsg = "";
      if (existingSubmission.status === "pending") {
        statusMsg = "⏳ You have already submitted and it is under review, please wait.";
      } else if (existingSubmission.status === "rejected") {
        statusMsg = "❌ You have already submitted and your application was rejected.";
      } else if (existingSubmission.status === "accepted") {
        statusMsg = "✅ You have already submitted and your application was accepted.";
      } else {
        statusMsg = "ℹ️ You have already submitted an application for this position.";
      }
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: statusMsg,
          ephemeral: true,
        });
      }
      return;
    }

    const answers = {
      experience: interaction.fields.getTextInputValue("experience"),
      previous_staff: interaction.fields.getTextInputValue("previous_staff"),
      motivation: interaction.fields.getTextInputValue("motivation"),
      additional_info: interaction.fields.getTextInputValue("additional_info"),
    };

    // Create submission first
    const submission = new Submission({
      userId: interaction.user.id,
      applicationId,
      guildId: interaction.guildId,
      submittedAt: new Date(),
      status: "pending",
      answers,
    });

    await submission.save();
    
    // Reply to the user immediately to avoid timeout
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "✅ Your application has been submitted successfully!",
        ephemeral: true,
      });
    }

    // Then handle notification separately
    try {
      const notify = interaction.guild.channels.cache.get(
        application.channels.notifications
      );
      
      if (notify) {
        const embed = createEmbed(
          "📝 New Application Submitted",
          `**User:** ${interaction.user.tag}\n**Position:** ${application.positionName}`
        );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`accept_${submission._id}`)
            .setLabel("Accept")
            .setStyle(ButtonStyle.Success)
            .setEmoji("✅"),
          new ButtonBuilder()
            .setCustomId(`reject_${submission._id}`)
            .setLabel("Reject")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("❌")
        );

        await notify.send({ embeds: [embed], components: [row] });
      }
    } catch (notifyError) {
      console.error("Error sending notification:", notifyError);
      // Don't reply again here, just log the error
    }
  } catch (error) {
    console.error("Error in submit_application modal:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ An error occurred while submitting your application.",
        ephemeral: true,
      });
    }
  }
});

modalHandlers.set("reject_application", async (interaction, submissionId) => {
  try {
    const submission = await Submission.findById(submissionId).populate("applicationId");
    if (!submission) {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ Submission not found.",
          ephemeral: true,
        });
      }
      return;
    }

    const reason = interaction.fields.getTextInputValue("reject_reason");
    if (!reason) {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ Please provide a reason for rejection.",
          ephemeral: true,
        });
      }
      return;
    }

    // Update submission status
    submission.status = "rejected";
    submission.reviewedAt = new Date();
    submission.reviewedBy = interaction.user.id;
    submission.reviewNotes = reason;
    await submission.save();

    // Get application for logging
    const application = submission.applicationId;

    // DM the user
    try {
      const user = await interaction.client.users.fetch(submission.userId);
      if (user) {
        const embed = createEmbed(
          "❌ Application Rejected",
          `Your application for **${application.positionName}** has been rejected.\n\n**Reason:** ${reason}`
        ).setColor("#FF0000");
        await user.send({ embeds: [embed] });
      }
    } catch (e) { /* Ignore DM errors */ }

    // Delete the notification message (the one with the buttons)
    try {
      if (interaction.message && interaction.message.deletable) {
        await interaction.message.delete();
      }
    } catch (e) { /* Ignore delete errors */ }

    // Log to history channel
    try {
      const historyChannelId = application.channels.history;
      const historyChannel = interaction.guild.channels.cache.get(historyChannelId);
      if (historyChannel) {
        const historyEmbed = createEmbed(
          "❌ Application Rejected",
          null
        ).setColor("#FF0000")
         .addFields(
           { name: "Applicant", value: `<@${submission.userId}>`, inline: true },
           { name: "Position", value: application.positionName, inline: true },
           { name: "Rejected by", value: `<@${interaction.user.id}>`, inline: true },
           { name: "Reason", value: reason, inline: false },
           { name: "Remaining Positions", value: application.openPositions.toString(), inline: true },
           { name: "Date", value: new Date().toLocaleString(), inline: false }
         );
        await historyChannel.send({ embeds: [historyEmbed] });
      }
    } catch (e) { /* Ignore log errors */ }

    // Delete the submission from MongoDB
    await Submission.findByIdAndDelete(submissionId);

    // Always sync panels after any changes
    await syncAllPanels(interaction.client);

    // Reply to the modal
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "✅ Application has been rejected.",
        ephemeral: true,
      });
    }

  } catch (error) {
    console.error("Error in reject_application modal:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ An error occurred while rejecting the application.",
        ephemeral: true,
      });
    }
  }
});

modalHandlers.set("accept_application", async (interaction, submissionId) => {
  try {
    const submission = await Submission.findById(submissionId).populate("applicationId");
    if (!submission) {
      await interaction.reply({
        content: "❌ Submission not found.",
        ephemeral: true,
      });
      return;
    }

    // Update submission status
    submission.status = "accepted";
    submission.reviewedAt = new Date();
    submission.reviewedBy = interaction.user.id;
    await submission.save();

    // Update application's open positions
    const application = submission.applicationId;
    application.openPositions = Math.max(0, application.openPositions - 1);
    
    // If no more positions are open, deactivate and delete the application
    if (application.openPositions === 0) {
      application.active = false;
      await Application.findByIdAndDelete(application._id);
      // Delete all !sau messages and clear cache
      if (sauMessageCache && sauMessageCache.length) {
        for (const msg of sauMessageCache) {
          try { await msg.delete(); } catch (e) {}
        }
        sauMessageCache.length = 0;
      }
    } else {
      await application.save();
    }

    // Reply to the modal first!
    await interaction.reply({
      content: "✅ Application has been accepted.",
      ephemeral: true,
    });

    // DM the user
    try {
      const user = await interaction.client.users.fetch(submission.userId);
      if (user) {
        const embed = createEmbed(
          "✅ Application Accepted",
          `Congratulations! Your application for **${application.positionName}** has been accepted.`
        ).setColor("#00FF00");
        await user.send({ embeds: [embed] });
      }
    } catch (e) { /* Ignore DM errors */ }

    // Delete the notification message (the one with the buttons)
    try {
      if (interaction.message && interaction.message.deletable) {
        await interaction.message.delete();
      }
    } catch (e) { /* Ignore delete errors */ }

    // Log to history channel
    try {
      const historyChannelId = application.channels.history;
      const historyChannel = interaction.guild.channels.cache.get(historyChannelId);
      if (historyChannel) {
        const historyEmbed = createEmbed(
          "✅ Application Accepted",
          null
        ).setColor("#00FF00")
         .addFields(
           { name: "Applicant", value: `<@${submission.userId}>`, inline: true },
           { name: "Position", value: application.positionName, inline: true },
           { name: "Accepted by", value: `<@${interaction.user.id}>`, inline: true },
           { name: "Remaining Positions", value: application.openPositions.toString(), inline: true },
           { name: "Date", value: new Date().toLocaleString(), inline: false }
         );
        await historyChannel.send({ embeds: [historyEmbed] });
      }
    } catch (e) { /* Ignore log errors */ }

    // Delete the submission from MongoDB
    await Submission.findByIdAndDelete(submissionId);

    // Always sync panels after any changes
    await syncAllPanels(interaction.client);

  } catch (error) {
    console.error("Error in accept_application modal:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ An error occurred while accepting the application.",
        ephemeral: true,
      });
    }
  }
});

modalHandlers.set('sa_create_modal', async (interaction) => {
  if (!interaction.member.permissions.has('Administrator')) {
    return interaction.reply({
      content: '❌ You do not have permission to manage staff applications.',
      ephemeral: true,
    });
  }
  const modal = createApplicationModal();
  await interaction.showModal(modal);
});

// Add to existing modalHandlers collection
modalHandlers.set('confirm_delete', async (interaction, applicationId) => {
    try {
        // Check permissions
        if (!(await isAdmin(interaction.member))) {
            return interaction.reply({
                content: '❌ You do not have permission to delete applications.',
                ephemeral: true
            });
        }

        // Get confirmation value
        const confirm = interaction.fields.getTextInputValue('confirm');
        
        if (confirm.toLowerCase() !== 'confirm') {
            return interaction.reply({
                content: '❌ Deletion cancelled. You did not type "confirm".',
                ephemeral: true
            });
        }

        // Get application
        const application = await Application.findById(applicationId);
        if (!application) {
            return interaction.reply({
                content: '❌ Application not found.',
                ephemeral: true
            });
        }

        // Store application name for logging
        const positionName = application.positionName;

        // Delete application
        await Application.findByIdAndDelete(applicationId);

        // Delete related submissions
        await Submission.deleteMany({ applicationId });

        // Update panels
        await syncAllPanels(interaction.client);

        // Log to history channel
        try {
            const historyChannel = interaction.guild.channels.cache.get(application.channels.history);
            if (historyChannel) {
                const logEmbed = createEmbed(
                    '🗑️ Application Deleted',
                    `**Position:** ${positionName}\n` +
                    `**Deleted by:** ${interaction.user.tag}\n` +
                    `**Time:** ${new Date().toLocaleString()}`
                ).setColor('#FF0000');

                await historyChannel.send({ embeds: [logEmbed] });
            }
        } catch (error) {
            console.error('Error logging application deletion:', error);
        }

        // Reply to interaction
        await interaction.reply({
            content: `🗑️ Application **${positionName}** has been successfully deleted.`,
            ephemeral: true
        });
    } catch (error) {
        console.error('Error in confirm_delete modal handler:', error);
        await interaction.reply({
            content: '❌ An error occurred while deleting the application.',
            ephemeral: true
        });
    }
});

modalHandlers.set("update_application", async (interaction, applicationId) => {
  try {
    if (!(await isAdmin(interaction.member))) {
      return interaction.reply({
        content: "❌ You do not have permission to update staff applications.",
        ephemeral: true
      });
    }
    const application = await Application.findById(applicationId);
    if (!application) {
      return interaction.reply({
        content: "❌ Application not found.",
        ephemeral: true
      });
    }
    const positionName = interaction.fields.getTextInputValue("position_name");
    const description = interaction.fields.getTextInputValue("description");
    const openPositions = parseInt(interaction.fields.getTextInputValue("open_positions"));
    const durationDays = parseInt(interaction.fields.getTextInputValue("duration_days"));
    const roleId = interaction.fields.getTextInputValue("role_id");
    const allowResubmitRaw = interaction.fields.getTextInputValue("allow_resubmit");
    const allowResubmit = allowResubmitRaw && allowResubmitRaw.trim().toLowerCase() === 'yes';

    if (isNaN(openPositions) || openPositions < 1) {
      return interaction.reply({
        content: "❌ Number of open positions must be a positive number.",
        ephemeral: true
      });
    }
    if (isNaN(durationDays) || durationDays < 0) {
      return interaction.reply({
        content: "❌ Duration days must be 0 or a positive number.",
        ephemeral: true
      });
    }
    if (!interaction.guild.roles.cache.has(roleId)) {
      return interaction.reply({
        content: "❌ The specified role ID is invalid.",
        ephemeral: true
      });
    }

    application.positionName = positionName;
    application.description = description;
    application.openPositions = openPositions;
    application.duration = {
      type: durationDays > 0 ? 'days' : 'untilFilled',
      days: durationDays,
      endDate: durationDays > 0 ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000) : null
    };
    application.roleId = roleId;
    application.allowResubmit = allowResubmit;
    application.lastUpdated = new Date();
    await application.save();

    // Sync panels after update
    await syncAllPanels(interaction.client);

    // Delete all !sau messages and clear cache
    if (sauMessageCache && sauMessageCache.length) {
      for (const msg of sauMessageCache) {
        try { await msg.delete(); } catch (e) {}
      }
      sauMessageCache.length = 0;
    }

    await interaction.reply({
      content: `✅ Application "${positionName}" has been updated and panels synced!`,
      ephemeral: true
    });
  } catch (error) {
    console.error('Error in update_application modal:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ An error occurred while updating the application.',
        ephemeral: true
      });
    }
  }
});

module.exports = modalHandlers;
module.exports.applicationCreationCache = applicationCreationCache;
