export const selectors = {
  usernameInput: [
    'input[formcontrolname="usuario"]',
    'input[name="usuario"]',
    'input[id*="usuario"]',
    'input[placeholder*="Usuario"]',
    'input[aria-label*="Usuario"]',
    'input[type="text"]',
  ],
  enterButton: [
    'button[type="submit"]:has-text("Entrar")',
    'button:has-text("Entrar")',
    'button:has-text("Ingresar")',
    'input[type="submit"]',
  ],
  passwordInput: [
    'input[formcontrolname="contrasena"]',
    'input[name="contrasena"]',
    'input[id*="contras"]',
    'input[placeholder*="Contraseña"]',
    'input[type="password"]',
  ],
  continueButton: [
    'button[type="submit"]:has-text("Continuar")',
    'button:has-text("Continuar")',
    'button:has-text("Aceptar")',
    'button:has-text("Entrar")',
  ],
  dashboardMarker: [
    'text=Posición Consolidada',
    'text=Posicion Consolidada',
    'text=Cuentas',
    'text=Bienvenido',
  ],
  accountSectionHeader: [
    'text=Cuentas',
  ],
  accountRows: [
    'table tbody tr',
    'tbody tr',
    '[role="rowgroup"] [role="row"]',
    'mat-row',
  ],
};
