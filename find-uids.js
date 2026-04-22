const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
    credential: cert(serviceAccount)
});

const auth = getAuth();

async function findUsers() {
    const listUsersResult = await auth.listUsers(1000);
    const targets = ['ender', 'nestor'];
    
    console.log('--- BUSCANDO UIDs ---');
    listUsersResult.users.forEach((user) => {
        const name = (user.displayName || '').toLowerCase();
        const email = (user.email || '').toLowerCase();
        
        if (targets.some(t => name.includes(t) || email.includes(t))) {
            console.log(`User: ${user.displayName} | Email: ${user.email} | UID: ${user.uid} | Claims: ${JSON.stringify(user.customClaims || {})}`);
        }
    });
}

findUsers().catch(console.error);
