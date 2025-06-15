const { createEmbed } = require('../utils/embedUtils');
const { isAdmin } = require('../utils/permissionUtils');
const { createOrUpdatePanel } = require('../handlers/panelSync');
const envConfig = require('../config/env');

module.exports = {
    name: 'sap',
    description: 'Send or update application panel in a channel',
    async execute(message, client) {
        // Get the command prefix from environment config
        const PREFIX = envConfig.COMMAND_PREFIX;
        
        // Check permissions
        if (!(await isAdmin(message.member))) {
            return message.reply('❌ You do not have permission to manage application panels.');
        }

        // Get target channel
        const channel = message.mentions.channels.first();
        if (!channel) {
            return message.reply(`❌ Please mention a channel: ${PREFIX}sap #channel`);
        }

        try {
            // Create or update panel
            await createOrUpdatePanel(client, message.guild.id, channel.id);
            
            await message.reply({
                content: `✅ Application panel has been sent/updated in ${channel}!`,
                ephemeral: true
            });
        } catch (error) {
            console.error('Error in sap command:', error);
            await message.reply('❌ An error occurred while creating the application panel.');
        }
    }
};