import { useState, useCallback } from 'react';
import { collection, query, orderBy, limit, getDocs, where, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface Client {
    id: string;
    clientName: string;
    cedula: string;
    email?: string;
    phone?: string;
    bank?: string;
    accountNumber?: string;
    accountType?: string;
}

interface ClientsState {
    clients: Client[];
    loading: boolean;
    error: string | null;
}

/**
 * Busca un cliente silenciosamente sin afectar estado de UI. Ideal para autocompletado.
 */
export const findClientSilently = async (cedula: string): Promise<Client | null> => {
    try {
        const cleanCedula = cedula.replace(/[^0-9]/g, '');
        if (!cleanCedula) return null;
        const q = query(collection(db, 'clients'), where('cedula', '==', cleanCedula), limit(1));
        const snapshot = await getDocs(q);
        if (snapshot.empty) return null;
        return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Client;
    } catch {
        return null;
    }
};

/**
 * Hook para listar y buscar clientes de la colección 'clients'.
 */
export function useClients() {
    const [state, setState] = useState<ClientsState>({
        clients: [],
        loading: false,
        error: null,
    });

    /** Cargar los últimos N clientes */
    const loadRecent = useCallback(async (count = 50) => {
        setState(prev => ({ ...prev, loading: true, error: null }));
        try {
            const q = query(collection(db, 'clients'), orderBy('createdAt', 'desc'), limit(count));
            const snapshot = await getDocs(q);
            const clients: Client[] = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data(),
            } as Client));
            setState({ clients, loading: false, error: null });
        } catch (err: any) {
            setState({ clients: [], loading: false, error: err.message });
        }
    }, []);

    /** Buscar cliente por cédula */
    const searchByCedula = useCallback(async (cedula: string) => {
        setState(prev => ({ ...prev, loading: true, error: null }));
        try {
            const cleanCedula = cedula.replace(/[^0-9]/g, '');
            if (!cleanCedula) {
                setState({ clients: [], loading: false, error: 'Ingresa una cédula válida' });
                return;
            }
            const q = query(collection(db, 'clients'), where('cedula', '==', cleanCedula), limit(10));
            const snapshot = await getDocs(q);
            const clients: Client[] = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data(),
            } as Client));
            setState({ clients, loading: false, error: null });
        } catch (err: any) {
            setState({ clients: [], loading: false, error: err.message });
        }
    }, []);

    /** Actualizar cliente existente */
    const updateClient = useCallback(async (id: string, data: Partial<Client>) => {
        try {
            const clientRef = doc(db, 'clients', id);
            await updateDoc(clientRef, data);

            // Actualizar estado local asumiendo éxito
            setState(prev => ({
                ...prev,
                clients: prev.clients.map(c => c.id === id ? { ...c, ...data } : c)
            }));
            return true;
        } catch (err: any) {
            console.error('Error updating client:', err);
            return false;
        }
    }, []);

    /** Eliminar cliente */
    const deleteClient = useCallback(async (id: string) => {
        try {
            const clientRef = doc(db, 'clients', id);
            await deleteDoc(clientRef);

            // Remover del estado local
            setState(prev => ({
                ...prev,
                clients: prev.clients.filter(c => c.id !== id)
            }));
            return true;
        } catch (err: any) {
            console.error('Error deleting client:', err);
            return false;
        }
    }, []);

    return { ...state, loadRecent, searchByCedula, updateClient, deleteClient };
}
