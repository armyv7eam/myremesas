import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type Screen =
    | 'dashboard'
    | 'history'
    | 'clients'
    | 'balance'
    | 'ves-balance'
    | 'settings'
    | 'commissions'
    | 'accounts'
    | 'reports';

interface NavigationContextType {
    screen: Screen;
    navigate: (screen: Screen) => void;
    goHome: () => void;
}

const NavigationContext = createContext<NavigationContextType | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
    const [screen, setScreen] = useState<Screen>('dashboard');

    const navigate = useCallback((s: Screen) => setScreen(s), []);
    const goHome = useCallback(() => setScreen('dashboard'), []);

    return (
        <NavigationContext.Provider value={{ screen, navigate, goHome }}>
            {children}
        </NavigationContext.Provider>
    );
}

export function useNavigation() {
    const ctx = useContext(NavigationContext);
    if (!ctx) throw new Error('useNavigation must be inside NavigationProvider');
    return ctx;
}
