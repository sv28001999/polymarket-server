require('dotenv').config();
const { ClobClient } = require('@polymarket/clob-client');
const { ethers } = require('ethers');
const axios = require('axios');
const URL = 'https://gamma-api.polymarket.com/markets/slug/btc-updown-15m-';
const URL5Min = 'https://gamma-api.polymarket.com/markets/slug/btc-updown-5m-';

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

const getCurrentOpenOrders5Min = async (req, res, next) => {
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
                const fifteenMinutes = 5 * 60 * 1000;
                const nextInterval = Math.ceil(timestampMs / fifteenMinutes) * fifteenMinutes;
                const epoch = currentEpoch < 10000000000 ? Math.floor(nextInterval / 1000) - 300 : nextInterval - 300;
                return axios.get(`${URL5Min}${epoch}`);
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

const get3hrOpenTrades = async (req, res, next) => {
    try {
        console.log('📗 Connecting to Polymarket CLOB...\n');

        const { PRIVATE_KEY, FUNDER_ADDRESS, SIGNATTYPE = '0' } = process.env;

        if (!PRIVATE_KEY || !FUNDER_ADDRESS) {
            return res.status(400).json({
                success: false,
                message: `Missing required env vars: ${!PRIVATE_KEY ? 'PRIVATE_KEY ' : ''}${!FUNDER_ADDRESS ? 'FUNDER_ADDRESS' : ''}`
            });
        }

        const signer = createCompatibleWallet(PRIVATE_KEY);
        const signatureType = parseInt(SIGNATTYPE);

        console.log('🔐 Creating API credentials...');

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

        // ── Fetch current epoch once ──────────────────────────────────────────
        const timeResp = await axios.get("https://clob.polymarket.com/time");
        const currentEpoch = timeResp.data;
        const timestampMs = currentEpoch < 10000000000 ? currentEpoch * 1000 : currentEpoch;
        const fiveMinutes = 5 * 60 * 1000;
        const nextInterval = Math.ceil(timestampMs / fiveMinutes) * fiveMinutes;

        // Base epoch (first interval ceiling)
        const baseEpoch = currentEpoch < 10000000000
            ? Math.floor(nextInterval / 1000) - 300
            : nextInterval - 300;

        // ── Build 36 epoch values (base, base+300, base+600, …, base+10500) ──
        const EPOCH_COUNT = 36;
        const EPOCH_STEP = 300;          // 5 minutes in seconds

        const epochs = Array.from(
            { length: EPOCH_COUNT },
            (_, i) => baseEpoch + i * EPOCH_STEP
        );

        console.log(`📅 Fetching markets for ${EPOCH_COUNT} epochs...`);
        console.log(`   From epoch ${epochs[0]} → ${epochs[epochs.length - 1]}\n`);

        // ── Hit URL5Min for all 36 epochs in parallel ─────────────────────────
        const marketResponses = await Promise.allSettled(
            epochs.map(epoch => axios.get(`${URL5Min}${epoch}`))
        );

        // Extract unique, valid conditionIds
        const marketIds = [
            ...new Set(
                marketResponses
                    .filter(r => r.status === 'fulfilled' && r.value?.data?.conditionId)
                    .map(r => r.value.data.conditionId)
            )
        ];

        console.log(`✅ Resolved ${marketIds.length} unique market ID(s) across ${EPOCH_COUNT} epochs\n`);

        if (marketIds.length === 0) {
            return res.status(200).json({
                success: false,
                signer: signer.address,
                funder: FUNDER_ADDRESS,
                totalOrders: 0,
                message: 'No valid markets found for any epoch',
                orders: []
            });
        }

        // ── Fetch open orders for every market in parallel ────────────────────
        console.log('📊 Fetching open orders for all markets...\n');

        const orderResults = await Promise.allSettled(
            marketIds.map(marketId =>
                client.getOpenOrders({ market: marketId })
                    .then(orders => ({ marketId, orders }))
            )
        );

        // Flatten all orders, tagging each with its marketId
        const allOrders = orderResults
            .filter(r => r.status === 'fulfilled' && r.value.orders.length > 0)
            .flatMap(r =>
                r.value.orders.map(order => ({
                    ...order,
                    marketId: r.value.marketId   // attach context
                }))
            );

        // Collect markets that errored (useful for debugging)
        const failedMarkets = orderResults
            .filter(r => r.status === 'rejected')
            .map((r, i) => ({ marketId: marketIds[i], reason: r.reason?.message }));

        if (failedMarkets.length > 0) {
            console.warn(`⚠️  ${failedMarkets.length} market(s) failed to fetch orders`);
        }

        if (allOrders.length === 0) {
            console.log('🔭 No open orders found across all markets.');
            return res.status(200).json({
                success: false,
                signer: signer.address,
                funder: FUNDER_ADDRESS,
                epochsChecked: EPOCH_COUNT,
                marketsChecked: marketIds.length,
                totalOrders: 0,
                message: 'No open orders found',
                orders: []
            });
        }

        console.log(`✅ Found ${allOrders.length} open order(s) across ${marketIds.length} market(s)`);
        console.log('✨ Done!\n');

        return res.status(200).json({
            success: true,
            signer: signer.address,
            funder: FUNDER_ADDRESS,
            epochsChecked: EPOCH_COUNT,
            marketsChecked: marketIds.length,
            totalOrders: allOrders.length,
            failedMarkets,               // [] when all succeeded
            rawOrders: allOrders
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

const getMatchedTrades5Min = async (req, res, next) => {
    try {
        const resp = await axios.get("https://clob.polymarket.com/time");
        const currentEpoch = resp.data;
        const timestampMs = currentEpoch < 10000000000 ? currentEpoch * 1000 : currentEpoch;
        const fifteenMinutes = 5 * 60 * 1000;
        const nextInterval = Math.ceil(timestampMs / fifteenMinutes) * fifteenMinutes;
        const epoch = currentEpoch < 10000000000 ? Math.floor(nextInterval / 1000) - 300 : nextInterval - 300;
        const epochTime = String(epoch);
        console.log(epochTime);
        console.log(typeof (epochTime));

        const response = await axios.get(`${URL5Min}${epochTime}`);
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
        console.log(trades);


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
            quantity: trades[0].size,
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

const getHighPriceTrade = async (req, res, next) => {
    try {
        // ── Validate env vars early ───────────────────────────────────────────
        const { PRIVATE_KEY, FUNDER_ADDRESS, SIGNATTYPE = '0' } = process.env;

        if (!PRIVATE_KEY || !FUNDER_ADDRESS) {
            return res.status(400).json({
                success: false,
                message: `Missing required env vars: ${!PRIVATE_KEY ? 'PRIVATE_KEY ' : ''}${!FUNDER_ADDRESS ? 'FUNDER_ADDRESS' : ''}`
            });
        }

        // ── Compute base epoch ────────────────────────────────────────────────
        const resp = await axios.get("https://clob.polymarket.com/time");
        const currentEpoch = resp.data;
        const timestampMs = currentEpoch < 10000000000 ? currentEpoch * 1000 : currentEpoch;
        const fiveMinutes = 5 * 60 * 1000;
        const nextInterval = Math.ceil(timestampMs / fiveMinutes) * fiveMinutes;
        const baseEpoch = currentEpoch < 10000000000
            ? Math.floor(nextInterval / 1000) - 300
            : nextInterval - 300;

        // ── Build 36 epoch values (base+300, base+600, …, base+10800) ─────────
        const EPOCH_COUNT = 36;
        const EPOCH_STEP = 300;

        const epochs = Array.from(
            { length: EPOCH_COUNT },
            (_, i) => baseEpoch + (i + 1) * EPOCH_STEP   // mirrors your original i++ before push
        );

        console.log(`📅 Fetching markets for ${EPOCH_COUNT} epochs...`);
        console.log(`   From epoch ${epochs[0]} → ${epochs[epochs.length - 1]}\n`);

        // ── Fetch all market conditionIds in parallel ─────────────────────────
        const marketResponses = await Promise.allSettled(
            epochs.map(epoch => axios.get(`${URL5Min}${String(epoch)}`))
        );

        // Unique, valid conditionIds only
        const marketIds = [
            ...new Set(
                marketResponses
                    .filter(r => r.status === 'fulfilled' && r.value?.data?.conditionId)
                    .map(r => r.value.data.conditionId)
            )
        ];

        console.log(`✅ Resolved ${marketIds.length} unique market ID(s) across ${EPOCH_COUNT} epochs`);
        console.log("Market IDs:", marketIds, '\n');

        if (marketIds.length === 0) {
            return res.status(200).json({
                success: false,
                totalTrades: 0,
                message: 'No valid markets found for any epoch',
                matchedOrderIds: [],
                epochsChecked: EPOCH_COUNT,
                baseEpoch
            });
        }

        // ── Build authenticated client ────────────────────────────────────────
        const signer = createCompatibleWallet(PRIVATE_KEY);
        console.log(`🔑 Using signer address: ${signer.address}`);
        console.log(`💰 Funder address: ${FUNDER_ADDRESS}\n`);

        console.log('🔐 Creating API credentials...');
        const tempClient = new ClobClient(HOST, CHAIN_ID, signer);
        const apiCreds = await tempClient.createOrDeriveApiKey();
        console.log('✅ API credentials created\n');

        const signatureType = parseInt(SIGNATTYPE);
        console.log(`📝 Using signature type: ${signatureType} (${getSignatureTypeName(signatureType)})\n`);

        const client = new ClobClient(
            HOST,
            CHAIN_ID,
            signer,
            apiCreds,
            signatureType,
            FUNDER_ADDRESS
        );

        // ── Fetch trades for all markets in parallel ──────────────────────────
        console.log('📊 Fetching matched trades for all markets...\n');

        const tradeResults = await Promise.allSettled(
            marketIds.map(marketId =>
                client.getTrades({ market: marketId })
                    .then(trades => ({ marketId, trades }))
            )
        );

        // Flatten all trades, tagging each with its marketId
        const allTrades = tradeResults
            .filter(r => r.status === 'fulfilled' && r.value.trades.length > 0)
            .flatMap(r =>
                r.value.trades.map(trade => ({
                    ...trade,
                    marketId: r.value.marketId
                }))
            );

        // Collect failed markets for debugging
        const failedMarkets = tradeResults
            .filter(r => r.status === 'rejected')
            .map((r, i) => ({ marketId: marketIds[i], reason: r.reason?.message }));

        if (failedMarkets.length > 0) {
            console.warn(`⚠️  ${failedMarkets.length} market(s) failed to fetch trades`);
        }

        // Unique maker order IDs across all trades
        const orderIds = [
            ...new Set(
                allTrades.flatMap(t => t.maker_orders.map(m => m.order_id))
            )
        ];

        // ── Early return if nothing found ─────────────────────────────────────
        if (allTrades.length === 0 || orderIds.length === 0) {
            console.log('🔭 No matched trades found.');
            return res.status(200).json({
                success: false,
                totalTrades: 0,
                message: 'No matched trades found',
                matchedOrderIds: [],
                epochsChecked: EPOCH_COUNT,
                marketsChecked: marketIds.length,
                failedMarkets,
                baseEpoch
            });
        }

        console.log(`✅ Found ${allTrades.length} matched trade(s) across ${marketIds.length} market(s)`);
        console.log('='.repeat(80));
        console.log(`\n📈 Total matched trades: ${allTrades.length}`);
        console.log('✨ Done!\n');

        return res.status(200).json({
            success: true,
            totalTrades: allTrades.length,
            matchedOrderIds: orderIds,
            message: 'Orders Found',
            epochsChecked: EPOCH_COUNT,
            marketsChecked: marketIds.length,
            failedMarkets,
            baseEpoch
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
};

const cancelOrder = async (req, res, next) => {
    try {
        const { orderId } = req.body;

        if (!orderId) {
            return res.status(400).json({
                success: false,
                message: "orderId is required in request body"
            });
        }

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

        console.log(`🗑️  Cancelling order: ${orderId}...\n`);

        const cancelResp = await client.cancelOrder({ clobOrderID: orderId });

        console.log('✅ Order cancelled successfully\n');
        console.log('✨ Done!\n');

        return res.status(200).json({
            success: true,
            message: 'Order cancelled successfully',
            orderId,
            cancelResponse: cancelResp
        });

    } catch (error) {
        console.error("\n❌ Cancel Trade Error:", error.message);

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
            message: "Failed to cancel trade",
            error: error.message,
            apiError: error.response?.data || null
        });
    }
};

const cancelLastOrder = async (req, res, next) => {
    try {
        // ── Validate env vars early ───────────────────────────────────────────
        const { PRIVATE_KEY, FUNDER_ADDRESS, SIGNATTYPE = '0' } = process.env;

        if (!PRIVATE_KEY || !FUNDER_ADDRESS) {
            return res.status(400).json({
                success: false,
                message: `Missing required env vars: ${!PRIVATE_KEY ? 'PRIVATE_KEY ' : ''}${!FUNDER_ADDRESS ? 'FUNDER_ADDRESS' : ''}`
            });
        }

        // ── Build authenticated client ────────────────────────────────────────
        const signer = createCompatibleWallet(PRIVATE_KEY);
        console.log(`🔑 Using signer address: ${signer.address}`);
        console.log(`💰 Funder address: ${FUNDER_ADDRESS}\n`);

        console.log('🔐 Creating API credentials...');
        const tempClient = new ClobClient(HOST, CHAIN_ID, signer);
        const apiCreds = await tempClient.createOrDeriveApiKey();
        console.log('✅ API credentials created\n');

        const signatureType = parseInt(SIGNATTYPE);
        console.log(`📝 Using signature type: ${signatureType} (${getSignatureTypeName(signatureType)})\n`);

        const client = new ClobClient(
            HOST,
            CHAIN_ID,
            signer,
            apiCreds,
            signatureType,
            FUNDER_ADDRESS
        );

        // ── Fetch market ID ───────────────────────────────────────────────────
        console.log('🕐 Fetching current market...\n');

        const [timeResp, marketResp] = await Promise.all([
            axios.get("https://clob.polymarket.com/time"),
            (async () => {
                const currentEpoch = (await axios.get("https://clob.polymarket.com/time")).data;
                const timestampMs = currentEpoch < 10000000000 ? currentEpoch * 1000 : currentEpoch;
                const fifteenMinutes = 5 * 60 * 1000;
                const nextInterval = Math.ceil(timestampMs / fifteenMinutes) * fifteenMinutes;
                const epoch = currentEpoch < 10000000000 ? Math.floor(nextInterval / 1000) : nextInterval;
                console.log("Cancel Trade For: " + epoch);
                return axios.get(`${URL5Min}${epoch}`);
            })()
        ]);

        const marketId = marketResp.data.conditionId;
        console.log("Market ID:", marketId);

        // ── Fetch open orders ─────────────────────────────────────────────────
        console.log('📊 Fetching open orders...\n');

        const openOrders = await client.getOpenOrders({ market: marketId });
        console.log(openOrders);


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

        console.log(`✅ Found ${openOrders.length} open order(s), cancelling...\n`);

        // ── Cancel all open orders in parallel ────────────────────────────────
        const ordersToCancel = openOrders.filter(order => order.price >= 0.45);

        const cancelResults = await Promise.allSettled(
            ordersToCancel.map(order =>
                client.cancelOrder({ orderID: order.id })
                    .then(resp => ({ orderId: order.id, resp }))
            )
        );

        const cancelled = cancelResults
            .filter(r => r.status === 'fulfilled')
            .map(r => r.value.orderId);

        const failedCancels = cancelResults
            .filter(r => r.status === 'rejected')
            .map((r, i) => ({ orderId: openOrders[i].id, reason: r.reason?.message }));

        if (failedCancels.length > 0) {
            console.warn(`⚠️  ${failedCancels.length} order(s) failed to cancel`);
        }

        console.log(`✅ Cancelled ${cancelled.length}/${openOrders.length} order(s)\n`);
        console.log('✨ Done!\n');

        return res.status(200).json({
            success: cancelled.length > 0,
            signer: signer.address,
            funder: FUNDER_ADDRESS,
            message: `Cancelled ${cancelled.length} of ${openOrders.length} order(s)`,
            totalFound: openOrders.length,
            totalCancelled: cancelled.length,
            cancelledOrderIds: cancelled,
            failedCancels
        });

    } catch (error) {
        console.error("\n❌ Cancel Order Error:", error.message);

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
            message: "Failed to cancel orders",
            error: error.message,
            apiError: error.response?.data || null
        });
    }
};

module.exports = {
    getServerTime,
    getOpenOrders,
    getMatchedTrades,
    getCurrentOpenOrders,
    getMatchedTrades5Min,
    getCurrentOpenOrders5Min,
    getHighPriceTrade,
    get3hrOpenTrades,
    cancelOrder,
    cancelLastOrder
}