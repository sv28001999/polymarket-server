const express = require('express');
const router = express.Router();

const { getServerTime,
    getOpenOrders,
    getMatchedTrades,
    getCurrentOpenOrders,
    getCurrentOpenOrders5Min,
    getMatchedTrades5Min,
    getHighPriceTrade,
    get3hrOpenTrades,
    cancelOrder,
    cancelLastOrder
} = require('../controllers/orderDetails');
const { placeOrder } = require('../controllers/placeOrder');
const { getBtcEvent, get5minBtcEvent, getCurrentPrice } = require('../controllers/eventDetails');

router.route('/getServerTime').get(getServerTime);
router.route('/getOpenOrders').get(getOpenOrders);
router.route('/getCurrentOpenOrders').get(getCurrentOpenOrders);
router.route('/getCurrentOpenOrders5Min').get(getCurrentOpenOrders5Min);
router.route('/get3hrOpenTrades').get(get3hrOpenTrades);
router.route('/getMatchedTrades').get(getMatchedTrades);
router.route('/getMatchedTrades5Min').get(getMatchedTrades5Min);
router.route('/getBtcEvent').post(getBtcEvent);
router.route('/get5minBtcEvent').post(get5minBtcEvent);
router.route('/getHighPriceTrade').post(getHighPriceTrade);
router.route('/placeOrder').post(placeOrder);
router.route('/cancelOrder').post(cancelOrder);
router.route('/cancelLastOrder').post(cancelLastOrder);
router.route('/getCurrentPrice').post(getCurrentPrice);

module.exports = router;