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
const envConfig = require("../config/env");

// Global cache to track !sau response messages for deletion
const sauMessageCache = [];

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    // Get the command prefix from environment config
    const PREFIX = envConfig.COMMAND_PREFIX;

    // Ignore messages from bots and non-prefix messages
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
      // Import command files
      const updateEmbedsCommand = require('../commands/updateembeds');
      const purgeCommand = require('../commands/purge');
      
      switch (command) {
        case "updateembeds":
          // Execute the updateembeds command
          // Access client through message.client instead of using client directly
          await updateEmbedsCommand.execute(message, message.client);
          break;

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
            "Click the button below to create a new staff application position!\n\n" +
              "You'll be asked to provide:\n" +
              "• Position Name\n" +
              "• Description/Responsibilities\n" +
              "• Number of Open Positions\n" +
              "• Application Duration\n" +
              "• Role ID for accepted applicants"
          );

          await message.channel.send({
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
            return message.reply(`❌ Please mention a channel: ${PREFIX}sap #channel`);
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
              `❌ Please provide a position ID: ${PREFIX}toggle <position_id>`
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
              `\`${PREFIX}sa\` - Start creating a new staff application\n` +
              `\`${PREFIX}sap #channel\` - Send/update application panel\n` +
              `\`${PREFIX}vap\` - View all active application panels\n` +
              `\`${PREFIX}toggle position_id\` - Enable/disable a position\n` +
              `\`${PREFIX}status @user\` - View applications for a specific user\n` +
              `\`${PREFIX}add @user\` - Grant a user access to the current channel\n` +
              `\`${PREFIX}remove @user\` or \`${PREFIX}rm @user\` - Remove a user's access from the current channel\n\n` +
              "**User Commands:**\n" +
              `\`${PREFIX}status\` - Check your application status\n` +
              `\`${PREFIX}help\` - Show this help message\n\n` +
              "**How to Apply:**\n" +
              "1. Find an application panel in the designated channel\n" +
              "2. Click the position you want to apply for\n" +
              "3. Fill out the application form\n" +
              "4. Wait for staff to review your application"
          );

          await message.reply({ embeds: [helpEmbed] });
          break;

        case "sahelp":
          const sahelpEmbed = createEmbed(
            "📚 Staff Applications System Guide",
            "Welcome to the Staff Applications System! This guide will help you understand all the features and commands available.\n\n" +
            
            "**🎯 Core Features**\n" +
            "• Create and manage staff application positions\n" +
            "• Customizable application forms\n" +
            "• Application panels with select menus\n" +
            "• Notification system for new applications\n" +
            "• Application history tracking\n" +
            "• Role assignment upon acceptance\n" +
            "• Temporary channel access management\n\n" +
            
            "**👑 Admin Commands**\n" +
            `\`${PREFIX}sa\` - Start creating a new staff application\n` +
            "┗ Creates a new application position with customizable settings\n" +
            "┗ Configure position name, description, duration, and more\n\n" +
            
            `\`${PREFIX}sap #channel\` - Send/update application panel\n` +
            "┗ Creates an interactive panel in the specified channel\n" +
            "┗ Shows all active positions with a select menu\n" +
            "┗ Includes a reload button to refresh the panel\n\n" +
            
            `\`${PREFIX}sau\` - Update/Delete Applications\n` +
            "┗ Shows all applications with update/delete buttons\n" +
            "┗ Messages auto-delete after 2 minutes\n" +
            "┗ Allows quick management of existing applications\n\n" +
            
            `\`${PREFIX}vap\` - View Active Panels\n` +
            "┗ Lists all active application panels\n" +
            "┗ Shows position details and channel locations\n\n" +
            
            `\`${PREFIX}toggle position_id\` - Enable/Disable Position\n` +
            "┗ Quickly enable or disable an application position\n" +
            "┗ Useful for temporarily closing applications\n\n" +
            
            `\`${PREFIX}status @user\` - View User Applications\n` +
            "┗ Check application status for any user\n" +
            "┗ Shows all their submissions and current status\n\n" +
            
            `\`${PREFIX}add @user\` - Grant Channel Access\n` +
            "┗ Gives a user temporary access to the current channel\n" +
            "┗ Useful for adding users to private channels without role changes\n\n" +
            
            `\`${PREFIX}remove @user\` or \`${PREFIX}rm @user\` - Remove Channel Access\n` +
            "┗ Removes a user's access from the current channel\n" +
            "┗ Reverts permissions granted by the add command\n\n" +
            
            "**👤 User Commands**\n" +
            `\`${PREFIX}status\` - Check Your Applications\n` +
            "┗ View all your submitted applications\n" +
            "┗ See current status and review details\n\n" +
            
            "**📋 Application Process**\n" +
            "1. Find an application panel in the designated channel\n" +
            "2. Select the position you want to apply for\n" +
            "3. Fill out the application form with your details\n" +
            "4. Wait for staff to review your application\n" +
            "5. Receive notification of acceptance/rejection\n\n" +
            
            "**⚙️ System Features**\n" +
            "• Automatic role assignment upon acceptance\n" +
            "• Notification system for new applications\n" +
            "• Application history tracking\n" +
            "• Customizable management roles\n" +
            "• Support for multiple active positions\n" +
            "• Automatic panel updates\n" +
            "• Temporary channel access management\n\n" +
            
            "**🔔 Notifications**\n" +
            "• New applications ping management roles\n" +
            "• Applicants receive DM notifications\n" +
            "• History channel tracks all actions\n" +
            "• Panel updates are automatic\n\n"
          ).setFooter({ 
            text: "Staff Applications System v1.0 • Made with ♥ by BitCraft Network",
            iconURL: "https://i.imgur.com/OMqZfgz.png"
          });

          await message.channel.send({ embeds: [sahelpEmbed] });
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

          // Clear any existing messages in the cache
          if (sauMessageCache && sauMessageCache.length) {
            for (const msg of sauMessageCache) {
              try { await msg.delete(); } catch (e) {}
            }
            sauMessageCache.length = 0;
          }

          // Store the original command message for later deletion
          sauMessageCache.push(message);

          // Set timeout to delete the original command message after 120 seconds
          setTimeout(async () => {
            try {
              await message.delete();
              // Remove from cache after deletion
              const index = sauMessageCache.indexOf(message);
              if (index > -1) {
                sauMessageCache.splice(index, 1);
              }
            } catch (e) { /* ignore if already deleted */ }
          }, 120000);

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
            const sentMsg = await message.channel.send({ embeds: [appEmbed], components: [row] });
            // Track the message for later deletion
            sauMessageCache.push(sentMsg);
            setTimeout(async () => {
              try {
                await sentMsg.delete();
                // Remove from cache after deletion
                const index = sauMessageCache.indexOf(sentMsg);
                if (index > -1) {
                  sauMessageCache.splice(index, 1);
                }
              } catch (e) { /* ignore if already deleted */ }
            }, 120000);
          }
          break;

        case "add":
          // Check if a user was mentioned
          const userToAdd = message.mentions.users.first();
          if (!userToAdd) {
            return message.reply("❌ Please mention a user: `!add @user`");
          }

          // Check if the command user has permission to manage channels
          if (!message.member.permissions.has("ManageChannels")) {
            return message.reply("❌ You do not have permission to manage channel access.");
          }

          try {
            // Get the member object from the mentioned user
            const memberToAdd = await message.guild.members.fetch(userToAdd.id);
            
            // Add the user to the current channel by modifying permission overwrites
            // Setting ReadMessageHistory to false as per requirement
            await message.channel.permissionOverwrites.edit(memberToAdd, {
              ViewChannel: true,
              SendMessages: true,
              ReadMessageHistory: false
            });

            await message.reply(`✅ ${userToAdd} has been granted access to this channel.`);
          } catch (error) {
            console.error("Error adding user to channel:", error);
            await message.reply("❌ An error occurred while adding the user to this channel.");
          }
          break;

        case "remove":
        case "rm":
          // Check if a user was mentioned
          const userToRemove = message.mentions.users.first();
          if (!userToRemove) {
            return message.reply("❌ Please mention a user: `!remove @user` or `!rm @user`");
          }

          // Check if the command user has permission to manage channels
          if (!message.member.permissions.has("ManageChannels")) {
            return message.reply("❌ You do not have permission to manage channel access.");
          }

          try {
            // Get the member object from the mentioned user
            const memberToRemove = await message.guild.members.fetch(userToRemove.id);
            
            // Remove the user's access to the current channel
            await message.channel.permissionOverwrites.delete(memberToRemove);

            await message.reply(`✅ ${userToRemove} has been removed from this channel.`);
          } catch (error) {
            console.error("Error removing user from channel:", error);
            await message.reply("❌ An error occurred while removing the user from this channel.");
          }
          break;

        case "purge":
        case "clear":
        case "prune":
        case "clr":
          // Execute the purge command
          await purgeCommand.execute(message, args);
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