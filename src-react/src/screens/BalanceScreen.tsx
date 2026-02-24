import { useState } from 'react';
import { useBalanceHistory } from '../hooks/useBalanceHistory';
import { useExchangeRates } from '../hooks/useExchangeRates';
import { Button } from '../components/ui';
import * as XLSX from 'xlsx';

import { useNavigation } from '../contexts/NavigationContext';

const QUICK_RANGES = [
    { label: 'Hoy', days: 0 },
    { label: 'Ayer', days: 1 },
    { label: '7 días', days: 7 },
    { label: '30 días', days: 30 },
];

interface Props {
    onBack?: () => void;
}

export function BalanceScreen({ onBack }: Props = {}) {
    const { goHome } = useNavigation();
    const handleBack = onBack || goHome;
    const { entries, loading, error, totals, hasSearched, search } = useBalanceHistory();
    const { rates } = useExchangeRates();
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const handleSearch = () => {
        if (!startDate || !endDate) return;
        search(new Date(startDate), new Date(endDate));
    };

    const handleQuickRange = (days: number) => {
        const end = new Date();
        const start = new Date();
        if (days === 1) {
            start.setDate(start.getDate() - 1);
            end.setDate(end.getDate() - 1);
        } else {
            start.setDate(start.getDate() - days);
        }
        const fmt = (d: Date) => d.toISOString().split('T')[0];
        setStartDate(fmt(start));
        setEndDate(fmt(end));
        search(start, end);
    };

    const handleExportExcel = () => {
        if (entries.length === 0) return;
        const data = entries.map(e => ({
            'Monto': e.amount,
            'Tipo': e.type,
            'Descripción': e.description,
            'Pedido': e.orderId || '',
            'Creado Por': e.createdBy || '',
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'HistorialSaldo');
        XLSX.writeFile(wb, `Balance_CLP_${startDate || 'all'}_a_${endDate || 'all'}.xlsx`);
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
                <div className="max-w-900 mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={handleBack} className="text-gray-400 hover:text-gray-700 transition-colors text-sm font-semibold">
                            ← Volver
                        </button>
                        <h1 className="text-sm font-bold text-gray-800">Balance CLP</h1>
                    </div>
                    {entries.length > 0 && (
                        <Button variant="ghost" onClick={handleExportExcel} className="!text-xs">📥 Excel</Button>
                    )}
                </div>
            </header>

            <main className="max-w-900 mx-auto px-4 py-6 space-y-4">
                {/* Current Balance Card */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-2xl p-5 text-white shadow-lg">
                    <p className="text-xs text-blue-200 font-medium">Saldo Disponible</p>
                    <p className="text-3xl font-bold mt-1">
                        {rates.totalClpBalance > 0
                            ? rates.totalClpBalance.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })
                            : '$0'}
                    </p>
                    <div className="flex gap-4 mt-3">
                        <div>
                            <p className="text-[10px] text-blue-300">Tasa VES</p>
                            <p className="text-sm font-semibold">{rates.VES > 0 ? rates.VES.toFixed(2) : '—'}</p>
                        </div>
                    </div>
                </div>

                {/* Quick Ranges */}
                <div className="flex gap-2 overflow-x-auto pb-1">
                    {QUICK_RANGES.map(r => (
                        <button
                            key={r.label}
                            onClick={() => handleQuickRange(r.days)}
                            className="shrink-0 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-semibold text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-all"
                        >
                            {r.label}
                        </button>
                    ))}
                </div>

                {/* Date Range */}
                <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="exchange-label">Desde</label>
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="exchange-input text-xs" />
                        </div>
                        <div>
                            <label className="exchange-label">Hasta</label>
                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="exchange-input text-xs" />
                        </div>
                    </div>
                    <Button variant="primary" fullWidth onClick={handleSearch} isLoading={loading} className="!text-xs">
                        🔍 Buscar Movimientos
                    </Button>
                </div>

                {/* Summary */}
                {!loading && !error && totals.count === 0 && (
                    <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 text-xs text-blue-700 font-medium">
                        No hay movimientos en este rango.
                    </div>
                )}
                {!loading && !error && totals.count > 0 && (
                    <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 text-xs text-blue-800 font-medium">
                        {totals.count} movimientos. Ingresos:{' '}
                        <span className="text-green-600 font-bold">
                            {totals.in.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}
                        </span>{' '}
                        | Egresos:{' '}
                        <span className="text-red-600 font-bold">
                            {totals.out.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}
                        </span>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-xs text-red-600">{error}</div>
                )}

                {/* Entries Table (Bank Statement Style) */}
                {entries.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[600px]">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-500">
                                        <th className="px-4 py-3 font-semibold w-32">FECHA Y HORA</th>
                                        <th className="px-4 py-3 font-semibold">DESCRIPCIÓN</th>
                                        <th className="px-4 py-3 font-semibold w-24">BANCO</th>
                                        <th className="px-4 py-3 font-semibold text-right w-28">CARGO</th>
                                        <th className="px-4 py-3 font-semibold text-right w-28">ABONO</th>
                                        <th className="px-4 py-3 font-semibold text-right w-32">SALDO</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 bg-white">
                                    {entries.map(entry => {
                                        const isAbono = entry.amount > 0;
                                        const isCargo = entry.amount < 0;
                                        const absAmount = Math.abs(entry.amount);
                                        const date = entry.createdAt ? entry.createdAt.toDate() : new Date();

                                        return (
                                            <tr key={entry.id} className="hover:bg-gray-50/50 transition-colors group">
                                                {/* FECHA Y HORA */}
                                                <td className="px-4 py-2.5 text-[11px] text-gray-500 whitespace-nowrap">
                                                    {date.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                                    <span className="text-[10px] text-gray-400 ml-1.5">
                                                        {date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </td>

                                                {/* DESCRIPCIÓN */}
                                                <td className="px-4 py-2.5 text-[11px] font-medium text-gray-800 whitespace-nowrap max-w-[250px] truncate">
                                                    {entry.description || (entry.type === 'add' ? 'Carga de saldo' : entry.type)}
                                                    {entry.orderId && (
                                                        <span className="ml-1.5 text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-sm font-mono tracking-tighter">
                                                            #{entry.orderId.slice(-5)}
                                                        </span>
                                                    )}
                                                </td>

                                                {/* BANCO */}
                                                <td className="px-4 py-2.5 text-[11px] text-gray-500 capitalize whitespace-nowrap max-w-[150px] truncate">
                                                    {entry.bank || (entry.type === 'Ingreso' ? 'Pago' : (entry.type === 'Egreso' ? 'Anulación' : entry.type))}
                                                </td>

                                                {/* CARGO */}
                                                <td className="px-4 py-2.5 text-right font-medium text-[11px] text-rose-600 tabular-nums">
                                                    {isCargo ? absAmount.toLocaleString('es-CL', { minimumFractionDigits: 0 }) : ''}
                                                </td>

                                                {/* ABONO */}
                                                <td className="px-4 py-2.5 text-right font-medium text-[11px] text-emerald-600 tabular-nums">
                                                    {isAbono ? absAmount.toLocaleString('es-CL', { minimumFractionDigits: 0 }) : ''}
                                                </td>

                                                {/* SALDO */}
                                                <td className="px-4 py-2.5 text-right font-bold text-[11px] text-blue-600 tabular-nums bg-blue-50/10 group-hover:bg-blue-50/30">
                                                    {entry.balanceAfter !== undefined
                                                        ? entry.balanceAfter.toLocaleString('es-CL', { minimumFractionDigits: 0 })
                                                        : '—'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Empty */}
                {!loading && entries.length === 0 && !hasSearched && (
                    <div className="text-center py-16">
                        <p className="text-4xl mb-3">💰</p>
                        <p className="text-gray-400 text-sm">Selecciona un rango de fechas para ver movimientos</p>
                    </div>
                )}
            </main>
        </div>
    );
}
