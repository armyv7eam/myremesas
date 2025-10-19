const axios = require('axios');

const BINANCE_API_KEY = process.env.BINANCE_API_KEY || '';
const BINANCE_API_SECRET = process.env.BINANCE_API_SECRET || '';

const FALLBACK_RATES = {
    WLD_to_USDT: 0.88,
    USDT_to_CLP_P2P: 950.00,
    VES_per_USDT_SELL: 37.00,
};

const BINANCE_P2P_ENDPOINT = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';
const BINANCE_TICKER_PRICE_ENDPOINT = 'https://api.binance.com/api/v3/ticker/price';
const BINANCE_AVG_PRICE_ENDPOINT = 'https://api.binance.com/api/v3/avgPrice';
const BINANCE_24H_TICKER_ENDPOINT = 'https://api.binance.com/api/v3/ticker/24hr';
const BYBIT_SPOT_TICKER_ENDPOINT = 'https://api.bybit.com/v5/market/tickers';

/**
 * Genera headers comunes para las peticiones a Binance.
 * Para las peticiones Spot anexamos la API Key; la API P2P ignora la firma,
 * pero mantener el header ayuda a depurar accesos.
 */
function buildHeaders(extra = {}) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (compatible; myremesas/1.0; +https://myremesas.vercel.app)',
        'Accept': 'application/json',
        ...extra,
    };
    if (BINANCE_API_KEY) {
        headers['X-MBX-APIKEY'] = BINANCE_API_KEY;
    }
    return headers;
}

/**
 * Obtiene el precio spot de WLD/USDT usando la API oficial.
 */
async function getBinanceSpotRate(errorBucket = []) {
    const attempts = [
        {
            url: BINANCE_AVG_PRICE_ENDPOINT,
            params: { symbol: 'WLDUSDT' },
            source: 'binance_avgPrice',
            pick: (data) => data?.price,
        },
        {
            url: BINANCE_TICKER_PRICE_ENDPOINT,
            params: { symbol: 'WLDUSDT' },
            source: 'binance_tickerPrice',
            pick: (data) => data?.price,
        },
        {
            url: BINANCE_24H_TICKER_ENDPOINT,
            params: { symbol: 'WLDUSDT' },
            source: 'binance_ticker24h',
            pick: (data) => data?.lastPrice,
        },
    ];

    for (const attempt of attempts) {
        try {
            const { data } = await axios.get(attempt.url, {
                params: attempt.params,
                headers: buildHeaders(),
                timeout: 5000,
            });
            const rawPrice = attempt.pick(data);
            const price = parseFloat(rawPrice);
            if (Number.isFinite(price) && price > 0) {
                return { price, source: attempt.source };
            }
        } catch (error) {
            const message = error.response
                ? `HTTP ${error.response.status} - ${error.response.statusText}`
                : error.message;
            console.warn(`Fallo consulta spot (${attempt.source}):`, message);
            errorBucket.push({
                exchange: 'binance',
                source: attempt.source,
                message,
            });
        }
    }

    return null;
}

async function getBybitSpotRate(errorBucket = []) {
    try {
        const { data } = await axios.get(BYBIT_SPOT_TICKER_ENDPOINT, {
            params: {
                category: 'spot',
                symbol: 'WLDUSDT',
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; myremesas/1.0; +https://myremesas.vercel.app)',
                'Accept': 'application/json',
            },
            timeout: 5000,
        });

        const priceStr = data?.result?.list?.[0]?.lastPrice;
        const price = parseFloat(priceStr);
        if (Number.isFinite(price) && price > 0) {
            return { price, source: 'bybit_spot' };
        }
        console.warn('Respuesta de Bybit sin precio válido para WLD/USDT.');
        errorBucket.push({
            exchange: 'bybit',
            source: 'bybit_spot',
            message: 'Respuesta sin precio válido',
        });
        return null;
    } catch (error) {
        const message = error.response
            ? `HTTP ${error.response.status} - ${error.response.statusText}`
            : error.message;
        console.warn('Fallo consulta spot (bybit_spot):', message);
        errorBucket.push({
            exchange: 'bybit',
            source: 'bybit_spot',
            message,
        });
        return null;
    }
}

