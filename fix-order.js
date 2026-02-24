
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function fixOrder() {
    const orderId = '6dFdlUH62sUmh0fOL5wK';
    const orderRef = db.collection('orders').doc(orderId);

    await orderRef.update({
        status: 'Pendiente de pago'
    });

    console.log(`Order ${orderId} status updated to "Pendiente de pago"`);
}

fixOrder();
