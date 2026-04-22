export const mercantilSelectors = {
  usernameInput: [
    '#username',
    'input[placeholder*="Usuario"]',
    'input[placeholder*="Tarjeta"]',
    'input[name*="usuario" i]',
    'input[id*="usuario" i]',
    'input[id*="user" i]',
    'input[type="password"]',
    'input[type="text"]',
  ],
  passwordInput: [
    '#password',
    'input[placeholder*="Clave"]',
    'input[name*="clave" i]',
    'input[id*="clave" i]',
    'input[id*="pass" i]',
    'input[type="password"]',
  ],
  submitButton: [
    'button:has-text("Iniciar")',
    'input[type="submit"]',
    'button[type="submit"]',
  ],
  dashboardMarker: [
    'text=/Cuentas en Moneda Nacional/i',
    'text=/Mis productos/i',
    'text=/Ocultar saldos/i',
    'text=/Bienvenido/i',
    'text=/Posicion/i',
    'text=/Saldo/i',
    'text=/Cuenta/i',
  ],
};