async function getOkxSpotRate(errorBucket = []) {
    try {
        const { data } = await axios.get('https://www.okx.com/api/v5/market/ticker', {
            params: { instId: 'WLD-USDT' },
            timeout: 5000,
        });

        const price = parseFloat(data?.data?.[0]?.last);
        if (Number.isFinite(price) && price > 0) {
            return { price, source: 'okx_spot' };
        }

        errorBucket.push({
            exchange: 'okx',
            source: 'ticker',
            message: 'Respuesta sin precio valido',
        });
        return null;
    } catch (error) {
        const message = error.response
            ? `HTTP ${error.response.status} - ${error.response.statusText}`
            : error.message;
        console.warn('Fallo consulta spot (okx_spot):', message);
        errorBucket.push({
            exchange: 'okx',
            source: 'ticker',
            message,
        });
        return null;
    }
}

async function getKucoinSpotRate(errorBucket = []) {
    try {
        const { data } = await axios.get('https://api.kucoin.com/api/v1/market/orderbook/level1', {
            params: { symbol: 'WLD-USDT' },
            timeout: 5000,
        });

        const price = parseFloat(data?.data?.price);
        if (Number.isFinite(price) && price > 0) {
            return { price, source: 'kucoin_spot' };
        }

        errorBucket.push({
            exchange: 'kucoin',
            source: 'orderbook_level1',
            message: 'Respuesta sin precio valido',
        });
        return null;
    } catch (error) {
        const message = error.response
            ? `HTTP ${error.response.status} - ${error.response.statusText}`
            : error.message;
        console.warn('Fallo consulta spot (kucoin_spot):', message);
        errorBucket.push({
            exchange: 'kucoin',
            source: 'orderbook_level1',
            message,
        });
        return null;
    }
}

async function getGateSpotRate(errorBucket = []) {
    try {
        const { data } = await axios.get('https://api.gateio.ws/api/v4/spot/tickers', {
            params: { currency_pair: 'WLD_USDT' },
            timeout: 5000,
        });

        const price = parseFloat(data?.[0]?.last);
        if (Number.isFinite(price) && price > 0) {
            return { price, source: 'gate_spot' };
        }

        errorBucket.push({
            exchange: 'gate',
            source: 'spot_ticker',
            message: 'Respuesta sin precio valido',
        });
        return null;
    } catch (error) {
        const message = error.response
            ? `HTTP ${error.response.status} - ${error.response.statusText}`
            : error.message;
        console.warn('Fallo consulta spot (gate_spot):', message);
        errorBucket.push({
            exchange: 'gate',
            source: 'spot_ticker',
            message,
        });
        return null;
    }
}

async function getCoingeckoSpotRate(errorBucket = []) {
    try {
        const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
            params: {
                ids: 'worldcoin-wld',
                vs_currencies: 'usd'
            },
            timeout: 5000,
        });
        const price = parseFloat(data?.['worldcoin-wld']?.usd);
        if (Number.isFinite(price) && price > 0) {
            return { price, source: 'coingecko_spot' };
        }
        errorBucket.push({ exchange: 'coingecko', source: 'simple_price', message: 'Respuesta sin precio v�lido' });
        return null;
    } catch (error) {
        const message = error.response ? `HTTP ${error.response.status} - ${error.response.statusText}` : error.message;
        console.warn('Fallo consulta spot (coingecko_spot):', message);
        errorBucket.push({ exchange: 'coingecko', source: 'simple_price', message });
        return null;
    }
}

async function getSpotRate() {
    const spotErrors = [];
    const binanceSpot = await getBinanceSpotRate(spotErrors);
    if (binanceSpot) {
        binanceSpot.errors = spotErrors;
        return binanceSpot;
    }

    const bybitSpot = await getBybitSpotRate(spotErrors);
    if (bybitSpot) {
        bybitSpot.errors = spotErrors;
        return bybitSpot;
    }

    const okxSpot = await getOkxSpotRate(spotErrors);
    if (okxSpot) {
        okxSpot.errors = spotErrors;
        return okxSpot;
    }

    const kucoinSpot = await getKucoinSpotRate(spotErrors);
    if (kucoinSpot) {
        kucoinSpot.errors = spotErrors;
        return kucoinSpot;
    }

    const gateSpot = await getGateSpotRate(spotErrors);
    if (gateSpot) {
        gateSpot.errors = spotErrors;
        return gateSpot;
    }

    const coingeckoSpot = await getCoingeckoSpotRate(spotErrors);
    if (coingeckoSpot) {
        coingeckoSpot.errors = spotErrors;
        return coingeckoSpot;
    }

    console.error('No se pudo obtener precio spot WLD/USDT desde Binance, Bybit, OKX, Kucoin, Gate ni Coingecko.');
    return { price: null, source: 'fallback', errors: spotErrors };
}

