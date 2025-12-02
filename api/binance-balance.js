const axios = require("axios");
const crypto = require("crypto");

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

module.exports = async (req, res) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  // Usar el proxy de Cloudflare si está configurado, si no, usar la API directa.
  const useProxy = !!process.env.BINANCE_PROXY_URL;

  const asset = (req.query.asset || "USDT").toUpperCase();

  try {
    let responseData;

    if (useProxy) {
      // --- Lógica para llamar al Proxy de Cloudflare ---
      const proxyUrl = `${process.env.BINANCE_PROXY_URL}/binance?asset=${asset}`;
      console.log(`Usando proxy de Cloudflare: ${proxyUrl}`);
      const { data } = await axios.get(proxyUrl, { timeout: 8000 });
      responseData = data; // La respuesta del proxy ya tiene el formato que necesitamos
    } else {
      // --- Lógica original para llamar directamente a Binance (para desarrollo local) ---
      console.log("Usando API directa de Binance (entorno local o sin proxy configurado).");
      const apiKey = process.env.BINANCE_API_KEY;
      const apiSecret = process.env.BINANCE_API_SECRET;

      if (!apiKey || !apiSecret) {
        return res.status(500).json({
          success: false,
          message: "Credenciales de Binance no configuradas. Define BINANCE_API_KEY y BINANCE_API_SECRET.",
        });
      }

      const params = { timestamp: Date.now(), recvWindow: 5000 };
      const queryString = new URLSearchParams(params).toString();
      const signature = crypto.createHmac("sha256", apiSecret).update(queryString).digest("hex");

      const { data: binanceData } = await axios.get("https://api1.binance.com/sapi/v1/capital/config/getall", {
        params: { ...params, signature },
        headers: { "X-MBX-APIKEY": apiKey },
        timeout: 8000,
      });

      if (!Array.isArray(binanceData)) {
        return res.status(502).json({ success: false, message: "Respuesta inesperada de Binance.", data: binanceData });
      }

      // Formatear la respuesta para que sea igual a la del proxy
      const assetInfo = binanceData.find((item) => item.coin === asset);
      const free = parseFloat(assetInfo?.free || "0");
      const locked = parseFloat(assetInfo?.locked || "0");
      const withdrawing = parseFloat(assetInfo?.withdrawing || "0");

      responseData = {
        success: true,
        asset,
        balance: assetInfo ? { free, locked, withdrawing, total: free + locked + withdrawing } : null,
      };
    }

    // Handle proxy response (already formatted) vs direct API response (raw array)
    let finalResponse;

    if (useProxy) {
      // Proxy returns raw Binance array, need to process it
      if (!Array.isArray(responseData)) {
        return res.status(502).json({ success: false, message: "Respuesta inesperada del proxy.", data: responseData });
      }

      const assetInfo = responseData.find((item) => item.coin === asset);
      if (!assetInfo) {
        return res.status(200).json({
          success: true,
          asset,
          balance: null,
          message: `El activo ${asset} no se encontró en la cuenta.`,
        });
      }

      const free = parseFloat(assetInfo.free || "0");
      const locked = parseFloat(assetInfo.locked || "0");
      const withdrawing = parseFloat(assetInfo.withdrawing || "0");
      const total = free + locked + withdrawing;

      finalResponse = {
        success: true,
        asset,
        balance: {
          free,
          locked,
          withdrawing,
          total,
        },
      };
    } else {
      // Direct API already formatted the response
      finalResponse = responseData;
    }

    return res.status(200).json(finalResponse);
  } catch (error) {
    const status = error.response?.status;
    const message = error.response?.data?.msg || error.message;
    return res.status(status || 500).json({
      success: false,
      message: `Error al consultar saldo en Binance: ${message}`,
      status,
    });
  }
};
