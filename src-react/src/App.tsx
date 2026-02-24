import { useEffect } from 'react';
import { useAuth } from './hooks';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';
import { ToastProvider } from './contexts/ToastContext';
import { LoginScreen } from './screens/LoginScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { ClientsScreen } from './screens/ClientsScreen';
import { BalanceScreen } from './screens/BalanceScreen';
import { VesBalanceScreen } from './screens/VesBalanceScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { CommissionsScreen } from './screens/CommissionsScreen';
import { AccountsScreen } from './screens/AccountsScreen';
import { ReportsScreen } from './screens/ReportsScreen';
import { BottomNav } from './components/BottomNav';
import { Apple } from 'lucide-react';

function AppRouter() {
    const { user, role, loading } = useAuth();
    const { screen, navigate } = useNavigation();

    // Redirección forzosa si intenta entrar a donde no debe
    useEffect(() => {
        if (!loading && user && role !== 'admin') {
            const adminOnlyScreens = ['reports', 'ves-balance', 'commissions', 'accounts'];
            if (adminOnlyScreens.includes(screen)) {
                navigate('dashboard');
            }
        }
    }, [screen, role, loading, user, navigate]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-manzano-400 to-manzano-600 rounded-2xl shadow-lg shadow-manzano-400/20 animate-pulse mb-3">
                        <Apple className="w-7 h-7 text-white" />
                    </div>
                    <p className="text-gray-400 text-sm font-medium">Cargando...</p>
                </div>
            </div>
        );
    }

    if (!user) return <LoginScreen />;

    const SCREENS: Record<string, React.ReactNode> = {
        dashboard: <DashboardScreen />,
        history: <HistoryScreen />,
        clients: <ClientsScreen />,
        balance: <BalanceScreen />,
        'ves-balance': <VesBalanceScreen />,
        settings: <SettingsScreen />,
        commissions: <CommissionsScreen />,
        accounts: <AccountsScreen />,
        reports: <ReportsScreen />,
    };

    return (
        <>
            <div className="pb-16 md:pb-0">
                {SCREENS[screen] || <DashboardScreen />}
            </div>
            <BottomNav />
        </>
    );
}

function App() {
    return (
        <NavigationProvider>
            <ToastProvider>
                <AppRouter />
            </ToastProvider>
        </NavigationProvider>
    );
}

export default App;
