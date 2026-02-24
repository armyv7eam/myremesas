
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function checkOrder() {
    const orderId = '6dFdlUH62sUmh0fOL5wK';
    const doc = await db.collection('orders').doc(orderId).get();
    if (!doc.exists) {
        console.log('Order not found');
        return;
    }
    const data = doc.data();
    console.log('Order Data:', JSON.stringify(data, null, 2));

    // Check if it's from today (Chile time)
    const createdAt = data.createdAt.toDate();
    console.log('Created At:', createdAt.toISOString());
}

checkOrder();
