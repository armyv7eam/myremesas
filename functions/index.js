const {onRequest, onCall} = require("firebase-functions/v2/https");
const {HttpsError} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();

/**
 * A simple placeholder function to ensure deployment works.
 * You can remove this later if you don't need it.
 */
exports.helloWorld = onRequest((request, response) => {
  logger.info("Hello logs!", {structuredData: true});
  response.send("Hello from Firebase! Your functions are deploying correctly.");
});

/**
 * Sets a custom claim for a user to make them an admin.
 * This is a callable function, intended to be triggered from a client app.
 * NOTE: For security, you should protect this function. The best practice is
 * to ensure only an existing admin can call this function.
 */
exports.setAdminClaim = onCall(async (request) => {
  // v4 - Forcing a clean deploy after dependency reinstall.
  // Security check: Ensure the caller is an authenticated admin.
  if (request.auth?.token?.admin !== true) {
    logger.warn(`Non-admin user ${request.auth?.uid || "unauthenticated"} tried to set admin claim.`);
    throw new HttpsError("permission-denied", "Only admins can set other admins.");
  }

  const email = request.data.email;
  if (!email) {
    throw new HttpsError(
      "invalid-argument",
      "The function must be called with an 'email' argument."
    );
  }

  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    logger.info(`Successfully made ${email} an admin.`);
    return { message: `Success! ${email} has been made an admin.` };
  } catch (error) {
    logger.error("Error setting custom claim:", {email, error: error.message});
    // Avoid leaking internal error details to the client for security.
    throw new HttpsError("internal", "An internal error occurred while setting the admin claim.");
  }
});