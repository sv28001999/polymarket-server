const express = require('express');
const router = express.Router();

const { getServerTime,
    getOpenOrders } = require('../controllers/orderDetails');

router.route('/getServerTime').get(getServerTime);
router.route('/getOpenOrders').get(getOpenOrders);

module.exports = router;