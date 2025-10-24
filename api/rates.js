const axios = require("axios");

console.log("Executing api/rates.js with CoinGecko API");

// URL de la API de CoinGecko
const COINGECKO_API_URL = "https://api.coingecko.com/api/v3/simple/price";

// Tasas de Referencia Fijas (Fallback)
const FALLBACK_RATES = {
  WLD_to_USDT: 1.19,
  USDT_to_CLP_P2P: 963.00,
  VES_to_USDT_P2P: 36.00,
};

/**
 * Obtiene las tasas de cambio desde la API de CoinGecko.
 * @returns {Promise<object|null>} Un objeto con las tasas o null si falla.
 */
async function getCoinGeckoRates() {
  try {
    const params = {
      ids: 'worldcoin,tether',
      vs_currencies: 'usdt,clp,ves'
    };

    const response = await axios.get(COINGECKO_API_URL, { params, timeout: 5000 });
    const data = response.data;

    if (data && data.worldcoin && data.tether) {
      return {
        wld_usdt: data.worldcoin.usdt,
        usdt_clp: data.tether.clp,
        usdt_ves: data.tether.ves,
      };
    }
    
    console.warn("Respuesta inesperada de CoinGecko API:", data);
    return null;

  } catch (error) {
    console.error("Error detallado al obtener tasas de CoinGecko:", error.message);
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
    const coingeckoRates = await getCoinGeckoRates();

    const finalRates = {
      success: true,
      WLD_to_USDT: coingeckoRates?.wld_usdt || FALLBACK_RATES.WLD_to_USDT,
      USDT_to_CLP_P2P: coingeckoRates?.usdt_clp || FALLBACK_RATES.USDT_to_CLP_P2P,
      VES_to_USDT_P2P: coingeckoRates?.usdt_ves || FALLBACK_RATES.VES_to_USDT_P2P,
      meta: {
          wld_source: coingeckoRates?.wld_usdt ? 'CoinGecko' : 'Fallback',
          clp_source: coingeckoRates?.usdt_clp ? 'CoinGecko' : 'Fallback',
          ves_source: coingeckoRates?.usdt_ves ? 'CoinGecko' : 'Fallback',
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