/**
 * Realiza una consulta al marketplace P2P de Binance.
 * Binance no expone esta API con firma, por lo que se usa el endpoint público.
 */
async function getP2PRates({ fiat, tradeType, asset = 'USDT', rows = 8, transAmount = null }) {
    const payload = {
        page: 1,
        rows,
        payTypes: [],
        asset,
        tradeType,
        fiat,
        transAmount,
        publisherType: null,
        merchantCheck: false,
        proMerchantAds: false,
        shieldMerchantAds: false,
    };

    try {
        const { data } = await axios.post(
            BINANCE_P2P_ENDPOINT,
            payload,
            {
                headers: {
                    ...buildHeaders({
                        'Content-Type': 'application/json',
                        'clienttype': 'web',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
                        'Origin': 'https://p2p.binance.com',
                        'Referer': 'https://p2p.binance.com/',
                    }),
                },
                timeout: 7000,
            },
        );

        if (!data || !Array.isArray(data.data) || data.data.length === 0) {
            console.warn(`No se recibieron ofertas P2P para ${tradeType} ${asset} ${fiat}`);
            return [];
        }

        return data.data
            .map((entry) => {
                const price = parseFloat(entry?.adv?.price);
                return Number.isFinite(price) ? price : null;
            })
            .filter((price) => price !== null);
    } catch (error) {
        console.error(`Error al obtener tasas P2P ${tradeType} ${asset}/${fiat}:`, error.message);
        return [];
    }
}

/**
 * Selecciona una oferta concreta priorizando estabilidad frente a outliers.
 */
function pickOffer(prices, strategy = { index: 0, average: 0 }) {
    if (!Array.isArray(prices) || prices.length === 0) {
        return null;
    }

    if (strategy.average && prices.length >= strategy.average) {
        const slice = prices.slice(0, strategy.average);
        const sum = slice.reduce((acc, price) => acc + price, 0);
        return sum / slice.length;
    }

    const index = Math.min(strategy.index ?? 0, prices.length - 1);
    return prices[index];
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    let spotErrors = [];

    try {
        const [spotResult, clpBuyPrices, vesSellPrices] = await Promise.all([
            getSpotRate(),
            getP2PRates({ fiat: 'CLP', tradeType: 'BUY' }),
            getP2PRates({ fiat: 'VES', tradeType: 'SELL' }),
        ]);

        spotErrors = Array.isArray(spotResult?.errors) ? spotResult.errors : [];
        const spotPrice = spotResult?.price ?? null;
        const spotSource = spotResult?.source ?? 'fallback';
        const clpBuyRate = pickOffer(clpBuyPrices, { average: 3 }) || FALLBACK_RATES.USDT_to_CLP_P2P;
        const vesSellRate = pickOffer(vesSellPrices, { index: 3 }) || FALLBACK_RATES.VES_per_USDT_SELL;
        const wldSpot = spotPrice || FALLBACK_RATES.WLD_to_USDT;

        res.status(200).json({
            success: true,
            WLD_to_USDT: wldSpot,
            USDT_to_CLP_P2P: clpBuyRate,
            VES_per_USDT_SELL: vesSellRate,
            meta: {
                spotSource,
                clpOffers: clpBuyPrices.length,
                vesOffers: vesSellPrices.length,
                apiKeyAttached: Boolean(BINANCE_API_KEY && BINANCE_API_SECRET),
                spotErrors,
            },
        });
    } catch (error) {
        console.error('Error general al obtener tasas:', error.message);
        res.status(500).json({
            success: false,
            message: 'Error al procesar tasas, usando valores de referencia.',
            ...FALLBACK_RATES,
            meta: {
                spotSource: 'fallback',
                spotErrors,
                apiKeyAttached: Boolean(BINANCE_API_KEY && BINANCE_API_SECRET),
            },
        });
    }
};
