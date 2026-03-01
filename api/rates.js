const axios = require("axios");

console.log("Executing api/rates.js with Final Hybrid API (CriptoYa + CoinGecko)");

// URLs de las APIs
const CRIPTOYA_API_BASE_URL = "https://criptoya.com/api";
const COINGECKO_API_URL = "https://api.coingecko.com/api/v3/simple/price";
const BINANCE_SPOT_PRICE_URL = "https://api.binance.com/api/v3/ticker/price";
const BINANCE_P2P_SEARCH_URL = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";
const BYBIT_TICKER_URL = "https://api.bybit.com/v5/market/tickers";
const GATE_TICKER_URL = "https://api.gateio.ws/api/v4/spot/tickers";

// Tasas de Referencia Fijas (Fallback)
const FALLBACK_RATES = {
  WLD_to_USDT: 1.19,
  USDT_to_CLP_P2P: 963.00,
  VES_to_USDT_P2P: 36.00,
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const PAYMENT_METHOD_BANK_TRANSFER_REGEX = /(bank|banc|transfer|transferencia)/i;

const hasBankTransferMethod = (row) => {
  const methods = Array.isArray(row?.adv?.tradeMethods) ? row.adv.tradeMethods : [];
  return methods.some((method) => {
    const name = `${method?.tradeMethodName || ""} ${method?.identifier || ""}`;
    return PAYMENT_METHOD_BANK_TRANSFER_REGEX.test(name);
  });
};

async function getBinanceP2POffers({ fiat, tradeType, rows = 20, payTypes = [] }) {
  try {
    const payload = {
      page: 1,
      rows,
      payTypes,
      countries: [],
      publisherType: null,
      asset: "USDT",
      fiat,
      tradeType,
      transAmount: "",
    };

    const response = await axios.post(BINANCE_P2P_SEARCH_URL, payload, {
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
      },
    });

    return Array.isArray(response.data?.data) ? response.data.data : [];
  } catch (error) {
    const status = error.response?.status;
    const suffix = status ? ` (HTTP ${status})` : "";
    console.error(`Error Binance P2P ${tradeType} ${fiat}: ${error.message}${suffix}`);
    return [];
  }
}

async function getBinanceP2PSixthRates() {
  const [clpBuyRows, vesSellRows] = await Promise.all([
    getBinanceP2POffers({ fiat: "CLP", tradeType: "BUY" }),
    // 50 filas para ampliar el pool de filtrado.
    getBinanceP2POffers({ fiat: "VES", tradeType: "SELL", rows: 50 }),
  ]);

  const clpBuy6 = toNumber(clpBuyRows[5]?.adv?.price);

  const vesSellBankRows = vesSellRows.filter(hasBankTransferMethod);

  let vesTargetRow;
  let vesSellSource;

  if (vesSellBankRows.length > 0) {
    // Si hay ofertas con bank-transfer, toma la 6ª o la última disponible.
    vesTargetRow = vesSellBankRows[5] ?? vesSellBankRows[vesSellBankRows.length - 1];
    vesSellSource = 'Binance P2P SELL #6 (Bank Transfer)';
  } else {
    // En VES los métodos de pago son nombres de bancos (Mercantil, Banesco, etc.)
    // que no coinciden con el regex bancario. Fallback a la 6ª oferta general.
    vesTargetRow = vesSellRows[5];
    vesSellSource = 'Binance P2P SELL #6';
    console.warn('VES SELL: sin ofertas con método bank-transfer reconocido. Usando 6ª oferta general.');
  }

  const vesSell6Bank = toNumber(vesTargetRow?.adv?.price);

  return {
    clpBuy6,
    vesSell6Bank,
    vesSellSource: vesSell6Bank > 0 ? vesSellSource : null,
  };
}

/**
 * Obtiene la tasa P2P de Binance a través de la API de CriptoYa.
 */
