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
  // Si no se inicializa, las funciones fallarán, lo cual es manejado en el handler.
}
/**
 * Middleware para verificar el token de autenticación de Firebase.
 * Extrae el UID del usuario y lo añade al request.
 */
async function authenticate(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw { status: 401, message: 'Token de autenticación no proporcionado o con formato incorrecto.' };
  }
  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    req.userId = decodedToken.uid; // Añade el UID al objeto de la solicitud
  } catch (error) {
    throw { status: 403, message: 'Token inválido o expirado.' };
  }
}

/**
 * Handler principal para la API de órdenes.
 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!db) {
    return res.status(500).json({ success: false, message: 'Error de configuración del servidor: la base de datos no está disponible.' });
  }

  try {
    await authenticate(req); // Protege todas las rutas de órdenes
    const { userId } = req;
    const appId = 'myremesas-app'; // Asumiendo un ID de aplicación estático
    const transactionsCollection = db.collection(`artifacts/${appId}/users/${userId}/transactions`);

    // --- Enrutador de Métodos HTTP ---

    // POST /api/orders - Crear una nueva orden
    if (req.method === 'POST') {
      const orderData = req.body;

      // Validación básica
      if (!orderData || !orderData.amount || !orderData.recipient) {
        return res.status(400).json({ success: false, message: 'Faltan datos en la orden.' });
      }

      const newOrder = {
        ...orderData,
        userId,
        status: 'PENDING_PAYMENT', // Estado inicial
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const docRef = await transactionsCollection.add(newOrder);
      return res.status(201).json({ success: true, id: docRef.id, ...newOrder });
    }

    // GET /api/orders - Obtener historial de órdenes del usuario
    if (req.method === 'GET') {
      const snapshot = await transactionsCollection.orderBy('createdAt', 'desc').get();
      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return res.status(200).json({ success: true, orders });
    }

    // PUT /api/orders/:id - Actualizar una orden (ej: adjuntar comprobante)
    if (req.method === 'PUT') {
      const orderId = req.url.split('/').pop();
      const { proofOfPaymentUrl, status } = req.body;

      if (!orderId) {
        return res.status(400).json({ success: false, message: 'Falta el ID de la orden.' });
      }

      const updateData = { updatedAt: new Date().toISOString() };
      if (proofOfPaymentUrl) updateData.proofOfPaymentUrl = proofOfPaymentUrl;
      if (status) updateData.status = status; // Ej: 'PENDING_VERIFICATION'

      await transactionsCollection.doc(orderId).update(updateData);
      return res.status(200).json({ success: true, message: `Orden ${orderId} actualizada.` });
    }

    // Si no es GET, POST o PUT
    return res.status(405).json({ success: false, message: 'Método no permitido.' });

  } catch (error) {
    console.error('Error en API de órdenes:', error);
    return res.status(error.status || 500).json({ success: false, message: error.message || 'Error interno del servidor.' });
  }
};