import { useState, useEffect } from 'react';
import {
    onAuthStateChanged as firebaseOnAuthStateChanged,
    signInWithEmailAndPassword as firebaseSignIn,
    createUserWithEmailAndPassword as firebaseCreateUser,
    sendPasswordResetEmail as firebaseSendReset,
    signOut as firebaseSignOut
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from '../lib/firebase';

interface AuthState {
    user: User | null;
    role: 'admin' | 'seller' | 'client' | null;
    loading: boolean;
    error: string | null;
}

export function useAuth() {
    const [state, setState] = useState<AuthState>({
        user: null,
        role: null,
        loading: true,
        error: null,
    });

    useEffect(() => {
        const unsubscribe = firebaseOnAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const idTokenResult = await user.getIdTokenResult();
                    let computedRole: 'admin' | 'seller' | 'client' = 'client';
                    if (idTokenResult.claims.admin) {
                        computedRole = 'admin';
                    } else if (idTokenResult.claims.seller) {
                        computedRole = 'seller';
                    }
                    setState({ user, role: computedRole, loading: false, error: null });
                } catch (e) {
                    setState({ user, role: 'client', loading: false, error: null });
                }
            } else {
                setState({ user: null, role: null, loading: false, error: null });
            }
        });
        return unsubscribe;
    }, []);

    const signIn = async (email: string, password: string) => {
        setState(prev => ({ ...prev, loading: true, error: null }));
        try {
            const cred = await firebaseSignIn(auth, email, password);
            return cred.user;
        } catch (err: any) {
            console.error('🔥 Firebase Auth Error Completo:', err);
            let msg = 'Error de autenticación';
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
                msg = 'Correo electrónico o contraseña incorrectos.';
            } else if (err.code === 'auth/invalid-email') {
                msg = 'El formato del correo electrónico es inválido.';
            } else if (err.code === 'auth/too-many-requests') {
                msg = 'Demasiados intentos fallidos. Intenta más tarde.';
            } else if (err.message) {
                msg = err.message;
            }
            setState(prev => ({ ...prev, loading: false, error: msg }));
            throw new Error(msg);
        }
    };

    const register = async (email: string, password: string) => {
        setState(prev => ({ ...prev, loading: true, error: null }));
        try {
            const cred = await firebaseCreateUser(auth, email, password);
            return cred.user;
        } catch (err: any) {
            const msg = err.message || 'Error al crear cuenta';
            setState(prev => ({ ...prev, loading: false, error: msg }));
            throw new Error(msg);
        }
    };

    const resetPassword = async (email: string) => {
        try {
            await firebaseSendReset(auth, email);
        } catch (err: any) {
            throw new Error(err.message || 'Error al enviar correo de recuperación');
        }
    };

    const logout = async () => {
        try {
            await firebaseSignOut(auth);
        } catch (err: any) {
            throw new Error(err.message || 'Error al cerrar sesión');
        }
    };

    return {
        user: state.user,
        role: state.role,
        loading: state.loading,
        error: state.error,
        signIn,
        register,
        resetPassword,
        logout,
    };
}