async function getCriptoYaP2PRate(fiat) {
  try {
    // URL CORRECTA: /api/binancep2p/{coin_to_buy}/{fiat_to_pay_with}/{volume}
    const url = `${CRIPTOYA_API_BASE_URL}/binancep2p/usdt/${fiat.toLowerCase()}/1`;
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
 * Obtiene el precio spot WLD/USDT desde Binance.
 */
async function getBinanceSpotRate(symbol) {
  try {
    const response = await axios.get(BINANCE_SPOT_PRICE_URL, {
      params: { symbol },
      timeout: 7000,
    });

    if (response.data?.price) {
      return parseFloat(response.data.price);
    }

    console.warn(`Respuesta inesperada de Binance para ${symbol}:`, response.data);
    return null;
  } catch (error) {
    const status = error.response?.status;
    const suffix = status ? ` (HTTP ${status})` : "";
    console.error(`Error al obtener tasa spot de Binance para ${symbol}: ${error.message}${suffix}`);
    if (status === 451) {
      console.warn("Binance rechaza la solicitud por restricciones geográficas. Intentando otra fuente.");
    }
    return null;
  }
}

/**
 * Obtiene el precio spot WLD/USDT desde Bybit.
 */
async function getBybitSpotRate(symbol) {
  try {
    const response = await axios.get(BYBIT_TICKER_URL, {
      params: { category: "spot", symbol },
      timeout: 7000,
    });

    const ticker = response.data?.result?.list?.[0];
    if (ticker?.lastPrice) {
      return parseFloat(ticker.lastPrice);
    }

    console.warn(`Respuesta inesperada de Bybit para ${symbol}:`, response.data);
    return null;
  } catch (error) {
    const status = error.response?.status;
    const suffix = status ? ` (HTTP ${status})` : "";
    console.error(`Error al obtener tasa spot de Bybit para ${symbol}: ${error.message}${suffix}`);
    return null;
  }
}

/**
 * Obtiene el precio spot WLD/USDT desde Gate.io.
 */
async function getGateSpotRate(currencyPair) {
  try {
    const response = await axios.get(GATE_TICKER_URL, {
      params: { currency_pair: currencyPair },
      timeout: 7000,
    });

    const ticker = Array.isArray(response.data) ? response.data[0] : null;
    if (ticker?.last) {
      return parseFloat(ticker.last);
    }

    console.warn(`Respuesta inesperada de Gate.io para ${currencyPair}:`, response.data);
    return null;
  } catch (error) {
    const status = error.response?.status;
    const suffix = status ? ` (HTTP ${status})` : "";
    console.error(`Error al obtener tasa spot de Gate.io para ${currencyPair}: ${error.message}${suffix}`);
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
    if (!data) {
      console.warn("CoinGecko devolvió una respuesta vacía.");
      return null;
    }

    let wldUsdt = data.worldcoin?.usdt ?? null;
    const usdtClp = data.tether?.clp ?? null;
    const usdtVes = data.tether?.ves ?? null;

    // Si CoinGecko no entrega WLD/USDT directo, intenta derivarlo desde CLP.
    if (!wldUsdt && data.worldcoin?.clp && usdtClp) {
      wldUsdt = data.worldcoin.clp / usdtClp;
    }

    if (!wldUsdt && !usdtClp && !usdtVes) {
      console.warn("CoinGecko no entregó suficientes datos para tasas de respaldo:", data);
      return null;
    }

    return {
      wld_usdt: wldUsdt,
      usdt_clp: usdtClp,
      usdt_ves: usdtVes,
    };
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
    const [
      p2pBinance,
      clpRateCriptoYa,
      vesRateCriptoYa,
      wldRateBinance,
      wldRateBybit,
      wldRateGate,
      backupRatesCoinGecko,
    ] = await Promise.all([
      getBinanceP2PSixthRates(),
      getCriptoYaP2PRate("clp"),
      getCriptoYaP2PRate("ves"),
      getBinanceSpotRate("WLDUSDT"),
      getBybitSpotRate("WLDUSDT"),
      getGateSpotRate("WLD_USDT"),
      getCoinGeckoBackupRates(),
    ]);

    const usdtToClpFromBinance6 = p2pBinance.clpBuy6;
    // Tasa directa de Binance P2P VES SELL. Si está bloqueada desde Vercel (geo),
    // CriptoYa scrape el mismo mercado — usamos esa tasa como equivalente.
    const usdtToVesFromBinance6BankSell = p2pBinance.vesSell6Bank > 0
      ? p2pBinance.vesSell6Bank
      : (vesRateCriptoYa || null);
    const vesFromDirectBinance = p2pBinance.vesSell6Bank > 0;

    const usdtToClp = usdtToClpFromBinance6
      || clpRateCriptoYa
      || backupRatesCoinGecko?.usdt_clp
      || FALLBACK_RATES.USDT_to_CLP_P2P;

    const usdtToVes = usdtToVesFromBinance6BankSell
      || vesRateCriptoYa
      || backupRatesCoinGecko?.usdt_ves
      || FALLBACK_RATES.VES_to_USDT_P2P;

    const finalRates = {
      success: true,
      WLD_to_USDT: wldRateBinance || wldRateBybit || wldRateGate || backupRatesCoinGecko?.wld_usdt || FALLBACK_RATES.WLD_to_USDT,
      USDT_to_CLP_P2P: usdtToClp,
      USDT_to_CLP_P2P_BUY_6TH: usdtToClpFromBinance6 || null,
      USDT_CLP_BUY_6TH: usdtToClpFromBinance6 || null,
      USDT_to_VES_P2P_SELL_6TH_BANK_TRANSFER: usdtToVesFromBinance6BankSell || null,
      USDT_VES_SELL_6TH_BANK_TRANSFER: usdtToVesFromBinance6BankSell || null,
      USDT_to_VES_P2P: usdtToVes,
      // Campo legado: se mantiene por compatibilidad hacia atrás.
      VES_to_USDT_P2P: usdtToVes,
      meta: {
        wld_source: wldRateBinance
          ? 'Binance Spot'
          : (wldRateBybit
            ? 'Bybit Spot'
            : (wldRateGate
              ? 'Gate.io Spot'
              : (backupRatesCoinGecko?.wld_usdt ? 'CoinGecko' : 'Fallback'))),
        clp_source: usdtToClpFromBinance6
          ? 'Binance P2P BUY #6'
          : (clpRateCriptoYa ? 'CriptoYa' : (backupRatesCoinGecko?.usdt_clp ? 'CoinGecko' : 'Fallback')),
        ves_source: usdtToVesFromBinance6BankSell
          ? (vesFromDirectBinance
            ? (p2pBinance.vesSellSource || 'Binance P2P SELL #6')
            : 'Binance P2P via CriptoYa')
          : (backupRatesCoinGecko?.usdt_ves ? 'CoinGecko' : 'Fallback'),
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
