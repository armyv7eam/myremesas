import { useAuth } from '../hooks/useAuth';
import { useExchangeRates } from '../hooks/useExchangeRates';

import { useNavigation } from '../contexts/NavigationContext';

import { USER_TAGS } from '../lib/constants';

const TAG_ROLES: Record<string, string> = {
    A1: 'Super Admin',
    A2: 'Admin',
    A3: 'Admin',
    A4: 'Admin',
    A5: 'Admin',
    V1: 'Vendedor',
    V2: 'Vendedor',
    V3: 'Vendedor',
};

interface Props {
    onBack?: () => void;
}

export function SettingsScreen({ onBack }: Props = {}) {
    const { goHome } = useNavigation();
    const handleBack = onBack || goHome;
    const { user, role, logout } = useAuth();
    const { rates } = useExchangeRates();
    const currentTag = user?.email ? USER_TAGS[user.email] || '—' : '—';

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
                <div className="max-w-900 mx-auto px-4 py-3 flex items-center gap-3">
                    <button onClick={handleBack} className="text-gray-400 hover:text-gray-700 transition-colors text-sm font-semibold">← Volver</button>
                    <h1 className="text-sm font-bold text-gray-800">Configuración</h1>
                </div>
            </header>

            <main className="max-w-900 mx-auto px-4 py-6 space-y-6">
                {/* Current User Card */}
                <div className="bg-gradient-to-r from-gray-900 to-gray-700 rounded-2xl p-5 text-white shadow-lg">
                    <p className="text-xs text-gray-400 font-medium">Tu perfil</p>
                    <p className="text-lg font-bold mt-1">{user?.email}</p>
                    <div className="flex gap-4 mt-3">
                        <div>
                            <p className="text-[10px] text-gray-400">Tag</p>
                            <p className="text-sm font-bold text-manzano-300">{currentTag}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-gray-400">Rol</p>
                            <p className="text-sm font-semibold">{TAG_ROLES[currentTag] || 'Usuario'}</p>
                        </div>
                    </div>
                </div>

                {/* System Info - Admin Only */}
                {role === 'admin' && (
                    <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                        <h3 className="text-xs font-bold text-gray-700">Estado del Sistema</h3>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-gray-400">Tienda</p>
                                <p className={`font-bold ${rates.isTakingOrders ? 'text-green-600' : 'text-red-600'}`}>
                                    {rates.isTakingOrders ? '🟢 Abierta' : '🔴 Cerrada'}
                                </p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-gray-400">Balance CLP</p>
                                <p className="font-bold text-blue-600">
                                    {rates.totalClpBalance.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}
                                </p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-gray-400">Tasa VES</p>
                                <p className="font-bold">{rates.VES > 0 ? rates.VES.toFixed(2) : '—'}</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-gray-400">Tasa COP</p>
                                <p className="font-bold">{rates.COP > 0 ? rates.COP.toFixed(2) : '—'}</p>
                            </div>
                        </div>
                    </section>
                )}

                {/* User Tags List - Admin Only */}
                {role === 'admin' && (
                    <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                        <h3 className="text-xs font-bold text-gray-700">Usuarios del Sistema</h3>
                        <div className="space-y-2">
                            {Object.entries(USER_TAGS)
                                .sort(([, a], [, b]) => a.localeCompare(b))
                                .map(([email, tag]) => (
                                    <div key={email} className={`flex items-center justify-between py-2 px-3 rounded-lg ${email === user?.email ? 'bg-manzano-50 border border-manzano-200' : 'bg-gray-50'
                                        }`}>
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${tag.startsWith('A') ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                                                }`}>
                                                {tag}
                                            </span>
                                            <span className="text-xs text-gray-700 truncate">{email}</span>
                                        </div>
                                        <span className="text-[10px] text-gray-400 shrink-0">{TAG_ROLES[tag] || 'Usuario'}</span>
                                    </div>
                                ))}
                        </div>
                    </section>
                )}

                {/* Logout Button */}
                <button
                    onClick={logout}
                    className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-semibold text-sm rounded-xl border border-red-200 py-3 transition-colors"
                >
                    Cerrar Sesión
                </button>

                {/* App Version */}
                <div className="text-center py-4">
                    <p className="text-[11px] text-gray-300">Manzano App v2.0 — React</p>
                </div>
            </main>
        </div>
    );
}
