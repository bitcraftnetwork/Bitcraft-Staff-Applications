// Load environment configuration based on the current npm script
const envConfig = require('./config/env');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const express = require('express');

// Log the current environment
console.log(`🌍 Current environment: ${envConfig.NODE_ENV}`);
console.log(`📄 Environment file: ${envConfig.ENV_FILE}`);
console.log(`🔧 Command prefix: ${envConfig.COMMAND_PREFIX}`);


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

// Connect to MongoDB
mongoose.connect(envConfig.MONGO_URI)
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

// We don't need to periodically sync panels as it's causing duplicate messages
// The panel will be updated when needed via the reload button or other interactions

// Sync panels on startup
client.once('ready', () => {
    syncAllPanels(client).catch(err => console.error('Error in initial panel sync:', err));
});

// Add a minimal Express server for Render.com compatibility
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, () => console.log(`Web server listening on port ${PORT}`));
