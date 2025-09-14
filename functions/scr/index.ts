import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

// Una función de ejemplo "Hola Mundo" para verificar que todo funciona.
export const helloWorld = functions.https.onRequest((request, response) => {
  logger.info("Hello logs!", {structuredData: true});
  response.send("Hello from Firebase!");
});

// Una función para asignar un rol de administrador a un usuario.
// Se invoca desde el cliente.
export const setAdminClaim = functions.https.onCall(async (data, context) => {
  // Verifica que la solicitud la haga un usuario autenticado.
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated.",
    );
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
    await admin.auth().setCustomUserClaims(user.uid, {admin: true});
    return {message: `Success! ${email} has been made an admin.`};
  } catch (error) {
    logger.error("Error setting admin claim", error);
    throw new functions.https.HttpsError("internal", "Error setting admin claim.");
  }
});