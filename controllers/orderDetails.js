require('dotenv').config();
const { ClobClient } = require('@polymarket/clob-client');
const { ethers } = require('ethers');
const axios = require('axios');
const URL = 'https://gamma-api.polymarket.com/markets/slug/btc-updown-15m-';

const HOST = "https://clob.polymarket.com";
const CHAIN_ID = 137; // Polygon mainnet

// Helper functions from getOpenOrders.js
function getSignatureTypeName(type) {
    const types = {
        0: 'EOA/MetaMask',
        1: 'Magic/Email',
        2: 'Proxy Wallet'
    };
    return types[type] || 'Unknown';
}

function formatSide(side) {
    if (!side) return 'N/A';
    const sideStr = side.toString().toUpperCase();
    return sideStr === 'BUY' || sideStr === '0' ? '🟢 BUY' : '🔴 SELL';
}

function formatPrice(price) {
    if (!price) return '0.00';
    return parseFloat(price).toFixed(4);
}

function formatAmount(amount) {
    if (!amount) return '0';
    return parseFloat(amount).toFixed(2);
}

function getRemainingSize(order) {
    const original = parseFloat(order.original_size || order.size || 0);
    const matched = parseFloat(order.size_matched || order.sizeMatched || 0);
    return Math.max(0, original - matched);
}

function formatDate(timestamp) {
    if (!timestamp) return 'N/A';

    // Handle Unix timestamp (seconds)
    const ts = timestamp.toString().length === 10
        ? parseInt(timestamp) * 1000
        : parseInt(timestamp);

    try {
        const date = new Date(ts);
        return date.toLocaleString();
    } catch (e) {
        return timestamp;
    }
}

// Create a compatible wallet wrapper for ethers v6
function createCompatibleWallet(privateKey) {
    const wallet = new ethers.Wallet(privateKey);

    // Add _signTypedData if it doesn't exist (for ethers v6 compatibility)
    if (!wallet._signTypedData && wallet.signTypedData) {
        wallet._signTypedData = wallet.signTypedData.bind(wallet);
    }

    return wallet;
}

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

const getOpenOrders = async (req, res, next) => {
    try {
        console.log('📗 Connecting to Polymarket CLOB...\n');

        // Validate env vars
        if (!process.env.PRIVATE_KEY) {
            return res.status(400).json({
                success: false,
                message: "PRIVATE_KEY not found in .env"
            });
        }

        if (!process.env.FUNDER_ADDRESS) {
            return res.status(400).json({
                success: false,
                message: "FUNDER_ADDRESS not found in .env"
            });
        }

        // Create signer with compatibility wrapper
        const signer = createCompatibleWallet(process.env.PRIVATE_KEY);

        // Temp client to derive API creds
        console.log('🔐 Creating API credentials...');
        const tempClient = new ClobClient(HOST, CHAIN_ID, signer);
        const apiCreds = await tempClient.createOrDeriveApiKey();
        console.log('✅ API credentials created');

        // Signature type
        const signatureType = parseInt(process.env.SIGNATTYPE || '0');
        console.log(`📝 Using signature type: ${signatureType} (${getSignatureTypeName(signatureType)})\n`);

        // Authenticated client
        const client = new ClobClient(
            HOST,
            CHAIN_ID,
            signer,
            apiCreds,
            signatureType,
            process.env.FUNDER_ADDRESS
        );

        console.log('📊 Fetching open orders...\n');

        // Fetch open orders
        const openOrders = await client.getOpenOrders();

        if (openOrders.length === 0) {
            console.log('🔭 No open orders found.');

            return res.status(200).json({
                success: false,
                signer: signer.address,
                funder: process.env.FUNDER_ADDRESS,
                totalOrders: 0,
                message: 'No open orders found',
                orders: []
            });
        }

        console.log(`✅ Found ${openOrders.length} open order(s):\n`);
        console.log('='.repeat(80));

        // Format orders with detailed information
        const formattedOrders = openOrders.map((order, index) => {
            const orderInfo = {
                orderNumber: index + 1,
                id: order.id || order.orderID || 'N/A',
                market: order.market || 'N/A',
                tokenId: order.asset_id || order.tokenID || 'N/A',
                side: formatSide(order.side),
                sideRaw: order.side,
                price: `${formatPrice(order.price)} USDC`,
                priceRaw: order.price,
                size: formatAmount(order.original_size || order.size),
                sizeRaw: order.original_size || order.size,
                filled: formatAmount(order.size_matched || order.sizeMatched || 0),
                filledRaw: order.size_matched || order.sizeMatched || 0,
                remaining: formatAmount(getRemainingSize(order)),
                remainingRaw: getRemainingSize(order),
                status: order.status || 'LIVE',
                orderType: order.type || order.orderType || 'GTC',
                created: formatDate(order.created_at || order.timestamp),
                createdRaw: order.created_at || order.timestamp,
                expiration: order.expiration ? formatDate(order.expiration) : null,
                expirationRaw: order.expiration || null
            };

            return orderInfo;
        });

        console.log('\n' + '='.repeat(80));
        console.log(`\n📈 Total open orders: ${openOrders.length}`);
        console.log('✨ Done!\n');

        return res.status(200).json({
            success: true,
            signer: signer.address,
            funder: process.env.FUNDER_ADDRESS,
            totalOrders: openOrders.length,
            // orders: formattedOrders,
            rawOrders: openOrders
        });

    } catch (error) {
        console.error("\n❌ Open Orders Error:", error.message);

        if (error.response) {
            console.error('API Response:', error.response.data);
        }

        return res.status(500).json({
            success: false,
            message: "Failed to fetch open orders",
            error: error.message,
            apiError: error.response?.data || null
        });
    }
}

