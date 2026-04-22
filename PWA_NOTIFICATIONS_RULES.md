# Reglas Estrictas: Notificaciones Push (PWA & FCM)

Este documento detalla la configuración exacta y el flujo crítico para que las notificaciones Push funcionen tanto en Web como en PWA (Chrome para Android). **NO ALTERAR esta arquitectura en futuras actualizaciones sin leer detenidamente.**

## 1. El Backend (Firebase Cloud Functions)

Para que el sistema operativo Android despierte el dispositivo y muestre la notificación cuando la PWA está cerrada o en background, es **obligatorio** incluir el objeto `webpush` en el payload además del objeto `android`.

Si solo incluyes `android`, el Service Worker de la PWA no tendrá las instrucciones para renderizar el popup y descartará el mensaje silenciosamente.

**Estructura OBLIGATORIA del Payload:**
```typescript
const payload = {
  notification: {
    title: "Título de la alerta",
    body: "Cuerpo del mensaje",
  },
  data: {
    // Tus datos internos
  },
  // ESTE BLOQUE ES CRÍTICO PARA LA PWA (ANDROID/CHROME)
  webpush: {
    notification: {
      // ⚠️ IMPORTANTE: 'title' y 'body' DEBEN replicarse aquí adentro. 
      // El bloque webpush.notification SOBREESCRIBE por completo al bloque superior `notification` en plataformas Web.
      // Si no los incluyes aquí, el ServiceWorker de la PWA recibirá un título y mensaje vacíos. 
      title: "Título de la alerta",
      body: "Cuerpo del mensaje",
      icon: "/images/icon-192x192.png",
      vibrate: [200, 100, 200, 100, 200, 100, 200],
      requireInteraction: true,
    },
    fcmOptions: {
      link: "/" // Redirección al hacer click
    }
  },
  // ESTE BLOQUE ES PARA APLICACIONES NATIVAS (CAPACITOR/KOTLIN)
  android: {
    priority: "high",
    notification: {
      channelId: "high_priority",
      sound: "default",
      icon: "ic_stat_notification",
      color: "#8cb33e",
    },
  },
};
```

## 2. El Service Worker (`firebase-messaging-sw.js`)

**Regla de Oro:** NUNCA llames a `self.registration.showNotification(...)` dentro del listener `messaging.onBackgroundMessage` si el payload ya trae un objeto `notification`.

Firebase SDK (compat.js) **ya dibuja la notificación automáticamente** si detecta las propiedades `notification` y `webpush`. Si intentas dibujarla tú mismo con JavaScript, Android matará el Service Worker por interrupción y el usuario no verá nada.

**Código Correcto en el SW:**
```javascript
messaging.onBackgroundMessage((payload) => {
    // Si viene desde el backend con notification payload, Firebase lo maneja solo.
    if (payload.notification) {
        return; 
    }

    // Solo usar showNotification como Fallback si es un Data-only message
    return self.registration.showNotification(payload.data.title, { ...options });
});
```
*Tampoco* uses `self.addEventListener('push')` manual al mismo tiempo que inicializas `firebase.messaging()`, porque generará conflictos de quién ataja el mensaje.

## 3. Frontend React (`useNotifications.ts`)

La lógica del cliente debe manejar dos estados:
1. **Background (App Cerrada):** Firebase WebPush mostrará el globo de Android (ver punto 2).
2. **Foreground (App Abierta):** Firebase interceptará el mensaje en la función `onMessage`. 

**Regla de Renderizado en Foreground:**
Nunca tires un `new Notification()` si la pestaña está visible (`document.visibilityState === 'visible'`). Esto confunde al SO. Usa un Toast UI interno de la aplicación.
```typescript
onMessage(messaging, (payload) => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        toast.info(`${payload.notification.title}: ${payload.notification.body}`);
        return; // Detener aquí. No llamar API nativa.
    }
});
```

## 4. Limpieza de Caché (`index.html`)

Nunca uses scripts masivos anti-caché de Service Workers que ejecuten `sw.unregister()` en bucle. Hacerlo borrará el SW de Firebase Messaging y romperá la entrega.
Si necesitas limpiar SWs viejos, asegúrate de excluir el de Firebase:
```html
<script>
  if ('serviceWorker' in navigator) { 
    navigator.serviceWorker.getRegistrations().then(function(regs) { 
      regs.forEach(function(sw) { 
        var url = (sw.active && sw.active.scriptURL) || ''; 
        // IMPORTANTE: Excluir Push Notification SW
        if (!url.includes('firebase-messaging-sw')) { 
          sw.unregister(); 
        } 
      }); 
    }); 
  }
</script>
```
