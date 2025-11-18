/**
 * Worker de Cloudflare para interactuar con la API de Binance.
 */

const JSON_CONTENT_TYPE = { 'Content-Type': 'application/json' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Enrutador simple para manejar diferentes rutas
    switch (url.pathname) {
      case '/binance':
        return handleBinanceBalance(url, env);
      // Puedes añadir más rutas aquí en el futuro, por ejemplo:
      // case '/binance/trade':
      //   return handleBinanceTrade(request, env);
      default:
        return new Response('Not found', { status: 404 });
    }
  },
};

/**
 * Maneja la lógica para consultar el balance de un activo en Binance.
 * @param {URL} url - El objeto URL de la solicitud.
 * @param {object} env - Las variables de entorno del worker.
 * @returns {Promise<Response>}
 */
async function handleBinanceBalance(url, env) {
  const { BINANCE_API_KEY, BINANCE_API_SECRET } = env;
  if (!BINANCE_API_KEY || !BINANCE_API_SECRET) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Faltan las variables BINANCE_API_KEY o BINANCE_API_SECRET en el Worker.'
    }), { status: 500, headers: JSON_CONTENT_TYPE });
  }

  const params = {
    timestamp: Date.now(),
    recvWindow: 5000,
  };
  const queryString = new URLSearchParams(params).toString();
  const signature = await sign(queryString, BINANCE_API_SECRET);
  const apiUrl = `https://api.binance.com/sapi/v1/capital/config/getall?${queryString}&signature=${signature}`;

  try {
    const binanceResp = await fetch(apiUrl, {
      headers: { 'X-MBX-APIKEY': BINANCE_API_KEY },
    });

    const data = await binanceResp.json();

    if (!binanceResp.ok) {
      return new Response(JSON.stringify({
        success: false,
        message: data?.msg || `Error de Binance (HTTP ${binanceResp.status})`,
      }), { status: binanceResp.status, headers: JSON_CONTENT_TYPE });
    }

    const asset = url.searchParams.get('asset')?.toUpperCase() || 'USDT';
    const entry = data?.find((item) => item.coin === asset);

    return new Response(JSON.stringify({
      success: true,
      asset,
      balance: entry ? {
        free: entry.free,
        locked: entry.locked,
        withdrawing: entry.withdrawing,
      } : null,
    }), { status: 200, headers: JSON_CONTENT_TYPE });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      message: `Error general: ${error.message}`,
    }), { status: 500, headers: JSON_CONTENT_TYPE });
  }
}

/**
 * Firma una cadena de consulta para la API de Binance usando HMAC-SHA256.
 * @param {string} query - La cadena de parámetros a firmar.
 * @param {string} secret - El API secret de Binance.
 * @returns {Promise<string>} La firma en formato hexadecimal.
 */
async function sign(query, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(query));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}