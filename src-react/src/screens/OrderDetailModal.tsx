import { useState, useRef } from 'react';
import { Modal, Button } from '../components/ui';
import { useOrderActions } from '../hooks/useOrderActions';
import type { Order } from '../hooks/useOrders';

interface Props {
    order: Order | null;
    isOpen: boolean;
    onClose: () => void;
}

const TYPE_LABELS: Record<string, string> = {
    'transferencia': '🏦 Transferencia',
    'pago-movil': '📱 Pago Móvil',
    'recarga-saldo': '💳 Recarga',
};

export function OrderDetailModal({ order, isOpen, onClose }: Props) {
    const { markAsPaid, cancelOrder, copyOrderData, loading, error } = useOrderActions();
    const [files, setFiles] = useState<File[]>([]);
    const [showUpload, setShowUpload] = useState(false);
    const [copied, setCopied] = useState(false);
    const [toast, setToast] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!order) return null;

    const handleMarkPaid = async () => {
        if (files.length === 0) {
            setShowUpload(true);
            return;
        }
        try {
            await markAsPaid(order.id, files);
            setToast('✅ Pedido marcado como pagado');
            setTimeout(() => { setToast(''); onClose(); }, 1200);
            setFiles([]);
            setShowUpload(false);
        } catch {
            // Error shown by hook
        }
    };

    const handleCancel = async () => {
        try {
            await cancelOrder(order.id);
            setToast('🗑️ Pedido cancelado');
            setTimeout(() => { setToast(''); onClose(); }, 1000);
        } catch {
            // Error shown by hook
        }
    };

    const handleCopy = () => {
        copyOrderData(order);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
        }
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleClose = () => {
        setFiles([]);
        setShowUpload(false);
        setCopied(false);
        setToast('');
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Detalle del Pedido">
            <div className="space-y-4">
                {/* Status badge */}
                <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">#{order.id.slice(-6)}</span>
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${order.status === 'Pendiente de pago'
                            ? 'bg-amber-100 text-amber-800'
                            : order.status === 'Pagado'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                        }`}>
                        {order.status}
                    </span>
                </div>

                {/* Client info */}
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                    <div className="flex justify-between">
                        <span className="text-xs text-gray-400">Cliente</span>
                        <span className="text-sm font-semibold text-gray-800">{order.clientName}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-xs text-gray-400">Cédula</span>
                        <span className="text-sm font-mono text-gray-700">{order.cedula}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-xs text-gray-400">Tipo</span>
                        <span className="text-sm text-gray-700">{TYPE_LABELS[order.type] || order.type}</span>
                    </div>
                    {order.bank && (
                        <div className="flex justify-between">
                            <span className="text-xs text-gray-400">Banco</span>
                            <span className="text-sm text-gray-700">{order.bank}</span>
                        </div>
                    )}
                    {order.accountNumber && (
                        <div className="flex justify-between">
                            <span className="text-xs text-gray-400">Cuenta</span>
                            <span className="text-sm font-mono text-gray-700">{order.accountNumber}</span>
                        </div>
                    )}
                    {order.phone && (
                        <div className="flex justify-between">
                            <span className="text-xs text-gray-400">Teléfono</span>
                            <span className="text-sm font-mono text-gray-700">{order.phone}</span>
                        </div>
                    )}
                </div>

                {/* Amounts */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-blue-50 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-blue-400 uppercase font-bold">Envía</p>
                        <p className="text-lg font-bold text-blue-700">
                            {order.clpAmount.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}
                        </p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-green-400 uppercase font-bold">Recibe</p>
                        <p className="text-lg font-bold text-green-700">
                            {order.destinationAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} {order.destinationCurrency}
                        </p>
                    </div>
                </div>

                {/* Upload section (conditionally shown) */}
                {showUpload && order.status === 'Pendiente de pago' && (
                    <div className="border border-dashed border-blue-300 rounded-xl p-4 bg-blue-50/50 space-y-3">
                        <p className="text-xs font-semibold text-blue-600 text-center">Subir Comprobante(s)</p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            multiple
                            className="hidden"
                        />
                        <Button
                            variant="outline"
                            fullWidth
                            onClick={() => fileInputRef.current?.click()}
                            className="!text-xs"
                        >
                            📎 Seleccionar Imagen(es)
                        </Button>
                        {files.length > 0 && (
                            <div className="space-y-1">
                                {files.map((f, i) => (
                                    <div key={i} className="flex items-center justify-between bg-white rounded-lg px-3 py-1.5 text-xs">
                                        <span className="truncate text-gray-600">{f.name}</span>
                                        <button
                                            onClick={() => removeFile(i)}
                                            className="text-red-400 hover:text-red-600 ml-2 font-bold"
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Proof URLs (for paid orders) */}
                {order.proofUrl && (
                    <div className="bg-green-50 rounded-xl p-3">
                        <p className="text-[10px] text-green-500 uppercase font-bold mb-2">Comprobante</p>
                        <a
                            href={order.proofUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline break-all"
                        >
                            Ver comprobante →
                        </a>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-600 text-xs">
                        {error}
                    </div>
                )}

                {/* Toast */}
                {toast && (
                    <div className="bg-gray-800 text-white text-center text-xs py-2 rounded-lg animate-pulse">
                        {toast}
                    </div>
                )}

                {/* Actions */}
                {order.status === 'Pendiente de pago' && (
                    <div className="grid grid-cols-3 gap-2 pt-2">
                        <Button variant="outline" onClick={handleCopy} className="!text-xs !py-2.5">
                            {copied ? '✅ Copiado' : '📋 Copiar'}
                        </Button>
                        <Button variant="danger" onClick={handleCancel} isLoading={loading} className="!text-xs !py-2.5">
                            Cancelar
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleMarkPaid}
                            isLoading={loading}
                            className="!text-xs !py-2.5 !bg-green-600 hover:!bg-green-700"
                        >
                            {showUpload && files.length > 0 ? 'Confirmar' : '💰 Pagar'}
                        </Button>
                    </div>
                )}

                {order.status === 'Pagado' && (
                    <div className="grid grid-cols-2 gap-2 pt-2">
                        <Button variant="outline" onClick={handleCopy} className="!text-xs !py-2.5">
                            {copied ? '✅ Copiado' : '📋 Copiar Datos'}
                        </Button>
                        <Button variant="secondary" onClick={handleClose} className="!text-xs !py-2.5">
                            Cerrar
                        </Button>
                    </div>
                )}
            </div>
        </Modal>
    );
}
