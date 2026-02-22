// Shared configuration — single source of truth for JWT secret.
// Both server.js and authMiddleware.js import from here so they always agree.
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

module.exports = { JWT_SECRET };
