require('dotenv').config();
const { ClobClient, Side, OrderType } = require('@polymarket/clob-client');
const { ethers } = require('ethers');
const axios = require('axios');

const HOST = 'https://clob.polymarket.com';
const CHAIN_ID = 137; // Polygon mainnet

// Helper function to add delay between requests
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Configure axios with browser-like headers to bypass Cloudflare
axios.defaults.headers.common['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
axios.defaults.headers.common['Accept'] = 'application/json';
axios.defaults.headers.common['Accept-Language'] = 'en-US,en;q=0.9';
axios.defaults.headers.common['Accept-Encoding'] = 'gzip, deflate, br';
axios.defaults.headers.common['Origin'] = 'https://polymarket.com';
axios.defaults.headers.common['Referer'] = 'https://polymarket.com/';
axios.defaults.headers.common['sec-ch-ua'] = '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"';
axios.defaults.headers.common['sec-ch-ua-mobile'] = '?0';
axios.defaults.headers.common['sec-ch-ua-platform'] = '"Windows"';
axios.defaults.headers.common['Sec-Fetch-Dest'] = 'empty';
axios.defaults.headers.common['Sec-Fetch-Mode'] = 'cors';
axios.defaults.headers.common['Sec-Fetch-Site'] = 'same-site';
axios.defaults.headers.common['Connection'] = 'keep-alive';

// Create a compatible wallet wrapper for ethers v6
function createCompatibleWallet(privateKey) {
    const wallet = new ethers.Wallet(privateKey);
    
    // Add _signTypedData if it doesn't exist (for ethers v6 compatibility)
    if (!wallet._signTypedData && wallet.signTypedData) {
        wallet._signTypedData = wallet.signTypedData.bind(wallet);
    }
    
    return wallet;
}

// Initialize CLOB client with proper headers
async function initializeClient(privateKey, funderAddress = null, signatureType = 0) {
    try {
        const signer = createCompatibleWallet(privateKey);
        
        console.log('🔑 Wallet address:', signer.address);

        // Add delay to avoid rate limiting
        await sleep(500);

        // Create temporary client to derive API credentials with custom headers
        const tempClient = new ClobClient(
            HOST,
            CHAIN_ID,
            signer,
            undefined,
            signatureType,
            undefined,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Origin': 'https://polymarket.com',
                    'Referer': 'https://polymarket.com/',
                    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-site'
                }
            }
        );

        console.log('🔐 Creating API credentials...');
        const apiCreds = await tempClient.createOrDeriveApiKey();
        console.log('✅ API credentials created');

        // Add another delay
        await sleep(500);

        // Initialize the actual trading client with headers
        const client = new ClobClient(
            HOST,
            CHAIN_ID,
            signer,
            apiCreds,
            signatureType,
            funderAddress || signer.address,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Origin': 'https://polymarket.com',
                    'Referer': 'https://polymarket.com/',
                    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-site'
                }
            }
        );

        console.log('✅ CLOB client initialized successfully\n');
        return client;

    } catch (error) {
        console.error('❌ Error initializing client:', error.message);
        throw error;
    }
}

