# TASA MAYORISTA — Fórmula de Cálculo (INALTERABLE)

> [!CAUTION]
> **NO MODIFICAR esta lógica sin entender completamente la fórmula.**
> Este documento existe para evitar regresar errores de cálculo que ya fueron corregidos.

---

## Fuentes de Datos (API `myremesas.vercel.app/api/rates`)

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| `USDT_CLP_BUY_6TH` | Precio de compra USDT en pesos chilenos (CLP), 6ta oferta BUY de Binance P2P | `910` |
| `USDT_VES_SELL_6TH_BANK_TRANSFER` | Precio USDT en bolívares (VES), 6ta oferta SELL bank transfer de Binance P2P | `624` |

---

## Fórmula de la Tasa Mayorista (CLP/VES)

### Paso 1 — Tasa de mercado bruta
```
tasaBruta = USDT_VES_SELL / USDT_CLP_BUY
           = 624 / 910
           = 0.6857  (cuántos CLP vale 1 VES)
```

### Paso 2 — Aplicar fee operativo del 1%
El fee se aplica **dividiendo** la tasa bruta para hacerla más baja (el cliente recibe menos CLP por cada VES, cubriendo el costo operativo):
```
tasaMayorista = tasaBruta / 1.01
              = 0.6857 / 1.01
              = 0.6789  ← lo que se muestra en pantalla
```

### Paso 3 — Calcular CLP total de la operación
```
clpTotal = vesACombrar / tasaMayorista
         = 100000 / 0.6789
         = 147,297 CLP
```

### Paso 4 — Calcular USDT equivalente
El costo en USDT también incluye el fee como multiplicador del precio de compra:
```
usdtEquivalente = clpTotal / (USDT_CLP_BUY × 1.01)
                = 147,297 / (910 × 1.01)
                = 147,297 / 919.1
                = 160.3 USDT
```

---

## Resumen Ejecutivo

```
tasaMayorista   = (VES_por_USDT / CLP_por_USDT) / 1.01
clpTotal        = VES_cantidad / tasaMayorista
usdtEquivalente = clpTotal / (CLP_por_USDT × 1.01)
```

---

## ❌ Errores Comunes a Evitar

| Error | Por qué es incorrecto |
|-------|-----------------------|
| `clpTotal = VES × tasa` | Multiplica en vez de dividir — da valores ~10x menores |
| `usdtResult = clpTotal / usdtClpRate` | No aplica el fee al costo de USDT — viola el margen |
| `usdtResult = clpTotal / usdtClpRate × 1.01` | **Suma** el fee al resultado final — no lo refleja en la tasa visible |
| Cambiar el factor `1.01` sin consultar esta guía | Rompe la correlación con el bot de Telegram de referencia |

---

## Archivos que implementan esta lógica

- **Frontend**: [`src-react/src/screens/WholesalePurchasesScreen.tsx`](./src-react/src/screens/WholesalePurchasesScreen.tsx)
  - `usdtResult` → `clpAmountComputed / (usdtToClpRate * 1.01)`
  - `setRateInput` → `round4((vesPerUsdt / rawUsdtToClp) / 1.01)`

- **Backend API**: [`myremesas/api/rates.js`](../myremesas/api/rates.js)
  - Fuente CLP: Binance P2P BUY offer #6
  - Fuente VES: Binance P2P SELL bank transfer #6 (o CriptoYa como fallback)

---

## Valores de Referencia (Marzo 2026)

| Mercado | Tasa | Fuente |
|---------|------|--------|
| USDT/CLP | ~910 | Binance P2P BUY #6 |
| USDT/VES | ~624 | Binance P2P SELL bank transfer #6 |
| **Tasa mayorista** | **~0.6788** | Bot Telegram de referencia |
| **USDT (100k VES)** | **~160 USDT** | Resultado esperado |
