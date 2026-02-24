import { useState, useCallback } from 'react';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface BalanceEntry {
    id: string;
    amount: number;
    type: 'ingreso' | 'egreso' | string;
    description: string;
    createdAt: any;
    orderId?: string;
    createdBy?: string;
    adminTag?: string;
    balanceAfter?: number;
    bank?: string;
}

interface BalanceState {
    entries: BalanceEntry[];
    loading: boolean;
    error: string | null;
    totals: {
        in: number;
        out: number;
        count: number;
    };
    hasSearched: boolean;
}

/**
 * Hook para consultar el historial de movimientos de balance CLP.
 * Lee de la colección 'clp_balance_history'.
 */
export function useBalanceHistory() {
    const [state, setState] = useState<BalanceState>({
        entries: [],
        loading: false,
        error: null,
        totals: { in: 0, out: 0, count: 0 },
        hasSearched: false,
    });

    const search = useCallback(async (startDate: Date, endDate: Date) => {
        setState(prev => ({ ...prev, loading: true, error: null }));

        try {
            const qStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0);
            const qEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999);

            const q = query(
                collection(db, 'clp_balance_history'),
                where('createdAt', '>=', qStart),
                where('createdAt', '<=', qEnd),
                orderBy('createdAt', 'desc')
            );

            const snapshot = await getDocs(q);
            const entries: BalanceEntry[] = snapshot.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    amount: data.amount || 0,
                    type: data.type || '',
                    description: data.description || '',
                    createdAt: data.createdAt,
                    orderId: data.orderId,
                    createdBy: data.createdBy,
                    adminTag: data.adminTag,
                    balanceAfter: data.balanceAfter,
                    bank: data.bank,
                };
            });

            const totalIn = entries.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0);
            const totalOut = entries.filter(e => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0);

            setState({ entries, loading: false, error: null, totals: { in: totalIn, out: totalOut, count: entries.length }, hasSearched: true });
        } catch (err: any) {
            setState({ entries: [], loading: false, error: err.message, totals: { in: 0, out: 0, count: 0 }, hasSearched: true });
        }
    }, []);

    return { ...state, search };
}