const getCurrentOpenOrders = async (req, res, next) => {
    try {
        console.log('📗 Connecting to Polymarket CLOB...\n');

        // Validate env vars (early return pattern)
        const { PRIVATE_KEY, FUNDER_ADDRESS, SIGNATTYPE = '0' } = process.env;

        if (!PRIVATE_KEY || !FUNDER_ADDRESS) {
            return res.status(400).json({
                success: false,
                message: `Missing required env vars: ${!PRIVATE_KEY ? 'PRIVATE_KEY ' : ''}${!FUNDER_ADDRESS ? 'FUNDER_ADDRESS' : ''}`
            });
        }

        // Parallel initialization
        const signer = createCompatibleWallet(PRIVATE_KEY);
        const signatureType = parseInt(SIGNATTYPE);

        console.log('🔐 Creating API credentials...');

        // Create client once with proper configuration
        const tempClient = new ClobClient(HOST, CHAIN_ID, signer);
        const apiCreds = await tempClient.createOrDeriveApiKey();

        console.log('✅ API credentials created');
        console.log(`📝 Using signature type: ${signatureType} (${getSignatureTypeName(signatureType)})\n`);

        const client = new ClobClient(
            HOST,
            CHAIN_ID,
            signer,
            apiCreds,
            signatureType,
            FUNDER_ADDRESS
        );

        console.log('📊 Fetching open orders...\n');

        // Parallel API calls instead of sequential
        const [timeResp, marketResp] = await Promise.all([
            axios.get("https://clob.polymarket.com/time"),
            (async () => {
                const currentEpoch = (await axios.get("https://clob.polymarket.com/time")).data;
                const timestampMs = currentEpoch < 10000000000 ? currentEpoch * 1000 : currentEpoch;
                const fifteenMinutes = 15 * 60 * 1000;
                const nextInterval = Math.ceil(timestampMs / fifteenMinutes) * fifteenMinutes;
                const epoch = currentEpoch < 10000000000 ? Math.floor(nextInterval / 1000) - 900 : nextInterval - 900;
                return axios.get(`${URL}${epoch}`);
            })()
        ]);

        const marketId = marketResp.data.conditionId;
        console.log("Market ID:", marketId);

        // Fetch open orders
        const openOrders = await client.getOpenOrders({ market: marketId });

        if (openOrders.length === 0) {
            console.log('🔭 No open orders found.');
            return res.status(200).json({
                success: false,
                signer: signer.address,
                funder: FUNDER_ADDRESS,
                totalOrders: 0,
                message: 'No open orders found',
                orders: []
            });
        }

        console.log(`✅ Found ${openOrders.length} open order(s):\n`);

        // Only format orders if you're actually using formattedOrders
        // Since it's commented out, skip this expensive operation
        // const formattedOrders = openOrders.map((order, index) => { ... });

        console.log(`\n📈 Total open orders: ${openOrders.length}`);
        console.log('✨ Done!\n');

        return res.status(200).json({
            success: true,
            signer: signer.address,
            funder: FUNDER_ADDRESS,
            totalOrders: openOrders.length,
            rawOrders: openOrders
        });

    } catch (error) {
        console.error("\n❌ Open Orders Error:", error.message);
        if (error.response) {
            console.error('API Response:', error.response.data);
        }

        return res.status(500).json({
            success: false,
            message: "Failed to fetch open orders",
            error: error.message,
            apiError: error.response?.data || null
        });
    }
};

