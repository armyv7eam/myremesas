import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface VesAccount {
    id: string;
    holder: string;
    bank: string;
    balance: number;
}

/**
 * Hook con listener en tiempo real de la colección 'accounts'.
 * Retorna las cuentas con saldos actualizados.
 */
export function useVesAccounts() {
    const [accounts, setAccounts] = useState<VesAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalBalance, setTotalBalance] = useState(0);

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'accounts'), (snapshot) => {
            const data: VesAccount[] = snapshot.docs.map(doc => ({
                id: doc.id,
                holder: doc.data().holder || '',
                bank: doc.data().bank || '',
                balance: doc.data().balance || 0,
            }));
            setAccounts(data.sort((a, b) => b.balance - a.balance));
            setTotalBalance(data.reduce((sum, acc) => sum + acc.balance, 0));
            setLoading(false);
        }, () => {
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Group by holder
    const holders = accounts.reduce<Record<string, VesAccount[]>>((acc, item) => {
        if (!acc[item.holder]) acc[item.holder] = [];
        acc[item.holder].push(item);
        return acc;
    }, {});

    return { accounts, holders, totalBalance, loading };
}
