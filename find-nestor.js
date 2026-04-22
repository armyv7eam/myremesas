const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
    credential: cert(serviceAccount)
});

const auth = getAuth();

async function findUser() {
    const email = 'namv2210@gmail.com';
    try {
        const user = await auth.getUserByEmail(email);
        console.log(`User: ${user.displayName} | Email: ${user.email} | UID: ${user.uid} | Claims: ${JSON.stringify(user.customClaims || {})}`);
    } catch (e) {
        console.error(`Error: User with email ${email} not found.`);
    }
}

findUser().catch(console.error);
