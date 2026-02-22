const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./config');

// FIX: Import JWT_SECRET from shared config instead of reading raw env var.
// Previously, process.env.JWT_SECRET could be undefined in dev, causing all
// token verification to fail while server.js used a 'dev_secret' fallback separately.
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Authentication token required.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Adds { id, role } to the request object
        next();
    } catch (error) {
        return res.status(403).json({ message: 'Invalid or expired token.' });
    }
};

module.exports = authMiddleware;
