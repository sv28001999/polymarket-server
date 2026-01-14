require('dotenv').config();
const axios = require('axios');

// Get server time from Polymarket
const getServerTime = async (req, res, next) => {
    try {
        const response = await axios.get('https://clob.polymarket.com/time');

        return res.status(200).json({
            success: true,
            data: response.data,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error fetching time:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Failed to fetch server time',
            error: error.message
        });
    }
};

module.exports = {
    getServerTime
}