import { useState } from 'react';
import { db, storage } from '../lib/firebase';
import { runTransaction, doc, serverTimestamp, collection, increment } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth, useVesAccounts } from '../hooks';
import { computeInterbankFee, normalizeBankName } from '../lib/constants';
import { Modal, Button } from '../components/ui';
import { useToast } from '../contexts/ToastContext';
import type { Order } from '../hooks/useOrders';

interface BatchPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedOrders: Order[];
    onSuccess: () => void;
}

export function BatchPaymentModal({ isOpen, onClose, selectedOrders, onSuccess }: BatchPaymentModalProps) {
    const { user } = useAuth();
    const { accounts } = useVesAccounts();
    const toast = useToast();

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [sourceAccountId, setSourceAccountId] = useState('');
    const [proofFiles, setProofFiles] = useState<Record<string, File>>({});

    const totalVes = selectedOrders.reduce((sum, order) => sum + order.destinationAmount, 0);

    const handleFileChange = (orderId: string, file: File | null) => {
        if (file) {
            setProofFiles(prev => ({ ...prev, [orderId]: file }));
        } else {
            const newFiles = { ...proofFiles };
            delete newFiles[orderId];
            setProofFiles(newFiles);
        }
    };

    const handleCopyData = (order: Order) => {
        let text = '';
        if (order.type === 'transferencia') {
            text = `Banco: ${order.bank || 'N/A'} \nCuenta: ${order.accountNumber} \nCédula: ${order.cedula} \nBeneficiario: ${order.clientName} \nMonto: ${order.destinationAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES`;
        } else if (order.type === 'pago-movil') {
            text = `Banco: ${order.bank || 'N/A'} \nTeléfono: ${order.phone} \nCédula: ${order.cedula} \nBeneficiario: ${order.clientName} \nMonto: ${order.destinationAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES`;
        } else if (order.type === 'recarga-saldo') {
            text = `Operadora: ${order.bank || 'N/A'} \nTeléfono: ${order.phone} \nMonto: ${order.destinationAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES`;
        } else {
            text = `${order.clientName} - ${order.destinationAmount} VES`;
        }
        navigator.clipboard.writeText(text);
        toast.success("Datos copiados");
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!sourceAccountId) {
            toast.error("Selecciona una cuenta origen.");
            return;
        }

        if (Object.keys(proofFiles).length !== selectedOrders.length) {
            toast.error("Debes adjuntar un comprobante para cada pedido.");
            return;
        }

        const sourceAccount = accounts.find(a => a.id === sourceAccountId);
        if (!sourceAccount) {
            toast.error("Cuenta de origen no encontrada.");
            return;
        }

        setIsSubmitting(true);

        try {
            // Resolve all file uploads via Storage FIRST
            const uploadPromises = selectedOrders.map(async (order) => {
                const file = proofFiles[order.id];
                const storageRef = ref(storage, `proofs/${order.id}/${file.name}`);
                await uploadBytes(storageRef, file);
                const url = await getDownloadURL(storageRef);
                return { orderId: order.id, url, order };
            });
            const uploadResults = await Promise.all(uploadPromises);

            const ADMIN_BASE_COMMISSION_RATE = 0.01;
            const TILLO_COMMISSION_RATE = 0.0015;

            // Compute total amount to deduct first (for validation)
            let totalDebitVes = 0;
            const orderFeeMap = new Map<string, number>();

            selectedOrders.forEach(order => {
                let fee = 0;
                if (sourceAccount) {
                    if (order.type === 'pago-movil') {
                        fee = computeInterbankFee(order.destinationAmount);
                    } else if (order.type === 'transferencia') {
                        const sourceBank = normalizeBankName(sourceAccount.bank);
                        const destBank = normalizeBankName(order.bank || '');
                        if (sourceBank !== destBank) {
                            fee = computeInterbankFee(order.destinationAmount);
                        }
                    }
                }
                orderFeeMap.set(order.id, fee);

                const adminCommission = Math.ceil((order.destinationAmount * ADMIN_BASE_COMMISSION_RATE) * 100) / 100;
                const tilloCommission = Math.ceil((order.destinationAmount * TILLO_COMMISSION_RATE) * 100) / 100;

                totalDebitVes += order.destinationAmount + fee + adminCommission + tilloCommission;
            });

            await runTransaction(db, async (transaction) => {
                // Read configuration
                const rateRef = doc(db, 'config', 'rate');
                const rateDoc = await transaction.get(rateRef);

                const accountRef = doc(db, 'accounts', sourceAccountId);
                const accountDoc = await transaction.get(accountRef);

                if (!accountDoc.exists() || (accountDoc.data().balance || 0) < totalDebitVes) {
                    throw new Error('Saldo insuficiente en la cuenta seleccionada para cubrir el lote (incluyendo comisiones).');
                }

                let runningBalance = accountDoc.data().balance || 0;
                let runningTotalClpBalance = rateDoc.exists() ? rateDoc.data().totalClpBalance || 0 : 0;
                const ts = serverTimestamp();
                const historyHolder = sourceAccount?.holder || 'Desconocido';
                const historyBank = sourceAccount?.bank || 'Desconocido';

                selectedOrders.forEach(order => {
                    const orderRef = doc(db, 'orders', order.id);
                    const fileUrl = uploadResults.find(r => r.orderId === order.id)?.url;

                    // 1. Update order
                    transaction.update(orderRef, {
                        status: 'Pagado',
                        proofUrl: fileUrl,
                        proofUrls: [fileUrl], // Ensure proofUrls is an array
                        paidByTag: user?.email || 'ADMIN',
                        paidAt: ts
                    });

                    // 2. CLP Balance History
                    runningTotalClpBalance += (order.clpAmount || 0);
                    const clpHistoryRef = doc(collection(db, 'clp_balance_history'));
                    transaction.set(clpHistoryRef, {
                        amount: order.clpAmount || 0,
                        type: 'Ingreso',
                        description: `Pago pedido ${order.id.slice(-5)} (Lote VES)`,
                        createdAt: ts,
                        orderId: order.id,
                        createdBy: user?.email || 'ADMIN',
                        adminTag: 'ADMIN',
                        balanceAfter: runningTotalClpBalance,
                        bank: order.bank || ''
                    });

                    const vesHistoryRef = doc(collection(db, 'balance_history'));
                    transaction.set(vesHistoryRef, {
                        amount: order.destinationAmount, type: 'subtract', note: `Pago lote ${order.id.slice(-5)}`,
                        timestamp: serverTimestamp(), holder: historyHolder, bank: historyBank, balanceAfter: runningBalance
                    });

                    const interbankFee = orderFeeMap.get(order.id) || 0;
                    if (interbankFee > 0) {
                        const feeHistoryRef = doc(collection(db, 'balance_history'));
                        transaction.set(feeHistoryRef, {
                            amount: interbankFee, type: 'fee', note: `Com. interbancaria lote ${order.id.slice(-5)}`,
                            timestamp: serverTimestamp(), holder: historyHolder, bank: historyBank, balanceAfter: runningBalance
                        });
                    }
                });

                // Update totalClpBalance in config
                transaction.update(rateRef, { totalClpBalance: runningTotalClpBalance });

                // Decrement the main balance on Account
                transaction.update(accountRef, {
                    balance: increment(-totalDebitVes)
                });
            });

            toast.success("Lote procesado exitosamente");
            onSuccess();
        } catch (error: any) {
            console.error("Error al procesar lote:", error);
            toast.error(error.message || "Ocurrió un error al procesar el lote.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Procesar Lote Pendiente" maxWidth="xl">
            <form onSubmit={handleSubmit} className="space-y-6">

                <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
                    <div className="flex justify-between items-center text-sm mb-2">
                        <span className="text-emerald-800">Total Pedidos:</span>
                        <span className="font-bold text-emerald-900">{selectedOrders.length}</span>
                    </div>
                    <div className="flex justify-between items-center text-lg">
                        <span className="text-emerald-800 font-bold">Total a Pagar:</span>
                        <span className="font-black text-emerald-900">{totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES</span>
                    </div>
                </div>

                <div className="space-y-4 max-h-[40vh] overflow-y-auto w-full px-1">
                    {selectedOrders.map(order => (
                        <div key={order.id} className="p-4 bg-white border border-gray-200 rounded-xl shadow-sm space-y-3">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h4 className="font-bold text-gray-900">{order.clientName}</h4>
                                    <p className="text-xs text-gray-500">CI: {order.cedula}</p>
                                    <div className="mt-1 text-xs text-gray-700">
                                        {order.type === 'transferencia' ? (
                                            <p><span className="font-semibold">Banco:</span> {order.bank} | <span className="font-semibold">Cta:</span> {order.accountNumber}</p>
                                        ) : order.type === 'pago-movil' ? (
                                            <p><span className="font-semibold">Banco:</span> {order.bank} | <span className="font-semibold">Telf:</span> {order.phone}</p>
                                        ) : (
                                            <p><span className="font-semibold">Operadora:</span> {order.bank} | <span className="font-semibold">Telf:</span> {order.phone}</p>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleCopyData(order)}
                                        className="mt-2 text-[10px] bg-blue-50 text-blue-700 px-2 py-1 flex items-center gap-1 rounded font-semibold hover:bg-blue-100"
                                    >
                                        Copiar Datos
                                    </button>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-emerald-600">{order.destinationAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES</p>
                                </div>
                            </div>

                            <div className="pt-2 border-t border-gray-100">
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Comprobante de Pago</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="w-full text-sm outline-none bg-gray-50 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500"
                                    onChange={(e) => handleFileChange(order.id, e.target.files?.[0] || null)}
                                    required
                                />
                            </div>
                        </div>
                    ))}
                </div>

                <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                        Cuenta Origen
                    </label>
                    <select
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm"
                        value={sourceAccountId}
                        onChange={(e) => setSourceAccountId(e.target.value)}
                        required
                    >
                        <option value="">Seleccione una cuenta ({accounts.length} disponibles)</option>
                        {accounts.map(account => (
                            <option key={account.id} value={account.id} disabled={account.balance < totalVes}>
                                {account.bank} - {account.holder} ({account.balance.toLocaleString('es-VE')} VES)
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-100">
                    <Button variant="secondary" onClick={onClose} type="button" className="flex-1" disabled={isSubmitting}>
                        Cancelar
                    </Button>
                    <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                        Pagar Lote
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

