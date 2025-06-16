const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { createEmbed } = require('../utils/embedUtils');

module.exports = {
  name: 'purge',
  aliases: ['clear', 'prune', 'clr'],
  description: 'Deletes messages from the current channel',
  async execute(message, args) {
    // Delete the command message immediately
    await message.delete().catch(error => console.error(`Failed to delete command message: ${error}`));

    // Check if user has permission to manage messages
    if (!message.member.permissions.has('ManageMessages')) {
      const noPermEmbed = createEmbed(
        'Permission Denied',
        '❌ You do not have permission to delete messages.',
        '#FF0000'
      );
      
      const reply = await message.channel.send({ embeds: [noPermEmbed] });
      setTimeout(() => reply.delete().catch(() => {}), 5000);
      return;
    }

    // Parse the number of messages to delete
    let amount = args[0] ? parseInt(args[0]) : 100; // Default to 100 if no amount specified
    
    // Validate the amount
    if (isNaN(amount) || amount < 1) {
      const invalidEmbed = createEmbed(
        'Invalid Amount',
        '❌ Please provide a valid number of messages to delete.',
        '#FF0000'
      );
      
      const reply = await message.channel.send({ embeds: [invalidEmbed] });
      setTimeout(() => reply.delete().catch(() => {}), 5000);
      return;
    }

    // Cap the amount at 100 due to Discord API limitations
    if (amount > 100) amount = 100;

    // Create confirmation embed
    const confirmEmbed = createEmbed(
      'Confirm Message Purge',
      `Are you sure you want to delete **${amount}** messages from this channel?

This action cannot be undone.`,
      '#FFA500' // Orange color for warning
    );

    // Create confirmation buttons
    const confirmButton = new ButtonBuilder()
      .setCustomId('purge_confirm')
      .setLabel('Confirm')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️');

    const cancelButton = new ButtonBuilder()
      .setCustomId('purge_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('❌');

    const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

    // Send confirmation message
    const confirmMessage = await message.channel.send({
      embeds: [confirmEmbed],
      components: [row]
    });

    // Create collector for button interactions
    const collector = confirmMessage.createMessageComponentCollector({ 
      time: 30000 // 30 seconds timeout
    });

    // Handle button interactions
    collector.on('collect', async interaction => {
      // Ensure only the command author can interact with the buttons
      if (interaction.user.id !== message.author.id) {
        await interaction.reply({ 
          content: '❌ Only the person who initiated the command can use these buttons.', 
          ephemeral: true 
        });
        return;
      }

      // Handle confirmation
      if (interaction.customId === 'purge_confirm') {
        try {
          // Try to acknowledge the interaction, but it might already be acknowledged by the collector
          await interaction.deferUpdate();
        } catch (error) {
          // Ignore the error if the interaction is already acknowledged
          console.log('Interaction already acknowledged, continuing with purge operation');
        }
        
        // Update embed to show loading state
        const loadingEmbed = createEmbed(
          'Purging Messages',
          `⏳ Deleting ${amount} messages... Please wait.`,
          '#FFA500'
        );
        
        await confirmMessage.edit({ 
          embeds: [loadingEmbed], 
          components: [] 
        });

        try {
          // Fetch one more message than requested to account for the confirmation message
          const fetchedMessages = await message.channel.messages.fetch({ limit: amount + 1 });
          
          // Filter out the confirmation message from the deletion
          const messagesToDelete = fetchedMessages.filter(msg => msg.id !== confirmMessage.id);
          
          // Only delete up to the requested amount
          const finalMessages = messagesToDelete.first(amount);
          
          await message.channel.bulkDelete(finalMessages, true)
            .catch(error => {
              console.error(`Error deleting messages: ${error}`);
              throw error;
            });

          // Show success message
          const successEmbed = createEmbed(
            'Messages Purged',
            `✅ Successfully deleted ${finalMessages.size} messages.`,
            '#00FF00' // Green color for success
          );
          
          // Try to delete the confirmation message if it still exists
          try {
            await confirmMessage.delete().catch(() => {});
          } catch (error) {
            // Message was already deleted in the bulk delete, do nothing
          }
          
          // Send a visible success message that auto-deletes after 5 seconds
          const newSuccessMessage = await message.channel.send({ embeds: [successEmbed] });
          setTimeout(() => newSuccessMessage.delete().catch(() => {}), 5000);
        } catch (error) {
          // Handle errors (like messages older than 14 days)
          const errorEmbed = createEmbed(
            'Error',
            `❌ An error occurred: ${error.message}\n\nNote: Discord doesn't allow bulk deletion of messages older than 14 days.`,
            '#FF0000' // Red color for error
          );
          
          // We can't use followUp after deferUpdate, so we'll just rely on the visible error message below
          
          // Try to delete the confirmation message if it still exists
          try {
            await confirmMessage.delete().catch(() => {});
          } catch (deleteError) {
            // Message was already deleted, do nothing
          }
          
          // Send a visible error message that auto-deletes after 10 seconds
          const newErrorMessage = await message.channel.send({ embeds: [errorEmbed] });
          setTimeout(() => newErrorMessage.delete().catch(() => {}), 10000);
        }
      } 
      // Handle cancellation
      else if (interaction.customId === 'purge_cancel') {
        try {
          // Try to acknowledge the interaction, but it might already be acknowledged by the collector
          await interaction.deferUpdate();
        } catch (error) {
          // Ignore the error if the interaction is already acknowledged
          console.log('Interaction already acknowledged, continuing with cancel operation');
        }
        
        const cancelEmbed = createEmbed(
          'Operation Cancelled',
          '✅ Message purge cancelled.',
          '#00FF00'
        );
        
        // Try to delete the confirmation message if it still exists
        try {
          await confirmMessage.delete().catch(() => {});
        } catch (error) {
          // Message was already deleted, do nothing
        }
        
        // Send a visible cancel message that auto-deletes after 5 seconds
        const newCancelMessage = await message.channel.send({ 
          embeds: [cancelEmbed]
        });
        setTimeout(() => newCancelMessage.delete().catch(() => {}), 5000);
      }

      // End the collector
      collector.stop();
    });

    // Handle collector end (timeout)
    collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        const timeoutEmbed = createEmbed(
          'Operation Timed Out',
          '⏱️ Purge command timed out due to inactivity.',
          '#808080' // Gray color for timeout
        );
        
        // Try to delete the confirmation message if it still exists
        try {
          await confirmMessage.delete().catch(() => {});
        } catch (error) {
          // Message was already deleted, do nothing
        }
        
        // Send a visible timeout message that auto-deletes after 5 seconds
        const newTimeoutMessage = await message.channel.send({ 
          embeds: [timeoutEmbed]
        });
        setTimeout(() => newTimeoutMessage.delete().catch(() => {}), 5000);
      }
    });
  }
};