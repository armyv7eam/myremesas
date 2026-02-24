import { useState, type FormEvent } from 'react';
import { useAuth } from '../hooks';
import { Button } from '../components/ui';
import { Apple, Mail, Lock, LogIn, Shield } from 'lucide-react';

export function LoginScreen() {
    const { signIn, error, loading } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        try { await signIn(email, password); } catch { /* handled */ }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-manzano-400/5 rounded-full blur-3xl" />
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-manzano-400/5 rounded-full blur-3xl" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-manzano-400/3 rounded-full blur-3xl" />
            </div>

            <div className="w-full max-w-sm relative z-10">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-manzano-400 to-manzano-600 rounded-2xl shadow-lg shadow-manzano-400/20 mb-4">
                        <Apple className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">Manzano App</h1>
                    <div className="flex items-center justify-center gap-1.5 mt-2">
                        <Shield className="w-3 h-3 text-gray-500" />
                        <p className="text-xs text-gray-400">Panel de Administración</p>
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="bg-white/[0.07] backdrop-blur-md rounded-2xl p-6 border border-white/10 shadow-2xl space-y-5">
                    <div>
                        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                            <Mail className="w-3 h-3" />
                            Correo Electrónico
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="admin@manzano.cl"
                            required
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-manzano-400/50 focus:border-transparent transition-all text-sm"
                        />
                    </div>

                    <div>
                        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                            <Lock className="w-3 h-3" />
                            Contraseña
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-manzano-400/50 focus:border-transparent transition-all text-sm"
                        />
                    </div>

                    {error && (
                        <div className="bg-red-500/15 border border-red-500/20 rounded-xl px-4 py-2.5 text-red-300 text-xs flex items-center gap-2">
                            <Shield className="w-3.5 h-3.5 shrink-0" />
                            {error}
                        </div>
                    )}

                    <Button
                        type="submit"
                        fullWidth
                        isLoading={loading}
                        className="!bg-gradient-to-r !from-manzano-400 !to-manzano-600 hover:!from-manzano-500 hover:!to-manzano-700 !text-white !font-bold !py-3 !rounded-xl !shadow-lg !shadow-manzano-400/20"
                    >
                        <span className="flex items-center justify-center gap-2">
                            <LogIn className="w-4 h-4" />
                            Iniciar Sesión
                        </span>
                    </Button>
                </form>

                <p className="text-center text-[11px] text-gray-600 mt-6">
                    Manzano App &copy; {new Date().getFullYear()} · v2.0
                </p>
            </div>
        </div>
    );
}
