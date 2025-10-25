const axios = require("axios");

console.log("Executing api/rates.js with Hybrid API (CoinGecko + Binance)");

// URLs de las APIs
const COINGECKO_API_URL = "https://api.coingecko.com/api/v3/simple/price";
const BINANCE_SPOT_URL = "https://api.binance.com/api/v3/ticker/price?symbol=WLDUSDT";

// Tasas de Referencia Fijas (Fallback)
const FALLBACK_RATES = {
  WLD_to_USDT: 1.19,
  USDT_to_CLP_P2P: 963.00,
  VES_to_USDT_P2P: 36.00,
};

/**
 * Obtiene las tasas de cambio de monedas fiat desde la API de CoinGecko.
 */
async function getCoinGeckoFiatRates() {
  try {
    const params = { ids: 'tether', vs_currencies: 'clp,ves' };
    const response = await axios.get(COINGECKO_API_URL, { params, timeout: 5000 });
    const data = response.data;

    if (data && data.tether) {
      return {
        usdt_clp: data.tether.clp,
        usdt_ves: data.tether.ves,
      };
    }
    console.warn("Respuesta inesperada de CoinGecko API para tasas fiat:", data);
    return null;
  } catch (error) {
    console.error("Error detallado al obtener tasas fiat de CoinGecko:", error.message);
    return null;
  }
}

/**
 * Obtiene el precio de WLD/USDT desde la API Spot de Binance.
 */
async function getBinanceSpotRate() {
  try {
    const response = await axios.get(BINANCE_SPOT_URL, { timeout: 5000 });
    if (response.data && response.data.price) {
      return parseFloat(response.data.price);
    }
    console.warn("Respuesta inesperada de Binance Spot API:", response.data);
    return null;
  } catch (error) {
    console.error("Error detallado al obtener WLD/USDT spot rate de Binance:", error.message, error.response?.data);
    return null;
  }
}

// Función principal de Vercel Serverless
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const [fiatRates, spotPrice] = await Promise.all([
      getCoinGeckoFiatRates(),
      getBinanceSpotRate(),
    ]);

    const finalRates = {
      success: true,
      WLD_to_USDT: spotPrice || FALLBACK_RATES.WLD_to_USDT,
      USDT_to_CLP_P2P: fiatRates?.usdt_clp || FALLBACK_RATES.USDT_to_CLP_P2P,
      VES_to_USDT_P2P: fiatRates?.usdt_ves || FALLBACK_RATES.VES_to_USDT_P2P,
      meta: {
          wld_source: spotPrice ? 'Binance Spot' : 'Fallback',
          clp_source: fiatRates?.usdt_clp ? 'CoinGecko' : 'Fallback',
          ves_source: fiatRates?.usdt_ves ? 'CoinGecko' : 'Fallback',
      }
    };

    res.status(200).json(finalRates);

  } catch (error) {
    console.error("Error general en la función de tasas:", error.message);
    res.status(500).json({
      success: false,
      message: "Error al procesar tasas, usando valores de referencia.",
      ...FALLBACK_RATES,
      meta: {
          wld_source: 'Fallback',
          clp_source: 'Fallback',
          ves_source: 'Fallback',
      }
    });
  }
};
