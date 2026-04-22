import { useCallback, useState } from 'react';

// Se obtienen las URLs y Token de las variables de entorno de Vite
// Cambiado para usar el Cloud Function Proxy y evitar errores de Mixed Content (HTTPS -> HTTP)
const VPS_BASE_URL = import.meta.env.VITE_VPS_BINANCE_URL || 'https://us-central1-manzanoapp-2f775.cloudfunctions.net/binanceVpsProxy';
const VPS_AUTH_TOKEN = import.meta.env.VITE_VPS_BINANCE_TOKEN || 'un_token_largo_y_secreto_para_manzano';

export interface BinanceBalance {
    asset: string;
    free: string;
    locked: string;
    source: string;
    updatedAt: string;
}

export interface P2PRateData {
    fiat: string;
    asset: string;
    tradeType: string;
    requestedAmount: number | null;
    bestRate: number;
    topAds: Array<{
        price: number;
        advertiser: string;
        min: string;
        max: string;
    }>;
    source: string;
    updatedAt: string;
}

export function useBinanceAPI() {
    const [loadingBalance, setLoadingBalance] = useState(false);
    const [loadingP2P, setLoadingP2P] = useState(false);
    const [balance, setBalance] = useState<BinanceBalance | null>(null);
    const [p2pRate, setP2pRate] = useState<P2PRateData | null>(null);
    const [error, setError] = useState<string | null>(null);

    const checkWalletBalance = useCallback(async (asset: string = 'USDT') => {
        setLoadingBalance(true);
        setError(null);
        try {
            const response = await fetch(`${VPS_BASE_URL}/balance?asset=${asset}`, {
                method: 'GET',
                headers: {
                    'x-vps-token': VPS_AUTH_TOKEN
                }
            });

            if (!response.ok) {
                throw new Error('Error al conectar con VPS de Binance (Balance)');
            }

            const data = await response.json();
            if (data.error) throw new Error(data.error);

            setBalance(data);
            return data;
        } catch (err: any) {
            setError(err.message);
            return null;
        } finally {
            setLoadingBalance(false);
        }
    }, []);

    const fetchP2PRate = useCallback(async (amount: number, fiat: string = 'VES', asset: string = 'USDT', tradeType: string = 'BUY') => {
        setLoadingP2P(true);
        setError(null);
        try {
            const response = await fetch(`${VPS_BASE_URL}/p2p-rate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-vps-token': VPS_AUTH_TOKEN
                },
                body: JSON.stringify({ amount, fiat, asset, tradeType })
            });

            if (!response.ok) {
                throw new Error('Error al consultar P2P en el VPS');
            }

            const data = await response.json();
            if (data.error) throw new Error(data.error);

            setP2pRate(data);
            return data;
        } catch (err: any) {
            setError(err.message);
            return null;
        } finally {
            setLoadingP2P(false);
        }
    }, []);

    return {
        balance,
        p2pRate,
        loadingBalance,
        loadingP2P,
        error,
        checkWalletBalance,
        fetchP2PRate
    };
}
