
export interface Env {
	// Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
	// MY_KV_NAMESPACE: KVNamespace;
	//
	// Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
	// MY_DURABLE_OBJECT: DurableObjectNamespace;
	//
	// Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
	// MY_BUCKET: R2Bucket;
	//
	// Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
	// MY_SERVICE: Fetcher;
	//
	// Example binding to a Queue. Learn more at https://developers.cloudflare.com/queues/javascript-apis/
	// MY_QUEUE: Queue;
    BINANCE_API_KEY: string;
    BINANCE_API_SECRET: string;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
        
        // Handle CORS
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type, Authorization",
                },
            });
        }

		if (url.pathname === '/binance') {
            const asset = url.searchParams.get('asset') || 'USDT';
            const apiUrl = 'https://api.binance.com/sapi/v1/capital/config/getall';
            
            const timestamp = Date.now();
            const recvWindow = 5000;
            const queryString = `timestamp=${timestamp}&recvWindow=${recvWindow}`;
            
            // We need to sign the request
            // Note: In a real worker, you'd need to use crypto.subtle or a library to sign.
            // However, for this proxy to work simply as a pass-through for the backend, 
            // it might be better if the backend signs it, OR if we just forward the request.
            // BUT, the backend code we saw earlier (api/binance-balance.js) expects the proxy 
            // to return the data directly without needing signatures from the backend if using proxy?
            // Wait, looking at api/binance-balance.js:
            // if (useProxy) { ... axios.get(proxyUrl ... }
            // It seems the backend expects the proxy to handle the authentication if it's just a GET.
            // BUT, the backend has the secrets. The proxy might not have them unless we bind them.
            
            // Let's look at the backend code again.
            // It calls `${process.env.BINANCE_PROXY_URL}/binance?asset=${asset}`
            // It does NOT pass the signature. So the PROXY must sign it.
            // This means the PROXY needs the secrets.
            
            // I will implement the signing logic here using Web Crypto API available in Workers.

            const apiKey = env.BINANCE_API_KEY;
            const apiSecret = env.BINANCE_API_SECRET;

            if (!apiKey || !apiSecret) {
                 return new Response(JSON.stringify({ success: false, message: "Proxy credentials not configured" }), {
                    status: 500,
                    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
                });
            }

            const encoder = new TextEncoder();
            const key = await crypto.subtle.importKey(
                "raw",
                encoder.encode(apiSecret),
                { name: "HMAC", hash: "SHA-256" },
                false,
                ["sign"]
            );
            const signatureBuffer = await crypto.subtle.sign(
                "HMAC",
                key,
                encoder.encode(queryString)
            );
            const signature = Array.from(new Uint8Array(signatureBuffer))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');

            const finalUrl = `${apiUrl}?${queryString}&signature=${signature}`;

            try {
                const response = await fetch(finalUrl, {
                    headers: {
                        "X-MBX-APIKEY": apiKey
                    }
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                     return new Response(JSON.stringify({ success: false, message: "Binance API Error", data }), {
                        status: response.status,
                        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
                    });
                }
                
                // Filter for the asset
                // The backend expects the full array or the filtered object?
                // Backend says: responseData = data; // La respuesta del proxy ya tiene el formato que necesitamos
                // And then: const assetInfo = data.find((item) => item.coin === asset);
                // Wait, if responseData = data, and data is the array from Binance...
                // But later it does: const assetInfo = data.find... 
                // Fails if data is not an array.
                
                // Let's return the full array as Binance does, so the backend logic works as is.
                return new Response(JSON.stringify(data), {
                    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
                });

            } catch (e: any) {
                return new Response(JSON.stringify({ success: false, message: e.message }), {
                    status: 500,
                    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
                });
            }
		}

		return new Response('Not Found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;
