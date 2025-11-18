const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

// --- Inicialización de Firebase Admin SDK ---
let db;
try {
  // Evita la reinicialización en entornos serverless
  if (getApps().length === 0) {
    const serviceAccount = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    initializeApp({
      credential: cert(serviceAccount),
    });
    console.log("Firebase Admin SDK inicializado para producción.");
  } else {
    // Si ya está inicializado (posiblemente por otro endpoint en el mismo proceso local)
    // no hacemos nada para evitar errores.
  }
  db = getFirestore();
} catch (error) {
  console.error("Error inicializando Firebase Admin SDK:", error.message);
}

/**
 * Middleware para verificar el token de autenticación de Firebase.
 */
async function authenticate(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw { status: 401, message: 'Token de autenticación no proporcionado.' };
  }
  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    req.userId = decodedToken.uid;
  } catch (error) {
    throw { status: 403, message: 'Token inválido o expirado.' };
  }
}

/**
 * Handler principal para la API de beneficiarios.
 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!db) {
    return res.status(500).json({ success: false, message: 'Error de configuración del servidor.' });
  }

  try {
    await authenticate(req);
    const { userId } = req;
    const appId = 'myremesas-app';
    const beneficiariesCollection = db.collection(`artifacts/${appId}/users/${userId}/beneficiaries`);

    // POST /api/beneficiaries - Crear un nuevo beneficiario
    if (req.method === 'POST') {
      const beneficiaryData = req.body;
      if (!beneficiaryData || !beneficiaryData.name || !beneficiaryData.accountNumber) {
        return res.status(400).json({ success: false, message: 'Faltan datos del beneficiario.' });
      }
      const docRef = await beneficiariesCollection.add(beneficiaryData);
      return res.status(201).json({ success: true, id: docRef.id, ...beneficiaryData });
    }

    // GET /api/beneficiaries - Obtener lista de beneficiarios
    if (req.method === 'GET') {
      const snapshot = await beneficiariesCollection.get();
      const beneficiaries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return res.status(200).json({ success: true, beneficiaries });
    }

    // DELETE /api/beneficiaries/:id - Eliminar un beneficiario
    if (req.method === 'DELETE') {
      const beneficiaryId = req.url.split('/').pop();
      if (!beneficiaryId) {
        return res.status(400).json({ success: false, message: 'Falta el ID del beneficiario.' });
      }
      await beneficiariesCollection.doc(beneficiaryId).delete();
      return res.status(200).json({ success: true, message: `Beneficiario ${beneficiaryId} eliminado.` });
    }

    return res.status(405).json({ success: false, message: 'Método no permitido.' });

  } catch (error) {
    console.error('Error en API de beneficiarios:', error);
    return res.status(error.status || 500).json({ success: false, message: error.message || 'Error interno del servidor.' });
  }
};