const Application = require('../models/Application');

// Check if user has admin permissions
async function isAdmin(member, applicationId = null) {
    if (member.permissions.has('Administrator')) return true;
    
    if (applicationId) {
        const application = await Application.findById(applicationId);
        if (!application) return false;
        
        return member.roles.cache.some(role => 
            application.acceptingRoles.includes(role.id)
        );
    }
    
    return false;
}

// Validate channel ID
function isValidChannel(guild, channelId) {
    return guild.channels.cache.has(channelId);
}

// Validate role ID
function isValidRole(guild, roleId) {
    return guild.roles.cache.has(roleId);
}

// Check if application is still open
function isApplicationOpen(application) {
    if (!application.active) return false;
    
    if (application.duration.type === 'untilFilled') {
        return true;
    }
    
    return application.duration.endDate > new Date();
}

module.exports = {
    isAdmin,
    isValidChannel,
    isValidRole,
    isApplicationOpen
};
