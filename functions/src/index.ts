import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

admin.initializeApp();

const brevoApiKey = defineSecret("BREVO_API_KEY");

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ─── Email helpers ─────────────────────────────────────────────────────────────

function buildOrderConfirmationHtml(params: {
  clientName: string;
  vesAmount: string;
  clpAmount: string;
  bank: string;
  orderType: string;
  orderId: string;
  proofsHtml: string;
}): string {
  const { clientName, vesAmount, clpAmount, bank, orderType, orderId, proofsHtml } = params;
  const orderRef = orderId.slice(-6).toUpperCase();
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #8cb33e; padding: 28px 32px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 22px; }
    .body { padding: 28px 32px; }
    .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
    .row:last-child { border-bottom: none; }
    .label { color: #666; }
    .value { font-weight: bold; color: #222; }
    .badge { display: inline-block; background: #e6f4d7; color: #4a7c15; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: bold; }
    .proofs { margin-top: 24px; padding: 16px; background: #fdfdfd; border: 1px dashed #d9d9d9; border-radius: 8px; text-align: center; font-size: 14px; }
    .proof-btn { display: inline-block; margin: 6px; padding: 8px 16px; background: #f0f0f0; color: #333; text-decoration: none; border-radius: 6px; font-weight: bold; border: 1px solid #e0e0e0; }
    .proof-btn:hover { background: #e8e8e8; }
    .footer { background: #f9f9f9; padding: 16px 32px; text-align: center; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>✅ Pedido Procesado</h1></div>
    <div class="body">
      <p>Hola <strong>${clientName}</strong>,</p>
      <p>Tu pedido en <strong>Cambios Manzano</strong> ha sido procesado y pagado exitosamente.</p>
      <div class="row"><span class="label">Número de pedido</span><span class="value">#${orderRef}</span></div>
      <div class="row"><span class="label">Monto enviado</span><span class="value">${vesAmount} VES</span></div>
      <div class="row"><span class="label">Monto CLP</span><span class="value">${clpAmount} CLP</span></div>
      <div class="row"><span class="label">Banco / Servicio</span><span class="value">${bank || 'N/A'}</span></div>
      <div class="row"><span class="label">Tipo de operación</span><span class="value">${orderType}</span></div>
      <div class="row"><span class="label">Estado</span><span class="value"><span class="badge">Pagado</span></span></div>
      ${proofsHtml}
    </div>
    <div class="footer">Gracias por confiar en Cambios Manzano &bull; Este es un correo automático, por favor no respondas.</div>
  </div>
</body>
</html>`;
}

async function sendOrderConfirmation(apiKey: string, orderId: string, orderData: Record<string, any>): Promise<void> {
  const clientEmail = typeof orderData.email === "string" ? orderData.email.trim() : "";
  if (!clientEmail) {
    logger.info("No client email in order, skipping confirmation email", { orderId });
    return;
  }

  const clientName = orderData.clientName || orderData.name || "Cliente";
  const vesAmount = (orderData.destinationAmount || orderData.vesAmount || 0)
    .toLocaleString("es-VE", { minimumFractionDigits: 2 });
  const clpAmount = (orderData.clpAmount || 0)
    .toLocaleString("es-CL", { minimumFractionDigits: 0 });
  const bank = orderData.bank || "";
  const orderType = orderData.type || "transferencia";

  const proofUrls: string[] = Array.isArray(orderData.proofUrls) ? orderData.proofUrls : (orderData.proofUrl ? [orderData.proofUrl] : []);
  const attachments: { name: string, content: string }[] = [];

  if (proofUrls.length > 0) {
    for (let i = 0; i < proofUrls.length; i++) {
      try {
        const url = proofUrls[i];
        const res = await fetch(url);
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          const base64Content = Buffer.from(buffer).toString('base64');
          const ext = url.toLowerCase().includes('.png') ? 'png' : (url.toLowerCase().includes('.pdf') ? 'pdf' : 'jpg');
          attachments.push({
            name: `comprobante_${i + 1}.${ext}`,
            content: base64Content
          });
        }
      } catch (err) {
        logger.error("Failed downloading proof attachment for email", { orderId, url: proofUrls[i], err });
      }
    }
  }

  const htmlContent = buildOrderConfirmationHtml({ clientName, vesAmount, clpAmount, bank, orderType, orderId, proofsHtml: '' });

  const payload: any = {
    sender: { name: "Cambios Manzano", email: "cmanzanospa@gmail.com" },
    to: [{ email: clientEmail, name: clientName }],
    subject: `✅ Tu pedido en Cambios Manzano ha sido procesado`,
    htmlContent,
  };

  if (attachments.length > 0) {
    payload.attachment = attachments;
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const db = admin.firestore();
    const orderRef = db.collection('orders').doc(orderId);

    if (!res.ok) {
      const errText = await res.text();
      logger.error("Brevo email API error", { orderId, status: res.status, error: errText });
      await orderRef.update({
        emailSent: false,
        emailError: `API Status ${res.status}: ${errText.substring(0, 500)}`,
        emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    await orderRef.update({
      emailSent: true,
      emailError: null,
      emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.info("Order confirmation email sent via Brevo with attachments", { orderId, email: clientEmail, attachments: attachments.length });
  } catch (err: any) {
    logger.error("Email processing failed", { orderId, err: err.message });
    const db = admin.firestore();
    await db.collection('orders').doc(orderId).update({
      emailSent: false,
      emailError: err.message || 'Unknown network error',
      emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(e => logger.error("Failed updating order with email error", { orderId, err: e.message }));
  }
}

async function syncDynamicClpBalance(reason: string): Promise<void> {
  const db = admin.firestore();
  const rateRef = db.collection("config").doc("rate");

  const [rateSnap, accountsSnap] = await Promise.all([
    rateRef.get(),
    db.collection("accounts").get(),
  ]);

  if (!rateSnap.exists) {
    logger.warn("config/rate does not exist, skipping CLP balance sync", { reason });
    return;
  }

  const rateData = rateSnap.data() || {};
  const purchaseRateVES = Number(rateData.purchaseRateVES || 0);
  const currentTotalClpBalance = Number(rateData.totalClpBalance || 0);

  let totalVesBalance = 0;
  accountsSnap.forEach((accountDoc) => {
    totalVesBalance += Number(accountDoc.data()?.balance || 0);
  });
  totalVesBalance = round2(totalVesBalance);

  const computedTotalClpBalance = purchaseRateVES > 0
    ? round2(totalVesBalance / purchaseRateVES)
    : 0;

  const shouldUpdate = Math.abs(currentTotalClpBalance - computedTotalClpBalance) > 0.005;
  if (!shouldUpdate) return;

  await rateRef.set({
    totalClpBalance: computedTotalClpBalance,
    totalVesBalance,
    clpBalanceMode: "dynamic_ves_div_purchaseRateVES",
    clpBalanceUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  logger.info("CLP balance synchronized from VES balance", {
    reason,
    purchaseRateVES,
    totalVesBalance,
    currentTotalClpBalance,
    computedTotalClpBalance,
  });
}

/**
 * Keeps config/rate.totalClpBalance aligned with:
 * total VES in accounts / purchaseRateVES.
 */
export const syncClpBalanceFromAccounts = onDocumentWritten("accounts/{accountId}", async (event) => {
  await syncDynamicClpBalance(`accounts/${event.params.accountId}`);
  return null;
});

/**
 * Recompute CLP balance whenever purchaseRateVES changes.
 */
export const syncClpBalanceFromRate = onDocumentUpdated("config/rate", async (event) => {
  const beforeRate = Number(event.data?.before.data()?.purchaseRateVES || 0);
  const afterRate = Number(event.data?.after.data()?.purchaseRateVES || 0);
  if (beforeRate === afterRate) return null;

  await syncDynamicClpBalance("config/rate.purchaseRateVES");
  return null;
});

function collectTokensFromUser(data: any): string[] {
  const tokens = new Set<string>();

  // Preferred source: one token per registered device.
  if (data?.fcmDeviceTokens && typeof data.fcmDeviceTokens === "object") {
    Object.values(data.fcmDeviceTokens).forEach((entry: any) => {
      const token = entry?.token;
      if (typeof token === "string" && token.trim()) tokens.add(token);
    });
  }

  // If the new device map exists, trust it and ignore legacy fields.
  if (tokens.size > 0) {
    return Array.from(tokens);
  }

  // Backward compatibility: one token per platform.
  const webToken = data?.fcmPlatformTokens?.web?.token;
  const nativeToken = data?.fcmPlatformTokens?.native?.token;
  if (typeof webToken === "string" && webToken.trim()) tokens.add(webToken);
  if (typeof nativeToken === "string" && nativeToken.trim()) tokens.add(nativeToken);

  // Legacy fields.
  if (typeof data?.fcmToken === "string" && data.fcmToken.trim()) tokens.add(data.fcmToken);
  if (Array.isArray(data?.fcmTokens)) {
    data.fcmTokens.forEach((t: unknown) => {
      if (typeof t === "string" && t.trim()) tokens.add(t);
    });
  }

  return Array.from(tokens);
}

/**
 * A simple placeholder function to ensure deployment works.
 */
export const helloWorld = onRequest((request, response) => {
  logger.info("Hello logs!", { structuredData: true });
  response.send("Hello from Firebase! Your functions are deploying correctly.");
});

/**
 * Test function to verify a specific user's tokens
 */
export const testPushNotification = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in to test push.");
  }

  const uid = request.auth.uid;
  logger.info(`Test push requested by ${uid}`);

  try {
    const userDoc = await admin.firestore().collection("users").doc(uid).get();
    if (!userDoc.exists) return { success: false, message: 'User not found' };

    const tokens = collectTokensFromUser(userDoc.data());
    if (tokens.length === 0) return { success: false, message: 'No tokens found for user' };

    logger.info(`Found ${tokens.length} tokens for user ${uid}`, { tokens });

    const response = await sendMulticastWithCleanup({
      tokens,
      notification: {
        title: "Test de Notificación Manzano",
        body: `¡Si lees esto, las notificaciones PWA están funcionando! (Tokens probados: ${tokens.length})`,
      },
      data: { type: "test" },
      webpush: {
        notification: {
          title: "Test de Notificación Manzano",
          body: `¡Si lees esto, las notificaciones PWA están funcionando! (Tokens probados: ${tokens.length})`,
          icon: "/images/icon-192x192.png",
          vibrate: [200, 100, 200, 100, 200, 100, 200],
          requireInteraction: true,
        },
        fcmOptions: {
          link: "/"
        }
      },
      apns: { payload: { aps: { sound: "default" } } },
      android: {
        priority: "high" as const,
        notification: {
          channelId: "manzano_alerts_v1",
          sound: "default",
          icon: "ic_stat_notification",
          color: "#8cb33e",
        },
      },
    });

    return {
      success: true,
      tokensFound: tokens.length,
      successCount: response.successCount,
      failureCount: response.failureCount,
      details: response.responses.map((r, i) => ({
        token: tokens[i].substring(0, 15) + '...',
        success: r.success,
        error: r.error ? JSON.stringify(r.error) : null
      }))
    };
  } catch (error: any) {
    logger.error("Error in test push", error);
    throw new HttpsError("internal", error.message);
  }
});

/**
 * Sets a custom claim for a user to make them an admin.
 */
export const setAdminClaim = onCall(async (request) => {
  if (request.auth?.token?.admin !== true) {
    logger.warn(`Non-admin user ${request.auth?.uid || "unauthenticated"} tried to set admin claim.`);
    throw new HttpsError("permission-denied", "Only admins can set other admins.");
  }

  const email = request.data.email;
  if (!email) {
    throw new HttpsError("invalid-argument", "The function must be called with an 'email' argument.");
  }

  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    logger.info(`Successfully made ${email} an admin.`);
    return { message: `Success! ${email} has been made an admin.` };
  } catch (error: any) {
    logger.error("Error setting custom claim:", { email, error: error.message });
    throw new HttpsError("internal", "An internal error occurred while setting the admin claim.");
  }
});

/**
 * Validates a native Firebase Auth token and returns a custom token for Web SDK.
 */
export const validateAndSignIn = onCall(async (request) => {
  const { nativeToken } = request.data;
  if (!nativeToken) {
    throw new HttpsError("invalid-argument", "The function must be called with a 'nativeToken' argument.");
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(nativeToken);
    logger.info(`Token validated for user: ${decodedToken.uid}`);

    const customClaims: any = {};
    if (decodedToken.admin) customClaims.admin = true;
    if (decodedToken.seller) customClaims.seller = true;
    if (decodedToken.requiresProof) customClaims.requiresProof = true;
    if (decodedToken.commissionRate) customClaims.commissionRate = decodedToken.commissionRate;

    const customToken = await admin.auth().createCustomToken(decodedToken.uid, customClaims);
    logger.info(`Custom token created for user: ${decodedToken.uid}`, { claims: customClaims });

    return {
      customToken,
      uid: decodedToken.uid,
      claims: customClaims
    };
  } catch (error: any) {
    logger.error("Error validating native token:", { error: error.message });
    throw new HttpsError("unauthenticated", "Invalid or expired token.");
  }
});

/**
 * Manually resend confirmation email for a paid order.
 */
export const resendOrderEmail = onCall({ secrets: [brevoApiKey] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes estar autenticado.");
  }

  // Permiso: Admin o el vendedor del pedido? Por ahora simplificamos a Admin o Seller.
  // Pero lo mas seguro es admins solo para este debug.
  const isAdmin = request.auth.token.admin === true;
  const isSeller = request.auth.token.seller === true;
  if (!isAdmin && !isSeller) {
    throw new HttpsError("permission-denied", "No tienes permisos para esta acción.");
  }

  const { orderId } = request.data;
  if (!orderId) {
    throw new HttpsError("invalid-argument", "Falta ID del pedido.");
  }

  const orderDoc = await admin.firestore().collection("orders").doc(orderId).get();
  if (!orderDoc.exists) {
    throw new HttpsError("not-found", "El pedido no existe.");
  }

  const orderData = orderDoc.data()!;
  if (orderData.status !== "Pagado") {
    throw new HttpsError("failed-precondition", "Solo se envían correos para pedidos pagados.");
  }

  if (!orderData.email) {
    throw new HttpsError("failed-precondition", "El pedido no tiene un correo válido.");
  }

  const key = brevoApiKey.value();
  if (!key) {
    throw new HttpsError("failed-precondition", "BREVO_API_KEY no configurado.");
  }

  try {
    await sendOrderConfirmation(key, orderId, orderData);
    return { success: true, message: "Correo enviado exitosamente." };
  } catch (error: any) {
    throw new HttpsError("internal", error.message || "Error al enviar el correo.");
  }
});

/**
 * Helper to get all admin FCM tokens
 */
async function getAdminTokens(): Promise<string[]> {
  const adminsSnapshot = await admin.firestore()
    .collection("users")
    .where("isAdmin", "==", true)
    .get();

  const tokens = new Set<string>();
  adminsSnapshot.forEach(doc => {
    const data = doc.data();
    collectTokensFromUser(data).forEach((t) => tokens.add(t));
  });
  return Array.from(tokens);
}

/**
 * Helper to get all FCM tokens for a specific user ID
 */
async function getUserTokens(userId: string): Promise<string[]> {
  const userDoc = await admin.firestore().collection("users").doc(userId).get();
  if (!userDoc.exists) return [];

  const data = userDoc.data();
  return collectTokensFromUser(data);
}

/**
 * Helper to get all FCM tokens for a specific user email.
 */
async function getUserTokensByEmail(email: string): Promise<string[]> {
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized) return [];

  const usersSnapshot = await admin.firestore()
    .collection("users")
    .where("email", "==", normalized)
    .limit(1)
    .get();

  if (usersSnapshot.empty) return [];
  const data = usersSnapshot.docs[0].data();
  return collectTokensFromUser(data);
}

async function pruneInvalidToken(token: string): Promise<void> {
  const usersRef = admin.firestore().collection("users");
  const [directTokenDocs, arrayTokenDocs] = await Promise.all([
    usersRef.where("fcmToken", "==", token).get(),
    usersRef.where("fcmTokens", "array-contains", token).get(),
  ]);

  const writeOps: Array<Promise<FirebaseFirestore.WriteResult>> = [];

  directTokenDocs.forEach((userDoc) => {
    const data = userDoc.data() || {};
    const updateData: Record<string, unknown> = {
      fcmToken: admin.firestore.FieldValue.delete(),
    };
    const platformTokens = (data as any).fcmPlatformTokens;
    if (platformTokens?.web?.token === token) {
      updateData["fcmPlatformTokens.web"] = admin.firestore.FieldValue.delete();
    }
    if (platformTokens?.native?.token === token) {
      updateData["fcmPlatformTokens.native"] = admin.firestore.FieldValue.delete();
    }
    const deviceTokens = (data as any).fcmDeviceTokens || {};
    Object.entries(deviceTokens).forEach(([deviceId, entry]: [string, any]) => {
      if (entry?.token === token) {
        updateData[`fcmDeviceTokens.${deviceId}`] = admin.firestore.FieldValue.delete();
      }
    });
    writeOps.push(userDoc.ref.update(updateData));
  });

  arrayTokenDocs.forEach((userDoc) => {
    const data = userDoc.data() || {};
    const updateData: Record<string, unknown> = {
      fcmTokens: admin.firestore.FieldValue.arrayRemove(token),
    };
    const platformTokens = (data as any).fcmPlatformTokens;
    if (platformTokens?.web?.token === token) {
      updateData["fcmPlatformTokens.web"] = admin.firestore.FieldValue.delete();
    }
    if (platformTokens?.native?.token === token) {
      updateData["fcmPlatformTokens.native"] = admin.firestore.FieldValue.delete();
    }
    const deviceTokens = (data as any).fcmDeviceTokens || {};
    Object.entries(deviceTokens).forEach(([deviceId, entry]: [string, any]) => {
      if (entry?.token === token) {
        updateData[`fcmDeviceTokens.${deviceId}`] = admin.firestore.FieldValue.delete();
      }
    });
    writeOps.push(userDoc.ref.update(updateData));
  });

  if (writeOps.length > 0) {
    await Promise.all(writeOps);
  }
}

async function cleanupInvalidTokens(
  tokens: string[],
  responses: admin.messaging.SendResponse[],
): Promise<void> {
  const invalidCodes = new Set([
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
  ]);

  const invalidTokens = new Set<string>();
  responses.forEach((response, idx) => {
    if (response.success) return;
    const code = (response.error as any)?.code || (response.error as any)?.errorInfo?.code || "";
    if (invalidCodes.has(code) && tokens[idx]) {
      invalidTokens.add(tokens[idx]);
    }
  });

  if (invalidTokens.size === 0) return;

  await Promise.all(Array.from(invalidTokens).map((token) => pruneInvalidToken(token)));
  logger.info("Invalid FCM tokens pruned", { count: invalidTokens.size });
}

async function sendMulticastWithCleanup(
  message: admin.messaging.MulticastMessage,
): Promise<admin.messaging.BatchResponse> {
  const { tokens, ...restMessage } = message;
  if (!tokens || tokens.length === 0) {
    return {
      successCount: 0,
      failureCount: 0,
      responses: [],
    };
  }

  const responses = await Promise.all(tokens.map(async (token) => {
    try {
      const messageId = await admin.messaging().send({
        ...restMessage,
        token,
      });
      return {
        success: true,
        messageId,
      } as admin.messaging.SendResponse;
    } catch (error) {
      return {
        success: false,
        error: error as any,
      } as admin.messaging.SendResponse;
    }
  }));

  const successCount = responses.filter((r) => r.success).length;
  const failureCount = responses.length - successCount;
  await cleanupInvalidTokens(tokens, responses);

  return {
    responses,
    successCount,
    failureCount,
  };
}


/**
 * Send push notification when a new order is created
 * Notifies admin users about new orders
 * AND sends confirmation email to client
 */
export const notifyNewOrder = onDocumentCreated("orders/{orderId}", async (event) => {
  const orderData = event.data?.data();
  if (!orderData) return null;

  const orderId = event.params.orderId;
  logger.info("New order created", { orderId });

  // Email se envía al confirmar el pago (ver notifyOrderUpdate, status=Pagado)

  try {
    const tokenList = await getAdminTokens();
    if (tokenList.length === 0) {
      logger.info("No admin tokens found, skipping notification");
      return null;
    }
    // ... (rest of the existing function)


    const amount = orderData.destinationAmount || orderData.vesAmount || 0;
    const bank = orderData.bank || 'N/A';
    const formattedAmount = amount.toLocaleString('es-VE', { minimumFractionDigits: 2 });

    const payload = {
      notification: {
        title: "Nuevo Pedido Recibido",
        body: `Pedido de ${orderData.clientName || orderData.name || "Cliente"}. Banco: ${bank}. Monto: ${formattedAmount} VES`,
      },
      data: {
        orderID: orderId,
        type: "new_order",
        status: orderData.status,
      },
      webpush: {
        notification: {
          title: "Nuevo Pedido Recibido",
          body: `Pedido de ${orderData.clientName || orderData.name || "Cliente"}. Banco: ${bank}. Monto: ${formattedAmount} VES`,
          icon: "/images/icon-192x192.png",
          vibrate: [200, 100, 200, 100, 200, 100, 200],
          requireInteraction: true,
        },
        fcmOptions: {
          link: "/"
        }
      },
      apns: { payload: { aps: { sound: "default" } } },
      android: {
        priority: "high" as const,
        notification: {
          channelId: "manzano_alerts_v1",
          sound: "default",
          icon: "ic_stat_notification",
          color: "#8cb33e",
        },
      },
    };

    const response = await sendMulticastWithCleanup({
      tokens: tokenList,
      ...payload,
    });

    logger.info(`Sent ${response.successCount} notifications, ${response.failureCount} failed`);
    return response;
  } catch (error) {
    logger.error("Error sending new order notification:", error);
    return null;
  }
});

/**
 * Send push notification when a new wholesale purchase is registered.
 * Notifies specifically A1 (enderjpinar@gmail.com) and A2 (namv2210@gmail.com).
 */
export const notifyNewWholesalePurchase = onDocumentCreated("wholesale_purchases/{purchaseId}", async (event) => {
  const data = event.data?.data();
  if (!data) return null;

  const purchaseId = event.params.purchaseId;
  logger.info("New wholesale purchase created", { purchaseId });

  try {
    const adminEmails = ["enderjpinar@gmail.com", "namv2210@gmail.com"];
    const tokens = new Set<string>();

    for (const email of adminEmails) {
      const userTokens = await getUserTokensByEmail(email);
      userTokens.forEach(t => tokens.add(t));
    }

    const tokenList = Array.from(tokens);
    if (tokenList.length === 0) {
      logger.info("No tokens found for A1/A2 admins, skipping wholesale notification");
      return null;
    }

    const usdtAmount = data.usdtNeeded || 0;
    const formattedAmount = usdtAmount.toLocaleString('en-US', { minimumFractionDigits: 2 });

    // Explicit requested format: "Se ha registrado COMPRA de X CANTIDAD de USDT"
    const notificationBody = `Se ha registrado Compra de 💲${formattedAmount} de USDT`;

    const payload = {
      notification: {
        title: "Nueva Compra Mayorista",
        body: notificationBody,
      },
      data: {
        purchaseID: purchaseId,
        type: "wholesale_purchase",
      },
      webpush: {
        notification: {
          title: "Nueva Compra Mayorista",
          body: notificationBody,
          icon: "/images/icon-192x192.png",
          vibrate: [200, 100, 200, 100, 200, 100, 200],
          requireInteraction: true,
        },
        fcmOptions: {
          link: "/"
        }
      },
      apns: { payload: { aps: { sound: "default" } } },
      android: {
        priority: "high" as const,
        notification: {
          channelId: "manzano_alerts_v1",
          sound: "default",
          icon: "ic_stat_notification",
          color: "#8cb33e",
        },
      },
    };

    const response = await sendMulticastWithCleanup({
      tokens: tokenList,
      ...payload,
    });

    logger.info(`Sent ${response.successCount} wholesale notifications, ${response.failureCount} failed`);
    return response;
  } catch (error) {
    logger.error("Error sending wholesale notification:", error);
    return null;
  }
});

/**
 * Send push notification when an order status is updated
 */
export const notifyOrderUpdate = onDocumentUpdated(
  { document: "orders/{orderId}", secrets: [brevoApiKey] },
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    if (!beforeData || !afterData) return null;

    const orderId = event.params.orderId;
    if (beforeData.status === afterData.status) return null;

    try {
      const tokens = new Set<string>();
      const recipients: string[] = [];

      if (afterData.userId) {
        const userTokens = await getUserTokens(afterData.userId);
        userTokens.forEach(t => tokens.add(t));
        recipients.push(`userId:${afterData.userId}`);
      }

      if (afterData.sellerId && afterData.sellerId !== afterData.userId) {
        const sellerTokens = await getUserTokens(afterData.sellerId);
        sellerTokens.forEach(t => tokens.add(t));
        recipients.push(`sellerId:${afterData.sellerId}`);
      }

      // Fallback for legacy/admin-created orders that do not store userId/sellerId.
      if (tokens.size === 0 && typeof afterData.createdByTag === "string" && afterData.createdByTag.trim()) {
        const creatorTokens = await getUserTokensByEmail(afterData.createdByTag);
        creatorTokens.forEach(t => tokens.add(t));
        recipients.push(`createdByTag:${afterData.createdByTag.trim().toLowerCase()}`);
      }

      const tokenList = Array.from(tokens);
      if (tokenList.length === 0) {
        logger.info("No recipient tokens found for order update", {
          orderId,
          beforeStatus: beforeData.status,
          afterStatus: afterData.status,
          userId: afterData.userId || null,
          sellerId: afterData.sellerId || null,
          createdByTag: afterData.createdByTag || null,
        });
        return null;
      }

      let notificationBody = "";
      const clientName = afterData.clientName || afterData.name || "Cliente";

      if (afterData.status === "Pagado") {
        notificationBody = `El pedido de ${clientName} ha sido procesado y pagado. ${afterData.vesAmount || 0} VES`;

        // Enviar email de confirmación al cliente
        const key = brevoApiKey.value();
        if (key) {
          sendOrderConfirmation(key, orderId, afterData)
            .catch(err => logger.error("Email confirmation failed", { orderId, err: err.message }));
        } else {
          logger.warn("BREVO_API_KEY secret not available, skipping email", { orderId });
        }
      } else if (afterData.status === "Cancelado") {
        notificationBody = `El pedido de ${clientName} ha sido cancelado.`;
      } else if (afterData.status === "Pendiente de pago") {
        notificationBody = `El pedido de ${clientName} está pendiente de pago.`;
      }

      if (!notificationBody) return null;

      const response = await sendMulticastWithCleanup({
        tokens: tokenList,
        notification: {
          title: "Actualización de Pedido",
          body: notificationBody,
        },
        data: {
          orderID: orderId,
          type: "order_update",
          status: afterData.status,
        },
        webpush: {
          notification: {
            title: "Actualización de Pedido",
            body: notificationBody,
            icon: "/images/icon-192x192.png",
            vibrate: [200, 100, 200, 100, 200, 100, 200],
            requireInteraction: true,
          },
          fcmOptions: {
            link: "/"
          }
        },
        apns: { payload: { aps: { sound: "default" } } },
        android: {
          priority: "high" as const,
          notification: {
            channelId: "manzano_alerts_v1",
            sound: "default",
            icon: "ic_stat_notification",
            color: "#8cb33e",
          },
        },
      });
      logger.info("Order update notifications sent", {
        orderId,
        status: afterData.status,
        recipients,
        successCount: response.successCount,
        failureCount: response.failureCount,
      });
      return response;
    } catch (error) {
      logger.error("Error sending order update notification:", error);
      return null;
    }
  });

/**
 * Send push notification when exchange rate is updated
 */
export const notifyExchangeRateUpdate = onDocumentUpdated("config/exchangeRate", async (event) => {
  const beforeData = event.data?.before.data();
  const afterData = event.data?.after.data();
  if (!beforeData || !afterData || beforeData.rate === afterData.rate) return null;

  try {
    const usersSnapshot = await admin.firestore()
      .collection("users")
      .where("fcmToken", "!=", null)
      .get();

    const tokens: string[] = [];
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.fcmToken) tokens.push(data.fcmToken);
    });

    if (tokens.length === 0) return null;

    const payload = {
      notification: {
        title: "Tasa de Cambio Actualizada",
        body: `Nueva tasa: 1 CLP = ${afterData.rate} VES`,
      },
      data: {
        type: "exchange_rate_update",
        newRate: afterData.rate.toString(),
      },
      webpush: {
        notification: {
          title: "Tasa de Cambio Actualizada",
          body: `Nueva tasa: 1 CLP = ${afterData.rate} VES`,
          icon: "/images/icon-192x192.png",
          vibrate: [200, 100, 200, 100, 200, 100, 200],
          requireInteraction: true,
        },
        fcmOptions: {
          link: "/"
        }
      },
      apns: { payload: { aps: { sound: "default" } } },
      android: {
        priority: 'high' as const,
        notification: {
          channelId: "manzano_alerts_v1",
          sound: 'default',
          icon: 'ic_stat_notification',
          color: '#8cb33e'
        }
      }
    };

    const batchSize = 500;
    const promises = [];
    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      promises.push(sendMulticastWithCleanup({ tokens: batch, ...payload }));
    }

    const results = await Promise.all(promises);
    return results;
  } catch (error) {
    logger.error("Error sending exchange rate notification:", error);
    return null;
  }
});

/**
 * Send push notification when balance is loaded
 */
export const notifyBalanceLoad = onDocumentCreated("balance_history/{historyId}", async (event) => {
  const data = event.data?.data();
  if (!data || data.type !== 'add') return null;

  const historyId = event.params.historyId;
  logger.info("Balance load detected", { historyId });

  try {
    const tokenList = await getAdminTokens();
    if (tokenList.length === 0) {
      logger.info("No admin tokens found, skipping balance notification");
      return null;
    }

    const amount = data.amount || 0;
    const holder = data.holder || 'N/A';
    const bank = data.bank || 'N/A';
    const formattedAmount = amount.toLocaleString('es-VE', { minimumFractionDigits: 2 });

    const payload = {
      notification: {
        title: "Saldo Cargado ✅",
        body: `Monto: ${formattedAmount} VES. A la cuenta de: ${holder}, Banco: ${bank}`,
      },
      data: {
        historyID: historyId,
        type: "balance_load",
      },
      webpush: {
        notification: {
          title: "Saldo Cargado ✅",
          body: `Monto: ${formattedAmount} VES. A la cuenta de: ${holder}, Banco: ${bank}`,
          icon: "/images/icon-192x192.png",
          vibrate: [200, 100, 200, 100, 200, 100, 200],
          requireInteraction: true,
        },
        fcmOptions: {
          link: "/"
        }
      },
      apns: { payload: { aps: { sound: "default" } } },
      android: {
        priority: "high" as const,
        notification: {
          channelId: "manzano_alerts_v1",
          sound: "default",
          icon: "ic_stat_notification",
          color: "#8cb33e",
        },
      },
    };

    const response = await sendMulticastWithCleanup({
      tokens: tokenList,
      ...payload,
    });

    logger.info(`Sent ${response.successCount} balance notifications, ${response.failureCount} failed`);
    return response;
  } catch (error) {
    logger.error("Error sending balance load notification:", error);
    return null;
  }
});

/**
 * =========================================================
 * PROXY PARA BINANCE VPS (Bypass HTTPS Mixed Content)
 * Redirige llamadas de React (HTTPS) al HTTP del VPS
 * =========================================================
 */
export const binanceVpsProxy = onRequest(
    { cors: false },
    async (req, res) => {
        // Configuracion explicita de CORS para permitir headers personalizados como x-vps-token
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-vps-token');
        
        if (req.method === 'OPTIONS') {
            res.status(204).send('');
            return;
        }

        try {
            const axios = require('axios');
            const vpsIp = "http://165.227.158.59:3005";
            
            // Reparacion de path: Firebase a veces deja el nombre de la funcion en req.url
            let cleanPath = req.url.split('?')[0].replace('/binanceVpsProxy', '');
            
            // Si el front manda /balance, mapeamos a /api/balance para el VPS
            if (cleanPath === '/balance') cleanPath = '/api/balance';
            if (cleanPath === '/p2p-rate') cleanPath = '/api/p2p-rate';

            // Reconstruir query string si existe
            const queryString = req.url.includes('?') ? '?' + req.url.split('?')[1] : '';
            const targetUrl = `${vpsIp}${cleanPath}${queryString}`;
            
            logger.info(`Proxying ${req.method} to: ${targetUrl}`);

            const proxyResponse = await axios({
                method: req.method,
                url: targetUrl,
                data: req.body,
                headers: {
                    'x-vps-token': req.header('x-vps-token') || 'un_token_largo_y_secreto_para_manzano'
                },
                validateStatus: () => true // Permitir 401, 404, etc. para que el front los maneje
            });

            res.status(proxyResponse.status).send(proxyResponse.data);
        } catch (error) {
            logger.error("Error critico en Proxy VPS:", error);
            res.status(500).json({ error: "Fallo comunicacion con el VPS de Binance.", details: String(error) });
        }
    }
);
