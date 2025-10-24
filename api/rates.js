const axios = require("axios");

console.log("Executing api/rates.js"); // Log de ejecución

// URL de la API de Binance para WLD/USDT (Spot)
const BINANCE_SPOT_URL = "https://api.binance.com/api/v3/ticker/price?symbol=WLDUSDT";

// URL de la API P2P pública de Bybit
const BYBIT_P2P_URL = "https://api.bybit.com/fiat/v1/public/advertisement/query";

// Tasas de Referencia Fijas (Fallback)
const FALLBACK_RATES = {
  WLD_to_USDT: 1.19,
  USDT_to_CLP_P2P: 963.00,
  VES_to_USDT_P2P: 36.00,
};

async function getBybitP2PRate(fiat) {
  const payload = {
    userId: "", 
    asset: "USDT",
    fiatCurrency: fiat,
    payment: [], 
    side: "1", 
    size: "1", 
    page: "1",
    authMaker: false,
  };

  try {
    const response = await axios.post(BYBIT_P2P_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      timeout: 5000,
    });

    if (response.data?.code === "0" && response.data.result?.items?.length > 0) {
      const rate = parseFloat(response.data.result.items[0].price);
      return rate;
    }
    
    console.warn(`No se encontraron ofertas P2P en Bybit para ${fiat}. Respuesta:`, response.data);
    return null;
  } catch (error) {
    console.error(`Error detallado al obtener tasa P2P de Bybit para ${fiat}:`, error);
    return null;
  }
}

async function getSpotRate() {
  try {
    const response = await axios.get(BINANCE_SPOT_URL, { timeout: 5000 });
    if (response.data && response.data.price) {
      return parseFloat(response.data.price);
    }
    console.warn("Respuesta inesperada de Binance Spot API:", response.data);
    return null;
  } catch (error) {
    console.error("Error detallado al obtener WLD/USDT spot rate:", error);
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const [spotPrice, clpRate, vesRate] = await Promise.all([
      getSpotRate(),
      getBybitP2PRate("CLP"),
      getBybitP2PRate("VES"),
    ]);

    const finalRates = {
      success: true,
      WLD_to_USDT: spotPrice || FALLBACK_RATES.WLD_to_USDT,
      USDT_to_CLP_P2P: clpRate || FALLBACK_RATES.USDT_to_CLP_P2P,
      VES_to_USDT_P2P: vesRate || FALLBACK_RATES.VES_to_USDT_P2P,
      meta: {
          wld_source: spotPrice ? 'Binance Spot' : 'Fallback',
          clp_source: clpRate ? 'Bybit P2P' : 'Fallback',
          ves_source: vesRate ? 'Bybit P2P' : 'Fallback',
      }
    };

    res.status(200).json(finalRates);
  } catch (error) {
    console.error("Error general en la función de tasas:", error);
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
