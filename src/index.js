require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const express = require('express');

// Create client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
    ]
});

// Initialize collections for interaction handlers
client.buttons = new Collection();
client.modals = new Collection();
client.selects = new Collection();

// Load interaction handler
const interactionHandler = require('./handlers/interactionHandler');

// Initialize collections for interaction handlers
client.buttons = new Collection();
client.modals = new Collection();
client.selects = new Collection();

// Load events
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}
client.on("interactionCreate", async (interaction) => {
  if (interaction.isModalSubmit()) {
    await interactionHandler.handleModal(interaction);
  }
});
// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Handle errors
mongoose.connection.on('error', err => {
    console.error('MongoDB error:', err);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);

// Import panel sync handler
const { syncAllPanels } = require('./handlers/panelSync');

// Set up periodic panel sync (every 5 minutes)
setInterval(() => {
    syncAllPanels(client).catch(err => console.error('Error in panel sync interval:', err));
}, 5 * 60 * 1000);

// Sync panels on startup
client.once('ready', () => {
    syncAllPanels(client).catch(err => console.error('Error in initial panel sync:', err));
});

// Add a minimal Express server for Render.com compatibility
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, () => console.log(`Web server listening on port ${PORT}`));
