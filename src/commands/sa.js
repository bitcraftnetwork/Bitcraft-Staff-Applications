const { SlashCommandBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { createEmbed } = require('../utils/embedUtils');

module.exports = {
  name: 'sa',
  description: 'Start the staff application creation flow',
  async execute(message) {
    // Only allow admins
    if (!message.member.permissions.has('Administrator')) {
      return message.reply({
        content: '❌ You do not have permission to manage staff applications.',
        ephemeral: true,
      });
    }

    const embed = createEmbed(
      '👑 Staff Application Setup',
      'Welcome to the staff application creation flow!\n\n' +
      'You will be guided through the following steps:\n' +
      '🔹 **Position Name**\n' +
      '📜 **Description** (optional)\n' +
      '🔢 **Number of Positions**\n' +
      '⏳ **Application Duration** (days or until filled)\n' +
      '🎭 **Role ID to assign on acceptance**\n' +
      '🔐 **Management Roles** (who can accept/reject)\n' +
      '📤 **Panel Channel**\n' +
      '🔔 **Notification Channel**\n' +
      '📚 **History Channel**\n\n' +
      'Click the button below to begin.'
    ).setFooter({ text: 'You can cancel at any time by typing cancel.' });

    const startButton = new ButtonBuilder()
      .setCustomId('sa_create_modal')
      .setLabel('Start Application Setup')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📝');

    const row = new ActionRowBuilder().addComponents(startButton);

    await message.reply({ embeds: [embed], components: [row] });
  }
};
