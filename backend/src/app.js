const express = require('express');
const http = require('http');
const authRoutes = require('./routes/authRoutes');
const demoProtectedRoutes = require('./routes/demoProtectedRoutes');
const corridorRoutes = require('./routes/corridorRoutes');
const assetRoutes = require('./routes/assetRoutes');
const maintenanceTaskRoutes = require('./routes/maintenanceTaskRoutes');
const blockWindowRoutes = require('./routes/blockWindowRoutes');
const trainMovementRoutes = require('./routes/trainMovementRoutes');
const syncRoutes = require('./routes/syncRoutes');
const aiGatewayRoutes = require('./routes/aiGatewayRoutes');
const planningRoutes = require('./routes/planningRoutes');
const planningRunRoutes = require('./routes/planningRunRoutes');

const app = express();

// Enable CORS for frontend clients (local Vite dev & production)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Parse JSON bodies
app.use(express.json());

// Root endpoint
app.get('/', (req, res) => {
    res.status(200).json({
        success: true,
        service: 'Indian Railways Automatic Block Planning API',
        version: '1.0.0',
        status: 'OPERATIONAL',
        endpoints: {
            health: '/api/health',
            auth: '/api/auth',
            corridors: '/api/corridors',
            plans: '/api/plans',
            maintenance_tasks: '/api/maintenance-tasks',
            train_movements: '/api/train-movements',
            sync: '/api/sync'
        },
        timestamp: new Date().toISOString()
    });
});

// Health check endpoint (backend itself)
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'UP',
        service: 'Indian Railways Automatic Block Planning API',
        timestamp: new Date().toISOString()
    });
});

// AI Engine health proxy — polls the Python AI Service on port 8000.
// Allows the browser to check AI engine status without CORS issues.
app.get('/api/health/ai-engine', (req, res) => {
    const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
    const url = new URL('/health', AI_SERVICE_URL);

    const proxyReq = http.request(
        { hostname: url.hostname, port: url.port || 8000, path: url.pathname, method: 'GET', timeout: 4000 },
        (proxyRes) => {
            let body = '';
            proxyRes.on('data', (chunk) => { body += chunk; });
            proxyRes.on('end', () => {
                if (proxyRes.statusCode === 200) {
                    try {
                        const data = JSON.parse(body);
                        return res.status(200).json({
                            connected: true,
                            status: data.status || 'healthy',
                            service: data.service || 'railway-ai-service',
                            version: data.version || '1.0.0',
                            timestamp: new Date().toISOString()
                        });
                    } catch (_) {
                        // Non-JSON but 200 response is still healthy
                        return res.status(200).json({ connected: true, status: 'healthy', timestamp: new Date().toISOString() });
                    }
                }
                return res.status(502).json({ connected: false, status: 'unhealthy', details: `AI service returned HTTP ${proxyRes.statusCode}`, timestamp: new Date().toISOString() });
            });
        }
    );

    proxyReq.on('timeout', () => {
        proxyReq.destroy();
        res.status(503).json({ connected: false, status: 'timeout', details: 'AI service did not respond within 4s', timestamp: new Date().toISOString() });
    });

    proxyReq.on('error', (err) => {
        res.status(503).json({ connected: false, status: 'unreachable', details: err.message, timestamp: new Date().toISOString() });
    });

    proxyReq.end();
});

// Mount core routes
app.use('/api/auth', authRoutes);
app.use('/api/demo', demoProtectedRoutes);
app.use('/api/corridors', corridorRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/maintenance-tasks', maintenanceTaskRoutes);
app.use('/api/maintenance-requests', maintenanceTaskRoutes);
app.use('/api/block-windows', blockWindowRoutes);
app.use('/api/train-movements', trainMovementRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/v1/ai', aiGatewayRoutes);
app.use('/api/plans', planningRoutes);
app.use('/api/planning-runs', planningRunRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: `Route not found: ${req.method} ${req.originalUrl}`
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('[Unhandled Error]:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

module.exports = app;
