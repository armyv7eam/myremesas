import { useState } from 'react';
import { doc, serverTimestamp, runTransaction, collection, increment } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { useAuth } from './useAuth';
import { USER_TAGS } from '../lib/constants';

const CLP_ADMIN_TAGS = new Set(['A1', 'A2']);
const VES_ADMIN_TAGS = new Set(['A3', 'A4', 'A5']);
const roundUp2 = (value: number) => Math.ceil(value * 100) / 100;

const resolveUserTag = (raw: string): string => {
    const normalized = (raw || '').trim();
    if (!normalized) return '';

    const mapped = USER_TAGS[normalized.toLowerCase()];
    if (mapped) return mapped;

    const asTag = normalized.toUpperCase();
    return /^[AV]\d+$/.test(asTag) ? asTag : '';
};

interface ActionState {
    loading: boolean;
    error: string | null;
}

/**
 * Hook para gestionar acciones sobre pedidos existentes.
 * Regla clave de Firestore: todos los reads de una transaccion deben ocurrir antes de writes.
 */
export function useOrderActions() {
    const { user } = useAuth();
    const [state, setState] = useState<ActionState>({ loading: false, error: null });

    /** Marcar un pedido como pagado y subir comprobante(s) */
    const markAsPaid = async (orderId: string, files: File[], sourceAccountId?: string, fee?: number) => {
        setState({ loading: true, error: null });
        try {
            if (!user) throw new Error('Debes iniciar sesion.');
            if (files.length === 0) throw new Error('Debes subir al menos un comprobante.');

            // Subir archivos a Firebase Storage (fuera de transaccion)
            const uploadPromises = files.map(async (file) => {
                const filePath = `proofs/${orderId}/${file.name}`;
                const fileRef = ref(storage, filePath);
                const snapshot = await uploadBytes(fileRef, file);
                return getDownloadURL(snapshot.ref);
            });
            const downloadURLs = await Promise.all(uploadPromises);

            await runTransaction(db, async (transaction) => {
                const orderRef = doc(db, 'orders', orderId);
                const rateRef = doc(db, 'config', 'rate');
                const shouldTouchVesAccount = Boolean(sourceAccountId);
                const accountRef = shouldTouchVesAccount ? doc(db, 'accounts', sourceAccountId as string) : null;

                // READ PHASE (solo lecturas)
                const orderDoc = await transaction.get(orderRef);
                const rateDoc = await transaction.get(rateRef);
                const accountDoc = accountRef ? await transaction.get(accountRef) : null;

                if (!orderDoc.exists()) throw new Error('El pedido no existe.');
                const orderData = orderDoc.data();
                if (orderData.status === 'Pagado') throw new Error('El pedido ya estaba pagado.');

                const baseAmount = orderData.destinationAmount || 0;
                const appliedFee = fee || 0;
                const adminCommissionVes = Math.ceil((baseAmount * 0.01) * 100) / 100;
                const tilloCommissionVes = Math.ceil((baseAmount * 0.0015) * 100) / 100;
                const totalCommissionVes = adminCommissionVes + tilloCommissionVes;
                const totalDebitVes = baseAmount + appliedFee + totalCommissionVes;
                const sellerId = typeof orderData.sellerId === 'string' ? orderData.sellerId.trim() : '';
                const sellerEmailFromOrder = typeof orderData.sellerEmail === 'string' ? orderData.sellerEmail.trim() : '';
                const createdByTagEmail = typeof orderData.createdByTag === 'string' ? orderData.createdByTag.trim() : '';
                const sellerEmail = sellerEmailFromOrder || createdByTagEmail;
                const rawSellerRate = Number(orderData.sellerCommissionRate || orderData.commissionRate || 0);
                const sellerCommissionRate = Number.isFinite(rawSellerRate) ? rawSellerRate : 0;
                const orderCLPAmount = Number(orderData.clpAmount || 0);
                const sellerTag = resolveUserTag(sellerEmail || createdByTagEmail);
                const useVesCommission = VES_ADMIN_TAGS.has(sellerTag);
                const useClpCommission = CLP_ADMIN_TAGS.has(sellerTag) || sellerTag.startsWith('V');

                const sellerCommissionAmountCLP = useClpCommission && sellerCommissionRate > 0 && orderCLPAmount > 0
                    ? roundUp2(orderCLPAmount * sellerCommissionRate)
                    : 0;
                const sellerCommissionAmountVES = useVesCommission && sellerCommissionRate > 0 && baseAmount > 0
                    ? roundUp2(baseAmount * sellerCommissionRate)
                    : 0;

                const purchaseRateVES = rateDoc.exists() ? rateDoc.data().purchaseRateVES || 0 : 0;
                let totalDebitClp = 0;
                if (purchaseRateVES > 0) {
                    totalDebitClp = Math.ceil((baseAmount + appliedFee + totalCommissionVes) / purchaseRateVES * 100) / 100;
                }

                const totalDebitVesWithSellerCommission = totalDebitVes + sellerCommissionAmountVES;

                const ts = serverTimestamp();

                // WRITE PHASE (solo escrituras)
                transaction.update(orderRef, {
                    status: 'Pagado',
                    proofUrl: downloadURLs[0],
                    proofUrls: downloadURLs,
                    paidByTag: user.email || 'ADMIN',
                    paidAt: ts,
                    adminCommission: adminCommissionVes,
                    tilloCommission: tilloCommissionVes,
                    bankFee: appliedFee
                });

                if (sellerEmail && sellerCommissionRate > 0 && sellerCommissionAmountCLP > 0) {
                    const sellerCommissionRef = doc(collection(db, 'seller_commissions'));
                    transaction.set(sellerCommissionRef, {
                        sellerId: sellerId || orderData.userId || '',
                        sellerEmail,
                        orderId,
                        orderCLPAmount,
                        commissionRate: sellerCommissionRate,
                        commissionAmountCLP: sellerCommissionAmountCLP,
                        commissionCurrency: 'CLP',
                        sellerTag,
                        timestamp: ts,
                        createdAt: ts,
                        createdBy: user.email || 'ADMIN',
                    });
                }

                if (totalDebitClp > 0) {
                    const historyRef = doc(collection(db, 'clp_balance_history'));
                    const note = `Pago pedido ${orderId.slice(-5)} (Envio de VES)`;
                    transaction.set(historyRef, {
                        amount: totalDebitClp,
                        type: 'subtract',
                        note,
                        description: note,
                        purchaseRateVESUsed: purchaseRateVES,
                        vesAmountAtCalc: totalDebitVes,
                        clpAmountComputed: totalDebitClp,
                        timestamp: ts,
                        createdAt: ts,
                        orderId: orderId,
                        createdBy: user.email || 'ADMIN',
                        adminTag: 'ADMIN',
                        bank: orderData.bank || ''
                    });
                }

                if (orderData.destinationCurrency === 'VES' && accountRef) {
                    if (!accountDoc || !accountDoc.exists()) {
                        throw new Error('La cuenta origen seleccionada no existe.');
                    }

                    const accountData = accountDoc.data();
                    const historyBank = typeof orderData.bank === 'string' ? orderData.bank.trim() : 'Sin banco';
                    const historyHolder = typeof accountData.holder === 'string' ? accountData.holder.trim() : 'Sin titular';
                    let runningBalance = accountData.balance || 0;

                    transaction.update(accountRef, {
                        balance: increment(-totalDebitVesWithSellerCommission)
                    });

                    runningBalance -= baseAmount;
                    transaction.set(doc(collection(db, 'balance_history')), {
                        amount: baseAmount,
                        type: 'subtract',
                        note: `Pago pedido ${orderId.slice(-5)} (${orderData.destinationCurrency})`,
                        timestamp: ts,
                        holder: historyHolder,
                        bank: historyBank,
                        balanceAfter: runningBalance
                    });

                    if (appliedFee > 0) {
                        runningBalance -= appliedFee;
                        transaction.set(doc(collection(db, 'balance_history')), {
                            amount: appliedFee,
                            type: 'fee',
                            note: `Comision pedido ${orderId.slice(-5)}`,
                            timestamp: ts,
                            holder: historyHolder,
                            bank: historyBank,
                            balanceAfter: runningBalance
                        });
                    }

                    if (adminCommissionVes > 0) {
                        runningBalance -= adminCommissionVes;
                        transaction.set(doc(collection(db, 'balance_history')), {
                            amount: adminCommissionVes,
                            type: 'admin_commission',
                            note: `Comision Admin pedido ${orderId.slice(-5)}`,
                            timestamp: ts,
                            holder: historyHolder,
                            bank: historyBank,
                            balanceAfter: runningBalance
                        });
                    }

                    if (tilloCommissionVes > 0) {
                        runningBalance -= tilloCommissionVes;
                        transaction.set(doc(collection(db, 'balance_history')), {
                            amount: tilloCommissionVes,
                            type: 'tillo_commission',
                            note: `Mano Tillo pedido ${orderId.slice(-5)}`,
                            timestamp: ts,
                            holder: historyHolder,
                            bank: historyBank,
                            balanceAfter: runningBalance
                        });
                    }

                    if (sellerCommissionAmountVES > 0) {
                        runningBalance -= sellerCommissionAmountVES;
                        transaction.set(doc(collection(db, 'balance_history')), {
                            amount: sellerCommissionAmountVES,
                            type: 'seller_commission',
                            note: `Comision Venta ${sellerTag || 'ADMIN'} pedido ${orderId.slice(-5)}`,
                            timestamp: ts,
                            holder: historyHolder,
                            bank: historyBank,
                            balanceAfter: runningBalance
                        });
                    }
                }
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

                // READ PHASE
                const orderDoc = await transaction.get(orderRef);
                if (!orderDoc.exists()) throw new Error('El pedido no existe.');

                const orderData = orderDoc.data();
                if (orderData.status === 'Cancelado') {
                    throw new Error('El pedido ya estaba cancelado.');
                }

                let totalDebitClp = 0;
                let purchaseRateVESUsed = 0;
                let vesAmountAtCalc = 0;
                if (orderData.status === 'Pagado') {
                    const rateDoc = await transaction.get(rateRef);
                    const purchaseRateVES = rateDoc.exists() ? rateDoc.data().purchaseRateVES || 0 : 0;
                    purchaseRateVESUsed = purchaseRateVES;

                    if (purchaseRateVES > 0) {
                        const baseAmount = orderData.destinationAmount || 0;
                        const paidFee = orderData.bankFee || 0;
                        const totalCommissionVes = (orderData.adminCommission || 0) + (orderData.tilloCommission || 0);
                        vesAmountAtCalc = baseAmount + paidFee + totalCommissionVes;
                        totalDebitClp = Math.ceil((baseAmount + paidFee + totalCommissionVes) / purchaseRateVES * 100) / 100;
                    }
                }

                // WRITE PHASE
                const ts = serverTimestamp();
                transaction.update(orderRef, { status: 'Cancelado', cancelledAt: ts });

                if (orderData.status === 'Pagado') {
                    if (totalDebitClp > 0) {
                        const historyRef = doc(collection(db, 'clp_balance_history'));
                        const note = `Reversion anulacion pedido ${orderId.slice(-5)} (Retorno de VES)`;
                        transaction.set(historyRef, {
                            amount: totalDebitClp,
                            type: 'add',
                            note,
                            description: note,
                            purchaseRateVESUsed,
                            vesAmountAtCalc,
                            clpAmountComputed: totalDebitClp,
                            timestamp: ts,
                            createdAt: ts,
                            orderId: orderId,
                            createdBy: user?.email || 'ADMIN',
                            adminTag: 'ADMIN',
                            bank: orderData.bank || ''
                        });
                    }
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
