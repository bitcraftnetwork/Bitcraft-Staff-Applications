class ApplicationError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'ApplicationError';
        this.code = code;
    }
}

class PermissionError extends ApplicationError {
    constructor(message) {
        super(message, 'PERMISSION_ERROR');
        this.name = 'PermissionError';
    }
}

class ValidationError extends ApplicationError {
    constructor(message) {
        super(message, 'VALIDATION_ERROR');
        this.name = 'ValidationError';
    }
}

module.exports = {
    ApplicationError,
    PermissionError,
    ValidationError
};
