import { useState } from 'react';
import { doc, serverTimestamp, runTransaction, collection } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { useAuth } from './useAuth';

interface ActionState {
    loading: boolean;
    error: string | null;
}

/**
 * Hook para gestionar acciones sobre pedidos existentes.
 * Replica la lógica de app.js: pagar (con comprobante), cancelar, copiar datos.
 */
export function useOrderActions() {
    const { user } = useAuth();
    const [state, setState] = useState<ActionState>({ loading: false, error: null });

    /** Marcar un pedido como pagado y subir comprobante(s) */
    const markAsPaid = async (orderId: string, files: File[]) => {
        setState({ loading: true, error: null });
        try {
            if (!user) throw new Error('Debes iniciar sesión.');
            if (files.length === 0) throw new Error('Debes subir al menos un comprobante.');

            // Subir archivos a Firebase Storage
            const uploadPromises = files.map(async (file) => {
                const filePath = `proofs/${orderId}/${file.name}`;
                const fileRef = ref(storage, filePath);
                const snapshot = await uploadBytes(fileRef, file);
                return getDownloadURL(snapshot.ref);
            });

            const downloadURLs = await Promise.all(uploadPromises);

            // Actualizar pedido y registrar el saldo exacto en una transacción
            await runTransaction(db, async (transaction) => {
                const orderRef = doc(db, 'orders', orderId);
                const rateRef = doc(db, 'config', 'rate');

                // 1. Leer los datos necesarios
                const [orderDoc, rateDoc] = await Promise.all([
                    transaction.get(orderRef),
                    transaction.get(rateRef)
                ]);

                if (!orderDoc.exists()) throw new Error('El pedido no existe.');
                const orderData = orderDoc.data();

                if (orderData.status === 'Pagado') {
                    throw new Error('El pedido ya estaba pagado.');
                }

                // 2. Calcular nuevo saldo CLP
                const currentTotalClpBalance = rateDoc.exists() ? rateDoc.data().totalClpBalance || 0 : 0;
                const newTotalClpBalance = currentTotalClpBalance + (orderData.clpAmount || 0);
                const ts = serverTimestamp();

                // 3. Actualizar Pedido
                transaction.update(orderRef, {
                    status: 'Pagado',
                    proofUrl: downloadURLs[0],
                    proofUrls: downloadURLs,
                    paidByTag: user.email || 'ADMIN',
                    paidAt: ts,
                });

                // 4. Actualizar totalClpBalance en config
                transaction.update(rateRef, {
                    totalClpBalance: newTotalClpBalance
                });

                // 5. Registrar movimiento en clp_balance_history
                const historyRef = doc(collection(db, 'clp_balance_history'));
                transaction.set(historyRef, {
                    amount: orderData.clpAmount || 0,
                    type: 'Ingreso',
                    description: `Pago pedido ${orderId.slice(-5)} (VES)`,
                    createdAt: ts,
                    orderId: orderId,
                    createdBy: user.email || 'ADMIN',
                    adminTag: 'ADMIN',
                    balanceAfter: newTotalClpBalance,
                    bank: orderData.bank || ''
                });
            });

            setState({ loading: false, error: null });
            return true;
        } catch (err: any) {
            const msg = err.message || 'Error al procesar el pago';
            setState({ loading: false, error: msg });
            throw new Error(msg);
        }
    };

    /** Cancelar un pedido */
    const cancelOrder = async (orderId: string) => {
        setState({ loading: true, error: null });
        try {
            await runTransaction(db, async (transaction) => {
                const orderRef = doc(db, 'orders', orderId);
                const rateRef = doc(db, 'config', 'rate');

                // Leer datos del pedido
                const orderDoc = await transaction.get(orderRef);
                if (!orderDoc.exists()) throw new Error('El pedido no existe.');

                const orderData = orderDoc.data();
                if (orderData.status === 'Cancelado') {
                    throw new Error('El pedido ya estaba cancelado.');
                }

                const ts = serverTimestamp();

                // 1. Marcar como cancelado
                transaction.update(orderRef, { status: 'Cancelado', cancelledAt: ts });

                // 2. Si estaba pagado, debemos revertir el saldo de CLP
                if (orderData.status === 'Pagado') {
                    const rateDoc = await transaction.get(rateRef);
                    const currentTotalClpBalance = rateDoc.exists() ? rateDoc.data().totalClpBalance || 0 : 0;

                    // Reversar el ingreso
                    const newTotalClpBalance = currentTotalClpBalance - (orderData.clpAmount || 0);

                    // Devolver el saldo a config/rate
                    transaction.update(rateRef, { totalClpBalance: newTotalClpBalance });

                    // Registrar en clp_balance_history como Egreso (Anulación)
                    const historyRef = doc(collection(db, 'clp_balance_history'));
                    transaction.set(historyRef, {
                        amount: -(orderData.clpAmount || 0),
                        type: 'Egreso',
                        description: `Reversión anulación pedido ${orderId.slice(-5)}`,
                        createdAt: ts,
                        orderId: orderId,
                        createdBy: user?.email || 'ADMIN',
                        adminTag: 'ADMIN',
                        balanceAfter: newTotalClpBalance,
                        bank: orderData.bank || ''
                    });
                }
            });

            setState({ loading: false, error: null });
            return true;
        } catch (err: any) {
            const msg = err.message || 'Error al cancelar el pedido';
            setState({ loading: false, error: msg });
            throw new Error(msg);
        }
    };

    /** Copiar datos de un pedido al portapapeles */
    const copyOrderData = (order: {
        clientName: string;
        cedula: string;
        type: string;
        bank?: string;
        accountNumber?: string;
        phone?: string;
        clpAmount: number;
        destinationAmount: number;
        destinationCurrency: string;
    }) => {
        let lines: string[] = [];

        if (order.type === 'transferencia') {
            lines = [
                order.clientName,
                order.cedula,
                order.bank || '',
                order.accountNumber || '',
                `${order.destinationAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} ${order.destinationCurrency}`,
            ];
        } else if (order.type === 'pago-movil') {
            lines = [
                order.phone || '',
                order.cedula,
                order.bank || '',
                `${order.destinationAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} ${order.destinationCurrency}`,
            ];
        } else if (order.type === 'recarga-saldo') {
            lines = [
                order.phone || '',
                `${order.destinationAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} ${order.destinationCurrency}`,
            ];
        }

        const text = lines.filter(Boolean).join('\n');
        navigator.clipboard.writeText(text);
        return text;
    };

    return { ...state, markAsPaid, cancelOrder, copyOrderData };
}
