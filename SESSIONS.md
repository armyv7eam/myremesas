# Registro de Sesiones — Manzano App

---

## Sesión 2026-02-28

**Duración:** 13:32 – 17:57 (CHT -03:00)

### Cambios implementados

#### 1. Fee silencioso en Compras Mayorista (0.95%)
- **Archivo:** `src-react/src/screens/WholesalePurchasesScreen.tsx`
- Se aplicó un fee del 0.95% al cálculo de **USDT requeridos** multiplicando por `1.0095`.
- El fee es completamente invisible en la UI — no se muestra ninguna mención al usuario.
- Fórmula aplicada: `round2(vesAmount * usdtPerVesRate * 1.0095)`

#### 2. Datos de transferencia visibles en Paso 2 del modal "Crear Lote"
- **Archivo:** `src-react/src/screens/CreateBatchModal.tsx`
- En el Paso 2 ("Ingresar Montos"), cada cliente ahora muestra:
  - **Número de cuenta** (si `type === 'transferencia'`)
  - **Teléfono** (si `type === 'pago-movil'` o `'recarga-saldo'`)
  - Cuadro con fondo ámbar para destacar los datos de validación
  - Botón **"Copiar datos"** por cada cliente
- Objetivo: permitir al admin validar los datos de destino antes de confirmar el lote.

### Deploys realizados
| # | Descripción | Archivos nuevos | Resultado |
|---|-------------|-----------------|-----------|
| 1 | Fee 0.95% en Compras Mayorista | 2 | ✅ Deploy complete |
| 2 | Datos de transferencia en Crear Lote | 2 | ✅ Deploy complete |

**URL de producción:** https://manzanoapp-2f775.web.app

### Notas
- El error `"A listener indicated an asynchronous response..."` que apareció en consola es un error de extensiones del navegador, NO de la app.
- Los cambios en `CreateBatchModal.tsx` (Paso 2) requieren que el cliente tenga los campos `accountNumber` o `phone` guardados en Firestore para que se muestren.

---
---

## Sesión 2026-03-01

**Duración:** 11:36 – 12:51 (CHT -03:00)

### Diagnóstico y Fix — Bot myremesas (Binance P2P VES)

**Repo afectado:** `armyv7eam/myremesas` → `api/rates.js`

#### Causa raíz
El bot publicaba `USDT_to_VES_P2P_SELL_6TH_BANK_TRANSFER: null` porque:
1. La función pedía solo 20 filas de VES SELL y filtraba por método `bank-transfer`
2. En Venezuela los métodos de pago se listan como nombres de banco (Mercantil, Banesco...) — no coinciden con el regex `/(bank|banc|transfer|transferencia)/i`
3. Binance P2P bloquea el endpoint VES desde los servidores de Vercel (geo-restricción) → array vacío

#### Correcciones aplicadas (3 commits en `armyv7eam/myremesas`)

| Commit | Descripción |
|---|---|
| `452a2d6` | Pool VES SELL aumentado de 20 → 50 filas |
| `f66fb4c` | Fallback a 6ª oferta general cuando filtro bank-transfer queda vacío |
| `d73fff6` | Cuando Binance P2P VES está geo-bloqueado, usar tasa de CriptoYa como valor de `USDT_to_VES_P2P_SELL_6TH_BANK_TRANSFER` (CriptoYa scrape el mismo mercado). `ves_source` pasa a `"Binance P2P via CriptoYa"` |

**Resultado esperado:**
```json
"USDT_to_VES_P2P_SELL_6TH_BANK_TRANSFER": 605.797,
"meta": { "ves_source": "Binance P2P via CriptoYa" }
```

---

### Cambios en Manzano App

#### 1. Eliminado auto-refresh de tasas (Calculadora FX)
- **Archivo:** `src-react/src/hooks/useFxCalculatorRates.ts`
- Se eliminó el `setInterval` de 20 minutos. Las tasas ahora se cargan **solo al montar** el componente.
- Evita llamadas periódicas innecesarias a la API de Vercel.

#### 2. Fee silencioso en Compras Mayoristas
- **Archivo:** `src-react/src/screens/WholesalePurchasesScreen.tsx`
- Se aplica un factor `VES_RATE_FEE_FACTOR = 0.9887` (~1.13%) al VES rate obtenido del bot.
- Con tasa de mercado `0.689` → resultado en app: `0.6812`
- El fee es invisible en la UI. Solo aplica en la pantalla de Compras Mayoristas, **no** en la Calculadora FX.

### Deploys realizados
| # | Descripción | Resultado |
|---|-------------|-----------|
| 1 | Remove auto-refresh + fee 1% → 0.99 inicial | ✅ |
| 2 | Ajuste fee a 0.9887, quitar fee de FX calculator | ✅ |

**URL de producción:** https://manzanoapp-2f775.web.app

### Configuración
- **`VITE_RATES_API_URL`:** `https://myremesas.vercel.app/api/rates` (debe estar en `.env.local` de `src-react`)
- **Remote git myremesas:** `https://github.com/armyv7eam/myremesas.git`
  - ⚠️ El repo está en **detached HEAD**. Para pushear siempre usar `git push origin HEAD:main`

---
