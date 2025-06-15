const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed } = require('../utils/embedUtils');
const { isAdmin } = require('../utils/permissionUtils');
const Application = require('../models/Application');
const Panel = require('../models/Panel');
const { syncAllPanels } = require('../handlers/panelSync');

module.exports = {
    name: 'deleteapps',
    description: 'Lists all current applications with delete buttons',
    async execute(message, client) {
        // Check permissions
        if (!(await isAdmin(message.member))) {
            return message.reply('❌ You do not have permission to manage staff applications.');
        }

        // Get all applications for this guild
        const applications = await Application.find({ guildId: message.guild.id });

        if (applications.length === 0) {
            return message.reply('📝 There are no applications to delete.');
        }

        // Create embed with application list
        const embed = createEmbed(
            '🗑️ Delete Applications',
            'Select an application to delete:'
        );

        // Create buttons for each application
        const rows = [];
        let currentRow = new ActionRowBuilder();
        let buttonCount = 0;

        for (let i = 0; i < applications.length; i++) {
            const app = applications[i];
            const status = app.active ? '📅 Active' : '⏸️ Inactive';
            
            const button = new ButtonBuilder()
                .setCustomId(`delete_app_${app._id}`)
                .setLabel(`${app.positionName} (${status})`)
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌');
            
            currentRow.addComponents(button);
            buttonCount++;
            
            // Discord allows max 5 buttons per row
            if (buttonCount === 5 || i === applications.length - 1) {
                rows.push(currentRow);
                currentRow = new ActionRowBuilder();
                buttonCount = 0;
            }
        }

        // Send the message with buttons
        await message.reply({
            embeds: [embed],
            components: rows
        });
    }
};