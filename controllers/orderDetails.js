require('dotenv').config();
const { ClobClient } = require('@polymarket/clob-client');
const { Wallet } = require('ethers');
const axios = require('axios');

const HOST = "https://clob.polymarket.com";
const CHAIN_ID = 137; // Polygon mainnet

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

        // Create signer
        const signer = new Wallet(process.env.PRIVATE_KEY);

        // Temp client to derive API creds
        const tempClient = new ClobClient(HOST, CHAIN_ID, signer);
        const apiCreds = await tempClient.createOrDeriveApiKey();

        // Signature type
        const signatureType = parseInt(process.env.SIGNATTYPE || "0");

        // Authenticated client
        const client = new ClobClient(
            HOST,
            CHAIN_ID,
            signer,
            apiCreds,
            signatureType,
            process.env.FUNDER_ADDRESS
        );

        // Fetch open orders
        const openOrders = await client.getOpenOrders();

        return res.status(200).json({
            success: true,
            signer: signer.address,
            funder: process.env.FUNDER_ADDRESS,
            totalOrders: openOrders.length,
            orders: openOrders
        });

    } catch (error) {
        console.error("❌ Open Orders Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch open orders",
            error: error.message,
            apiError: error.response?.data || null
        });
    }
}

module.exports = {
    getServerTime,
    getOpenOrders
}