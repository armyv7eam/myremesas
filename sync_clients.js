const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function syncClients() {
    console.log('Starting client sync from orders...');

    // Fetch orders from the last 48 hours to be safe
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const ordersSnapshot = await db.collection('orders')
        .where('createdAt', '>=', fortyEightHoursAgo)
        .get();

    console.log(`Found ${ordersSnapshot.size} recent orders.`);

    let syncedCount = 0;
    for (const orderDoc of ordersSnapshot.docs) {
        const order = orderDoc.data();
        if (order.cedula && order.clientName) {
            const cleanCedula = order.cedula.replace(/[^0-9]/g, '');
            const clientRef = db.collection('clients').doc(cleanCedula);

            const clientData = {
                clientName: order.clientName,
                cedula: cleanCedula,
                email: order.email || '',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            if (order.bank) clientData.bank = order.bank;
            if (order.accountNumber) clientData.accountNumber = order.accountNumber;
            if (order.accountType) clientData.accountType = order.accountType;
            if (order.phone) clientData.phone = order.phone;
            if (order.sellerId) clientData.sellerId = order.sellerId;
            if (order.userId) clientData.userId = order.userId;

            await clientRef.set(clientData, { merge: true });
            syncedCount++;
        }
    }

    console.log(`Successfully synced ${syncedCount} clients.`);
    process.exit(0);
}

syncClients().catch(err => {
    console.error('Error syncing clients:', err);
    process.exit(1);
});
