const {
  Collection,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require("discord.js");
const {
  createEmbed,
  createApplicationModal,
  createSubmissionModal,
} = require("../utils/embedUtils");
const { isAdmin, isApplicationOpen } = require("../utils/permissionUtils");
const Application = require("../models/Application");
const Submission = require("../models/Submission");
const externalModalHandlers = require("./modalHandlers");
const externalButtonHandlers = require("./buttonHandlers");
const externalSelectHandlers = require("./selectHandlers");

class InteractionHandler {
  constructor() {
    this.buttons = new Collection();
    this.modals = new Collection();
    this.selectMenus = new Collection();
    this.setupHandlers();
  }

  setupHandlers() {
    // Register modal handlers from modalHandlers.js
    for (const [id, handler] of externalModalHandlers.entries()) {
      this.modals.set(id, handler);
    }

    // Register button handlers from buttonHandlers.js
    for (const [id, handler] of externalButtonHandlers.entries()) {
      this.buttons.set(id, handler);
    }

    // Register select menu handlers from selectHandlers.js
    for (const [id, handler] of externalSelectHandlers.entries()) {
      this.selectMenus.set(id, handler);
    }

    // Button Handlers
    this.buttons.set("new_application_config", async (interaction) => {
      if (!(await isAdmin(interaction.member))) {
        return interaction.reply({
          content: "❌ You do not have permission to manage staff applications.",
          ephemeral: true,
        });
      }
      const modal = createApplicationModal();
      await interaction.showModal(modal);
    });

    this.buttons.set("use_previous_config", async (interaction) => {
      try {
        if (!(await isAdmin(interaction.member))) {
          return interaction.reply({
            content: "❌ You do not have permission to manage staff applications.",
            ephemeral: true,
          });
        }

        const lastApplication = await Application.findOne({
          guildId: interaction.guildId,
        }).sort({ createdAt: -1 });

        if (!lastApplication) {
          return interaction.reply({
            content: "❌ No previous configuration found. Please create a new configuration.",
            ephemeral: true,
          });
        }

        const configEmbed = createEmbed(
          "Previous Configuration",
          `**Panel Channel:** <#${lastApplication.channels.panel}>\n` +
            `**Notifications:** <#${lastApplication.channels.notifications}>\n` +
            `**History:** <#${lastApplication.channels.history}>\n` +
            `**Management Roles:** ${
              lastApplication.acceptingRoles
                ?.map((r) => `<@&${r}>`)
                .join(", ") || "None set"
            }`
        ).setFooter({ 
          text: "Configuration management • Made with ♥ by BitCraft Network",
          iconURL: "https://i.imgur.com/OMqZfgz.png"
        });

        // Send the message with the configuration details
        const sentMessage = await interaction.reply({
          embeds: [configEmbed],
          fetchReply: true,
          ephemeral: false, // Make it visible so reactions can be added
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
              components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId("new_application_config")
                  .setLabel("Open Configuration Modal")
                  .setStyle(ButtonStyle.Primary)
              )]
            });
          }
        } catch (error) {
          // If no reaction after timeout
          await sentMessage.edit({
            content: "⏱️ No reaction received. Application creation cancelled.",
            embeds: [],
          });
        }
      } catch (error) {
        console.error("Error in use_previous_config button:", error);
        await this.handleError(interaction);
      }
    });

    this.buttons.set("confirm_previous_config", async (interaction) => {
      try {
        if (!(await isAdmin(interaction.member))) {
          return interaction.reply({
            content: "❌ You do not have permission to manage staff applications.",
            ephemeral: true,
          });
        }

        const lastApplication = await Application.findOne({
          guildId: interaction.guildId,
        }).sort({ createdAt: -1 });

        if (!lastApplication) {
          return interaction.reply({
            content: "❌ No previous configuration found. Please create a new configuration.",
            ephemeral: true,
          });
        }

        const application = new Application({
          ...lastApplication.toObject(),
          active: true,
        });

        await application.save();

        await interaction.reply({
          content: "✅ Previous configuration has been used to create a new application.",
          ephemeral: true,
        });
      } catch (error) {
        console.error("Error in confirm_previous_config button:", error);
        await this.handleError(interaction);
      }
    });

    // Select Menu Handlers
    this.selectMenus.set("apply", async (interaction) => {
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

        if (!isApplicationOpen(application)) {
          return interaction.reply({
            content: "❌ This position is no longer accepting applications.",
            ephemeral: true,
          });
        }

        const existingSubmission = await Submission.findOne({
          userId: interaction.user.id,
          applicationId: applicationId,
          status: "pending",
        });

        if (existingSubmission) {
          return interaction.reply({
            content: "❌ You already have a pending application for this position.",
            ephemeral: true,
          });
        }

        const modal = createSubmissionModal();
        modal.setCustomId(`submit_application_${applicationId}`);
        await interaction.showModal(modal);
      } catch (error) {
        console.error("Error in apply select menu:", error);
        await this.handleError(interaction);
      }
    });
  }

  /**
   * Robustly handle button interactions, supporting both exact and prefix-matched dynamic IDs.
   * Maintainers: To add a new dynamic button, add a prefix check below and register the handler in buttonHandlers.
   */
  async handleButton(interaction) {
    const customId = interaction.customId;
    let handler;
    let handlerId;
    
    try {
      // Prefix-matching for dynamic button IDs
      if (customId.startsWith('accept_')) {
        handlerId = 'accept';
        handler = this.buttons.get(handlerId);
        if (handler) {
          const submissionId = customId.replace('accept_', '');
          await handler(interaction, submissionId);
          return;
        }
      } else if (customId.startsWith('reject_')) {
        handlerId = 'reject';
        handler = this.buttons.get(handlerId);
        if (handler) {
          const submissionId = customId.replace('reject_', '');
          await handler(interaction, submissionId);
          return;
        }
      } else if (customId.startsWith('update_app_')) {
        handlerId = 'update_app';
        handler = this.buttons.get(handlerId);
        if (handler) {
          const applicationId = customId.replace('update_app_', '');
          await handler(interaction, applicationId);
          return;
        }
      } else if (customId.startsWith('delete_app_')) {
        handlerId = 'delete_app';
        handler = this.buttons.get(handlerId);
        if (handler) {
          const applicationId = customId.replace('delete_app_', '');
          await handler(interaction, applicationId);
          return;
        }
      } else if (customId.startsWith('continue_setup')) {
        handlerId = 'continue_setup';
        handler = this.buttons.get(handlerId);
        if (handler) {
          await handler(interaction);
          return;
        }
      } else if (customId.startsWith('submit_application_')) {
        // This is a modal, not a button, but for future-proofing
        handlerId = 'submit_application';
        handler = this.buttons.get(handlerId);
        if (handler) {
          const applicationId = customId.replace('submit_application_', '');
          await handler(interaction, applicationId);
          return;
        }
      } else if (this.buttons.has(customId)) {
        handler = this.buttons.get(customId);
        await handler(interaction);
        return;
      }
      // Fallback: log and reply
      console.error(`No handler found for button: ${customId}`);
      await this.handleError(interaction);
    } catch (error) {
      console.error(`Error handling button interaction (${customId}):`, error);
      // Try to respond with an error message if possible
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '❌ An error occurred while processing your request.',
            ephemeral: true
          });
        } else if (interaction.replied) {
          await interaction.followUp({
            content: '❌ An error occurred while processing your request.',
            ephemeral: true
          });
        }
      } catch (replyError) {
        console.error('Failed to send error reply:', replyError);
        // If the interaction is no longer valid, we can't do anything about it
      }
    }
  }

  /**
   * Robustly handle modal interactions, supporting both exact and prefix-matched dynamic IDs.
   * Maintainers: To add a new dynamic modal, add a prefix check below and register the handler in modalHandlers.
   */
  async handleModal(interaction) {
    try {
      const { customId } = interaction;
      let handler;
      let handlerId;
      // Prefix-matching for dynamic modal IDs
      if (customId.startsWith('submit_application_')) {
        handlerId = 'submit_application';
        handler = this.modals.get(handlerId);
        if (handler) {
          const applicationId = customId.replace('submit_application_', '');
          await handler(interaction, applicationId);
          return;
        }
      } else if (customId.startsWith('reject_')) {
        handlerId = 'reject_application';
        handler = this.modals.get(handlerId);
        if (handler) {
          const submissionId = customId.replace('reject_', '');
          await handler(interaction, submissionId);
          return;
        }
      } else if (customId.startsWith('allow_resubmit_modal')) {
        handlerId = 'allow_resubmit_modal';
        handler = this.modals.get(handlerId);
        if (handler) {
          await handler(interaction);
          return;
        }
      } else if (this.modals.has(customId)) {
        handler = this.modals.get(customId);
        await handler(interaction);
        return;
      }
      // Fallback: log and reply
      console.error(`No handler found for modal: ${customId}`);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ This modal is not supported.',
          ephemeral: true,
        });
      }
    } catch (error) {
      console.error('Error in modal handler:', error);
      await this.handleError(interaction, error);
    }
  }

  /**
   * Robustly handle select menu interactions, supporting both exact and prefix-matched dynamic IDs.
   * Maintainers: To add a new dynamic select, add a prefix check below and register the handler in selectHandlers.
   */
  async handleSelectMenu(interaction) {
    const customId = interaction.customId;
    let handler;
    let handlerId;
    
    try {
      if (customId.startsWith('apply')) {
        handlerId = 'apply';
        handler = this.selectMenus.get(handlerId);
        if (handler) {
          await handler(interaction);
          return;
        }
      } else if (this.selectMenus.has(customId)) {
        handler = this.selectMenus.get(customId);
        await handler(interaction);
        return;
      }
      // Fallback: log and reply
      console.error(`No handler found for select menu: ${customId}`);
      await this.handleError(interaction);
    } catch (error) {
      console.error(`Error handling select menu interaction (${customId}):`, error);
      // Try to respond with an error message if possible
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '❌ An error occurred while processing your request.',
            ephemeral: true
          });
        } else if (interaction.replied) {
          await interaction.followUp({
            content: '❌ An error occurred while processing your request.',
            ephemeral: true
          });
        }
      } catch (replyError) {
        console.error('Failed to send error reply:', replyError);
        // If the interaction is no longer valid, we can't do anything about it
      }
    }
  }

  async handleError(interaction, error) {
    const errorMessage = "❌ An error occurred while processing your request.";

    if (interaction.replied || interaction.deferred) {
      await interaction
        .followUp({
          content: errorMessage,
          flags: MessageFlags.Ephemeral,
        })
        .catch(console.error);
    } else {
      await interaction
        .reply({
          content: errorMessage,
          flags: MessageFlags.Ephemeral,
        })
        .catch(console.error);
    }
  }
}

module.exports = new InteractionHandler();
