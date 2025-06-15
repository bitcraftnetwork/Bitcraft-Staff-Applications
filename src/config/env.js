/**
 * Environment configuration loader
 * Loads different .env files based on the current npm script
 */

const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Determine which environment to use based on npm_lifecycle_event
const npmScript = process.env.npm_lifecycle_event || 'start';

// Define the path to the root directory
const rootDir = path.resolve(__dirname, '../../');

// Set the appropriate .env file based on the npm script
let envFile = '.env';

// Default command prefix
let commandPrefix = '!';

if (npmScript === 'test') {
  // Use test environment if running tests
  envFile = '.env.test';
  commandPrefix = '!'; // Changed from '!d-' to '!' as requested
  console.log('🧪 Loading test environment configuration');
} else if (npmScript === 'dev') {
  // Use development environment if running in dev mode
  envFile = '.env.dev';
  console.log('🛠️ Loading development environment configuration');
} else {
  // Use production environment for all other cases
  console.log('🚀 Loading production environment configuration');
}

// Check if the environment file exists
const envPath = path.join(rootDir, envFile);
if (!fs.existsSync(envPath)) {
  console.warn(`⚠️ Warning: ${envFile} file not found. Falling back to default .env file.`);
  // Fall back to the default .env file
  dotenv.config();
} else {
  // Load the appropriate environment file
  dotenv.config({ path: envPath });
}

module.exports = {
  // Export environment variables that might be needed elsewhere
  NODE_ENV: process.env.NODE_ENV || (npmScript === 'test' ? 'test' : npmScript === 'dev' ? 'development' : 'production'),
  MONGO_URI: process.env.MONGO_URI,
  COMMAND_PREFIX: process.env.COMMAND_PREFIX || commandPrefix, // Export the command prefix
  ENV_FILE: envFile, // Export the environment file name
  // Add other commonly used environment variables here
};