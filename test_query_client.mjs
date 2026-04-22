import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDLZBYfANw7o7FEOrw83PSrrQ7KmamAPEE",
    authDomain: "manzanoapp-2f775.firebaseapp.com",
    projectId: "manzanoapp-2f775",
    storageBucket: "manzanoapp-2f775.firebasestorage.app",
    messagingSenderId: "250652050778",
    appId: "1:250652050778:web:cb43d53c10989b046fdf63"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testQuery() {
    console.log("Querying balance_history...");
    const q = query(
        collection(db, 'balance_history'),
        orderBy('timestamp', 'desc'),
        limit(20)
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) {
        console.log("No recent records found in balance_history.");
    } else {
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const ts = data.timestamp ? data.timestamp.toDate() : null;
            console.log(`ID: ${doc.id}, type: ${data.type}, amt: ${data.amount}, date: ${ts}`);
        });
    }

    console.log("-----------------------------------------");
    console.log("Querying users for FCM tokens...");
    const uq = query(collection(db, 'users'), limit(10));
    const uSnapshot = await getDocs(uq);
    uSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.fcmToken || data.fcmTokens) {
            console.log(`User ${doc.id} (${data.email}): Has fcmToken=${!!data.fcmToken}, fcmTokensArray=${Array.isArray(data.fcmTokens) ? data.fcmTokens.length : 'no'}`);
        } else {
            console.log(`User ${doc.id} (${data.email}): No FCM tokens.`);
        }
    });

    process.exit(0);
}

testQuery().catch(console.error);
