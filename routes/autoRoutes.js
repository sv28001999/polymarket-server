const express = require('express');
const router = express.Router();

const { getServerTime } = require('../controllers/orderDetails');

router.route('/getServerTime').get(getServerTime);

module.exports = router;