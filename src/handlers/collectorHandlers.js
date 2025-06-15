// Utility to collect management roles and channel IDs from admin
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { createEmbed } = require('../utils/embedUtils');

/**
 * Collect management roles from the admin via modal or message collector.
 * @param {Interaction} interaction - The original interaction
 * @param {TextChannel} channel - The channel to collect in
 * @param {User} user - The admin user
 * @param {Function} validateRole - Function to validate role IDs
 * @returns {Promise<string[]>} - Array of role IDs
 */
async function collectManagementRoles(interaction, channel, user, validateRole) {
  const promptEmbed = () => createEmbed(
    '🔐 Management Roles',
    'Please provide the **Role IDs** (comma-separated) of those who can accept/reject applications.\n\n' +
    'You can either:\n' +
    '• Enter role IDs: `1234567890,0987654321`\n' +
    '• Mention roles: `@Admin, @Moderator`\n\n' +
    'Type `default` to use cached roles, or `cancel` to abort.'
  );

  while (true) {
    await channel.send({ content: `<@${user.id}>`, embeds: [promptEmbed()] });
    const filter = m => m.author.id === user.id;
    const collected = await channel.awaitMessages({ filter, max: 1, time: 120000 });
    const response = collected.first();
    if (!response) throw new Error('No response received.');
    const content = response.content.trim().toLowerCase();
    if (content === 'cancel') throw new Error('Cancelled by user.');
    if (content === 'default') return 'default';
    
    // Check for role mentions
    const mentionedRoles = response.mentions.roles;
    if (mentionedRoles.size > 0) {
      return Array.from(mentionedRoles.values()).map(role => role.id);
    }
    
    // If no mentions, validate role IDs
    const roleIds = response.content.split(',').map(r => r.trim()).filter(Boolean);
    let allValid = true;
    for (const id of roleIds) {
      if (!validateRole(id)) {
        allValid = false;
        break;
      }
    }
    if (allValid && roleIds.length > 0) return roleIds;
    // If invalid, prompt again
    await channel.send({ content: `<@${user.id}>`, embeds: [createEmbed('❌ Invalid Input', 'Please enter valid role IDs, mention roles, type `default`, or `cancel`.')] });
  }
}

/**
 * Collect channel IDs for panel, notification, and history.
 * @param {Interaction} interaction
 * @param {TextChannel} channel
 * @param {User} user
 * @param {Function} validateChannel
 * @returns {Promise<{panel: string, notifications: string, history: string}>}
 */
async function collectChannels(interaction, channel, user, validateChannel) {
  const promptEmbed = () => createEmbed(
    '📢 Channel Configuration',
    'Please provide the following channels (space-separated):\n' +
    '`panel_channel notification_channel history_channel`\n\n' +
    'You can either:\n' +
    '• Enter channel IDs: `1234567890 0987654321 1122334455`\n' +
    '• Mention channels: `#applications #notifications #history`\n\n' +
    'Type `default` to use cached channels, or `cancel` to abort.'
  );

  while (true) {
    await channel.send({ content: `<@${user.id}>`, embeds: [promptEmbed()] });
    const filter = m => m.author.id === user.id;
    const collected = await channel.awaitMessages({ filter, max: 1, time: 120000 });
    const response = collected.first();
    if (!response) throw new Error('No response received.');
    const content = response.content.trim().toLowerCase();
    if (content === 'cancel') throw new Error('Cancelled by user.');
    if (content === 'default') return 'default';
    
    // Check for channel mentions
    const mentionedChannels = response.mentions.channels;
    if (mentionedChannels.size >= 3) {
      const channels = Array.from(mentionedChannels.values());
      return {
        panel: channels[0].id,
        notifications: channels[1].id,
        history: channels[2].id
      };
    }
    
    // If no mentions or not enough mentions, validate channel IDs
    const [panel, notifications, history] = response.content.split(/\s+/);
    if (validateChannel(panel) && validateChannel(notifications) && validateChannel(history)) {
      return { panel, notifications, history };
    }
    // If invalid, prompt again
    await channel.send({ content: `<@${user.id}>`, embeds: [createEmbed('❌ Invalid Input', 'Please enter valid channel IDs, mention 3 channels, type `default`, or `cancel`.')] });
  }
}

module.exports = {
  collectManagementRoles,
  collectChannels
};