const getMatchedTrades = async (req, res, next) => {
    try {
        const resp = await axios.get("https://clob.polymarket.com/time");
        const currentEpoch = resp.data;
        const timestampMs = currentEpoch < 10000000000 ? currentEpoch * 1000 : currentEpoch;
        const fifteenMinutes = 15 * 60 * 1000;
        const nextInterval = Math.ceil(timestampMs / fifteenMinutes) * fifteenMinutes;
        const epoch = currentEpoch < 10000000000 ? Math.floor(nextInterval / 1000) - 900 : nextInterval - 900;
        const epochTime = String(epoch);
        console.log(epochTime);
        console.log(typeof (epochTime));

        const response = await axios.get(`${URL}${epochTime}`);
        // console.log(response.data);

        const marketId = response.data.conditionId;
        console.log("Market ID:", marketId);


        // Validate env vars
        if (!process.env.PRIVATE_KEY) {
            return res.status(400).json({
                success: false,
                message: "PRIVATE_KEY not found in .env"
            });
        }

        if (!process.env.FUNDER_ADDRESS) {
            return res.status(400).json({
                success: false,
                message: "FUNDER_ADDRESS not found in .env"
            });
        }

        // Create signer with compatibility wrapper
        const signer = createCompatibleWallet(process.env.PRIVATE_KEY);
        console.log(`🔑 Using signer address: ${signer.address}`);
        console.log(`💰 Funder address: ${process.env.FUNDER_ADDRESS}\n`);

        // Temp client to derive API creds
        console.log('🔐 Creating API credentials...');
        const tempClient = new ClobClient(HOST, CHAIN_ID, signer);
        const apiCreds = await tempClient.createOrDeriveApiKey();
        console.log('✅ API credentials created\n');

        // Signature type
        const signatureType = parseInt(process.env.SIGNATTYPE || '0');
        console.log(`📝 Using signature type: ${signatureType} (${getSignatureTypeName(signatureType)})\n`);

        // Authenticated client
        const client = new ClobClient(
            HOST,
            CHAIN_ID,
            signer,
            apiCreds,
            signatureType,
            process.env.FUNDER_ADDRESS
        );

        console.log('📊 Fetching matched trades...\n');

        // Fetch trades (matched orders)
        const trades = await client.getTrades({ market: marketId });

        const orderIds = [...new Set(
            trades.flatMap(t => t.maker_orders.map(m => m.order_id))
        )];

        if (trades.length === 0 || orderIds.length == 0) {
            console.log('🔭 No matched trades found.');

            return res.status(200).json({
                success: (trades.length == 0) || (orderIds.length == 0) ? false : true,
                // signer: signer.address,
                // funder: process.env.FUNDER_ADDRESS,
                totalTrades: 0,
                message: 'No matched trades found',
                matchedOrderIds: [],
                epochTime: epochTime
            });
        }

        console.log(`✅ Found ${trades.length} matched trade(s):\n`);
        console.log('='.repeat(80));

        console.log('\n' + '='.repeat(80));
        console.log(`\n📈 Total matched trades: ${trades.length}`);
        console.log('✨ Done!\n');

        return res.status(200).json({
            success: (trades.length == 0) || (orderIds.length == 0) ? false : true,
            totalTrades: trades.length,
            matchedOrderIds: orderIds,
            message: 'Order Found',
            epochTime: epochTime,
            // rawTrades: trades
        });

    } catch (error) {
        console.error("\n❌ Matched Trades Error:", error.message);

        if (error.response) {
            console.error('API Response:', error.response.data);
        }

        console.error('\n💡 Troubleshooting tips:');
        console.error('   - Ensure your PRIVATE_KEY and FUNDER_ADDRESS are correct in .env');
        console.error('   - Check that your wallet has access to Polymarket');
        console.error('   - Verify you have a stable internet connection');
        console.error('   - Make sure the Polymarket API is accessible\n');

        return res.status(500).json({
            success: false,
            message: "Failed to fetch matched trades",
            error: error.message,
            apiError: error.response?.data || null
        });
    }
}

module.exports = {
    getServerTime,
    getOpenOrders,
    getMatchedTrades,
    getCurrentOpenOrders
}