const crypto = require('crypto');
const { verifyPassword, hashPassword } = require('../utils/password');
const { pool } = require('../config/db');

// In-memory session store: token -> session data
// Zero JWT/OAuth complexity, simple to replace with Redis/JWT later
const sessions = new Map();

// Canonical demo accounts with pre-hashed scrypt passwords
const DEMO_USERS = [
    {
        id: '44444444-4444-4444-4444-444444444444',
        username: 'gautam@example.com',
        email: 'gautam@example.com',
        role: 'Admin',
        fullName: 'Gautam Patidar',
        designation: 'Chief Operations & Planning Engineer (Admin)',
        department: 'ENGG',
        employeeId: 'IR-ADM-002',
        // Password: Gautam123
        passwordHash: 'ec4776b50982995892d660d7906b62f9:69a1440ff23e657dfeb7c6aeed1163f9b5fd405bbc1e3119dadda8c0a47c235be39ce7d55c3cffc36c6be81def983a0b0835d9b2f7a4cedc829035343ebea528'
    },
    {
        id: '11111111-1111-1111-1111-111111111111',
        username: 'admin',
        role: 'Admin',
        fullName: 'System Administrator',
        designation: 'Principal Chief Operations Manager (IT)',
        department: null,
        employeeId: 'IR-ADM-001',
        // Password: Admin@123
        passwordHash: '8f969a7f47bd0ffa9dc92dc1043f8baa:8367dd3f73baa47190311bb5c19d93c442bb3b31e7b04002ca5855b6779e059df07bb905edd69344993da5a9f5b1c1852306f564cb2c9fe75104b7eb4aea2d27'
    },
    {
        id: '22222222-2222-2222-2222-222222222222',
        username: 'planner',
        role: 'Planner',
        fullName: 'Rajesh Sharma',
        designation: 'Senior Section Engineer (Planning)',
        department: 'ENGG',
        employeeId: 'IR-PLN-102',
        // Password: Planner@123
        passwordHash: 'ef4613bd8b3d151aaffc6db1504882f1:2cfa7b6ecad87baa0060e7978fae9e1a3e9d4e9ea10f34a940d1cb5062502336fc1d091bf24b288cfcd6dbe13eb56959744cc2d322cd4964047bfe00dfdf453f'
    },
    {
        id: '33333333-3333-3333-3333-333333333333',
        username: 'operations',
        role: 'Operations',
        fullName: 'Amit Verma',
        designation: 'Chief Controller (Operating)',
        department: 'OPTG',
        employeeId: 'IR-OPS-204',
        // Password: Operations@123
        passwordHash: 'f1697dafba1a1b46ee5f15e0a9031524:4b7a0ad1837cf277be2f42a2f23cc95c434255c69776c6a848e2e91466dc2ee159454bb16b5e25169df6263de3bea40d064927df9b0dfe7db79479d75857a542'
    }
];

class AuthService {
    /**
     * Look up user by username:
     * Checks database if reachable, otherwise seamlessly falls back to demo records.
     */
    async findUserByUsername(username) {
        if (!username) return null;
        const normalized = username.trim().toLowerCase();

        // 1. Try querying PostgreSQL if pool is available
        try {
            const queryText = `
                SELECT 
                    u.id, 
                    u.username, 
                    u.password_hash AS "passwordHash", 
                    u.full_name AS "fullName", 
                    u.designation, 
                    u.employee_id AS "employeeId",
                    r.name AS role,
                    d.code AS department
                FROM users u
                JOIN roles r ON u.role_id = r.id
                LEFT JOIN departments d ON u.department_id = d.id
                WHERE LOWER(u.username) = $1 AND u.is_active = TRUE AND u.deleted_at IS NULL
                LIMIT 1
            `;
            const result = await pool.query(queryText, [normalized]);
            if (result.rows.length > 0) {
                return result.rows[0];
            }
        } catch {
            // DB offline / not yet migrated; proceed to fallback demo store
        }

        // 2. Fallback to in-memory demo users
        return DEMO_USERS.find(u => u.username.toLowerCase() === normalized) || null;
    }

    /**
     * Authenticate credentials and establish an active session token
     */
    async authenticate(username, password) {
        if (!username || !password) {
            throw new Error('Username and password are required');
        }

        const user = await this.findUserByUsername(username);
        if (!user) {
            throw new Error('Invalid credentials');
        }

        const isValid = verifyPassword(password, user.passwordHash);
        if (!isValid) {
            throw new Error('Invalid credentials');
        }

        // Generate clean random session token
        const token = crypto.randomUUID();
        const sessionUser = {
            id: user.id,
            username: user.username,
            role: user.role,
            fullName: user.fullName,
            designation: user.designation,
            department: user.department,
            employeeId: user.employeeId
        };

        sessions.set(token, {
            user: sessionUser,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        });

        return { token, user: sessionUser };
    }

    /**
     * Retrieve active session by token
     */
    getSession(token) {
        if (!token || !sessions.has(token)) {
            return null;
        }

        const session = sessions.get(token);
        if (session.expiresAt && session.expiresAt < new Date()) {
            sessions.delete(token);
            return null;
        }

        return session;
    }

    /**
     * Invalidate session on logout
     */
    destroySession(token) {
        if (!token) return false;
        return sessions.delete(token);
    }

    /**
     * Create a new user signup
     */
    async signup({ username, email, password, role = 'Admin', fullName = 'Gautam Patidar', designation = 'Chief Planning Engineer (Admin)', department = 'ENGG' }) {
        const idKey = (username || email || '').trim().toLowerCase();
        if (!idKey || !password) {
            throw new Error('Username/email and password are required');
        }

        const existing = await this.findUserByUsername(idKey);
        if (existing) {
            throw new Error('User already exists');
        }

        const passwordHash = hashPassword(password);
        const newUser = {
            id: crypto.randomUUID(),
            username: idKey,
            email: idKey,
            role,
            fullName,
            designation,
            department,
            employeeId: `IR-${role.substring(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`,
            passwordHash
        };

        DEMO_USERS.unshift(newUser);

        // Auto authenticate and generate session
        return this.authenticate(newUser.username, password);
    }

    /**
     * Metadata of available demo accounts
     */
    getDemoAccounts() {
        return [
            { username: 'gautam@example.com', role: 'Admin', hint: 'Gautam123', designation: 'Chief Planning Engineer (Admin)' },
            { username: 'admin', role: 'Admin', hint: 'Admin@123', designation: 'System Administrator' },
            { username: 'planner', role: 'Planner', hint: 'Planner@123', designation: 'Sr. Section Engineer (Planning)' },
            { username: 'operations', role: 'Operations', hint: 'Operations@123', designation: 'Chief Controller (Operating)' }
        ];
    }
}

module.exports = new AuthService();
