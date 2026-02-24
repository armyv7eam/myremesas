import { useState } from 'react';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import type { ExchangeRates } from './useExchangeRates';
import { VENEZUELAN_BANK_PREFIXES } from '../lib/constants';

export type OrderType = 'transferencia' | 'pago-movil' | 'recarga-saldo';

export interface OrderFormData {
    type: OrderType;
    clientName: string;
    cedula: string;
    email: string;
    clpAmount: number;
    // Transferencia
    bank?: string;
    accountNumber?: string;
    accountType?: string;
    // Pago Móvil
    phone?: string;
    // Pago Móvil bank is also `bank`
}

// Bancos Venezolanos (derivido dinámicamente de constants.ts)
export const VENEZUELAN_BANKS = Array.from(new Set(Object.values(VENEZUELAN_BANK_PREFIXES))).sort();

interface CreateOrderState {
    loading: boolean;
    error: string | null;
    success: boolean;
}

/**
 * Hook para crear pedidos en Firestore.
 * Replica la lógica de app.js líneas 2862-2971 y 5397-5420.
 */
export function useCreateOrder() {
    const { user } = useAuth();
    const [state, setState] = useState<CreateOrderState>({
        loading: false,
        error: null,
        success: false,
    });

    const createOrder = async (formData: OrderFormData, rates: ExchangeRates) => {
        setState({ loading: true, error: null, success: false });

        try {
            if (!user) throw new Error('Debes iniciar sesión para crear pedidos.');

            const rate = rates.VES || 0;
            if (rate <= 0) throw new Error('La tasa de cambio no está disponible.');
            if (!formData.clpAmount || formData.clpAmount <= 0) throw new Error('El monto en CLP debe ser mayor a cero.');
            if (!formData.clientName.trim()) throw new Error('El nombre del cliente es obligatorio.');
            if (!formData.cedula.trim()) throw new Error('La cédula es obligatoria.');

            const destinationAmount = Math.ceil(formData.clpAmount * rate * 100) / 100;

            // Validaciones específicas por tipo
            if (formData.type === 'transferencia') {
                if (!formData.bank) throw new Error('Selecciona un banco.');
                const accountClean = (formData.accountNumber || '').replace(/[^0-9]/g, '');
                if (accountClean.length !== 20) throw new Error('El número de cuenta debe tener 20 dígitos.');
                formData.accountNumber = accountClean;
            } else if (formData.type === 'pago-movil') {
                const phoneClean = (formData.phone || '').replace(/[^0-9]/g, '');
                if (phoneClean.length !== 11) throw new Error('El teléfono debe tener 11 dígitos (Ej: 04141234567).');
                if (!formData.bank) throw new Error('Selecciona un banco receptor.');
                formData.phone = phoneClean;
            } else if (formData.type === 'recarga-saldo') {
                const phoneClean = (formData.phone || '').replace(/[^0-9]/g, '');
                if (phoneClean.length !== 11) throw new Error('El teléfono debe tener 11 dígitos.');
                formData.phone = phoneClean;
            }

            // Crear el documento en Firestore
            const newOrderRef = doc(collection(db, 'orders'));

            const orderData: Record<string, any> = {
                type: formData.type,
                status: 'Pendiente de pago',
                userId: user.uid,
                createdByTag: user.email || 'ADMIN',
                country: 'VES',
                clientName: formData.clientName.trim(),
                email: formData.email || '',
                cedula: formData.cedula.replace(/[^0-9]/g, ''),
                clpAmount: formData.clpAmount,
                destinationCurrency: 'VES',
                destinationAmount,
                createdAt: serverTimestamp(),
            };

            // Campos condicionales
            if (formData.bank) orderData.bank = formData.bank;
            if (formData.accountNumber) orderData.accountNumber = formData.accountNumber;
            if (formData.accountType) orderData.accountType = formData.accountType;
            if (formData.phone) orderData.phone = formData.phone;

            await setDoc(newOrderRef, orderData);

            setState({ loading: false, error: null, success: true });
            return newOrderRef.id;
        } catch (err: any) {
            const msg = err.message || 'Error al crear el pedido';
            setState({ loading: false, error: msg, success: false });
            throw new Error(msg);
        }
    };

    const reset = () => setState({ loading: false, error: null, success: false });

    return { ...state, createOrder, reset };
}
