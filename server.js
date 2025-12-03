const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Binance balance endpoint
app.get('/binance-balance', async (req, res) => {
    const asset = (req.query.asset || 'USDT').toUpperCase();

    try {
        const apiKey = process.env.BINANCE_API_KEY;
        const apiSecret = process.env.BINANCE_API_SECRET;

        if (!apiKey || !apiSecret) {
            return res.status(500).json({
                success: false,
                message: 'Binance credentials not configured'
            });
        }

        // Prepare request to Binance
        const params = { timestamp: Date.now(), recvWindow: 5000 };
        const queryString = new URLSearchParams(params).toString();
        const signature = crypto
            .createHmac('sha256', apiSecret)
            .update(queryString)
            .digest('hex');

        // Call Binance API
        const { data: binanceData } = await axios.get(
            'https://api1.binance.com/sapi/v1/capital/config/getall',
            {
                params: { ...params, signature },
                headers: { 'X-MBX-APIKEY': apiKey },
                timeout: 8000
            }
        );

        if (!Array.isArray(binanceData)) {
            return res.status(502).json({
                success: false,
                message: 'Unexpected response from Binance',
                data: binanceData
            });
        }

        // Filter by asset
        const assetInfo = binanceData.find((item) => item.coin === asset);

        if (!assetInfo) {
            return res.status(200).json({
                success: true,
                asset,
                balance: null,
                message: `Asset ${asset} not found in account`
            });
        }

        const free = parseFloat(assetInfo.free || '0');
        const locked = parseFloat(assetInfo.locked || '0');
        const withdrawing = parseFloat(assetInfo.withdrawing || '0');
        const total = free + locked + withdrawing;

        return res.status(200).json({
            success: true,
            asset,
            balance: { free, locked, withdrawing, total }
        });

    } catch (error) {
        console.error('Error calling Binance API:', error);
        const status = error.response?.status;
        const message = error.response?.data?.msg || error.message;

        return res.status(status || 500).json({
            success: false,
            message: `Error querying Binance: ${message}`,
            status
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
