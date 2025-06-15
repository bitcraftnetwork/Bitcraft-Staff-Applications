const {
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonStyle,
} = require("discord.js");

// Create a standard embed with consistent branding
function createEmbed(title, description, color = "#2F3136") {
  return new EmbedBuilder()
    .setTitle(`📝 ${title}`)
    .setDescription(description)
    .setColor(color)
    .setFooter({ 
      text: "Made with ♥ by BitCraft Network",
      iconURL: "https://i.imgur.com/OMqZfgz.png"
    });
}

// Create application acceptance embed
function createAcceptanceEmbed(applicant, position, acceptedBy = null, remainingPositions = null) {
  const embed = new EmbedBuilder()
    .setTitle('✅ Application Accepted')
    .setColor('#00FF00')
    .addFields(
      { name: 'Applicant', value: applicant, inline: true },
      { name: 'Position', value: position, inline: true }
    );
  
  if (acceptedBy) {
    embed.addFields({ name: 'Accepted by', value: acceptedBy, inline: true });
  }
  
  if (remainingPositions !== null) {
    embed.addFields({ name: 'Remaining Positions', value: remainingPositions.toString(), inline: true });
  }
  
  embed.addFields({ name: 'Date', value: new Date().toLocaleString(), inline: false })
    .setFooter({ 
      text: "Made with ♥ by BitCraft Network",
      iconURL: "https://i.imgur.com/OMqZfgz.png"
    });
  
  return embed;
}

// Create application panel embed
function createApplicationPanel(application) {
  const embed = createEmbed(
    "Staff Applications",
    `**Position:** ${application.positionName}\n` +
      `**Description:** ${
        application.description || "No description provided"
      }\n` +
      `**Open Positions:** ${application.openPositions}\n` +
      `**Duration:** ${
        application.duration.type === "days"
          ? `${application.duration.days} days`
          : "Until positions are filled"
      }`
  );

  return embed;
}

// Create modal for application creation
function createApplicationModal() {
  const modal = new ModalBuilder()
    .setCustomId("create_application")
    .setTitle("Create Staff Application");

  // Position Name Input
  const positionInput = new TextInputBuilder()
    .setCustomId("position_name")
    .setLabel("Position Name")
    .setPlaceholder("e.g., Moderator, Support Staff, etc.")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);

  // Description Input
  const descriptionInput = new TextInputBuilder()
    .setCustomId("description")
    .setLabel("Description/Responsibilities")
    .setPlaceholder("Describe the role and its responsibilities...")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000);

  // Open Positions Input
  const positionsInput = new TextInputBuilder()
    .setCustomId("open_positions")
    .setLabel("Number of Open Positions")
    .setPlaceholder("Enter a number (e.g., 1, 2, 3)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(2);

  // Duration Input
  const durationInput = new TextInputBuilder()
    .setCustomId("duration_days")
    .setLabel("Duration (days, 0 for until filled)")
    .setPlaceholder("Enter number of days or 0 for unlimited")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(3);

  // Role ID Input
  const roleInput = new TextInputBuilder()
    .setCustomId("role_id")
    .setLabel("Role ID to assign if accepted")
    .setPlaceholder("Right-click role → Copy ID")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(20);

  // Only 5 components
  modal.addComponents(
    new ActionRowBuilder().addComponents(positionInput),
    new ActionRowBuilder().addComponents(descriptionInput),
    new ActionRowBuilder().addComponents(positionsInput),
    new ActionRowBuilder().addComponents(durationInput),
    new ActionRowBuilder().addComponents(roleInput)
  );

  return modal;
}

// Create modal for application submission
function createSubmissionModal() {
  return new ModalBuilder()
    .setTitle("Staff Application")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("experience")
          .setLabel("How much experience do you have?")
          .setPlaceholder("Describe your relevant experience...")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("previous_staff")
          .setLabel("Previous staff experience?")
          .setPlaceholder("Any previous staff/moderation roles...")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("motivation")
          .setLabel("Why do you want this role?")
          .setPlaceholder("Explain your motivation...")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("additional_info")
          .setLabel("What else can you offer?")
          .setPlaceholder("Additional skills, availability, etc...")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      )
    );
}

// Create buttons for application management
function createManagementButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("accept_application")
      .setLabel("Accept")
      .setStyle("Success")
      .setEmoji("✅"),
    new ButtonBuilder()
      .setCustomId("reject_application")
      .setLabel("Reject")
      .setStyle("Danger")
      .setEmoji("❌")
  );
}

// Create status embed for applications
function createStatusEmbed(submission) {
  const statusEmoji = {
    pending: "⏳",
    accepted: "✅",
    rejected: "❌",
  };

  const embed = createEmbed(
    `${statusEmoji[submission.status]} Application: ${
      submission.applicationId.positionName
    }`,
    `**Status:** ${submission.status.toUpperCase()}\n` +
      `**Submitted:** ${new Date(
        submission.submittedAt
      ).toLocaleString()}\n\n` +
      Object.entries(submission.answers)
        .map(([key, value]) => `**${key}:**\n${value}`)
        .join("\n\n")
  ).setColor(
    submission.status === "accepted"
      ? "#00FF00"
      : submission.status === "rejected"
      ? "#FF0000"
      : "#FFA500"
  );

  return embed;
}

