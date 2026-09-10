const express = require('express');
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

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'UP',
        service: 'Indian Railways Automatic Block Planning API',
        timestamp: new Date().toISOString()
    });
});

// Mount core routes
app.use('/api/auth', authRoutes);
app.use('/api/demo', demoProtectedRoutes);
app.use('/api/corridors', corridorRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/maintenance-tasks', maintenanceTaskRoutes);
app.use('/api/block-windows', blockWindowRoutes);
app.use('/api/train-movements', trainMovementRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/v1/ai', aiGatewayRoutes);
app.use('/api/plans', planningRoutes);

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
