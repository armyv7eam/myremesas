const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function checkOrders() {
    const orders = ['19518799', '10854368']; // From screenshot
    console.log('Checking orders:', orders);

    const snapshot = await db.collection('orders')
        .where('cedula', 'in', orders) // Wait, are these IDs or Cedulas? 
        // In the screenshot: ID: 19518799. Cedula is not visible but ID is.
        // But Firestore IDs are usually random. Maybe they are stored as a field 'id'?
        .get();

    if (snapshot.empty) {
        // Try searching by specific field if 'id' exists
        console.log('No orders found by cedula field matching these numeric strings. Trying search by "id" field...');
        const snapshot2 = await db.collection('orders').where('id', 'in', orders).get();
        if (snapshot2.empty) {
            console.log('No orders found by "id" field. Trying to list today\'s orders to find them.');
            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
            const snapshot3 = await db.collection('orders')
                .where('createdAt', '>=', startOfDay)
                .get();

            snapshot3.forEach(doc => {
                const data = doc.data();
                if (data.cedula && orders.includes(data.cedula)) {
                    console.log('Found by cedula:', doc.id, JSON.stringify(data, null, 2));
                } else if (data.id && orders.includes(data.id)) {
                    console.log('Found by id field:', doc.id, JSON.stringify(data, null, 2));
                } else if (orders.some(o => doc.id.includes(o))) {
                    console.log('Found by docId partial:', doc.id, JSON.stringify(data, null, 2));
                }
            });
        } else {
            snapshot2.forEach(doc => console.log('Found by id field:', doc.id, JSON.stringify(doc.data(), null, 2)));
        }
    } else {
        snapshot.forEach(doc => console.log('Found by cedula:', doc.id, JSON.stringify(doc.data(), null, 2)));
    }
}

checkOrders().catch(console.error);
