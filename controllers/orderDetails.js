require('dotenv').config();
const { ClobClient } = require('@polymarket/clob-client');
const { ethers } = require('ethers');
const axios = require('axios');

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
                success: true,
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
            orders: formattedOrders,
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

const getMatchedTrades = async (req, res, next) => {
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
        const trades = await client.getTrades();

        if (trades.length === 0) {
            console.log('🔭 No matched trades found.');

            return res.status(200).json({
                success: true,
                signer: signer.address,
                funder: process.env.FUNDER_ADDRESS,
                totalTrades: 0,
                message: 'No matched trades found',
                trades: []
            });
        }

        console.log(`✅ Found ${trades.length} matched trade(s):\n`);
        console.log('='.repeat(80));

        // Format trades with detailed information
        const formattedTrades = trades.map((trade, index) => {
            const tradeInfo = {
                tradeNumber: index + 1,
                id: trade.id || 'N/A',
                orderId: trade.order_id || trade.orderID || 'N/A',
                market: trade.market || 'N/A',
                tokenId: trade.asset_id || trade.tokenID || 'N/A',
                side: formatSide(trade.side),
                sideRaw: trade.side,
                price: `${formatPrice(trade.price)} USDC`,
                priceRaw: trade.price,
                size: formatAmount(trade.size),
                sizeRaw: trade.size,
                feeRateBps: trade.fee_rate_bps || 0,
                fee: trade.fee ? `${formatAmount(trade.fee)} USDC` : '0.00 USDC',
                feeRaw: trade.fee || 0,
                status: trade.status || 'MATCHED',
                tradeTime: formatDate(trade.timestamp || trade.created_at),
                tradeTimeRaw: trade.timestamp || trade.created_at,
                transactionHash: trade.transaction_hash || trade.transactionHash || 'N/A',
                matchId: trade.match_id || trade.matchID || 'N/A'
            };

            return tradeInfo;
        });

        console.log('\n' + '='.repeat(80));
        console.log(`\n📈 Total matched trades: ${trades.length}`);
        console.log('✨ Done!\n');

        return res.status(200).json({
            success: true,
            signer: signer.address,
            funder: process.env.FUNDER_ADDRESS,
            totalTrades: trades.length,
            // trades: formattedTrades,
            rawTrades: trades
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
    getMatchedTrades
}