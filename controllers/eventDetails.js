const axios = require('axios');
const { errors } = require('ethers');
const URL = 'https://gamma-api.polymarket.com/markets/slug/btc-updown-15m-';
const URL2 = 'https://gamma-api.polymarket.com/markets/slug/btc-updown-5m-';
const PRICE_URL = `https://clob.polymarket.com/last-trade-price?token_id=`;


const parseUpDown = clobTokenIds => {
    const [up, down] = JSON.parse(clobTokenIds);
    return { UP: up, DOWN: down };
}

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

const get5minBtcEvent = async (req, res, next) => {
    const { epochTime } = req.body;
    // Validate required fields
    if (!epochTime || typeof epochTime !== 'string') {
        return res.status(400).json({
            success: false,
            message: 'Invalid epochTime: must be a non-empty string'
        });
    }

    try {
        const response = await axios.get(`${URL2}${epochTime}`);

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

const getCurrentPrice = async (req, res, next) => {
    try {
        const { epochTime, side } = req.body;

        if (!epochTime || !side) {
            return res.status(400).json({
                success: false,
                message: 'epochTime and side are required'
            });
        }

        if (!["UP", "DOWN"].includes(side)) {
            return res.status(400).json({
                success: false,
                message: 'side must be UP or DOWN'
            });
        }

        const eventRes = await axios.get(`${URL2}${epochTime}`);

        if (!eventRes.data?.clobTokenIds) {
            return res.status(404).json({
                success: false,
                message: 'Event not found or missing token data'
            });
        }

        const clobToken = parseUpDown(eventRes.data.clobTokenIds)[side];

        const priceRes = await axios.get(`${PRICE_URL}${clobToken}`);

        const price = priceRes.data?.price;
        if (price === undefined) {
            return res.status(502).json({
                success: false,
                message: 'Price data unavailable'
            });
        }

        console.log("Price: " + price * 100);


        return res.status(200).json({
            success: true,
            message: `Price for ${side}`,
            price: price * 100,
            clobId: clobToken
        });

    } catch (err) {
        next(err);
    }
};

module.exports = { getBtcEvent, get5minBtcEvent, getCurrentPrice };