export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== '/binance') {
      return new Response('Not found', { status: 404 });
    }

    const { BINANCE_API_KEY, BINANCE_API_SECRET } = env;
    if (!BINANCE_API_KEY || !BINANCE_API_SECRET) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Faltan las variables BINANCE_API_KEY o BINANCE_API_SECRET en el Worker.'
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const params = {
      timestamp: Date.now(),
      recvWindow: 5000,
    };
    const queryString = new URLSearchParams(params).toString();
    const signature = await sign(queryString, BINANCE_API_SECRET);

    try {
      const binanceResp = await fetch(`https://api.binance.com/sapi/v1/capital/config/getall?${queryString}&signature=${signature}`, {
        headers: {
          'X-MBX-APIKEY': BINANCE_API_KEY,
        },
      });

      const data = await binanceResp.json();

      if (!binanceResp.ok) {
        return new Response(JSON.stringify({
          success: false,
          message: data?.msg || `Error de Binance (HTTP ${binanceResp.status})`,
        }), { status: binanceResp.status, headers: { 'Content-Type': 'application/json' } });
      }

      const asset = url.searchParams.get('asset')?.toUpperCase() || 'USDT';
      const entry = Array.isArray(data) ? data.find((item) => item.coin === asset) : null;

      return new Response(JSON.stringify({
        success: true,
        asset,
        balance: entry ? {
          free: entry.free,
          locked: entry.locked,
          withdrawing: entry.withdrawing,
        } : null,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        message: `Error general: ${error.message}`,
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  },
};

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