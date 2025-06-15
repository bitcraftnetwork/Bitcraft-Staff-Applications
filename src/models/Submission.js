const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
    applicationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Application',
        required: true
    },
    userId: {
        type: String,
        required: true
    },
    answers: {
        experience: String,
        previousStaff: String,
        motivation: String,
        additionalInfo: String
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'pending'
    },
    rejectionReason: String,
    handledBy: {
        userId: String,
        username: String,
        timestamp: Date
    },
    submittedAt: {
        type: Date,
        default: Date.now
    },
    guildId: {
        type: String,
        required: true
    }
});

module.exports = mongoose.model('Submission', submissionSchema);
