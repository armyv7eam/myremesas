require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3005;

// Auth Token simple para evitar que cualquiera use la API
const VPS_AUTH_TOKEN = process.env.VPS_AUTH_TOKEN || 'manzano_dev_token';

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// Seguridad Básica: Middleware para proteger los Endpoints
const authenticate = (req, res, next) => {
    const token = req.headers['x-vps-token'];
    if (token !== VPS_AUTH_TOKEN) {
        return res.status(401).json({ error: 'No autorizado. Token P2P incorrecto.' });
    }
    next();
};

/**
 * =========================================================
 * ENDPOINT 1: Consultar el balance de "Billetera de Fondos"
 * API Oficial: /sapi/v1/asset/getUserAsset
 * Requiere: BINANCE_API_KEY y BINANCE_API_SECRET
 * =========================================================
 */
app.get('/api/balance', authenticate, async (req, res) => {
    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_API_SECRET;

    if (!apiKey || !apiSecret) {
        return res.status(500).json({ error: 'Claves de Binance no configuradas en el VPS.' });
    }

    try {
        const timestamp = Date.now();
        // Asset opcional a consultar, si no se envía por query trae todos
        const asset = req.query.asset || 'USDT'; 
        
        let queryString = `timestamp=${timestamp}`;
        let signature = crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');
        
        const response = await axios.post(
            `https://api.binance.com/sapi/v3/asset/getUserAsset?${queryString}&signature=${signature}`, 
            {}, // body vacío según docu v3
            {
                headers: {
                    'X-MBX-APIKEY': apiKey,
                    'Content-Type': 'application/json'
                }
            }
        );

        // La respuesta es un array. Buscamos el asset solicitado.
        const assetData = response.data.find(coin => coin.asset === asset);

        if (!assetData) {
             return res.json({ 
                 asset, 
                 free: '0.00000000', 
                 locked: '0.00000000',
                 source: 'Binance Funding Wallet' 
             });
        }

        res.json({
             asset: assetData.asset,
             free: assetData.free,
             locked: assetData.locked,
             freeze: assetData.freeze,
             withdrawing: assetData.withdrawing,
             source: 'Binance Funding Wallet',
             updatedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error fetching balance:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Error consultando Billetera de Fondos.', 
            details: error.response?.data || error.message 
        });
    }
});

/**
 * =========================================================
 * ENDPOINT 2: Proxy universal para Binance P2P
 * Scraping de /bapi/c2c/v2/friendly/c2c/adv/search
 * =========================================================
 */
app.post('/api/proxy/p2p', authenticate, async (req, res) => {
    try {
        const response = await axios.post(
            'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
            req.body,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 10000
            }
        );

        res.status(response.status).json(response.data);
    } catch (error) {
         console.error('Error fetching P2P rate:', error.message);
         const status = error.response?.status || 500;
         res.status(status).json(error.response?.data || { error: 'Fallo comunicarse con Binance P2P.' });
    }
});

/**
 * =========================================================
 * ENDPOINT 3: Proxy universal para Binance Spot
 * =========================================================
 */
app.get('/api/proxy/spot', authenticate, async (req, res) => {
    try {
        const response = await axios.get(
            'https://api.binance.com/api/v3/ticker/price',
            {
                params: req.query, // Pasa parámetros como ?symbol=WLDUSDT
                timeout: 7000
            }
        );

        res.status(response.status).json(response.data);
    } catch (error) {
         console.error('Error fetching Spot rate:', error.message);
         const status = error.response?.status || 500;
         res.status(status).json(error.response?.data || { error: 'Fallo comunicarse con Binance Spot.' });
    }
});

// Comprobar estado del VPS
app.get('/health', (req, res) => res.send('VPS Ok: ' + new Date().toISOString()));

app.listen(PORT, () => {
    console.log(`[🚀] Servidor Proxy de Binance en puerto ${PORT}`);
});
