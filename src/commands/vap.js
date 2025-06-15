const { createEmbed } = require('../utils/embedUtils');
const { isAdmin } = require('../utils/permissionUtils');
const Application = require('../models/Application');
const Panel = require('../models/Panel');

module.exports = {
    name: 'vap',
    description: 'View all active application panels',
    async execute(message) {
        // Check permissions
        if (!(await isAdmin(message.member))) {
            return message.reply('❌ You do not have permission to view application panels.');
        }

        try {
            // Get all panels for this guild
            const panels = await Panel.find({ guildId: message.guild.id });
            
            // Get all active applications
            const applications = await Application.find({
                guildId: message.guild.id,
                active: true
            });

            if (panels.length === 0) {
                return message.reply('📝 There are no application panels set up.');
            }

            const embed = createEmbed(
                'Active Application Panels',
                panels.map((panel, index) => {
                    return `${index + 1}. **Panel in <#${panel.channelId}>**\n` +
                           `┗ Applications: ${panel.applications.length}\n` +
                           `┗ Message ID: ${panel.messageId}`;
                }).join('\n\n') + '\n\n' +
                applications.map((app, index) => {
                    return `${index + 1}. **${app.positionName}**\n` +
                           `┗ Open Positions: ${app.openPositions}\n` +
                           `┗ Duration: ${app.duration.type === 'days' ? `${app.duration.days} days` : 'Until filled'}`;
                }).join('\n\n')
            );

            await message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in vap command:', error);
            await message.reply('❌ An error occurred while fetching application panels.');
        }
    }
};