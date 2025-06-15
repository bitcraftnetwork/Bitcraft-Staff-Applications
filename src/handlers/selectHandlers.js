const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  Collection,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const { createEmbed, createApplicationPanel, createSubmissionModal } = require("../utils/embedUtils");
const Application = require("../models/Application");
const Submission = require("../models/Submission");
const { isApplicationOpen } = require("../utils/permissionUtils");

const selectHandlers = new Collection();

selectHandlers.set("apply", async (interaction) => {
  try {
    // Extract the applicationId by removing the "apply_" prefix if present
    let applicationId = interaction.values[0];
    if (applicationId.startsWith('apply_')) {
      applicationId = applicationId.substring(6); // Remove "apply_" prefix
    }
    
    const application = await Application.findById(applicationId);

    if (!application) {
      return interaction.reply({
        content: "❌ This position is no longer available.",
        ephemeral: true,
      });
    }

    // Check if application is still open
    if (!isApplicationOpen(application)) {
      return interaction.reply({
        content: "❌ This position is no longer accepting applications.",
        ephemeral: true,
      });
    }

    // Check if user has already applied (any status)
    const existingSubmission = await Submission.findOne({
      userId: interaction.user.id,
      applicationId: applicationId,
    });

    // Debug log for allowResubmit and submission status
    console.log('[DEBUG] Application allowResubmit:', application.allowResubmit, '| Submission status:', existingSubmission && existingSubmission.status);

    if (existingSubmission) {
      if (existingSubmission.status === "rejected") {
        if (application.allowResubmit) {
          console.log('[DEBUG] Allowing resubmission for user', interaction.user.id, 'on application', applicationId);
          // Allow resubmission: delete the old rejected submission and show the modal
          await Submission.deleteOne({ _id: existingSubmission._id });
          // Continue to show the modal below
        } else {
          console.log('[DEBUG] Blocking resubmission for user', interaction.user.id, 'on application', applicationId);
          // Block resubmission
          return interaction.reply({
            content: "❌ You cannot re-apply for this position. Resubmission is not allowed after rejection.",
            ephemeral: true,
          });
        }
      } else {
        // Block for all other statuses
        let statusMsg = "";
        if (existingSubmission.status === "pending") {
          statusMsg = "⏳ You have already submitted and it is under review, please wait.";
        } else if (existingSubmission.status === "accepted") {
          statusMsg = "✅ You have already submitted and your application was accepted.";
        } else {
          statusMsg = "ℹ️ You have already submitted an application for this position.";
        }
        return interaction.reply({
          content: statusMsg,
          ephemeral: true,
        });
      }
    }

    // Show application modal
    const modal = createSubmissionModal();
    modal.setCustomId(`submit_application_${applicationId}`);
    await interaction.showModal(modal);
  } catch (error) {
    console.error("Error in apply select menu:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ An error occurred while processing your selection.",
        ephemeral: true,
      });
    }
  }
});

function createPositionSelect(applications) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("apply")
      .setPlaceholder("Select a position to apply for")
      .addOptions(
        applications.map((app) => ({
          label: app.positionName,
          description:
            app.description?.slice(0, 100) || "No description provided",
          value: app._id.toString(), // Ensure we're using just the ID
          emoji: "📝",
        }))
      )
  );
}

function createApplicationControls(applicationId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`accept_${applicationId}`)
      .setLabel("Accept")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅"),
    new ButtonBuilder()
      .setCustomId(`reject_${applicationId}`)
      .setLabel("Reject")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("❌")
  );
}

module.exports = selectHandlers;
