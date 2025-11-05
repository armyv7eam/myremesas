export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.pathname !== '/binance') {
			return new Response('Not found', { status: 404 });
		}

		const asset = (url.searchParams.get('asset') || 'USDT').toUpperCase();
		const { BINANCE_API_KEY, BINANCE_API_SECRET } = env;
		if (!BINANCE_API_KEY || !BINANCE_API_SECRET) {
			return jsonResponse({
				success: false,
				message: 'Faltan las variables BINANCE_API_KEY o BINANCE_API_SECRET en el Worker.',
			}, 500);
		}

		const params = new URLSearchParams({
			timestamp: Date.now().toString(),
			recvWindow: '5000',
		});
		const signature = await signHmac(params.toString(), BINANCE_API_SECRET);

		try {
			const response = await fetch(`https://api.binance.com/sapi/v1/capital/config/getall?${params}&signature=${signature}`, {
				headers: {
					'X-MBX-APIKEY': BINANCE_API_KEY,
				},
			});
			const data = await response.json();

			if (!response.ok) {
				return jsonResponse({
					success: false,
					status: response.status,
					message: data?.msg || `Error de Binance (HTTP ${response.status})`,
				}, response.status);
			}

			if (!Array.isArray(data)) {
				return jsonResponse({
					success: false,
					message: 'Respuesta inesperada de Binance.',
					data,
				}, 502);
			}

			const assetInfo = data.find((item) => item.coin === asset);
			const balance = assetInfo
				? {
					free: parseFloat(assetInfo.free ?? '0'),
					locked: parseFloat(assetInfo.locked ?? '0'),
					withdrawing: parseFloat(assetInfo.withdrawing ?? '0'),
					service: 'binance',
				}
				: null;

			return jsonResponse({ success: true, asset, balance });
		} catch (error) {
			return jsonResponse({
				success: false,
				message: `Error general: ${error instanceof Error ? error.message : String(error)}`,
			}, 500);
		}
	},
} satisfies ExportedHandler<Bindings>;

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
	});
}

async function signHmac(query: string, secret: string): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(query));
	return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
