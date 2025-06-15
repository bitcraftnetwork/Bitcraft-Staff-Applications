<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

This is a Discord.js v14+ bot project that implements a staff application system. The bot uses:
- Node.js for runtime
- discord.js v14+ for Discord API integration
- Mongoose for MongoDB interaction
- dotenv for environment variables
- use centralized interaction handler so that its easy to maintain and debug

Key components:
1. Command handling system in /src/commands
2. Event handling system in /src/events
3. MongoDB models in /src/models
4. Utility functions in /src/utils

When suggesting code:
- Use discord.js v14+ best practices
- Implement proper error handling
- Follow MongoDB schema best practices
- Use async/await for asynchronous operations
- Include JSDoc comments for documentation
