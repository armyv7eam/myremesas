const axios = require("axios");

console.log("Executing api/rates.js with Hybrid API (CriptoYa + CoinGecko)");

// URLs de las APIs
const COINGECKO_API_URL = "https://api.coingecko.com/api/v3/simple/price";
const CRIPTOYA_API_BASE_URL = "https://criptoya.com/api";

// Tasas de Referencia Fijas (Fallback)
const FALLBACK_RATES = {
  WLD_to_USDT: 1.19,
  USDT_to_CLP_P2P: 963.00,
  VES_to_USDT_P2P: 36.00,
};

/**
 * Obtiene la tasa WLD/USDT desde la API de CoinGecko.
 */
async function getCoinGeckoWldRate() {
  try {
    const params = { ids: 'worldcoin', vs_currencies: 'usdt' };
    const response = await axios.get(COINGECKO_API_URL, { params, timeout: 7000 });
    if (response.data?.worldcoin?.usdt) {
      return response.data.worldcoin.usdt;
    }
    console.warn("Respuesta inesperada de CoinGecko para WLD/USDT:", response.data);
    return null;
  } catch (error) {
    console.error("Error detallado al obtener WLD/USDT de CoinGecko:", error.message);
    return null;
  }
}

/**
 * Obtiene la tasa P2P de un exchange a través de la API de CriptoYa.
 */
async function getCriptoYaP2PRate(fiat) {
  try {
    // Usamos un volumen bajo (ej. 1) para obtener la tasa base.
    const url = `${CRIPTOYA_API_BASE_URL}/binance/${fiat}/1`;
    const response = await axios.get(url, { timeout: 7000 });
    // CriptoYa devuelve el precio de COMPRA (ask) para el usuario.
    if (response.data && response.data.ask) {
      return response.data.ask;
    }
    console.warn(`Respuesta inesperada de CriptoYa para ${fiat}:`, response.data);
    return null;
  } catch (error) {
    console.error(`Error detallado al obtener tasa de CriptoYa para ${fiat}:`, error.message);
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
    const [wldRate, clpRate, vesRate] = await Promise.all([
      getCoinGeckoWldRate(),
      getCriptoYaP2PRate("clp"),
      getCriptoYaP2PRate("ves"),
    ]);

    const finalRates = {
      success: true,
      WLD_to_USDT: wldRate || FALLBACK_RATES.WLD_to_USDT,
      USDT_to_CLP_P2P: clpRate || FALLBACK_RATES.USDT_to_CLP_P2P,
      VES_to_USDT_P2P: vesRate || FALLBACK_RATES.VES_to_USDT_P2P,
      meta: {
          wld_source: wldRate ? 'CoinGecko' : 'Fallback',
          clp_source: clpRate ? 'CriptoYa' : 'Fallback',
          ves_source: vesRate ? 'CriptoYa' : 'Fallback',
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
