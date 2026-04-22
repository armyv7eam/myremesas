const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();
const auth = getAuth();

async function fixOrders() {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 48);

    const snapshot = await db.collection('orders')
        .where('createdAt', '>=', twentyFourHoursAgo)
        .get();

    console.log(`Checking ${snapshot.size} recent orders...`);

    let sellerFixes = 0;
    let clientFixes = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();

        if (!data.userId && !data.sellerId) continue;

        // Let's check the role of the creator
        // We know that `createdByTag` usually holds the email.
        const uid = data.userId || data.sellerId;

        try {
            const userRecord = await auth.getUser(uid);
            const claims = userRecord.customClaims || {};

            if (claims.seller) {
                // Should be sellerId, not userId
                if (data.userId) {
                    await doc.ref.update({
                        sellerId: uid,
                        userId: require('firebase-admin').firestore.FieldValue.delete()
                    });
                    sellerFixes++;
                    console.log(`Fixed order ${doc.id} (converted userId to sellerId)`);
                }
            } else if (claims.admin) {
                // Admins typically have no userId or sellerId in legacy
                // but we might just leave them alone.
            } else {
                // Regular Client
                if (data.sellerId) {
                    await doc.ref.update({
                        userId: uid,
                        sellerId: require('firebase-admin').firestore.FieldValue.delete()
                    });
                    clientFixes++;
                    console.log(`Fixed order ${doc.id} (converted sellerId to userId)`);
                }
            }
        } catch (e) {
            console.error(`Error fetching user ${uid}:`, e.message);
        }
    }

    console.log(`Done. Fixed ${sellerFixes} sellers and ${clientFixes} clients.`);
}

fixOrders().catch(console.error);
