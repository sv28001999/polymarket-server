// server.js
const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Root route
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'API is running',
        endpoints: {
            serverTime: '/getServerTime'
        }
    });
});

// Get server time from Polymarket
app.get('/getServerTime', async (req, res) => {
    try {
        const response = await axios.get('https://clob.polymarket.com/time');

        res.json({
            success: true,
            data: response.data,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error fetching time:', error.message);

        res.status(500).json({
            success: false,
            message: 'Failed to fetch server time',
            error: error.message
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Server error',
        error: err.message
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
    console.log(`📡 Test endpoint: http://localhost:${PORT}/getServerTime`);
});

module.exports = app;