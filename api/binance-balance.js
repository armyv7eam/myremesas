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
      // --- Lógica para llamar al Proxy de DigitalOcean ---
      const proxyUrl = `${process.env.BINANCE_PROXY_URL}/api/balance?asset=${asset}`;
      console.log(`Usando proxy de DigitalOcean: ${proxyUrl}`);
      const vpsToken = process.env.VPS_AUTH_TOKEN || 'manzano_dev_token';
      const { data } = await axios.get(proxyUrl, { 
          timeout: 8000,
          headers: { 'x-vps-token': vpsToken }
      });
      responseData = data;
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
      // El VPS de DigitalOcean ya nos devuelve el balance formateado
      if (responseData && (responseData.asset || responseData.free)) {
          finalResponse = {
            success: true,
            asset: responseData.asset || asset,
            balance: {
              free: parseFloat(responseData.free || "0"),
              locked: parseFloat(responseData.locked || "0"),
              withdrawing: parseFloat(responseData.withdrawing || "0"),
              total: parseFloat(responseData.free || "0") + parseFloat(responseData.locked || "0") + parseFloat(responseData.withdrawing || "0"),
            },
          };
      } else {
          console.error("Respuesta inesperada del proxy:", responseData);
          return res.status(502).json({ success: false, message: "Respuesta inesperada del proxy.", data: responseData });
      }
    } else {
      // Direct API already formatted the response
      finalResponse = responseData;
    }

    return res.status(200).json(finalResponse);
  } catch (error) {
    const status = error.response?.status;
    const message = error.response?.data?.error || error.response?.data?.msg || error.message;
    console.error(`Error en API binance-balance: ${message} (Status: ${status})`);
    return res.status(status || 500).json({
      success: false,
      message: `Error al consultar saldo en Binance: ${message}`,
      status,
    });
  }
};
