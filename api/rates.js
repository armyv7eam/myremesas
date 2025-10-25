const axios = require("axios");

console.log("Executing api/rates.js with Final Hybrid API (CriptoYa + CoinGecko)");

// URLs de las APIs
const CRIPTOYA_API_BASE_URL = "https://criptoya.com/api";
const COINGECKO_API_URL = "https://api.coingecko.com/api/v3/simple/price";

// Tasas de Referencia Fijas (Fallback)
const FALLBACK_RATES = {
  WLD_to_USDT: 1.19,
  USDT_to_CLP_P2P: 963.00,
  VES_to_USDT_P2P: 36.00,
};

/**
 * Obtiene la tasa P2P de Binance a través de la API de CriptoYa.
 */
async function getCriptoYaP2PRate(fiat) {
  try {
    // URL CORREGIDA: El formato es /api/{exchange}/{coin_to_buy}/{fiat_to_pay_with}/{volume}
    const url = `${CRIPTOYA_API_BASE_URL}/binance/usdt/${fiat.toLowerCase()}/1`;
    const response = await axios.get(url, { timeout: 7000 });
    // CriptoYa devuelve el precio de COMPRA (ask) para el usuario.
    if (response.data && response.data.ask) {
      return response.data.ask;
    }
    console.warn(`Respuesta inesperada de CriptoYa para ${fiat}:`, response.data);
    return null;
  } catch (error) {
    console.error(`Error al obtener tasa de CriptoYa para ${fiat}:`, error.message);
    return null;
  }
}

/**
 * Obtiene las tasas de mercado desde la API de CoinGecko como respaldo.
 */
async function getCoinGeckoBackupRates() {
  try {
    const params = { ids: 'worldcoin,tether', vs_currencies: 'usdt,clp,ves' };
    const response = await axios.get(COINGECKO_API_URL, { params, timeout: 7000 });
    const data = response.data;
    if (data && data.worldcoin?.usdt && data.tether?.clp && data.tether?.ves) {
      return {
        wld_usdt: data.worldcoin.usdt,
        usdt_clp: data.tether.clp,
        usdt_ves: data.tether.ves,
      };
    }
    console.warn("Respuesta inesperada de CoinGecko:", data);
    return null;
  } catch (error) {
    console.error("Error al obtener tasas de CoinGecko:", error.message);
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
    const [clpRateCriptoYa, vesRateCriptoYa, backupRatesCoinGecko] = await Promise.all([
      getCriptoYaP2PRate("clp"),
      getCriptoYaP2PRate("ves"),
      getCoinGeckoBackupRates(),
    ]);

    const finalRates = {
      success: true,
      WLD_to_USDT: backupRatesCoinGecko?.wld_usdt || FALLBACK_RATES.WLD_to_USDT,
      USDT_to_CLP_P2P: clpRateCriptoYa || backupRatesCoinGecko?.usdt_clp || FALLBACK_RATES.USDT_to_CLP_P2P,
      VES_to_USDT_P2P: vesRateCriptoYa || backupRatesCoinGecko?.usdt_ves || FALLBACK_RATES.VES_to_USDT_P2P,
      meta: {
          wld_source: backupRatesCoinGecko?.wld_usdt ? 'CoinGecko' : 'Fallback',
          clp_source: clpRateCriptoYa ? 'CriptoYa' : (backupRatesCoinGecko?.usdt_clp ? 'CoinGecko' : 'Fallback'),
          ves_source: vesRateCriptoYa ? 'CriptoYa' : (backupRatesCoinGecko?.usdt_ves ? 'CoinGecko' : 'Fallback'),
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
