// Load environment configuration based on the current npm script
const envConfig = require('./config/env');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const express = require('express');

x// Log the current environment
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
// const interactionHandler = require('./handlers/interactionHandler');

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

// Connect to MongoDB with improved error handling and reconnection logic
const connectToMongoDB = async () => {
    try {
        const options = {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds
            socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
        };
        
        await mongoose.connect(envConfig.MONGO_URI, options);
        console.log('✅ Connected to MongoDB');
    } catch (err) {
        console.error('❌ MongoDB connection error:', err);
        // Retry connection after delay if not in test mode
        if (envConfig.NODE_ENV !== 'test') {
            console.log('🔄 Retrying MongoDB connection in 5 seconds...');
            setTimeout(connectToMongoDB, 5000);
        } else {
            process.exit(1); // Exit in test mode
        }
    }
};

// Set up MongoDB connection event listeners
mongoose.connection.on('error', err => {
    console.error('❌ MongoDB error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB disconnected. Attempting to reconnect...');
    setTimeout(connectToMongoDB, 5000);
});

mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB reconnected');
});

// Initial MongoDB connection
connectToMongoDB();

// Login to Discord with error handling
client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log('Discord bot logged in successfully'))
    .catch(err => {
        console.error('Discord login error:', err);
        process.exit(1); // Exit with error code if login fails
    });

// Add global unhandled error listeners
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', err => {
    console.error('Uncaught Exception:', err);
});

// Import panel sync handler
const { syncAllPanels } = require('./handlers/panelSync');

// We don't need to periodically sync panels as it's causing duplicate messages
// The panel will be updated when needed via the reload button or other interactions

// Sync panels on startup
client.once('ready', () => {
    syncAllPanels(client).catch(err => console.error('Error in initial panel sync:', err));
});

// Add a minimal Express server for Render.com compatibility with improved security and error handling
const app = express();
const PORT = process.env.PORT || 3000;

// Basic security middleware
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Rate limiting to prevent abuse
let requestCounts = {};
app.use((req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    requestCounts[ip] = (requestCounts[ip] || 0) + 1;
    
    // Reset counts every minute
    setTimeout(() => {
        requestCounts[ip] = Math.max(0, (requestCounts[ip] || 0) - 1);
    }, 60000);
    
    // If too many requests, return 429
    if (requestCounts[ip] > 100) {
        return res.status(429).send('Too many requests');
    }
    
    next();
});

// Routes
app.get('/', (req, res) => res.send('Bot is running!'));
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Express server error:', err);
    res.status(500).send('Internal Server Error');
});

// Start server with error handling
const server = app.listen(PORT, () => console.log(`✅ Web server listening on port ${PORT}`));

server.on('error', (err) => {
    console.error('Express server error:', err);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('HTTP server closed');
        mongoose.connection.close(false, () => {
            console.log('MongoDB connection closed');
            process.exit(0);
        });
    });
});
