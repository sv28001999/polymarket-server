require('dotenv').config();
const { ClobClient, Side, OrderType } = require('@polymarket/clob-client');
const { ethers } = require('ethers');

const HOST = 'https://clob.polymarket.com';
const CHAIN_ID = 137; // Polygon mainnet

// Create a compatible wallet wrapper for ethers v6
function createCompatibleWallet(privateKey) {
    const wallet = new ethers.Wallet(privateKey);
    
    // Add _signTypedData if it doesn't exist (for ethers v6 compatibility)
    if (!wallet._signTypedData && wallet.signTypedData) {
        wallet._signTypedData = wallet.signTypedData.bind(wallet);
    }
    
    return wallet;
}

// Initialize CLOB client
async function initializeClient(privateKey, funderAddress = null, signatureType = 0) {
    const signer = createCompatibleWallet(privateKey);

    // Create temporary client to derive API credentials
    const tempClient = new ClobClient(HOST, CHAIN_ID, signer);
    const apiCreds = await tempClient.createOrDeriveApiKey();

    console.log('✅ API credentials created');

    // Initialize the actual trading client
    const client = new ClobClient(
        HOST,
        CHAIN_ID,
        signer,
        apiCreds,
        signatureType,
        funderAddress || signer.address
    );

    return client;
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

        // Initialize client
        console.log('🔐 Initializing Polymarket CLOB client...');
        const client = await initializeClient(privateKey, funderAddress, signatureType);

        // Convert side to BUY/SELL
        // UP = BUY (you're buying the outcome)
        // DOWN = SELL (you're selling the outcome or buying the opposite)
        const orderSide = side.toUpperCase() === 'BUY' ? Side.BUY : Side.SELL;

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

        console.log(`\n📊 Placing ${side.toUpperCase()} order:`);
        console.log('-'.repeat(80));
        console.log(`Token ID:        ${clobTokenId}`);
        console.log(`Side:            ${side.toUpperCase()} (${orderSide === Side.BUY ? 'BUY' : 'SELL'})`);
        console.log(`Price:           ${price} cents (${priceDecimal} USDC)`);
        console.log(`Quantity:        ${quantity}`);
        console.log(`Order Type:      ${orderTypeUpper}`);
        console.log(`Tick Size:       ${tickSize}`);
        console.log(`Neg Risk:        ${negRisk}`);
        console.log('-'.repeat(80));

        // Create and post order
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

        if (error.response) {
            console.error('API Response:', error.response.data);
        }

        console.error('\n💡 Troubleshooting tips:');
        console.error('   - Ensure your PRIVATE_KEY and FUNDER_ADDRESS are correct');
        console.error('   - Check that you have sufficient balance');
        console.error('   - Verify the token ID is valid');
        console.error('   - Make sure the price and quantity are within limits\n');

        return res.status(500).json({
            success: false,
            message: 'Failed to place order',
            error: error.message,
            apiError: error.response?.data || null
        });
    }
};

module.exports = {
    placeOrder
};