"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyBalanceLoad = exports.notifyExchangeRateUpdate = exports.notifyOrderUpdate = exports.notifyNewOrder = exports.validateAndSignIn = exports.setAdminClaim = exports.helloWorld = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const logger = __importStar(require("firebase-functions/logger"));
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
/**
 * A simple placeholder function to ensure deployment works.
 */
exports.helloWorld = (0, https_1.onRequest)((request, response) => {
    logger.info("Hello logs!", { structuredData: true });
    response.send("Hello from Firebase! Your functions are deploying correctly.");
});
/**
 * Sets a custom claim for a user to make them an admin.
 */
exports.setAdminClaim = (0, https_1.onCall)(async (request) => {
    if (request.auth?.token?.admin !== true) {
        logger.warn(`Non-admin user ${request.auth?.uid || "unauthenticated"} tried to set admin claim.`);
        throw new https_1.HttpsError("permission-denied", "Only admins can set other admins.");
    }
    const email = request.data.email;
    if (!email) {
        throw new https_1.HttpsError("invalid-argument", "The function must be called with an 'email' argument.");
    }
    try {
        const user = await admin.auth().getUserByEmail(email);
        await admin.auth().setCustomUserClaims(user.uid, { admin: true });
        logger.info(`Successfully made ${email} an admin.`);
        return { message: `Success! ${email} has been made an admin.` };
    }
    catch (error) {
        logger.error("Error setting custom claim:", { email, error: error.message });
        throw new https_1.HttpsError("internal", "An internal error occurred while setting the admin claim.");
    }
});
/**
 * Validates a native Firebase Auth token and returns a custom token for Web SDK.
 */
exports.validateAndSignIn = (0, https_1.onCall)(async (request) => {
    const { nativeToken } = request.data;
    if (!nativeToken) {
        throw new https_1.HttpsError("invalid-argument", "The function must be called with a 'nativeToken' argument.");
    }
    try {
        const decodedToken = await admin.auth().verifyIdToken(nativeToken);
        logger.info(`Token validated for user: ${decodedToken.uid}`);
        const customClaims = {};
        if (decodedToken.admin)
            customClaims.admin = true;
        if (decodedToken.seller)
            customClaims.seller = true;
        if (decodedToken.requiresProof)
            customClaims.requiresProof = true;
        if (decodedToken.commissionRate)
            customClaims.commissionRate = decodedToken.commissionRate;
        const customToken = await admin.auth().createCustomToken(decodedToken.uid, customClaims);
        logger.info(`Custom token created for user: ${decodedToken.uid}`, { claims: customClaims });
        return {
            customToken,
            uid: decodedToken.uid,
            claims: customClaims
        };
    }
    catch (error) {
        logger.error("Error validating native token:", { error: error.message });
        throw new https_1.HttpsError("unauthenticated", "Invalid or expired token.");
    }
});
/**
 * Helper to get all admin FCM tokens
 */
async function getAdminTokens() {
    const adminsSnapshot = await admin.firestore()
        .collection("users")
        .where("isAdmin", "==", true)
        .get();
    const tokens = new Set();
    adminsSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.fcmToken)
            tokens.add(data.fcmToken);
        if (Array.isArray(data.fcmTokens)) {
            data.fcmTokens.forEach((t) => tokens.add(t));
        }
    });
    return Array.from(tokens);
}
/**
 * Helper to get all FCM tokens for a specific user ID
 */
async function getUserTokens(userId) {
    const userDoc = await admin.firestore().collection("users").doc(userId).get();
    if (!userDoc.exists)
        return [];
    const data = userDoc.data();
    const tokens = new Set();
    if (data?.fcmToken)
        tokens.add(data.fcmToken);
    if (Array.isArray(data?.fcmTokens)) {
        data?.fcmTokens.forEach((t) => tokens.add(t));
    }
    return Array.from(tokens);
}
/**
 * Send push notification when a new order is created
 * Notifies admin users about new orders
 */
// ... (previous imports)
// ... (existing code)
/**
 * Send push notification when a new order is created
 * Notifies admin users about new orders
 * AND sends confirmation email to client
 */
exports.notifyNewOrder = (0, firestore_1.onDocumentCreated)("orders/{orderId}", async (event) => {
    const orderData = event.data?.data();
    if (!orderData)
        return null;
    const orderId = event.params.orderId;
    logger.info("New order created", { orderId });
    // 1. Send Email Confirmation
    // REMOVED per user request: Email only sent on Payment Confirmation.
    // sendOrderConfirmation(orderId, orderData).catch(err => logger.error("Email send failed", err));
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
        const response = await admin.messaging().sendEachForMulticast({
            tokens: tokenList,
            ...payload,
        });
        logger.info(`Sent ${response.successCount} notifications, ${response.failureCount} failed`);
        return response;
    }
    catch (error) {
        logger.error("Error sending new order notification:", error);
        return null;
    }
});
/**
 * Send push notification when an order status is updated
 */
exports.notifyOrderUpdate = (0, firestore_1.onDocumentUpdated)("orders/{orderId}", async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    if (!beforeData || !afterData)
        return null;
    const orderId = event.params.orderId;
    if (beforeData.status === afterData.status)
        return null;
    try {
        const tokens = new Set();
        if (afterData.userId) {
            const userTokens = await getUserTokens(afterData.userId);
            userTokens.forEach(t => tokens.add(t));
        }
        if (afterData.sellerId && afterData.sellerId !== afterData.userId) {
            const sellerTokens = await getUserTokens(afterData.sellerId);
            sellerTokens.forEach(t => tokens.add(t));
        }
        const tokenList = Array.from(tokens);
        if (tokenList.length === 0)
            return null;
        let notificationBody = "";
        const clientName = afterData.clientName || afterData.name || "Cliente";
        if (afterData.status === "Pagado") {
            notificationBody = `El pedido de ${clientName} ha sido procesado y pagado. ${afterData.vesAmount || 0} VES`;
        }
        else if (afterData.status === "Cancelado") {
            notificationBody = `El pedido de ${clientName} ha sido cancelado.`;
        }
        else if (afterData.status === "Pendiente de pago") {
            notificationBody = `El pedido de ${clientName} está pendiente de pago.`;
        }
        if (!notificationBody)
            return null;
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
                priority: "high",
                notification: {
                    channelId: "high_priority",
                    sound: "default",
                    icon: "ic_stat_notification",
                    color: "#8cb33e",
                },
            },
        });
        return response;
    }
    catch (error) {
        logger.error("Error sending order update notification:", error);
        return null;
    }
});
/**
 * Send push notification when exchange rate is updated
 */
exports.notifyExchangeRateUpdate = (0, firestore_1.onDocumentUpdated)("config/exchangeRate", async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    if (!beforeData || !afterData || beforeData.rate === afterData.rate)
        return null;
    try {
        const usersSnapshot = await admin.firestore()
            .collection("users")
            .where("fcmToken", "!=", null)
            .get();
        const tokens = [];
        usersSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.fcmToken)
                tokens.push(data.fcmToken);
        });
        if (tokens.length === 0)
            return null;
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
                priority: 'high',
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
    }
    catch (error) {
        logger.error("Error sending exchange rate notification:", error);
        return null;
    }
});
/**
 * Send push notification when balance is loaded
 */
exports.notifyBalanceLoad = (0, firestore_1.onDocumentCreated)("balance_history/{historyId}", async (event) => {
    const data = event.data?.data();
    if (!data || data.type !== 'add')
        return null;
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
                priority: "high",
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
    }
    catch (error) {
        logger.error("Error sending balance load notification:", error);
        return null;
    }
});
//# sourceMappingURL=index.js.map