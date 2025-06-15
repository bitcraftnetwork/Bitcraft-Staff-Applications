const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
    positionName: {
        type: String,
        required: true
    },
    managementRoles: [{
        type: String,
        required: true
    }],
    // Removed duplicate managementRoles field
    description: String,
    openPositions: {
        type: Number,
        required: true
    },
    duration: {
        type: {
            type: String,
            enum: ['days', 'untilFilled'],
            required: true
        },
        days: Number,
        endDate: Date
    },
    roleId: {
        type: String,
        required: true
    },
    acceptingRoles: [{
        type: String,
        required: true
    }],
    channels: {
        panel: {
            type: String,
            required: true
        },
        notifications: {
            type: String,
            required: true
        },
        history: {
            type: String,
            required: true
        }
    },
    active: {
        type: Boolean,
        default: true
    },
    guildId: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    },
    allowResubmit: {
        type: Boolean,
        default: false
    }
});

module.exports = mongoose.model('Application', applicationSchema);
