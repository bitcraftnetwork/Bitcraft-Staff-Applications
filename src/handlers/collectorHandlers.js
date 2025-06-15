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
  // Prompt for management roles
  const promptEmbed = createEmbed(
    '🔐 Management Roles',
    'Please provide the **Role IDs** (comma-separated) of those who can accept/reject applications.\n\nExample: `1234567890,0987654321`\n\nType `default` to use cached roles, or `cancel` to abort.'
  );
  await interaction.editReply({ content: `<@${user.id}>`, embeds: [promptEmbed] });

  const filter = m => m.author.id === user.id;
  const collected = await channel.awaitMessages({ filter, max: 1, time: 120000 });
  const response = collected.first();
  if (!response) throw new Error('No response received.');
  if (response.content.toLowerCase() === 'cancel') throw new Error('Cancelled by user.');
  if (response.content.toLowerCase() === 'default') return 'default';

  const roleIds = response.content.split(',').map(r => r.trim()).filter(Boolean);
  for (const id of roleIds) {
    if (!validateRole(id)) throw new Error(`Role ID ${id} is invalid.`);
  }
  return roleIds;
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
  const promptEmbed = createEmbed(
    '📢 Channel Configuration',
    'Please provide the following channel IDs (space-separated):\n' +
    '`panel_id notification_id history_id`\n' +
    'Example: `1234567890 0987654321 1122334455`\nType `default` to use cached channels, or `cancel` to abort.'
  );
  await interaction.editReply({ content: `<@${user.id}>`, embeds: [promptEmbed] });

  const filter = m => m.author.id === user.id;
  const collected = await channel.awaitMessages({ filter, max: 1, time: 120000 });
  const response = collected.first();
  if (!response) throw new Error('No response received.');
  if (response.content.toLowerCase() === 'cancel') throw new Error('Cancelled by user.');
  if (response.content.toLowerCase() === 'default') return 'default';

  const [panel, notifications, history] = response.content.split(/\s+/);
  if (!validateChannel(panel) || !validateChannel(notifications) || !validateChannel(history)) {
    throw new Error('One or more channel IDs are invalid.');
  }
  return { panel, notifications, history };
}

module.exports = {
  collectManagementRoles,
  collectChannels
};
