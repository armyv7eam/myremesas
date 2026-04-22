# BDV Bot

Worker local con Playwright para Banco de Venezuela en modo solo lectura.

## Objetivo inicial

- iniciar sesion en BDV
- entrar a la vista de posicion consolidada
- leer las cuentas visibles
- guardar evidencia local
- sincronizar opcionalmente a Firestore

## Configuracion

1. Copia `.env.example` a `.env`
2. Completa `BDV_USERNAME` y `BDV_PASSWORD`
3. Verifica `FIREBASE_SERVICE_ACCOUNT_PATH` si queres sync a Firestore
4. Instala dependencias con `npm install`
5. Instala el browser de Playwright con `npx playwright install chromium`

## Uso

`npm run login`

Abre el navegador, intenta login y deja trazas en `artifacts/`.

`npm run sync`

Hace login, extrae cuentas visibles y escribe un snapshot en Firestore si `BDV_SYNC_TO_FIRESTORE=true`.

`npm run process-request`

Toma una solicitud pendiente desde `bank_sync_requests`, ejecuta el bot una vez y actualiza el estado de la solicitud.

`npm run worker`

Deja el bot escuchando solicitudes pendientes en Firestore cada 15 segundos.

## Diagnostico

Si el login falla, el bot deja evidencia en `artifacts/`:

- screenshot del error
- html capturado
- metadata con URL y titulo
- trace `.zip` de Playwright

Cuando `BDV_SYNC_TO_FIRESTORE=true`, el bot tambien guarda referencias de esos artifacts en `bank_sync_runs`.

Eso permite ajustar selectores o detectar si el portal quedo bloqueado por red, timeout o cambio de layout.

## Notas

- Este worker esta separado de la app porque una sesion bancaria no debe vivir en Firebase Functions.
- El selector set es inicial y puede requerir ajuste segun el HTML real del portal.
- El primer alcance es solo lectura. Nada de transferencias automaticas todavia.
- El boton `Solicitar reintento` de la app crea una solicitud en Firestore; para ejecutarla de verdad debe estar corriendo `npm run worker` en una maquina con acceso a BDV.
