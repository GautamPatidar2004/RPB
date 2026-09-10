const authService = require('../services/authService');

class AuthController {
    /**
     * POST /api/auth/login
     */
    async login(req, res) {
        try {
            const { username, password } = req.body || {};
            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'Username and password are required'
                });
            }

            const { token, user } = await authService.authenticate(username, password);
            return res.status(200).json({
                success: true,
                message: `Logged in successfully as ${user.role}`,
                token,
                user
            });
        } catch (err) {
            return res.status(401).json({
                success: false,
                error: err.message || 'Authentication failed'
            });
        }
    }

    /**
     * POST /api/auth/logout
     */
    async logout(req, res) {
        try {
            authService.destroySession(req.token);
            return res.status(200).json({
                success: true,
                message: 'Logged out successfully'
            });
        } catch (err) {
            return res.status(500).json({
                success: false,
                error: 'Error logging out'
            });
        }
    }

    /**
     * GET /api/auth/me
     */
    async getCurrentUser(req, res) {
        return res.status(200).json({
            success: true,
            user: req.user
        });
    }

    /**
     * GET /api/auth/demo-accounts
     */
    async getDemoAccounts(req, res) {
        const accounts = authService.getDemoAccounts();
        return res.status(200).json({
            success: true,
            demoAccounts: accounts
        });
    }
}

module.exports = new AuthController();
