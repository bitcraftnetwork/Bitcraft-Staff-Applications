# Environment Configuration System

## Overview

This project uses a dynamic environment configuration system that loads different `.env` files based on the npm script being run. This allows for separate configurations for development, testing, and production environments.

## Environment Files

The system uses the following environment files:

- `.env` - Default environment file used for production
- `.env.dev` - Development environment file used when running `npm run dev`
- `.env.test` - Test environment file used when running `npm run test`

## How It Works

The system determines which environment file to load based on the npm script being executed:

- When running `npm run test`, it loads `.env.test`
- When running `npm run dev`, it loads `.env.dev`
- When running `npm start` or any other script, it loads the default `.env` file

If the specific environment file is not found, the system falls back to the default `.env` file.

## Setting Up Environment Files

1. Copy the provided template files and rename them according to your environment:
   - `.env.dev` for development
   - `.env.test` for testing
   - `.env` for production

2. Update the values in each file according to your environment-specific settings.

## Environment Variables

Each environment file should contain the following variables:

```
# Discord Bot Token
TOKEN=your_bot_token_here

# MongoDB Connection String
MONGO_URI=mongodb://localhost:27017/your_database_name

# Discord Guild ID
GUILD_ID=your_guild_id_here

# Default Admin Roles (comma-separated IDs)
DEFAULT_ADMIN_ROLES=role_id_1,role_id_2

# Default Notification Roles (comma-separated IDs)
DEFAULT_NOTIFICATION_ROLE=role_id_1,role_id_2

# Application Settings
APPLICATION_TIMEOUT=3600000

# Logging Level (debug, info, warn, error)
LOG_LEVEL=info
```

Additional environment-specific variables can be added as needed.

## Using Environment Variables in Code

You can access environment variables directly using `process.env` or through the exported config object:

```javascript
const envConfig = require('./config/env');

// Access environment variables
const mongoUri = process.env.MONGO_URI;
const nodeEnv = envConfig.NODE_ENV;
```

## Adding New Environment Variables

When adding new environment variables:

1. Add them to all environment files (`.env`, `.env.dev`, `.env.test`)
2. If they are commonly used, consider adding them to the exported object in `src/config/env.js`