// Create consolidated application panel with all positions
function createConsolidatedPanel(applications) {
  const embed = new EmbedBuilder()
    .setTitle(`✨ Staff Applications ✨`)
    .setColor("#2F3136");

  // Handle case when there are no applications
  if (!applications?.length) {
    embed
      .setDescription(
        "### 🔍 **No Open Positions Available** 🔍\n\n" +
        "There are currently no open staff positions available.\n" +
        "Please check back later for new opportunities!"
      )
      .setColor("#808080")
      .setFooter({ 
        text: "Check back soon for new openings! • Made with ♥ by BitCraft Network",
        iconURL: "https://i.imgur.com/OMqZfgz.png"
      });
    return { embed, hasApplications: false };
  }

  // Add all positions as numbered list in the description with emojis
  const description = `### 🌟 **Select a position below to apply!** 🌟\n\n`;

  // Position type emojis mapping
  const positionEmojis = {
    mod: "🛡️",
    moderator: "🛡️",
    admin: "⚙️",
    administrator: "⚙️",
    event: "🎮",
    manager: "📋",
    support: "🔧",
    developer: "💻",
    designer: "🎨",
    content: "📝",
    community: "👥",
    social: "📱",
    media: "📷",
    marketing: "📢",
    staff: "👔",
  };

  embed.setDescription(description);

  // Update embed in real-time as we process applications
  applications.forEach((application, index) => {
    const positionLower = application.positionName.toLowerCase();
    const emoji =
      Object.entries(positionEmojis).find(([key]) =>
        positionLower.includes(key)
      )?.[1] ?? "📌";

    embed
      .setColor("#B6E67F")
      .addFields([
        {
          name: `${emoji} Position Details`,
          value:
            `> **Position:** ${application.positionName}\n` +
            `> **Duration:** ${
              application.duration.type === "days"
                ? `${application.duration.days} days`
                : "Until positions are filled"
            }\n` +
            `> **Open Positions:** ${application.openPositions}\n\n`,
          inline: true,
        },
      ])
      .setFooter({
        text: "Click the buttons below to apply for a position • Made with ♥ by BitCraft Network",
        iconURL: "https://i.imgur.com/OMqZfgz.png"
      });
  });

  return { embed, hasApplications: true };
}

// Create modal for updating an application (prefilled)
function createPrefilledApplicationModal(application) {
  const modal = new ModalBuilder()
    .setCustomId(`update_application_${application._id}`)
    .setTitle("Update Staff Application");

  const positionInput = new TextInputBuilder()
    .setCustomId("position_name")
    .setLabel("Position Name")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100)
    .setValue(application.positionName || "");

  const descriptionInput = new TextInputBuilder()
    .setCustomId("description")
    .setLabel("Description/Responsibilities")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000)
    .setValue(application.description || "");

  const positionsInput = new TextInputBuilder()
    .setCustomId("open_positions")
    .setLabel("Number of Open Positions")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(2)
    .setValue(application.openPositions?.toString() || "1");

  const durationInput = new TextInputBuilder()
    .setCustomId("duration_days")
    .setLabel("Duration (days, 0 for until filled)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(3)
    .setValue(application.duration?.type === "days" ? application.duration.days?.toString() : "0");

  const roleInput = new TextInputBuilder()
    .setCustomId("role_id")
    .setLabel("Role ID to assign if accepted")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(20)
    .setValue(application.roleId || "");

  modal.addComponents(
    new ActionRowBuilder().addComponents(positionInput),
    new ActionRowBuilder().addComponents(descriptionInput),
    new ActionRowBuilder().addComponents(positionsInput),
    new ActionRowBuilder().addComponents(durationInput),
    new ActionRowBuilder().addComponents(roleInput)
  );

  return modal;
}

// Add function to create resubmit decision embed
function createResubmitDecisionEmbed(cacheKey) {
  return {
    embed: new EmbedBuilder()
      .setTitle('🔄 Resubmission Option')
      .setDescription('Do you want to let users **resubmit** after their application is rejected?\n\nChoose an option below:')
      .setColor('#5865F2')
      .setFooter({ 
        text: "This setting controls if rejected users can re-apply • Made with ♥ by BitCraft Network",
        iconURL: "https://i.imgur.com/OMqZfgz.png"
      }),
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`resubmit_yes:${cacheKey}`)
          .setLabel('Yes, allow resubmission')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅'),
        new ButtonBuilder()
          .setCustomId(`resubmit_no:${cacheKey}`)
          .setLabel('No, do not allow')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('❌')
      )
    ]
  };
}

// Add this to your module.exports
module.exports = {
  createEmbed,
  createAcceptanceEmbed,
  createApplicationPanel,
  createConsolidatedPanel,
  createApplicationModal,
  createSubmissionModal,
  createManagementButtons,
  createStatusEmbed,
  createPrefilledApplicationModal,
  createResubmitDecisionEmbed,
};
