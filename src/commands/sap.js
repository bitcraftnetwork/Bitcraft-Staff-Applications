const { createEmbed } = require('../utils/embedUtils');
const { isAdmin } = require('../utils/permissionUtils');
const { createOrUpdatePanel } = require('../handlers/panelSync');

module.exports = {
    name: 'sap',
    description: 'Send or update application panel in a channel',
    async execute(message, client) {
        // Check permissions
        if (!(await isAdmin(message.member))) {
            return message.reply('❌ You do not have permission to manage application panels.');
        }

        // Get target channel
        const channel = message.mentions.channels.first();
        if (!channel) {
            return message.reply('❌ Please mention a channel: !sap #channel');
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