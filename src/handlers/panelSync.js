const Application = require('../models/Application');
const Panel = require('../models/Panel');
const { createApplicationPanel, createConsolidatedPanel } = require('../utils/embedUtils');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

// Store cooldowns for reload button
const reloadCooldowns = new Map();

/**
 * Synchronizes all application panels across the server
 * @param {Client} client - Discord.js client
 */
async function syncAllPanels(client) {
    try {
        const applications = await Application.find({ active: true });
        const existingPanel = await Panel.findOne({});
        if ((!applications || applications.length === 0) && !existingPanel) {
            console.log('No applications or panels to sync. No panel will be shown.');
            return;
        }
        
        if (!applications || applications.length === 0) {
            console.log('No active applications to sync panels for');
            return;
        }
        
        console.log(`Syncing panels for ${applications.length} active applications`);
        
        // Get the first application to determine channel and guild
        const firstApp = applications[0];
        const guild = client.guilds.cache.get(firstApp.guildId);
        if (!guild) {
            console.log(`Guild ${firstApp.guildId} not found`);
            return;
        }
        
        // Get panel channel from the first application
        const channel = guild.channels.cache.get(firstApp.channels.panel);
        if (!channel) {
            console.log(`Panel channel ${firstApp.channels.panel} not found`);
            return;
        }
        
        // Create consolidated panel with all applications
        await createConsolidatedPanelMessage(client, applications, channel);
        
        console.log('Panel sync completed successfully');
    } catch (error) {
        console.error('Error in syncAllPanels:', error);
        throw error;
    }
}

/**
 * Creates or updates a consolidated application panel with all positions
 * @param {Client} client - Discord.js client
 * @param {Array} applications - Array of application documents
 * @param {TextChannel} channel - Discord channel
 */
async function createConsolidatedPanelMessage(client, applications, channel) {
    try {
        // Create embed with all applications (or empty state)
        const { embed, hasApplications } = createConsolidatedPanel(applications);
        
        // Create components array
        const components = [];
        
        // Add select menu if there are applications
        if (hasApplications) {
            const selectMenu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('apply')
                    .setPlaceholder('Select a position to apply for')
                    .addOptions(applications.map((app, index) => ({
                        label: `${index + 1}. ${app.positionName}`,
                        description: `Apply for ${app.positionName}`,
                        value: app._id.toString()
                    })))
            );
            components.push(selectMenu);
        }
        
        // Add reload button with cooldown
        const reloadButton = new ButtonBuilder()
            .setCustomId('reload_panel')
            .setLabel('Reload Panel')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔄');
            
        // Check cooldown
        const lastReload = reloadCooldowns.get(channel.id) || 0;
        const cooldownTime = 5 * 60 * 1000; // 5 minutes in milliseconds
        const timeLeft = cooldownTime - (Date.now() - lastReload);
        
        if (timeLeft > 0) {
            reloadButton.setDisabled(true);
            reloadButton.setLabel(`Reload (${Math.ceil(timeLeft / 1000 / 60)}m)`);
        }
        
        const reloadRow = new ActionRowBuilder().addComponents(reloadButton);
        components.push(reloadRow);
        
        // Find panel ID to use (first application or existing panel)
        let panelAppId = null;
        if (applications && applications.length > 0) {
            panelAppId = applications[0]._id;
        }
        
        // Check if a panel already exists
        const existingPanel = await Panel.findOne({ channelId: channel.id });
        
        if (existingPanel) {
            try {
                const message = await channel.messages.fetch(existingPanel.messageId);
                await message.edit({ embeds: [embed], components });
            } catch (error) {
                console.error('Error updating existing panel:', error);
                // If message not found, create new panel
                const newMessage = await channel.send({ embeds: [embed], components });
                await Panel.findOneAndUpdate(
                    { channelId: channel.id },
                    { messageId: newMessage.id },
                    { upsert: true }
                );
            }
        } else {
            // Create new panel
            const newMessage = await channel.send({ embeds: [embed], components });
            await Panel.create({
                applicationId: panelAppId,
                messageId: newMessage.id,
                channelId: channel.id,
                guildId: channel.guild.id
            });
        }
    } catch (error) {
        console.error('Error in createConsolidatedPanelMessage:', error);
        throw error;
    }
}

// Add reload button handler
async function handleReloadButton(interaction) {
    try {
        const channelId = interaction.channel.id;
        const lastReload = reloadCooldowns.get(channelId) || 0;
        const cooldownTime = 5 * 60 * 1000; // 5 minutes in milliseconds
        
        if (Date.now() - lastReload < cooldownTime) {
            const timeLeft = Math.ceil((cooldownTime - (Date.now() - lastReload)) / 1000 / 60);
            return interaction.reply({
                content: `⏳ Please wait ${timeLeft} minute(s) before reloading again.`,
                ephemeral: true
            });
        }
        
        // Update cooldown
        reloadCooldowns.set(channelId, Date.now());
        
        // Fetch fresh data from MongoDB
        const applications = await Application.find({ 
            guildId: interaction.guildId,
            active: true 
        });
        
        // Update panel
        await createConsolidatedPanelMessage(interaction.client, applications, interaction.channel);
        
        await interaction.reply({
            content: '✅ Panel has been reloaded!',
            ephemeral: true
        });
    } catch (error) {
        console.error('Error handling reload button:', error);
        await interaction.reply({
            content: '❌ An error occurred while reloading the panel.',
            ephemeral: true
        });
    }
}

module.exports = {
    syncAllPanels,
    handleReloadButton
};