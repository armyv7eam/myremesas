import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

admin.initializeApp();

/**
 * A simple placeholder function to ensure deployment works.
 */
export const helloWorld = onRequest((request, response) => {
  logger.info("Hello logs!", { structuredData: true });
  response.send("Hello from Firebase! Your functions are deploying correctly.");
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
    if (data.fcmToken) tokens.add(data.fcmToken);
    if (Array.isArray(data.fcmTokens)) {
      data.fcmTokens.forEach((t: string) => tokens.add(t));
    }
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
  const tokens = new Set<string>();
  if (data?.fcmToken) tokens.add(data.fcmToken);
  if (Array.isArray(data?.fcmTokens)) {
    data?.fcmTokens.forEach((t: string) => tokens.add(t));
  }
  return Array.from(tokens);
}

/**
 * Send push notification when a new order is created
 * Notifies admin users about new orders
 */
export const notifyNewOrder = onDocumentCreated("orders/{orderId}", async (event) => {
  const orderData = event.data?.data();
  if (!orderData) return null;

  const orderId = event.params.orderId;
  logger.info("New order created", { orderId });

  try {
    const tokenList = await getAdminTokens();
    if (tokenList.length === 0) {
      logger.info("No admin tokens found, skipping notification");
      return null;
    }

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
      android: {
        priority: "high" as const,
        notification: {
          channelId: "high_priority",
          sound: "default",
          icon: "ic_stat_notification",
          color: "#8cb33e",
        },
      },
    };

    const response = await admin.messaging().sendEachForMulticast({
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
 * Send push notification when an order status is updated
 */
export const notifyOrderUpdate = onDocumentUpdated("orders/{orderId}", async (event) => {
  const beforeData = event.data?.before.data();
  const afterData = event.data?.after.data();
  if (!beforeData || !afterData) return null;

  const orderId = event.params.orderId;
  if (beforeData.status === afterData.status) return null;

  try {
    const tokens = new Set<string>();

    if (afterData.userId) {
      const userTokens = await getUserTokens(afterData.userId);
      userTokens.forEach(t => tokens.add(t));
    }

    if (afterData.sellerId && afterData.sellerId !== afterData.userId) {
      const sellerTokens = await getUserTokens(afterData.sellerId);
      sellerTokens.forEach(t => tokens.add(t));
    }

    const tokenList = Array.from(tokens);
    if (tokenList.length === 0) return null;

    let notificationBody = "";
    const clientName = afterData.clientName || afterData.name || "Cliente";

    if (afterData.status === "Pagado") {
      notificationBody = `El pedido de ${clientName} ha sido procesado y pagado. ${afterData.vesAmount || 0} VES`;
    } else if (afterData.status === "Cancelado") {
      notificationBody = `El pedido de ${clientName} ha sido cancelado.`;
    } else if (afterData.status === "Pendiente de pago") {
      notificationBody = `El pedido de ${clientName} está pendiente de pago.`;
    }

    if (!notificationBody) return null;

    const response = await admin.messaging().sendEachForMulticast({
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
      android: {
        priority: "high" as const,
        notification: {
          channelId: "high_priority",
          sound: "default",
          icon: "ic_stat_notification",
          color: "#8cb33e",
        },
      },
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
      android: {
        priority: 'high' as const,
        notification: {
          channelId: 'high_priority',
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
      promises.push(admin.messaging().sendEachForMulticast({ tokens: batch, ...payload }));
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
      android: {
        priority: "high" as const,
        notification: {
          channelId: "high_priority",
          sound: "default",
          icon: "ic_stat_notification",
          color: "#8cb33e",
        },
      },
    };

    const response = await admin.messaging().sendEachForMulticast({
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
