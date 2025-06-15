const {
  Events,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require("discord.js");
const {
  createEmbed,
  createApplicationModal,
  createStatusEmbed,
  createConsolidatedPanel,
} = require("../utils/embedUtils");
const { isAdmin, isApplicationOpen } = require("../utils/permissionUtils");
const Application = require("../models/Application");
const Submission = require("../models/Submission");
const Panel = require("../models/Panel");

// Global cache to track !sau response messages for deletion
const sauMessageCache = [];

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    // Ignore messages from bots and non-prefix messages
    if (message.author.bot || !message.content.startsWith("!")) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
      switch (command) {
        case "sa":
          if (!(await isAdmin(message.member))) {
            return message.reply(
              "❌ You do not have permission to manage staff applications."
            );
          }

          const button = new ButtonBuilder()
            .setCustomId("sa_create_modal")
            .setLabel("Start Application Setup")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("📝");

          const row1 = new ActionRowBuilder().addComponents(button);

          const embed = createEmbed(
            "Create Staff Application",
            "📝 Click the button below to create a new staff application position!\n\n" +
              "You'll be asked to provide:\n" +
              "• Position Name\n" +
              "• Description/Responsibilities\n" +
              "• Number of Open Positions\n" +
              "• Application Duration\n" +
              "• Role ID for accepted applicants"
          );

          await message.reply({
            embeds: [embed],
            components: [row1],
          });
          break;

        case "sap":
          if (!(await isAdmin(message.member))) {
            return message.reply(
              "❌ You do not have permission to manage application panels."
            );
          }
          const channel = message.mentions.channels.first();
          if (!channel) {
            return message.reply("❌ Please mention a channel: !sap #channel");
          }

          // Get all active applications
          const activeApplications = await Application.find({
            guildId: message.guildId,
            active: true,
          });

          // Create the panel using the same function as application creation
          const { embed: panelEmbed, hasApplications } = createConsolidatedPanel(activeApplications);

          // Create components array
          const components = [];

          // Add select menu if there are applications
          if (hasApplications) {
            const selectMenu = new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId('apply')
                .setPlaceholder('Select a position to apply for')
                .addOptions(activeApplications.map((app, index) => ({
                  label: `${index + 1}. ${app.positionName}`,
                  description: `Apply for ${app.positionName}`,
                  value: app._id.toString()
                })))
            );
            components.push(selectMenu);
          }

          // Add reload button
          const reloadButton = new ButtonBuilder()
            .setCustomId('reload_panel')
            .setLabel('Reload Panel')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔄');

          const reloadRow = new ActionRowBuilder().addComponents(reloadButton);
          components.push(reloadRow);

          // Send the panel
          const panelMessage = await channel.send({
            embeds: [panelEmbed],
            components: components
          });

          // Create or update panel record
          await Panel.findOneAndUpdate(
            { channelId: channel.id },
            {
              applicationId: activeApplications[0]?._id || null,
              messageId: panelMessage.id,
              channelId: channel.id,
              guildId: message.guildId
            },
            { upsert: true }
          );

          await message.reply({
            content: `✅ Application panel has been sent to ${channel}!`,
            ephemeral: true,
          });
          break;

        case "vap":
          if (!(await isAdmin(message.member))) {
            return message.reply(
              "❌ You do not have permission to view application panels."
            );
          }
          const applications = await Application.find({
            guildId: message.guildId,
            active: true,
          });

          if (applications.length === 0) {
            return message.reply("📝 There are no active application panels.");
          }

          const vapEmbed = createEmbed(
            "Active Application Panels",
            applications
              .map(
                (app, index) =>
                  `${index + 1}. **${app.positionName}**\n` +
                  `┗ Channel: <#${app.channels.panel}>\n` +
                  `┗ Open Positions: ${app.openPositions}\n` +
                  `┗ Duration: ${
                    app.duration.type === "days"
                      ? `${app.duration.days} days`
                      : "Until filled"
                  }`
              )
              .join("\n\n")
          );

          await message.reply({ embeds: [vapEmbed] });
          break;

        case "toggle":
          if (!(await isAdmin(message.member))) {
            return message.reply(
              "❌ You do not have permission to manage applications."
            );
          }
          if (!args[0]) {
            return message.reply(
              "❌ Please provide a position ID: !toggle <position_id>"
            );
          }

          const positionId = args[0];
          const application = await Application.findById(positionId);

          if (!application) {
            return message.reply("❌ Position not found.");
          }

          if (application.guildId !== message.guildId) {
            return message.reply(
              "❌ This position does not belong to this server."
            );
          }

          application.active = !application.active;
          await application.save();

          await message.reply({
            content: `✅ Position "${application.positionName}" has been ${
              application.active ? "enabled" : "disabled"
            }.`,
          });
          break;

        case "status":
          const targetUser = message.mentions.users.first() || message.author;
          const isAdminRequest = targetUser.id !== message.author.id;

          if (isAdminRequest && !(await isAdmin(message.member))) {
            return message.reply(
              "❌ You do not have permission to view other users' applications."
            );
          }

          const submissions = await Submission.find({
            userId: targetUser.id,
            guildId: message.guildId,
          }).populate("applicationId");

          if (submissions.length === 0) {
            return message.reply(
              isAdminRequest
                ? `📝 ${targetUser.tag} has not submitted any applications.`
                : "📝 You have not submitted any applications."
            );
          }

          const statusEmbeds = submissions.map((submission) =>
            createStatusEmbed(submission)
          );
          await message.reply({
            content: isAdminRequest
              ? `📝 Applications for ${targetUser.tag}:`
              : "📝 Your application status:",
            embeds: statusEmbeds,
          });
          break;

        case "help":
          const helpEmbed = createEmbed(
            "Staff Applications Help",
            "📝 Welcome to the Staff Applications System!\n\n" +
              "Available Commands:\n\n" +
              "**Admin Commands:**\n" +
              "`!sa` - Start creating a new staff application\n" +
              "`!sap #channel` - Send/update application panel in a channel\n" +
              "`!vap` - View all active application panels\n" +
              "`!toggle position_id` - Enable/disable a position\n" +
              "`!status @user` - View applications for a specific user\n\n" +
              "**User Commands:**\n" +
              "`!status` - Check your application status\n" +
              "`!help` - Show this help message\n\n" +
              "**How to Apply:**\n" +
              "1. Find an application panel in the designated channel\n" +
              "2. Click the position you want to apply for\n" +
              "3. Fill out the application form\n" +
              "4. Wait for staff to review your application"
          );

          await message.reply({ embeds: [helpEmbed] });
          break;

        case "sau":
          if (!(await isAdmin(message.member))) {
            return message.reply(
              "❌ You do not have permission to update or delete staff applications."
            );
          }
          const allApplications = await Application.find({ guildId: message.guildId });
          if (allApplications.length === 0) {
            return message.reply("📝 There are no applications in the system.");
          }
          for (const app of allApplications) {
            const appEmbed = createEmbed(
              `Application: ${app.positionName}`,
              `**Description:** ${app.description || "No description provided"}\n` +
              `**Open Positions:** ${app.openPositions}\n` +
              `**Duration:** ${app.duration.type === "days" ? `${app.duration.days} days` : "Until filled"}\n` +
              `**Role ID:** ${app.roleId}\n` +
              `**Allow Resubmit:** ${app.allowResubmit ? "Yes" : "No"}\n` +
              `**Active:** ${app.active ? "Yes" : "No"}`
            );
            const updateButton = new ButtonBuilder()
              .setCustomId(`update_app_${app._id}`)
              .setLabel("Update")
              .setStyle(ButtonStyle.Primary)
              .setEmoji("✏️");
            const deleteButton = new ButtonBuilder()
              .setCustomId(`delete_app_${app._id}`)
              .setLabel("Delete")
              .setStyle(ButtonStyle.Danger)
              .setEmoji("🗑️");
            const row = new ActionRowBuilder().addComponents(updateButton, deleteButton);
            const sentMsg = await message.reply({ embeds: [appEmbed], components: [row] });
            // Track the message for later deletion
            sauMessageCache.push(sentMsg);
            setTimeout(async () => {
              try {
                await sentMsg.delete();
              } catch (e) { /* ignore if already deleted */ }
            }, 120000);
          }
          break;
      }
    } catch (error) {
      console.error("Error handling command:", error);
      await message.reply(
        "❌ An error occurred while processing your command."
      );
    }
  },
};
