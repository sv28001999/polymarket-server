const axios = require('axios');
const URL = 'https://gamma-api.polymarket.com/markets/slug/btc-updown-15m-';

const getBtcEvent = async (req, res, next) => {
    const { epochTime } = req.body;
    // Validate required fields
    if (!epochTime || typeof epochTime !== 'string') {
        return res.status(400).json({
            success: false,
            message: 'Invalid epochTime: must be a non-empty string'
        });
    }

    try {
        const response = await axios.get(`${URL}${epochTime}`);

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
}

module.exports = { getBtcEvent };