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
exports.validateAndSignIn = exports.setAdminClaim = exports.helloWorld = void 0;
const logger = __importStar(require("firebase-functions/logger"));
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
// Una función de ejemplo "Hola Mundo" para verificar que todo funciona.
exports.helloWorld = functions.https.onRequest((request, response) => {
    logger.info("Hello logs!", { structuredData: true });
    response.send("Hello from Firebase!");
});
// Una función para asignar un rol de administrador a un usuario.
// Se invoca desde el cliente.
exports.setAdminClaim = functions.https.onCall(async (data, context) => {
    // Verifica que la solicitud la haga un usuario autenticado.
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    // Opcional: Verifica que el usuario que hace la llamada ya sea un administrador.
    // if (context.auth.token.admin !== true) {
    //   throw new functions.https.HttpsError(
    //     "permission-denied",
    //     "Only admins can set other users as admins.",
    //   );
    // }
    const email = data.email;
    try {
        const user = await admin.auth().getUserByEmail(email);
        await admin.auth().setCustomUserClaims(user.uid, { admin: true });
        return { message: `Success! ${email} has been made an admin.` };
    }
    catch (error) {
        logger.error("Error setting admin claim", error);
        throw new functions.https.HttpsError("internal", "Error setting admin claim.");
    }
});
/**
 * Validates a native Firebase Auth token and returns a custom token for Web SDK.
 * This enables native auth to work with Firestore security rules.
 *
 * Usage: Call from client after native authentication to get a custom token,
 * then use that token to sign in to Firebase Web SDK.
 */
exports.validateAndSignIn = functions.https.onCall(async (data, context) => {
    const nativeToken = data.nativeToken;
    if (!nativeToken) {
        throw new functions.https.HttpsError("invalid-argument", "The function must be called with a 'nativeToken' argument.");
    }
    try {
        // Verify the native token
        const decodedToken = await admin.auth().verifyIdToken(nativeToken);
        logger.info(`Token validated for user: ${decodedToken.uid}`);
        // Extract custom claims to preserve them
        const customClaims = {};
        if (decodedToken.admin)
            customClaims.admin = true;
        if (decodedToken.seller)
            customClaims.seller = true;
        if (decodedToken.requiresProof)
            customClaims.requiresProof = true;
        if (decodedToken.commissionRate)
            customClaims.commissionRate = decodedToken.commissionRate;
        // Create a custom token for Web SDK with preserved claims
        const customToken = await admin.auth().createCustomToken(decodedToken.uid, customClaims);
        logger.info(`Custom token created for user: ${decodedToken.uid}`, { claims: customClaims });
        return {
            customToken,
            uid: decodedToken.uid,
            claims: customClaims
        };
    }
    catch (error) {
        logger.error("Error validating native token:", error);
        throw new functions.https.HttpsError("unauthenticated", "Invalid or expired token.");
    }
});
//# sourceMappingURL=index.js.map