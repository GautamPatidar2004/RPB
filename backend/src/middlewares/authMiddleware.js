const authService = require('../services/authService');

/**
 * Authentication middleware: ensures the request has a valid active session.
 * Attaches authenticated user details to `req.user`.
 */
function requireAuth(req, res, next) {
    let token = null;

    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
    } else if (req.headers['x-auth-token']) {
        token = req.headers['x-auth-token'].trim();
    } else if (req.query && req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized: Authentication token required'
        });
    }

    const session = authService.getSession(token);
    if (!session) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized: Invalid or expired session'
        });
    }

    req.user = session.user;
    req.token = token;
    next();
}

/**
 * Role-based authorization middleware.
 * Checks if authenticated user's role is in the list of allowed roles.
 * @param  {...string} allowedRoles (e.g. 'Planner', 'Operations', 'Admin')
 */
function requireRole(...allowedRoles) {
    const normalizedAllowed = allowedRoles.map(r => r.toLowerCase());

    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized: No active user role found'
            });
        }

        const userRole = req.user.role.toLowerCase();
        if (!normalizedAllowed.includes(userRole)) {
            return res.status(403).json({
                success: false,
                error: `Forbidden: Access restricted to roles [${allowedRoles.join(', ')}]. Current role: [${req.user.role}]`
            });
        }

        next();
    };
}

module.exports = {
    requireAuth,
    requireRole
};
