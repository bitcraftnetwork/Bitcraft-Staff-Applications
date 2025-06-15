const { Events } = require("discord.js");
const interactionHandler = require("../handlers/interactionHandler");

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    try {
      // Skip slash commands
      if (interaction.isCommand()) return;

      // Route to appropriate handler based on interaction type
      if (interaction.isButton()) {
        await interactionHandler.handleButton(interaction);
      } else if (interaction.isModalSubmit()) {
        await interactionHandler.handleModal(interaction);
      } else if (interaction.isStringSelectMenu()) {
        await interactionHandler.handleSelectMenu(interaction);
      }
    } catch (error) {
      console.error("Error in interaction handler:", error);
      const errorMessage =
        "❌ An error occurred while processing your request.";

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: errorMessage,
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: errorMessage,
            ephemeral: true,
          });
        }
      } catch (e) {
        console.error("Error sending error message:", e);
      }
    }
  },
};
