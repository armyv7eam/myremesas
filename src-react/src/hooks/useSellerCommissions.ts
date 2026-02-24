import { useState, useCallback } from 'react';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface CommissionEntry {
    id: string;
    amount: number;
    orderAmount: number;
    orderId: string;
    sellerEmail: string;
    timestamp: any;
}

interface CommState {
    entries: CommissionEntry[];
    loading: boolean;
    error: string | null;
    summary: string;
}

/**
 * Hook para consultar comisiones de un vendedor desde la colección 'seller_commissions'.
 */
export function useSellerCommissions() {
    const [state, setState] = useState<CommState>({
        entries: [],
        loading: false,
        error: null,
        summary: '',
    });

    const search = useCallback(async (sellerEmail: string, startDate: Date, endDate: Date) => {
        setState(prev => ({ ...prev, loading: true, error: null }));

        try {
            const qStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0);
            const qEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999);

            const q = query(
                collection(db, 'seller_commissions'),
                where('sellerEmail', '==', sellerEmail),
                where('timestamp', '>=', qStart),
                where('timestamp', '<=', qEnd),
                orderBy('timestamp', 'desc')
            );

            const snapshot = await getDocs(q);
            const entries: CommissionEntry[] = snapshot.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    amount: data.commissionAmountCLP || data.amount || 0,
                    orderAmount: data.orderCLPAmount || data.orderAmount || 0,
                    orderId: data.orderId || '',
                    sellerEmail: data.sellerEmail || sellerEmail,
                    timestamp: data.timestamp || data.createdAt,
                };
            });

            const total = entries.reduce((s, e) => s + e.amount, 0);
            const summary = entries.length === 0
                ? 'No hay comisiones en este rango.'
                : `${entries.length} comisiones. Total: ${total.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}`;

            setState({ entries, loading: false, error: null, summary });
        } catch (err: any) {
            setState({ entries: [], loading: false, error: err.message, summary: '' });
        }
    }, []);

    return { ...state, search };
}
