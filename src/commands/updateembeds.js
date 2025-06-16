const { createEmbed } = require('../utils/embedUtils');
const { isAdmin } = require('../utils/permissionUtils');
const Submission = require('../models/Submission');
const Application = require('../models/Application');
const envConfig = require('../config/env');

module.exports = {
    name: 'updateembeds',
    description: 'Update all pending application notification embeds with answers',
    async execute(message, client) {
        // Check permissions
        if (!(await isAdmin(message.member))) {
            return message.reply('❌ You do not have permission to manage application embeds.');
        }

        // Send initial response
        const loadingMsg = await message.reply('⏳ Updating application notification embeds...');

        try {
            // Find all pending submissions
            const pendingSubmissions = await Submission.find({ 
                guildId: message.guild.id,
                status: 'pending'
            }).populate('applicationId');

            if (pendingSubmissions.length === 0) {
                return loadingMsg.edit('ℹ️ No pending submissions found to update.');
            }

            let updatedCount = 0;
            let errorCount = 0;

            // Process each submission
            for (const submission of pendingSubmissions) {
                try {
                    // Get the application
                    const application = submission.applicationId;
                    if (!application) {
                        console.error(`Application not found for submission ${submission._id}`);
                        errorCount++;
                        continue;
                    }

                    // Get the notification channel
                    const notifyChannel = message.guild.channels.cache.get(application.channels.notifications);
                    if (!notifyChannel) {
                        console.error(`Notification channel not found for application ${application._id}`);
                        errorCount++;
                        continue;
                    }

                    // Try to find the user
                    const user = await client.users.fetch(submission.userId).catch(() => null);
                    if (!user) {
                        console.error(`User not found for submission ${submission._id}`);
                        errorCount++;
                        continue;
                    }

                    // Search for messages with the accept/reject buttons for this submission
                    const messages = await notifyChannel.messages.fetch({ limit: 100 });
                    const submissionMessage = messages.find(msg => 
                        msg.components?.length > 0 && 
                        msg.components[0].components?.some(comp => 
                            comp.customId === `accept_${submission._id}` || 
                            comp.customId === `reject_${submission._id}`
                        )
                    );

                    if (!submissionMessage) {
                        console.error(`Notification message not found for submission ${submission._id}`);
                        errorCount++;
                        continue;
                    }

                    // Create updated embed with answers
                    const updatedEmbed = createEmbed(
                        "New Application Submitted",
                        `**User:** ${user.tag}\n**Position:** ${application.positionName}\n\n**Age & Timezone:**\n${submission.answers.age_location}\n\n**Availability:**\n${submission.answers.availability}\n\n**Discord & Minecraft Experience:**\n${submission.answers.discord_minecraft_experience}\n\n**Why Staff:**\n${submission.answers.why_staff}\n\n**What Makes You Unique:**\n${submission.answers.what_makes_you_unique || "Not provided"}`
                    ).setFooter({ 
                        text: "New application awaiting review • Made with ♥ by BitCraft Network",
                        iconURL: "https://i.imgur.com/OMqZfgz.png"
                    });

                    // Update the message
                    await submissionMessage.edit({ embeds: [updatedEmbed] });
                    updatedCount++;
                } catch (submissionError) {
                    console.error(`Error updating submission ${submission._id}:`, submissionError);
                    errorCount++;
                }
            }

            // Update the loading message with results
            await loadingMsg.edit(`✅ Updated ${updatedCount} notification embeds with answers.${errorCount > 0 ? ` (${errorCount} errors)` : ''}`);
        } catch (error) {
            console.error('Error in updateembeds command:', error);
            await loadingMsg.edit('❌ An error occurred while updating notification embeds.');
        }
    }
};