const { Events, MessageFlags } = require('discord.js');
const { createEmbed } = require('../utils/embedUtils');
const interactionHandler = require('../handlers/interactionHandler');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        try {
            // Skip slash commands
            if (interaction.isCommand()) return;

            // Route to appropriate handler based on interaction type
            if (interaction.isButton()) {
                // Handle purge command buttons directly
                if (interaction.customId === 'purge_confirm' || interaction.customId === 'purge_cancel') {
                    // These are handled directly in the purge command via collector
                    return;
                }
                
                await interactionHandler.handleButton(interaction);
            }
            else if (interaction.isModalSubmit()) {
                await interactionHandler.handleModal(interaction);
            }
            else if (interaction.isStringSelectMenu()) {
                await interactionHandler.handleSelectMenu(interaction);
            }
        } catch (error) {
            console.error('Error in interaction handler:', error);
            const errorMessage = '❌ An error occurred while processing your request.';
            
            try {
                // Check if the interaction is still valid before attempting to reply
                if (!interaction.isRepliable()) {
                    console.error('Interaction is no longer valid and cannot be replied to');
                    return;
                }
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ 
                        content: errorMessage,
                        flags: MessageFlags.Ephemeral 
                    }).catch(e => console.error('Failed to follow up with error message:', e));
                } else {
                    await interaction.reply({ 
                        content: errorMessage,
                        flags: MessageFlags.Ephemeral 
                    }).catch(e => console.error('Failed to reply with error message:', e));
                }
            } catch (e) {
                console.error('Error sending error message:', e);
            }
        }
    }
};