// Place Order Controller
const placeOrder = async (req, res, next) => {
    try {
        console.log('📗 Initiating order placement...\n');

        // Extract parameters from request body
        const {
            clobTokenId,
            side,
            price,
            quantity,
            privateKey = process.env.PRIVATE_KEY,
            funderAddress = process.env.FUNDER_ADDRESS,
            signatureType = 1,
            orderType = 'GTC',
            tickSize = '0.01',
            negRisk = false
        } = req.body;

        // Validate required fields
        if (!clobTokenId || typeof clobTokenId !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Invalid clobTokenId: must be a non-empty string'
            });
        }

        if (!side || !['UP', 'DOWN'].includes(side.toUpperCase())) {
            return res.status(400).json({
                success: false,
                message: 'Invalid side: must be "UP" or "DOWN"'
            });
        }

        if (typeof price !== 'number' || price < 0 || price > 100) {
            return res.status(400).json({
                success: false,
                message: 'Invalid price: must be between 0 and 100 cents'
            });
        }

        if (typeof quantity !== 'number' || quantity <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid quantity: must be a positive number'
            });
        }

        // Validate credentials
        if (!privateKey) {
            return res.status(400).json({
                success: false,
                message: 'Private key is required. Set PRIVATE_KEY in .env or pass in request body'
            });
        }

        if (!funderAddress) {
            return res.status(400).json({
                success: false,
                message: 'Funder address is required. Set FUNDER_ADDRESS in .env or pass in request body'
            });
        }

        // Validate order type
        const validOrderTypes = ['GTC', 'FOK', 'GTD', 'FAK'];
        const orderTypeUpper = orderType.toUpperCase();
        if (!validOrderTypes.includes(orderTypeUpper)) {
            return res.status(400).json({
                success: false,
                message: `Invalid orderType: must be one of ${validOrderTypes.join(', ')}`
            });
        }

        // Initialize client with headers
        console.log('🔐 Initializing Polymarket CLOB client with security headers...');
        const client = await initializeClient(privateKey, funderAddress, signatureType);

        // Convert side to BUY/SELL
        const orderSide = side.toUpperCase() === 'UP' ? Side.BUY : Side.SELL;

        // Convert price from cents to decimal (e.g., 50 cents = 0.50)
        const priceDecimal = price / 100;

        // Map order type string to OrderType enum
        const orderTypeEnum = OrderType[orderTypeUpper];

        // Prepare order details
        const orderDetails = {
            tokenID: clobTokenId,
            price: priceDecimal,
            side: orderSide,
            size: quantity
        };

        const orderOptions = {
            tickSize: tickSize,
            negRisk: negRisk
        };

        console.log(`📊 Placing ${side.toUpperCase()} order:`);
        console.log('-'.repeat(80));
        console.log(`Token ID:        ${clobTokenId}`);
        console.log(`Side:            ${side.toUpperCase()} (${orderSide === Side.BUY ? 'BUY' : 'SELL'})`);
        console.log(`Price:           ${price} cents (${priceDecimal} USDC)`);
        console.log(`Quantity:        ${quantity}`);
        console.log(`Order Type:      ${orderTypeUpper}`);
        console.log(`Tick Size:       ${tickSize}`);
        console.log(`Neg Risk:        ${negRisk}`);
        console.log('-'.repeat(80));

        // Add delay before placing order
        await sleep(1000);

        // Create and post order
        console.log('\n⏳ Submitting order to Polymarket CLOB...');
        const response = await client.createAndPostOrder(
            orderDetails,
            orderOptions,
            orderTypeEnum
        );

        console.log('\n✅ Order placed successfully!');
        console.log('Order ID:', response.orderID);
        console.log('Transaction Hash:', response.transactionHash);
        console.log('Status:', response.status);
        console.log('✨ Done!\n');

        return res.status(200).json({
            success: true,
            message: 'Order placed successfully',
            orderId: response.orderID,
            transactionHash: response.transactionHash,
            status: response.status,
            orderDetails: {
                tokenId: clobTokenId,
                side: side.toUpperCase(),
                price: `${price} cents`,
                priceDecimal: priceDecimal,
                quantity: quantity,
                orderType: orderTypeUpper
            },
            data: response
        });

    } catch (error) {
        console.error('\n❌ Error placing order:', error.message);

        // Handle Cloudflare 403 errors specifically
        if (error.response?.status === 403) {
            console.error('🚫 Cloudflare blocked the request - Security check failed');
            console.error('Response:', error.response?.data);
            
            return res.status(403).json({
                success: false,
                message: 'Access blocked by Cloudflare security service',
                error: 'Request blocked with 403 Forbidden status',
                cloudflareBlock: true,
                troubleshooting: [
                    'Your IP may be temporarily blocked - wait 5-10 minutes',
                    'Check if you are in a restricted geographic region',
                    'Try using the official Polymarket website instead',
                    'Verify your network connection is stable',
                    'Contact Polymarket support if issue persists'
                ],
                cloudflareRayId: error.response?.headers?.['cf-ray'] || 'Not available',
                data: error.response?.data || null
            });
        }

        // Handle authentication errors
        if (error.message && (error.message.includes('API key') || error.message.includes('credentials'))) {
            console.error('🔑 Authentication error');
            return res.status(401).json({
                success: false,
                message: 'Authentication failed',
                error: error.message,
                troubleshooting: [
                    'Verify your PRIVATE_KEY is correct',
                    'Verify your FUNDER_ADDRESS matches your wallet',
                    'Check that your wallet has been approved for trading'
                ]
            });
        }

        // Handle insufficient balance
        if (error.message && error.message.toLowerCase().includes('balance')) {
            console.error('💰 Insufficient balance');
            return res.status(400).json({
                success: false,
                message: 'Insufficient balance',
                error: error.message,
                troubleshooting: [
                    'Check your USDC balance on Polygon',
                    'Ensure you have enough funds for the order',
                    'Account for transaction fees'
                ]
            });
        }

        // Handle other API errors
        if (error.response) {
            console.error('API Response Status:', error.response.status);
            console.error('API Response Data:', error.response.data);
            
            return res.status(error.response.status || 500).json({
                success: false,
                message: 'API request failed',
                error: error.message,
                statusCode: error.response.status,
                apiError: error.response?.data || null
            });
        }

        // Generic error handling
        console.error('\n💡 Troubleshooting tips:');
        console.error('   - Ensure your PRIVATE_KEY and FUNDER_ADDRESS are correct');
        console.error('   - Check that you have sufficient USDC balance on Polygon');
        console.error('   - Verify the token ID is valid and market is active');
        console.error('   - Make sure the price and quantity are within valid ranges');
        console.error('   - Check your internet connection\n');

        return res.status(500).json({
            success: false,
            message: 'Failed to place order',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

module.exports = {
    placeOrder
};