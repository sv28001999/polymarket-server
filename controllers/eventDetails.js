const axios = require('axios');
const { errors } = require('ethers');
const URL = 'https://gamma-api.polymarket.com/markets/slug/btc-updown-15m-';
const URL2 = 'https://gamma-api.polymarket.com/markets/slug/btc-updown-5m-';
const PRICE_URL = `https://clob.polymarket.com/last-trade-price?token_id=`;

const fs = require('fs');
const path = require('path');
const GAMMA_API_BASE = 'https://gamma-api.polymarket.com/markets/slug/btc-updown-5m-';
// const SERVER_BASE_URL = 'https://polymarket-server-zic4.onrender.com';
const SERVER_BASE_URL = 'http://localhost:3001/';
const TXT_FILE = path.resolve('./trades.txt');


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

const getCurrentPrice15min = async (req, res, next) => {
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

        const eventRes = await axios.get(`${URL}${epochTime}`);

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

if (!fs.existsSync(TXT_FILE)) {
    fs.writeFileSync(TXT_FILE, '===== TRADE LOG =====\n', 'utf8');
}

const appendToTXT = (epoch, action, price, side) => {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] Epoch: ${epoch} | Action: ${action} | Price: ${price} | Side: ${side}\n`;
    fs.appendFileSync(TXT_FILE, line, 'utf8');
    console.log(`[TXT] ${line.trim()}`);
};

const getCurrentEventEpoch = async () => {
    const currentEpoch = (await axios.get("https://clob.polymarket.com/time")).data;
    const timestampMs = currentEpoch < 10000000000 ? currentEpoch * 1000 : currentEpoch;
    const fiveMinutes = 5 * 60 * 1000;
    const nextInterval = Math.ceil(timestampMs / fiveMinutes) * fiveMinutes;
    const epoch = currentEpoch < 10000000000
        ? Math.floor(nextInterval / 1000) - 300
        : nextInterval - 300;
    return epoch;
};

function mapToUpDown(clobTokenIds) {
    const [up, down] = JSON.parse(clobTokenIds);
    return { UP: up, DOWN: down };
}

const getCP = async (epochTime, side) => {
    const eventRes = await axios.get(`${URL2}${epochTime}`);
    const clobToken = parseUpDown(eventRes.data.clobTokenIds)[side];
    const priceRes = await axios.get(`${PRICE_URL}${clobToken}`);
    const price = priceRes.data?.price;
    console.log("Price: " + price * 100);
    return { price: price * 100, clobId: clobToken };
};

// --- POST /dummyTrading  (called by cronjob every 5 min) ---
const dummyTrading = async (req, res, next) => {
    try {
        let isOrderBuy = false;
        let isOrderSell = true;
        let isUp = false;

        const now = new Date();
        const MAX_DURATION_MS = (5 * 60 * 1000) - (now.getMinutes() % 5 * 60 * 1000 + now.getSeconds() * 1000 + now.getMilliseconds());
        const POLL_INTERVAL_MS = 1000;

        const currentEventEpoch = await getCurrentEventEpoch();
        console.log('Current epoch:', currentEventEpoch);

        const eventDetails = await axios.get(`${GAMMA_API_BASE}${currentEventEpoch}`);
        const clobId = mapToUpDown(eventDetails.data.clobTokenIds);

        const startTime = Date.now();
        const trades = [];

        await new Promise((resolve) => {
            const poll = async () => {
                if (Date.now() - startTime >= MAX_DURATION_MS) {
                    console.log(`[Epoch ${currentEventEpoch}] Max duration reached, stopping.`);
                    return resolve();
                }

                try {
                    // const currentPriceRes = await axios.post(`${SERVER_BASE_URL}/getCurrentPrice`, {
                    //     epochTime: currentEventEpoch,
                    //     side: 'UP'
                    // });
                    const currentPriceRes = await getCP(currentEventEpoch, 'UP');
                    const upPrice = currentPriceRes.price;

                    if (upPrice >= 80 && !isOrderBuy) {
                        isOrderBuy = true;
                        isOrderSell = false;
                        isUp = true;
                        appendToTXT(currentEventEpoch, 'BUY', upPrice, 'UP');
                        trades.push({ action: 'BUY', price: upPrice, side: 'UP' });
                    }

                    if (upPrice <= 20 && !isOrderBuy) {
                        isOrderBuy = true;
                        isOrderSell = false;
                        isUp = false;
                        appendToTXT(currentEventEpoch, 'BUY', 100 - upPrice, 'DOWN');
                        trades.push({ action: 'BUY', price: 100 - upPrice, side: 'DOWN' });
                    }

                    if (isOrderBuy && !isOrderSell && isUp && upPrice <= 42) {
                        appendToTXT(currentEventEpoch, 'SELL', upPrice, 'UP');
                        trades.push({ action: 'SELL', price: upPrice, side: 'UP' });
                        isOrderSell = true;
                        return resolve();
                    }

                    if (isOrderBuy && !isOrderSell && !isUp && upPrice >= 58) {
                        appendToTXT(currentEventEpoch, 'SELL', 100 - upPrice, 'DOWN');
                        trades.push({ action: 'SELL', price: 100 - upPrice, side: 'DOWN' });
                        isOrderSell = true;
                        return resolve();
                    }

                } catch (pollErr) {
                    console.error(`[Epoch ${currentEventEpoch}] Poll error:`, pollErr.message);
                }

                setTimeout(poll, POLL_INTERVAL_MS);
            };

            setTimeout(poll, POLL_INTERVAL_MS);
        });

        return res.json({
            success: true,
            epoch: currentEventEpoch,
            trades,
            message: trades.length === 0
                ? 'No trade conditions met this epoch'
                : `Completed ${trades.length} trade action(s)`
        });

    } catch (err) {
        console.error('[dummyTrading] Fatal error:', err.message);
        next(err);
    }
};

// --- GET /getTrades  (read the full trade log) ---
const getTrades = (req, res, next) => {
    try {
        if (!fs.existsSync(TXT_FILE)) {
            return res.json({ success: true, trades: [], raw: '' });
        }

        const raw = fs.readFileSync(TXT_FILE, 'utf8');

        // Parse each trade line into a structured object
        const trades = raw
            .split('\n')
            .filter(line => line.startsWith('['))   // only data lines
            .map(line => {
                // [2024-01-01T00:00:00.000Z] Epoch: 123 | Action: BUY | Price: 82 | Side: UP
                const timestamp = line.match(/\[(.+?)\]/)?.[1] ?? null;
                const epoch = line.match(/Epoch: (\S+)/)?.[1] ?? null;
                const action = line.match(/Action: (\S+)/)?.[1] ?? null;
                const price = line.match(/Price: (\S+)/)?.[1] ?? null;
                const side = line.match(/Side: (\S+)/)?.[1] ?? null;
                return { timestamp, epoch, action, price: Number(price), side };
            });

        return res.json({ success: true, total: trades.length, trades, raw });

    } catch (err) {
        console.error('[getTrades] Error reading trade log:', err.message);
        next(err);
    }
};

module.exports = { getBtcEvent, get5minBtcEvent, getCurrentPrice, getCurrentPrice15min, dummyTrading, getTrades };