const express = require('express');
const router = express.Router();

const { getServerTime,
    getOpenOrders,
    getMatchedTrades,
} = require('../controllers/orderDetails');
const { placeOrder } = require('../controllers/placeOrder');
const { getBtcEvent } = require('../controllers/eventDetails');

router.route('/getServerTime').get(getServerTime);
router.route('/getOpenOrders').get(getOpenOrders);
router.route('/getMatchedTrades').get(getMatchedTrades);
router.route('/getBtcEvent').post(getBtcEvent);
router.route('/placeOrder').post(placeOrder);

module.exports = router;