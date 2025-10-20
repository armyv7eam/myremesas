import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";

import { getAuth, signInAnonymously, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import { getFirestore, doc, addDoc, onSnapshot, collection, query, collectionGroup, serverTimestamp, setLogLevel, deleteDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";



// Establecer nivel de log para depuracin de Firestore

setLogLevel('debug');



// --- CONFIGURACIN DE SEGURIDAD ---

// Lista de User IDs de administradores autorizados para ver el panel.

// UIDs de administradores. Se pueden aadir ms separados por comas.
const ADMIN_UIDS_PLACEHOLDER = "R3QU4xRLmSQFiArCWWRwGBMEOhc2,R3QU4xRLmSQFiArCWWRwGBMEOhc2,71YiNOk9MOc6mNjxnnKBLST1Clh2";

const ADMIN_UIDS = ADMIN_UIDS_PLACEHOLDER.split(',').filter(uid => uid.trim() !== '');



// Variables Globales de Firebase (provistas por el entorno)

const appId = "1:775892034675:web:98ed2724bcaff2ed427606";

const firebaseConfig = {"apiKey":"AIzaSyCnXU8XU7ZzA_12CDaYaY9W2rWBmkGLB-g","authDomain":"studio-7601782447-44d81.firebaseapp.com","projectId":"studio-7601782447-44d81","storageBucket":"studio-7601782447-44d81.firebasestorage.app","messagingSenderId":"775892034675","appId":"1:775892034675:web:98ed2724bcaff2ed427606"};

const initialAuthToken = null; // No estamos usando este mtodo por ahora.



let db;

let auth;

let storage;

let userId = null;

let isAuthReady = false; // Esta variable debe ser global o pasada como argumento si se usa fuera de initializeFirebase





// Tasas de cambio en vivo / referenciales

let liveRates = {

    // Valores de Referencia Fijos (Fallback)

    WLD_to_USDT: 2.80,

    USDT_to_CLP: 950.00, // Tasa de Referencia (1 USDT = X CLP)

    USDT_to_VES: 36.50   // Tasa de Referencia (1 USDT = X VES)

};



// Cuentas de destino del administrador

let adminAccounts = []; 



// Configuracin de mrgenes (se puede sobrescribir desde Firestore)

const DEFAULT_MARGIN_CONFIG = {

    discountWldClp: 0.14,

    discountClpVes: 0.06,

    marginUsdtClp: 0.004,

};

const MARGIN_CONFIG_COLLECTION = 'config';

const MARGIN_CONFIG_DOC_ID = 'pricing';

let marginConfig = { ...DEFAULT_MARGIN_CONFIG };

let marginConfigUnsubscribe = null;



// --- DECLARACIN DE VARIABLES DEL DOM (INICIALIZACIN MOVIDA A initializeDOM) ---

let userIdDisplay, userIdContainer, authStatus, amountSendInput, currencySendSelect, currencyReceiveSelect, swapButton, amountReceiveDisplay, rateDisplay, paymentButton, errorMessage, historyContainer, loadingHistory, adminPanel, toggleAdminButton, rateFetchStatus, savedAccountsList, accountCount, wldUsdtDisplay, usdtClpP2pWldDisplay, clpUsdtP2pDisplay, vesUsdtP2pDisplay, usdtClpMarginDisplay, adminBankNameInput, adminAccountHolderInput, adminAccountNumberInput, adminRutInput, adminAccountTypeInput, adminEmailInput, saveAccountsButton, accountStatus, paymentModal, closeModalButton, modalAmountSend, modalAmountReceive, adminAccountDetailsContainer, noAccountsMessage, modalCryptoWarning, modalTransferCurrency, adminToggleContainer, marginWldClpInput, marginClpVesInput, marginUsdtClpInput, saveMarginsButton, marginStatus, marginWldClpLabel, marginClpVesLabel, marginUsdtClpLabel, receiptUploadInput, uploadReceiptButton, receiptUploadStatus, adminTransactionsSection, adminPendingTransactionsList, adminCompletedTransactionsList, usdtDestinationForm, usdtWalletInput, usdtNetworkSelect, usdtNotesInput, vesDestinationForm, vesBeneficiaryInput, vesIdInput, vesBankInput, vesAccountTypeInput, vesAccountNumberInput, vesNotesInput, imageViewerModal, closeImageViewerButton, imageViewerImg, imageViewerTitle, orderCreationSection, toggleOrderCreationButton;



let currentTransactionId = null;

let currentTransactionPath = null;

let isCurrentUserAdmin = false;

let adminTransactionsUnsubscribe = null;
let transactionListenerUnsubscribe = null;
let adminAccountsUnsubscribe = null;
// Nuevas variables para autenticacin por email
let authContainer, appContainer, authFormsSection, registerForm, loginForm, logoutButton, showRegisterButton, showLoginButton;
let registerStatus, loginStatus;
let usdtDestinationSaveTimeout = null;
let vesDestinationSaveTimeout = null;



/**

 * Inicializa todas las referencias a los elementos del DOM.

 */

function initializeDOM() {

    userIdDisplay = document.getElementById('user-id');

    userIdContainer = document.getElementById('user-id-display');

    authStatus = document.getElementById('auth-status');

    amountSendInput = document.getElementById('amount-send');

    currencySendSelect = document.getElementById('currency-send');

    currencyReceiveSelect = document.getElementById('currency-receive');

    swapButton = document.getElementById('swap-button');

    amountReceiveDisplay = document.getElementById('amount-receive-display');

    rateDisplay = document.getElementById('rate-display');

    paymentButton = document.getElementById('payment-button'); 

    errorMessage = document.getElementById('error-message');

    historyContainer = document.getElementById('transaction-history');

    loadingHistory = document.getElementById('loading-history');

    adminPanel = document.getElementById('admin-panel');

    toggleAdminButton = document.getElementById('toggle-admin-button');

    adminToggleContainer = document.getElementById('admin-toggle-container');

    rateFetchStatus = document.getElementById('rate-fetch-status');

    savedAccountsList = document.getElementById('saved-accounts-list');

    accountCount = document.getElementById('account-count');

    wldUsdtDisplay = document.getElementById('wld-usdt-display');

    usdtClpP2pWldDisplay = document.getElementById('usdt-clp-p2p-wld-display');

    clpUsdtP2pDisplay = document.getElementById('clp-usdt-p2p-display');

    vesUsdtP2pDisplay = document.getElementById('ves-usdt-p2p-display');

    usdtClpMarginDisplay = document.getElementById('usdt-clp-margin-display');

    adminBankNameInput = document.getElementById('admin-bank-name');

    adminAccountHolderInput = document.getElementById('admin-account-holder');

    adminAccountNumberInput = document.getElementById('admin-account-number');

    adminRutInput = document.getElementById('admin-rut');

    adminAccountTypeInput = document.getElementById('admin-account-type');

    adminEmailInput = document.getElementById('admin-email');

    saveAccountsButton = document.getElementById('save-accounts-button');

    accountStatus = document.getElementById('account-status');

    paymentModal = document.getElementById('payment-details-modal');

    closeModalButton = document.getElementById('close-modal-button');

    modalAmountSend = document.getElementById('modal-amount-send');

    modalAmountReceive = document.getElementById('modal-amount-receive');

    adminAccountDetailsContainer = document.getElementById('admin-account-details-container');

    noAccountsMessage = document.getElementById('no-accounts-message');

    modalCryptoWarning = document.getElementById('modal-crypto-warning');

    modalTransferCurrency = document.getElementById('modal-transfer-currency');

    marginWldClpInput = document.getElementById('margin-wld-clp');

    marginClpVesInput = document.getElementById('margin-clp-ves');

    marginUsdtClpInput = document.getElementById('margin-usdt-clp');

    saveMarginsButton = document.getElementById('save-margins-button');

    marginStatus = document.getElementById('margin-status');

    marginWldClpLabel = document.getElementById('margin-wld-clp-label');

    marginClpVesLabel = document.getElementById('margin-clp-ves-label');

    marginUsdtClpLabel = document.getElementById('margin-usdt-clp-label');

    receiptUploadInput = document.getElementById('receipt-upload');

    uploadReceiptButton = document.getElementById('upload-receipt-button');

    receiptUploadStatus = document.getElementById('receipt-upload-status');
    adminTransactionsSection = document.getElementById('admin-transactions-section');
    adminPendingTransactionsList = document.getElementById('admin-pending-transactions');
    adminCompletedTransactionsList = document.getElementById('admin-completed-transactions');

    usdtDestinationForm = document.getElementById('usdt-destination-form');

    usdtWalletInput = document.getElementById('usdt-wallet-input');

    usdtNetworkSelect = document.getElementById('usdt-network-select');

    usdtNotesInput = document.getElementById('usdt-notes-input');

    vesDestinationForm = document.getElementById('ves-destination-form');

    vesBeneficiaryInput = document.getElementById('ves-beneficiary-input');

    vesIdInput = document.getElementById('ves-id-input');

    vesBankInput = document.getElementById('ves-bank-input');

    vesAccountTypeInput = document.getElementById('ves-account-type-input');

    vesAccountNumberInput = document.getElementById('ves-account-number-input');

    vesNotesInput = document.getElementById('ves-notes-input');



    // **CORRECCIN**: Evita que el botn de pago enve el formulario por defecto.

    if (paymentButton) paymentButton.type = 'button';



    applyMarginConfigToUI();

    // Contenedores principales

    authContainer = document.getElementById('auth-container');

    appContainer = document.getElementById('app');



    // Elementos para autenticacin por email

    authFormsSection = document.getElementById('auth-forms');

    registerForm = document.getElementById('register-form');

    loginForm = document.getElementById('login-form');

    logoutButton = document.getElementById('logout-button');

    registerStatus = document.getElementById('register-status');

    loginStatus = document.getElementById('login-status');

    showRegisterButton = document.getElementById('show-register-form');

    showLoginButton = document.getElementById('show-login-form');

    imageViewerModal = document.getElementById('image-viewer-modal');

    closeImageViewerButton = document.getElementById('close-image-viewer-button');

    imageViewerImg = document.getElementById('image-viewer-img');

    imageViewerTitle = document.getElementById('image-viewer-title');

    orderCreationSection = document.getElementById('order-creation-section');

    toggleOrderCreationButton = document.getElementById('toggle-order-creation-button');
}



// --- Funciones de Utilidad y Firebase ---



async function initializeFirebase() {

    try {

        if (!firebaseConfig) {

            authStatus.textContent = "Error: Configuracin de Firebase no disponible.";

            return;

        }



        const app = initializeApp(firebaseConfig);

        db = getFirestore(app);

        auth = getAuth(app);

        storage = getStorage(app);



        onAuthStateChanged(auth, async (user) => {

            if (user && !user.isAnonymous) {

                // Usuario con email y contrasea

                authContainer.classList.add('hidden');

                appContainer.classList.remove('hidden');



                userId = user.uid;

                // Si el usuario no es annimo, muestra su email. Si no, muestra su UID.

                if (user.email) {

                    userIdDisplay.textContent = user.email;

                    if (authFormsSection) authFormsSection.classList.add('hidden'); // Oculta formularios de login/registro

                    logoutButton.classList.remove('hidden'); // Muestra botn de logout

                } else {

                    userIdDisplay.textContent = `Annimo (${userId.substring(0, 8)}...)`;

                    if (authFormsSection) authFormsSection.classList.remove('hidden'); // Muestra formularios

                    logoutButton.classList.add('hidden'); // Oculta botn de logout

                }

                userIdContainer.classList.remove('hidden');



                authStatus.textContent = "Autenticado. Listo para usar.";



                isAuthReady = true;





                const isAdminUser = ADMIN_UIDS.includes(userId);

                isCurrentUserAdmin = isAdminUser;

                if (isAdminUser) {

                    setupMarginConfigListener();

                    adminToggleContainer.classList.remove('hidden');

                    setupAdminTransactionsListener();
                    if (orderCreationSection) orderCreationSection.classList.add('hidden');

                } else {
                    if (orderCreationSection) orderCreationSection.classList.remove('hidden');

                    marginConfig = { ...DEFAULT_MARGIN_CONFIG };

                    applyMarginConfigToUI();

                    if (adminTransactionsSection) {

                        adminTransactionsSection.classList.add('hidden');

                        if (adminPendingTransactionsList) adminPendingTransactionsList.innerHTML = '';
                        if (adminCompletedTransactionsList) adminCompletedTransactionsList.innerHTML = '';

                    }

                }

                

                setupTransactionListener();

                setupAdminAccountsListener(); 

            } else {

                // No hay usuario logueado o es annimo. Mostrar formularios de registro/login.

                if (user && user.isAnonymous) {

                    await signOut(auth); // Cerramos sesin annima para forzar login/registro

                }

                userId = null;

                isCurrentUserAdmin = false;

                if(authStatus) authStatus.textContent = "Por favor, inicie sesin o regstrese.";

                if(userIdContainer) userIdContainer.classList.add('hidden');

                if(authFormsSection) authFormsSection.classList.remove('hidden');

                if(logoutButton) logoutButton.classList.add('hidden');



                // Ocultar y limpiar paneles de admin e historial

                if (adminPanel) adminPanel.classList.add('hidden');

                if (adminToggleContainer) adminToggleContainer.classList.add('hidden');

                if (historyContainer) historyContainer.innerHTML = '<p class="text-gray-500 text-sm p-2">Inicie sesin para ver su historial.</p>';

                if (adminTransactionsSection) adminTransactionsSection.classList.add('hidden');



                authContainer.classList.remove('hidden');

                appContainer.classList.add('hidden');



            }

        });

    } catch (error) {

        console.error("Error al inicializar o autenticar Firebase:", error);

        authStatus.textContent = `Error de Firebase: ${error.message}`;

    }

}

function formatCurrency(value, currencyCode) {

    if (currencyCode === 'WLD') {

        return `${value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 8 })} WLD`;

    }

    if (currencyCode === 'USDT') {

         return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USDT`;

    }

    if (currencyCode === 'VES') {

         return value.toLocaleString('es-VE', { style: 'currency', currency: 'VES', minimumFractionDigits: 2, maximumFractionDigits: 2 });

    }

    if (currencyCode === 'CLP') {

         return value.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0, maximumFractionDigits: 0 });

    }

    return value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

}



 /**

 * **NUEVA FUNCIÓN**: Copia texto al portapapeles y muestra feedback.

 */

function copyToClipboard(text, element) {

    const textArea = document.createElement('textarea');

    textArea.value = text;

    document.body.appendChild(textArea);

    textArea.select();

    try {

        document.execCommand('copy');

        const feedback = element.querySelector('.copy-feedback');

        if (feedback) {

            feedback.style.opacity = '1';

            feedback.style.transform = 'translateX(-50%) translateY(-5px)';

            setTimeout(() => {

                feedback.style.opacity = '0';

                feedback.style.transform = 'translateX(-50%)';

            }, 1500);

        }

    } catch (err) {

        console.error('Error al copiar texto: ', err);

    }

    document.body.removeChild(textArea);

}

/**

 * Genera el bloque de HTML para los detalles de una cuenta, con un interlineado ms ajustado

 * y un nico botn para copiar todos los datos.

 */

function buildAccountDetailsMarkup(account) {

    const details = [

        { label: 'Banco', value: account.bankName },

        { label: 'Titular', value: account.accountHolder },

        { label: 'RUT', value: account.rut },

        { label: 'Tipo', value: account.accountType },

        { label: 'Nmero', value: account.accountNumber },

    ];

    if (account.email && account.email !== 'N/A') {

        details.push({ label: 'Email', value: account.email });

    }



    const copyText = details.map(d => `${d.label}: ${d.value}`).join('\n');



    const detailsHtml = details.map(d => 

        `<p class="leading-tight"><span class="font-medium">${d.label}:</span> ${d.value}</p>`

    ).join('');



    return `

        <div class="relative">

            <div class="text-xs md:text-sm text-gray-800 space-y-1">

                ${detailsHtml}

            </div>

            <button class="copy-btn absolute top-0 right-0 p-1.5 text-cyan-600 hover:bg-cyan-100 rounded-lg" data-copy="${copyText.replace(/"/g, '&quot;')}" aria-label="Copiar todos los datos de la cuenta">

                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">

                    <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />

                </svg>

                <span class="copy-feedback">Copiado</span>

            </button>

        </div>

    `;

}

function buildInfoCopyBlock(title, details) {

    const filtered = details.filter((item) => item.value && item.value !== '');

    if (!filtered.length) return '';



    const copyText = filtered.map((d) => `${d.label}: ${d.value}`).join('\n');

    const rows = filtered.map((d) => `<p class="leading-tight"><span class="font-medium">${d.label}:</span> ${d.value}</p>`).join('');



    return `

        <div class="relative border border-cyan-100 rounded-lg p-3 bg-cyan-50/50">

            <p class="text-xs font-semibold text-cyan-700 mb-2">${title}</p>

            <div class="text-xs md:text-sm text-gray-800 space-y-1">

                ${rows}

            </div>

            <button class="copy-btn absolute top-2 right-2 p-1.5 text-cyan-600 hover:bg-cyan-100 rounded-lg" data-copy="${copyText.replace(/"/g, '&quot;')}" aria-label="Copiar detalles">

                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">

                    <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />

                </svg>

                <span class="copy-feedback">Copiado</span>

            </button>

        </div>

    `;

}

function buildUserDestinationMarkup(tx) {

    const sections = [];



    if (tx.userVesDestination) {

        const data = tx.userVesDestination || {};

        const vesDetails = [

            { label: 'Beneficiario', value: data.beneficiary },

            { label: 'Documento', value: data.idNumber },

            { label: 'Banco', value: data.bank },

            { label: 'Tipo de cuenta', value: data.accountType },

            { label: 'Numero de cuenta', value: data.accountNumber },

            { label: 'Notas', value: data.notes },

        ];

        const block = buildInfoCopyBlock('Datos destino en VES', vesDetails);

        if (block) sections.push(block);

    }



    if (tx.userUsdtDestination) {

        const data = tx.userUsdtDestination || {};

        const usdtDetails = [

            { label: 'Wallet / ID', value: data.wallet },

            { label: 'Red', value: data.network },

            { label: 'Notas', value: data.notes },

        ];

        const block = buildInfoCopyBlock('Datos destino en USDT', usdtDetails);

        if (block) sections.push(block);

    }



    return sections.join('');

}

function getMarginValue(key) {

    const value = marginConfig[key];

    if (typeof value === 'number' && !Number.isNaN(value)) {

        return value;

    }

    return DEFAULT_MARGIN_CONFIG[key];

}



function formatPercent(value) {

    const percent = value * 100;

    if (!Number.isFinite(percent)) return '0';

    return percent.toFixed(2).replace(/\.?0+$/, '');

}



function hideMarginStatus() {

    if (!marginStatus) return;

    marginStatus.classList.add('hidden');

}



function showMarginStatus(message, isError = false) {

    if (!marginStatus) return;

    marginStatus.textContent = message;

    marginStatus.classList.remove('hidden');

    if (isError) {

        marginStatus.classList.add('text-red-600');

        marginStatus.classList.remove('text-yellow-800');

    } else {

        marginStatus.classList.remove('text-red-600');

        marginStatus.classList.add('text-yellow-800');

    }

}



function applyMarginConfigToUI() {

    const discountWldClp = getMarginValue('discountWldClp');

    const discountClpVes = getMarginValue('discountClpVes');

    const marginUsdtClp = getMarginValue('marginUsdtClp');



    const wldPercent = formatPercent(discountWldClp);

    const clpVesPercent = formatPercent(discountClpVes);

    const usdtClpPercent = formatPercent(marginUsdtClp);



    if (marginWldClpLabel) marginWldClpLabel.textContent = wldPercent;

    if (marginClpVesLabel) marginClpVesLabel.textContent = clpVesPercent;

    if (marginUsdtClpLabel) marginUsdtClpLabel.textContent = usdtClpPercent;



    if (marginWldClpInput && document.activeElement !== marginWldClpInput) {

        marginWldClpInput.value = wldPercent;

    }

    if (marginClpVesInput && document.activeElement !== marginClpVesInput) {

        marginClpVesInput.value = clpVesPercent;

    }

    if (marginUsdtClpInput && document.activeElement !== marginUsdtClpInput) {

        marginUsdtClpInput.value = usdtClpPercent;

    }



    hideMarginStatus();

}



function setupMarginConfigListener() {

    if (!db || marginConfigUnsubscribe) return;



    const configDocRef = doc(db, MARGIN_CONFIG_COLLECTION, MARGIN_CONFIG_DOC_ID);

    marginConfigUnsubscribe = onSnapshot(configDocRef, (snapshot) => {

        if (snapshot.exists()) {

            const data = snapshot.data();
            marginConfig = {

                discountWldClp: typeof data.discountWldClp === 'number' ? data.discountWldClp : DEFAULT_MARGIN_CONFIG.discountWldClp,

                discountClpVes: typeof data.discountClpVes === 'number' ? data.discountClpVes : DEFAULT_MARGIN_CONFIG.discountClpVes,

                marginUsdtClp: typeof data.marginUsdtClp === 'number' ? data.marginUsdtClp : DEFAULT_MARGIN_CONFIG.marginUsdtClp,

            };

        } else {

            marginConfig = { ...DEFAULT_MARGIN_CONFIG };

        }

        applyMarginConfigToUI();

        calculateExchange(false);

    }, (error) => {

        console.error('Error al escuchar mrgenes:', error);

        if (error?.code === 'permission-denied') {

            console.warn('El usuario no tiene permisos para leer config/pricing. Se usarán márgenes por defecto.');

            marginConfig = { ...DEFAULT_MARGIN_CONFIG };

            applyMarginConfigToUI();

            calculateExchange(false);

        }

    });

}



function readPercentInput(inputElement, label, fallbackDecimal) {

    if (!inputElement) return fallbackDecimal;

    const raw = (inputElement.value ?? '').toString().replace(',', '.').trim();

    if (raw === '') return fallbackDecimal;



    const numeric = parseFloat(raw);

    if (!Number.isFinite(numeric)) {

        throw new Error(`Ingrese un valor numérico válido para ${label}.`);

    }

    if (numeric < 0 || numeric > 100) {

        throw new Error(`${label} debe estar entre 0% y 100%.`);

    }

    return numeric / 100;

}



async function saveMarginConfig(event) {

    if (event) event.preventDefault();

    if (!isAuthReady || !db) {

        showMarginStatus('Error: conexión no lista.', true);

        return;

    }

    if (!ADMIN_UIDS.includes(userId)) {

        showMarginStatus('No autorizado para actualizar márgenes.', true);

        return;

    }



    const currentConfig = {

        discountWldClp: getMarginValue('discountWldClp'),

        discountClpVes: getMarginValue('discountClpVes'),

        marginUsdtClp: getMarginValue('marginUsdtClp'),

    };



    let discountWldClp;

    let discountClpVes;

    let marginUsdtClp;

    try {

        discountWldClp = readPercentInput(marginWldClpInput, 'Descuento WLD → CLP', currentConfig.discountWldClp);

        discountClpVes = readPercentInput(marginClpVesInput, 'Descuento CLP -> VES', currentConfig.discountClpVes);

        marginUsdtClp = readPercentInput(marginUsdtClpInput, 'Margen USDT -> CLP', currentConfig.marginUsdtClp);

    } catch (validationError) {

        showMarginStatus(validationError.message, true);

        return;

    }



    const configDocRef = doc(db, MARGIN_CONFIG_COLLECTION, MARGIN_CONFIG_DOC_ID);



    try {

        showMarginStatus('Guardando márgenes...');

        if (saveMarginsButton) {

            saveMarginsButton.disabled = true;

            saveMarginsButton.textContent = 'Guardando...';

        }

        await setDoc(configDocRef, {

            discountWldClp,

            discountClpVes,

            marginUsdtClp,

            updatedAt: serverTimestamp(),

            updatedBy: userId,

        }, { merge: true });



        marginConfig = { discountWldClp, discountClpVes, marginUsdtClp };

        applyMarginConfigToUI();

        calculateExchange(false);

        showMarginStatus('Márgenes guardados correctamente.');

        setTimeout(() => hideMarginStatus(), 3000);

    } catch (error) {

        console.error('Error al guardar márgenes:', error);

        showMarginStatus(`Error al guardar márgenes: ${error.message}`, true);

    } finally {

        if (saveMarginsButton) {

            saveMarginsButton.disabled = false;

            saveMarginsButton.textContent = 'Guardar Márgenes';

        }

    }

}



// --- Lgica de Autenticacin por Email ---

/**

 * Maneja el registro de un nuevo usuario.

 */

async function handleRegistration(event) {

    event.preventDefault();

    if (!auth) return;



    const email = registerForm.querySelector('#register-email').value;

    const password = registerForm.querySelector('#register-password').value;

    const passwordConfirm = registerForm.querySelector('#register-password-confirm').value;



    if (password !== passwordConfirm) {

        registerStatus.textContent = 'Las contraseñas no coinciden.';

        registerStatus.classList.remove('hidden');

        return;

    }



    registerStatus.textContent = 'Registrando...';

    registerStatus.classList.remove('hidden', 'text-red-500');

    registerStatus.classList.add('text-gray-600');



    try {

        await createUserWithEmailAndPassword(auth, email, password);

        // onAuthStateChanged se encargará de redirigir a la app.

        registerStatus.textContent = '¡Registro exitoso! Redirigiendo...';

        registerStatus.classList.remove('text-red-500', 'text-gray-600');

        registerStatus.classList.add('text-green-600');

    } catch (error) {

        console.error('Error de registro:', error);

        registerStatus.textContent = `Error: ${error.message}`;

        registerStatus.classList.remove('hidden', 'text-gray-600', 'text-green-600');

        registerStatus.classList.add('text-red-500');

    }

}

/**

 * Maneja el inicio de sesión de un usuario existente.

 */

async function handleLogin(event) {

    event.preventDefault();

    if (!auth) return;



    const email = loginForm.querySelector('#login-email').value;

    const password = loginForm.querySelector('#login-password').value;



    loginStatus.textContent = 'Iniciando sesión...';

    loginStatus.classList.remove('hidden', 'text-red-500');

    loginStatus.classList.add('text-gray-600');



    try {

        await signInWithEmailAndPassword(auth, email, password);

        // onAuthStateChanged se encargará de redirigir a la app.

        loginStatus.textContent = '¡Inicio de sesión exitoso! Redirigiendo...';

        loginStatus.classList.remove('text-red-500', 'text-gray-600');

        loginStatus.classList.add('text-green-600');

    } catch (error) {

        console.error('Error de inicio de sesión:', error);

        let message = 'Error al iniciar sesión. Verifica tus credenciales.';

        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {

            message = 'Correo o contraseña incorrectos.';

        } else {

            message = `Error: ${error.message}`;

        }

        loginStatus.textContent = message;

        loginStatus.classList.remove('hidden', 'text-gray-600', 'text-green-600');

        loginStatus.classList.add('text-red-500');

    }

}

/**

 * Maneja el cierre de sesión del usuario.

 */

async function handleLogout() {

    if (!auth) return;

    try {

        await signOut(auth);

        // onAuthStateChanged se encargará de limpiar la UI y mostrar el login.

        console.log('Usuario cerró sesión.');

        // Limpiar estados globales que persisten tras logout

        currentTransactionId = null;

        currentTransactionPath = null;

        isCurrentUserAdmin = false;

        if (adminTransactionsUnsubscribe) {

            adminTransactionsUnsubscribe();

            adminTransactionsUnsubscribe = null;

        }

        if (transactionListenerUnsubscribe) {

            transactionListenerUnsubscribe();

            transactionListenerUnsubscribe = null;

        }

        if (adminAccountsUnsubscribe) {

            adminAccountsUnsubscribe();

            adminAccountsUnsubscribe = null;

        }

        if (usdtDestinationSaveTimeout) {

            clearTimeout(usdtDestinationSaveTimeout);

            usdtDestinationSaveTimeout = null;

        }

        if (vesDestinationSaveTimeout) {

            clearTimeout(vesDestinationSaveTimeout);

            vesDestinationSaveTimeout = null;

        }

    } catch (error) {

        console.error('Error al cerrar sesión:', error);

        authStatus.textContent = `Error al cerrar sesión: ${error.message}`;

    }

}

/**

 * Abre el modal visor de imágenes con la URL y el título especificados.

 * @param {string} url La URL de la imagen a mostrar.

 * @param {string} title El título para el modal.

 */

function openImageViewer(url, title) {

    if (!imageViewerModal || !imageViewerImg || !imageViewerTitle) return;



    imageViewerImg.src = url;

    imageViewerTitle.textContent = title;

    imageViewerModal.classList.remove('hidden');

}

/**

 * Cierra el modal visor de imágenes.

 */

function closeImageViewer() {

    if (!imageViewerModal || !imageViewerImg) return;



    imageViewerModal.classList.add('hidden');

    imageViewerImg.src = ''; // Limpia la imagen para evitar que se muestre la anterior brevemente

}

function openReceiptFromButton(button) {

    if (!button) return false;



    const receiptUrl = button.dataset.receiptUrl;

    const receiptTitle = button.dataset.receiptTitle || 'Comprobante';

    if (!receiptUrl) return false;



    const filePath = receiptUrl.split('?')[0] || '';

    const isImageFile = /\.(jpe?g|png|gif|webp|bmp)$/i.test(filePath);



    if (isImageFile && typeof openImageViewer === 'function') {

        openImageViewer(receiptUrl, receiptTitle);

    } else {

        window.open(receiptUrl, '_blank', 'noopener');

    }



    return true;

}


// --- Lgica de Administracin de Cuentas ---



async function saveAdminAccounts() {

    if (!isAuthReady || !db) {

        accountStatus.textContent = "Error: Conexin no lista.";

        return;

    }



    const bankName = adminBankNameInput.value;

    const accountHolder = adminAccountHolderInput.value.trim();

    const accountNumber = adminAccountNumberInput.value.trim();

    const rut = adminRutInput.value.trim();

    const accountType = adminAccountTypeInput.value;

    const email = adminEmailInput.value.trim();



    if (!bankName || !accountHolder || !accountNumber || !rut || !accountType) {

        accountStatus.textContent = "Error: Complete todos los campos requeridos (Banco, Titular, Número, RUT, Tipo).";

        return;

    }

    

    saveAccountsButton.disabled = true;

    saveAccountsButton.textContent = 'Guardando...';



    try {

        const collectionPath = `artifacts/${appId}/public/data/admin_accounts`;

        await addDoc(collection(db, collectionPath), {

            bankName,

            accountHolder,

            accountNumber,

            rut,

            accountType,

            email: email || 'N/A',

            updatedBy: userId,

            timestamp: serverTimestamp()

        });

        

        adminBankNameInput.value = '';

        adminAccountHolderInput.value = 'Ender Javier Pia Rojas';

        adminAccountNumberInput.value = '';

        adminRutInput.value = '26728535-7';

        adminAccountTypeInput.value = '';

        adminEmailInput.value = '';



        accountStatus.textContent = "Cuenta guardada correctamente!";

    } catch (error) {

        console.error("Error al guardar cuentas:", error);

        accountStatus.textContent = "Error al guardar cuentas: " + error.message;

    } finally {

        saveAccountsButton.disabled = false;

        saveAccountsButton.textContent = 'Guardar Nueva Cuenta';

    }

}



async function deleteAdminAccount(docId, accountName) {

    if (!isAuthReady || !db) {

        console.error("Error: Conexión a Firebase no lista.");

        accountStatus.textContent = "Error: Conexin no lista.";

        return;

    }

    

     try {

         const collectionPath = `artifacts/${appId}/public/data/admin_accounts`;

         const docRef = doc(db, collectionPath, docId);

         await deleteDoc(docRef);

         accountStatus.textContent = `Cuenta ${accountName} eliminada correctamente.`;

         console.log(`Cuenta eliminada: ${accountName}`);

     } catch (error) {

         console.error("Error al eliminar cuenta:", error);

         accountStatus.textContent = "Error al eliminar: " + error.message;

     }

}



function setupAdminAccountsListener() {

    if (!isAuthReady || !db) return;



    if (adminAccountsUnsubscribe) {
        adminAccountsUnsubscribe();

        adminAccountsUnsubscribe = null;

    }



    const collectionPath = `artifacts/${appId}/public/data/admin_accounts`;

    const accountsCollectionRef = collection(db, collectionPath);

    const q = query(accountsCollectionRef);



    adminAccountsUnsubscribe = onSnapshot(q, (snapshot) => {

        adminAccounts = [];

        snapshot.forEach((doc) => {

            adminAccounts.push({ id: doc.id, ...doc.data() });

        });



        adminAccounts.sort((a, b) => a.bankName.localeCompare(b.bankName));



        renderAdminAccountsList();

        accountCount.textContent = adminAccounts.length;

    }, (error) => {

        console.error("Error al escuchar cuentas:", error);

        accountStatus.textContent = "Error al cargar cuentas.";

    });

}



function renderAdminAccountsList() {

    savedAccountsList.innerHTML = '';

    if (adminAccounts.length === 0) {

        savedAccountsList.innerHTML = '<p class="text-sm text-gray-500 p-2">No hay cuentas configuradas.</p>';

        return;

    }



    adminAccounts.forEach((account) => {

        const item = document.createElement('div');

        item.className = 'p-4 bg-white border border-yellow-200 rounded-lg space-y-3 text-sm text-left shadow-sm';

        item.setAttribute('data-account-id', account.id);

        item.setAttribute('data-account-name', `${account.bankName} (${account.accountType})`);

        item.innerHTML = `

            <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">

                <div>

                    <p class="text-sm font-semibold text-gray-800">${account.bankName}</p>

                    <p class="text-xs text-gray-500">${account.accountType}</p>

                </div>

                <button data-account-id="${account.id}" data-account-name="${account.bankName} (${account.accountType})" class="delete-account-btn text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded-md border border-red-200 bg-red-50">

                    Eliminar

                </button>

            </div>

            <div class="space-y-2">

                ${buildAccountDetailsMarkup(account)}

            </div>

        `;

        savedAccountsList.appendChild(item);

    });

}



// --- Lgica de Tasas Dinmicas ---



async function fetchDynamicRates() {

    rateFetchStatus.textContent = 'Conectando con API de Vercel...';

    

    try {

        // Llama a tu Serverless Function de Vercel

        const response = await fetch('/api/rates'); 

        if (!response.ok) {

            throw new Error(`Respuesta de la API de Vercel no fue exitosa: ${response.status}`);

        }

        const data = await response.json();

        

        // Ajusta la lgica para usar la respuesta de tu API de Vercel

        if (data?.success) {

            liveRates.USDT_to_CLP = data.USDT_to_CLP_P2P;

            liveRates.USDT_to_VES = data.VES_per_USDT_SELL; // Usamos la nueva tasa de venta

            liveRates.WLD_to_USDT = data.WLD_to_USDT;

            

            const spotSource = data.meta?.spotSource ?? 'spot';

            wldUsdtDisplay.textContent = `WLD/USDT (${spotSource}): ${liveRates.WLD_to_USDT.toFixed(4)}`;

            clpUsdtP2pDisplay.textContent = `USDT/CLP: 1 USDT = ${liveRates.USDT_to_CLP.toFixed(2)} CLP`;

            usdtClpP2pWldDisplay.textContent = `USDT/CLP: ${liveRates.USDT_to_CLP.toFixed(2)} CLP / USDT`;

            vesUsdtP2pDisplay.textContent = `USDT/VES: 1 USDT = ${liveRates.USDT_to_VES.toFixed(2)} VES`;

            rateFetchStatus.textContent = 'Tasas obtenidas de la API de Vercel.';

        } else {

            throw new Error("Respuesta de la API de Vercel con formato inesperado o error.");

        }

    } catch (error) {

        console.warn("Fallo en la conexin con la API de Vercel. Usando tasas de referencia fijas.", error);

        wldUsdtDisplay.textContent = `WLD/USDT: ${liveRates.WLD_to_USDT.toFixed(4)} (Fijo)`;

        clpUsdtP2pDisplay.textContent = `USDT/CLP: 1 USDT = ${liveRates.USDT_to_CLP.toFixed(2)} CLP (Fijo)`;

        usdtClpP2pWldDisplay.textContent = `USDT/CLP: ${liveRates.USDT_to_CLP.toFixed(2)} CLP / USDT (Fijo)`;

        vesUsdtP2pDisplay.textContent = `USDT/VES: 1 USDT = ${liveRates.USDT_to_VES.toFixed(2)} VES (Fijo)`;

        rateFetchStatus.textContent = 'Fallo de conexin. Usando tasas de Referencia Fijas.';

    }



    // **CORRECCIN**: Llama al clculo inicial pero sin habilitar el botn de pago.

    calculateExchange(false);

}



// --- Lgica de Intercambio (Cálculo) ---



function calculateFullRatesInternal() {

    const fullRates = {};

    

    const wldToUsdt = liveRates.WLD_to_USDT;

    const usdtToClp = liveRates.USDT_to_CLP;

    const usdtToVes = liveRates.USDT_to_VES;



    const discountWldClp = getMarginValue('discountWldClp');

    const discountClpVes = getMarginValue('discountClpVes');

    const marginUsdtClp = getMarginValue('marginUsdtClp');



    if (wldToUsdt !== null && usdtToClp !== null) {

        const baseWldToClp = wldToUsdt * usdtToClp;

        const finalWldToClp = baseWldToClp * (1 - discountWldClp);

        fullRates['WLD_to_CLP'] = finalWldToClp;

        fullRates['CLP_to_WLD'] = 1 / finalWldToClp;

    } else {

        fullRates['WLD_to_CLP'] = null;

        fullRates['CLP_to_WLD'] = null;

    }



    if (usdtToClp !== null && usdtToVes !== null) {

        const baseClpToVesRate = usdtToVes / usdtToClp;

        const finalClpToVesRate = baseClpToVesRate * (1 - discountClpVes);

        fullRates['CLP_to_VES'] = finalClpToVesRate;

        fullRates['VES_to_CLP'] = 1 / finalClpToVesRate;

    } else {

        fullRates['CLP_to_VES'] = null;

        fullRates['VES_to_CLP'] = null;

    }

    

    if (usdtToClp !== null) {

        const finalUsdtToClp = usdtToClp * (1 + marginUsdtClp);

        const finalClpToUsdt = 1 / finalUsdtToClp;

        fullRates['CLP_to_USDT'] = finalClpToUsdt;

        fullRates['USDT_to_CLP'] = finalUsdtToClp;

        if (usdtClpMarginDisplay) {

            const percentText = formatPercent(marginUsdtClp);

            usdtClpMarginDisplay.textContent = `1 USDT = ${finalUsdtToClp.toFixed(2)} CLP (Margen +${percentText}%)`;

        }

    } else {

        fullRates['CLP_to_USDT'] = null;

        fullRates['USDT_to_CLP'] = null;

    }

    

    if (usdtToVes !== null) {

        fullRates['USDT_to_VES'] = usdtToVes;

        fullRates['VES_to_USDT'] = 1 / usdtToVes;

    } else {

        fullRates['USDT_to_VES'] = null;

        fullRates['VES_to_USDT'] = null;

    }



    fullRates['WLD_to_VES'] = 1.0;

    fullRates['VES_to_WLD'] = 1.0;

    fullRates['CLP_to_CLP'] = 1.0;

    fullRates['VES_to_VES'] = 1.0;

    fullRates['WLD_to_WLD'] = 1.0;

    fullRates['USDT_to_USDT'] = 1.0;

    

    return fullRates;

}



function calculateExchange(enablePaymentButton = true) {

    const amountSend = parseFloat(amountSendInput.value);

    const currencySend = currencySendSelect.value;

    const currencyReceive = currencyReceiveSelect.value;

    const rates = calculateFullRatesInternal();



    const isReady = (rates.CLP_to_VES !== null || rates.VES_to_CLP !== null) &&

                    (rates.USDT_to_CLP !== null || rates.CLP_to_USDT !== null);



    if (!isReady) {

        rateDisplay.textContent = "Cargando tasas de cambio dinámicas...";

        paymentButton.disabled = true;

        return;

    }



    if (isNaN(amountSend) || amountSend <= 0) {

        amountReceiveDisplay.textContent = formatCurrency(0, currencyReceive);

        rateDisplay.textContent = "Ingrese un monto válido.";

        paymentButton.disabled = true;

        errorMessage.classList.add('hidden');

        return;

    }



    const rateKey = `${currencySend}_to_${currencyReceive}`;

    const rate = rates[rateKey];



    if (rate === null || typeof rate === 'undefined') {

        amountReceiveDisplay.textContent = "N/A";

        rateDisplay.textContent = `Intercambio ${currencySend} a ${currencyReceive} no disponible.`;

        paymentButton.disabled = true;

        errorMessage.classList.remove('hidden');

        errorMessage.textContent = `Error: El intercambio de ${currencySend} a ${currencyReceive} no es una ruta de remesa vlida.`;

        return;

    }



    if (enablePaymentButton && !isNaN(amountSend) && amountSend > 0) {

        paymentButton.disabled = false;

    }

    errorMessage.classList.add('hidden');



    const amountReceive = amountSend * rate;

    const rateFixed = rate.toFixed(currencyReceive === 'WLD' ? 8 : currencyReceive === 'CLP' ? 2 : 4);

    const discountClpVesPercent = formatPercent(getMarginValue('discountClpVes'));

    const discountWldClpPercent = formatPercent(getMarginValue('discountWldClp'));

    const marginUsdtClpPercent = formatPercent(getMarginValue('marginUsdtClp'));

    let rateText;

    if (currencySend === currencyReceive) {

        rateText = 'Intercambio 1:1';

    } else if (currencySend === 'CLP' && currencyReceive === 'USDT') {

        const inverted = rate !== 0 ? 1 / rate : null;

        rateText = inverted

            ? `Tasa de Cambio 1 USDT = ${inverted.toFixed(2)} CLP `

            : `Tasa de Cambio 1 ${currencySend} = ${rateFixed} ${currencyReceive}`;

    } else {

        rateText = `Tasa de Cambio 1 ${currencySend} = ${rateFixed} ${currencyReceive}`;

    }



    amountReceiveDisplay.textContent = formatCurrency(amountReceive, currencyReceive);

    rateDisplay.textContent = rateText;

    rateDisplay.style.fontSize = '130%';

    rateDisplay.style.fontWeight = '600';



}



function swapCurrencies() {

    const sendVal = currencySendSelect.value;

    currencySendSelect.value = currencyReceiveSelect.value;

    currencyReceiveSelect.value = sendVal;

    calculateExchange();

}



// --- Lgica de Transacciones y Modal de Pago ---



async function recordTransaction(amountSend, currencySend, amountReceive, currencyReceive, extraData = {}) {

    if (!isAuthReady || !db || !userId) {

        console.error('Error: Firebase o autenticacin no lista para registrar.');

        return null;

    }



    const safeAmountSend = Number.isFinite(amountSend) ? amountSend : 0;

    const transactionData = {

        amountSend: safeAmountSend,

        currencySend,

        amountReceive,

        currencyReceive,

        rateApplied: safeAmountSend > 0 ? amountReceive / safeAmountSend : null,

        timestamp: serverTimestamp(),

        userId,

        status: 'Sin comprobante',

        userReceiptUrl: null,

        adminReceiptUrl: null,

        ...extraData

    };



    try {

        const collectionPath = `artifacts/${appId}/users/${userId}/transactions`;

        const docRef = await addDoc(collection(db, collectionPath), transactionData);

        console.log('Transaccin registrada con xito.');

        return { id: docRef.id, path: `${collectionPath}/${docRef.id}` };

    } catch (error) {

        console.error('Error al registrar transaccin:', error);

        return null;

    }

}



function setupTransactionListener() {

    if (!isAuthReady || !db || !userId) return;

    if (transactionListenerUnsubscribe) {

        transactionListenerUnsubscribe();

        transactionListenerUnsubscribe = null;

    }



    const collectionPath = `artifacts/${appId}/users/${userId}/transactions`;

    const transactionsCollectionRef = collection(db, collectionPath);

    const q = query(transactionsCollectionRef);



    transactionListenerUnsubscribe = onSnapshot(q, (snapshot) => {

        const transactions = [];

        snapshot.forEach((doc) => {

            transactions.push({ id: doc.id, ...doc.data() });

        });



        transactions.sort((a, b) => b.timestamp?.seconds - a.timestamp?.seconds);



        renderTransactionHistory(transactions);

    }, (error) => {

        console.error("Error al escuchar transacciones:", error);

        loadingHistory.textContent = "Error al cargar el historial.";

    });

}



function renderTransactionHistory(transactions) {

    historyContainer.innerHTML = '';

    if (transactions.length === 0) {

        historyContainer.innerHTML = '<p class="text-gray-500 text-sm p-2">An no hay transacciones.</p>';

        return;

    }



    transactions.forEach(tx => {

        const date = tx.timestamp?.toDate ? tx.timestamp.toDate().toLocaleDateString() : 'Cargando fecha...';

        const time = tx.timestamp?.toDate ? tx.timestamp.toDate().toLocaleTimeString() : '';

        const displayStatus = tx.status || 'Sin comprobante';

        const statusClass = displayStatus === 'Pendiente'

            ? 'bg-orange-100 text-orange-800'

            : displayStatus === 'Completado'

                ? 'bg-green-100 text-green-800'

                : 'bg-gray-200 text-gray-700';



        const orderLabel = tx.id ? tx.id.slice(0, 8).toUpperCase() : 'ORDEN';



        const userReceiptInfo = tx.userReceiptUrl

            ? `<button class="view-receipt-btn text-cyan-700 hover:underline text-xs font-semibold" data-receipt-url="${tx.userReceiptUrl}" data-receipt-title="Comprobante enviado (Orden ${orderLabel})">Ver comprobante enviado</button>`

            : '<span class="text-xs text-orange-600">Debes subir el comprobante para activar la orden.</span>';



        const adminReceiptInfo = tx.adminReceiptUrl

            ? `<button class="view-receipt-btn text-cyan-700 hover:underline text-xs font-semibold" data-receipt-url="${tx.adminReceiptUrl}" data-receipt-title="Comprobante del pago recibido (Orden ${orderLabel})">Ver comprobante del pago recibido</button>`

            : '<span class="text-xs text-gray-500">Comprobante de pago en destino pendiente</span>';





        const item = document.createElement('div');

        item.className = 'p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm';

        item.innerHTML = `

            <p class="font-bold text-gray-800">${formatCurrency(tx.amountSend, tx.currencySend)}  ${formatCurrency(tx.amountReceive, tx.currencyReceive)}</p>

            <p class="text-xs text-gray-500 mt-1">

                Tasa: ${tx.rateApplied ? tx.rateApplied.toFixed(tx.currencySend === 'CLP' ? 8 : 4) : 'N/A'}

                | Fecha: ${date} ${time}

            </p>

            <span class="inline-block mt-2 px-2 py-0.5 text-xs font-semibold rounded-full ${statusClass}">${displayStatus}</span>

            <div class="mt-2 text-xs text-gray-600">

                ${userReceiptInfo}<br>

                ${adminReceiptInfo}

            </div>

        `;

        historyContainer.appendChild(item);

    });

}



async function showPaymentModal() {

    const amountSend = parseFloat(amountSendInput.value);

    const currencySend = currencySendSelect.value;

    const currencyReceive = currencyReceiveSelect.value;

    const amountReceiveText = amountReceiveDisplay.textContent;



    if (usdtDestinationForm) {

        if (currencyReceive === 'USDT') {

            usdtDestinationForm.classList.remove('hidden');

        } else {

            usdtDestinationForm.classList.add('hidden');

            if (usdtWalletInput) usdtWalletInput.value = '';

            if (usdtNetworkSelect) usdtNetworkSelect.value = '';

            if (usdtNotesInput) usdtNotesInput.value = '';

        }

    }



    if (vesDestinationForm) {

        if (currencyReceive === 'VES') {

            vesDestinationForm.classList.remove('hidden');

        } else {

            vesDestinationForm.classList.add('hidden');

            if (vesBeneficiaryInput) vesBeneficiaryInput.value = '';

            if (vesIdInput) vesIdInput.value = '';

            if (vesBankInput) vesBankInput.value = '';

            if (vesAccountTypeInput) vesAccountTypeInput.value = '';

            if (vesAccountNumberInput) vesAccountNumberInput.value = '';

            if (vesNotesInput) vesNotesInput.value = '';

        }

    }





    modalAmountSend.textContent = formatCurrency(amountSend, currencySend);

    modalAmountReceive.textContent = amountReceiveText;





    if (receiptUploadStatus) {

        receiptUploadStatus.textContent = '';

        receiptUploadStatus.classList.add('hidden');

    }

    if (receiptUploadInput) {

        receiptUploadInput.value = '';

    }





    const rates = calculateFullRatesInternal();

    const rate = rates[`${currencySend}_to_${currencyReceive}`] || 0;



    const extraTransactionData = {};

    if (currencyReceive === 'USDT') {

        extraTransactionData.userUsdtDestination = getUsdtDestinationData();

    }

    if (currencyReceive === 'VES') {

        extraTransactionData.userVesDestination = getVesDestinationData();

    }



    const transactionRecord = await recordTransaction(amountSend, currencySend, amountSend * rate, currencyReceive, extraTransactionData);

    if (!transactionRecord) {

        console.error('No se pudo registrar la transaccin para esta orden.');

        return;

    }





    currentTransactionId = transactionRecord.id;

    currentTransactionPath = transactionRecord.path;





    if (currencySend === 'CLP') {

        modalCryptoWarning.classList.add('hidden');

        modalTransferCurrency.textContent = 'CLP';





        adminAccountDetailsContainer.innerHTML = '';

        const clpAccounts = adminAccounts.filter((acc) => acc.accountType?.includes('Cuenta') || acc.bankName === 'Mercado Pago' || acc.bankName === 'Global66');





        if (clpAccounts.length > 0) {

            noAccountsMessage.classList.add('hidden');

            clpAccounts.forEach((account) => {

                const accountDiv = document.createElement('div');

                accountDiv.className = 'p-4 bg-white border border-cyan-300 rounded-lg shadow-sm space-y-2 text-sm';

                accountDiv.innerHTML = `

                    <div>

                        <p class="text-sm font-semibold text-gray-800">${account.bankName}</p>

                        <p class="text-xs text-gray-500">${account.accountType}</p>

                    </div>

                    <div class="space-y-2">

                        ${buildAccountDetailsMarkup(account)}

                    </div>

                `;

                adminAccountDetailsContainer.appendChild(accountDiv);

            });

        } else {

            noAccountsMessage.classList.remove('hidden');

            noAccountsMessage.textContent = 'El administrador no ha configurado cuentas CLP para recibir la transferencia.';

        }

    } else if (currencySend === 'WLD' || currencySend === 'USDT') {

        modalCryptoWarning.classList.remove('hidden');

        modalTransferCurrency.textContent = currencySend;

        adminAccountDetailsContainer.innerHTML = '<p class="text-center text-gray-600 p-4">La direccin de la Wallet ser proporcionada por el administrador una vez que confirme su intencin de enviar criptomonedas.</p>';

    } else {

        modalCryptoWarning.classList.remove('hidden');

        modalCryptoWarning.textContent = `Aviso: El mtodo de transferencia para ${currencySend} debe ser coordinado con el administrador.`;

        adminAccountDetailsContainer.innerHTML = '';

    }





    paymentModal.classList.remove('hidden');

}



function getUsdtDestinationData() {

    return {

        wallet: usdtWalletInput ? usdtWalletInput.value.trim() : '',

        network: usdtNetworkSelect ? usdtNetworkSelect.value : '',

        notes: usdtNotesInput ? usdtNotesInput.value.trim() : '',

    };

}

function getVesDestinationData() {

    return {

        beneficiary: vesBeneficiaryInput ? vesBeneficiaryInput.value.trim() : '',

        idNumber: vesIdInput ? vesIdInput.value.trim() : '',

        bank: vesBankInput ? vesBankInput.value.trim() : '',

        accountType: vesAccountTypeInput ? vesAccountTypeInput.value.trim() : '',

        accountNumber: vesAccountNumberInput ? vesAccountNumberInput.value.trim() : '',

        notes: vesNotesInput ? vesNotesInput.value.trim() : '',

    };

}

function handleSavedAccountsListClick(event) {

    const deleteButton = event.target.closest('.delete-account-btn');

    if (deleteButton) {

        const docId = deleteButton.getAttribute('data-account-id');

        const accountName = deleteButton.getAttribute('data-account-name');

        deleteAdminAccount(docId, accountName);

        return;

    }



    const copyButton = event.target.closest('.copy-btn');

    if (copyButton) {

        const textToCopy = copyButton.dataset.copy;

        copyToClipboard(textToCopy, copyButton);

    }

}



async function handleUserReceiptUpload(event) {

    event.preventDefault();

    if (!uploadReceiptButton) return;



    if (!currentTransactionPath || !currentTransactionId) {

        if (receiptUploadStatus) {

            receiptUploadStatus.textContent = 'Primero genera una orden antes de subir el comprobante.';

            receiptUploadStatus.classList.remove('hidden');

            receiptUploadStatus.classList.remove('text-gray-500');

            receiptUploadStatus.classList.remove('text-green-600');

            receiptUploadStatus.classList.add('text-red-600');

        }

        return;

    }



    const file = receiptUploadInput?.files?.[0];

    if (!file) {

        if (receiptUploadStatus) {

            receiptUploadStatus.textContent = 'Selecciona un archivo antes de subir.';

            receiptUploadStatus.classList.remove('hidden');

            receiptUploadStatus.classList.remove('text-gray-500');

            receiptUploadStatus.classList.remove('text-green-600');

            receiptUploadStatus.classList.add('text-red-600');

        }

        return;

    }



    if (file.size > 8 * 1024 * 1024) {

        if (receiptUploadStatus) {

            receiptUploadStatus.textContent = 'El archivo supera los 8 MB permitidos.';

            receiptUploadStatus.classList.remove('hidden');

            receiptUploadStatus.classList.remove('text-gray-500');

            receiptUploadStatus.classList.remove('text-green-600');

            receiptUploadStatus.classList.add('text-red-600');

        }

        return;

    }



    try {

        uploadReceiptButton.disabled = true;

        if (receiptUploadStatus) {

            receiptUploadStatus.textContent = 'Subiendo comprobante...';

            receiptUploadStatus.classList.remove('hidden');

            receiptUploadStatus.classList.remove('text-red-600');

            receiptUploadStatus.classList.remove('text-green-600');

            receiptUploadStatus.classList.add('text-gray-500');

        }



        const storagePath = `${currentTransactionPath}/receipts/user/${Date.now()}-${file.name}`;

        const fileRef = storageRef(storage, storagePath);

        await uploadBytes(fileRef, file);

        const downloadUrl = await getDownloadURL(fileRef);



        await updateDoc(doc(db, currentTransactionPath), {

            userReceiptUrl: downloadUrl,

            status: 'Pendiente',

            userReceiptUploadedAt: serverTimestamp(),

        });



        if (receiptUploadStatus) {

            receiptUploadStatus.textContent = 'Comprobante subido correctamente. Tu orden est pendiente de revisin.';

            receiptUploadStatus.classList.remove('hidden');

            receiptUploadStatus.classList.remove('text-red-600');

            receiptUploadStatus.classList.remove('text-gray-500');

            receiptUploadStatus.classList.add('text-green-600');

        }

    } catch (error) {

        console.error('Error al subir comprobante del usuario:', error);

        if (receiptUploadStatus) {

            receiptUploadStatus.textContent = `Error al subir el comprobante: ${error.message}`;

            receiptUploadStatus.classList.remove('hidden');

            receiptUploadStatus.classList.remove('text-green-600');

            receiptUploadStatus.classList.remove('text-gray-500');

            receiptUploadStatus.classList.add('text-red-600');

        }

    } finally {

        uploadReceiptButton.disabled = false;

        if (receiptUploadInput) {

            receiptUploadInput.value = '';

        }

    }

}



function handleAdminTransactionsListClick(event) {

    if (!isCurrentUserAdmin) return;



    const copyButton = event.target.closest('.copy-btn');

    if (copyButton) {

        copyToClipboard(copyButton.dataset.copy, copyButton);

        return;

    }



    const viewReceiptButton = event.target.closest('.view-receipt-btn');

    if (viewReceiptButton) {

        const opened = openReceiptFromButton(viewReceiptButton);

        if (opened) {

            event.preventDefault();

        }

        return;

    }



    const uploadButton = event.target.closest('.admin-upload-btn');

    if (!uploadButton) return;



    const card = uploadButton.closest('.admin-transaction-card');

    if (!card) return;



    const fileInput = card.querySelector('.admin-receipt-input');

    const statusElement = card.querySelector('.admin-upload-status');

    const file = fileInput?.files?.[0];

    if (!file) {

        if (statusElement) {

            statusElement.textContent = 'Selecciona un archivo antes de subir.';

            statusElement.classList.remove('hidden');

            statusElement.classList.remove('text-gray-500');

            statusElement.classList.remove('text-green-600');

            statusElement.classList.add('text-red-600');

        }

        return;

    }



    if (file.size > 12 * 1024 * 1024) {

        if (statusElement) {

            statusElement.textContent = 'El archivo supera los 12 MB permitidos.';

            statusElement.classList.remove('hidden');

            statusElement.classList.remove('text-gray-500');

            statusElement.classList.remove('text-green-600');

            statusElement.classList.add('text-red-600');

        }

        return;

    }



    const transactionPath = card.getAttribute('data-transaction-path');

    if (!transactionPath) return;



    uploadButton.disabled = true;

    if (statusElement) {

        statusElement.textContent = 'Subiendo comprobante de destino...';

        statusElement.classList.remove('hidden');

        statusElement.classList.remove('text-red-600');

        statusElement.classList.remove('text-green-600');

        statusElement.classList.add('text-gray-500');

    }



    uploadAdminReceipt(transactionPath, file)

        .then(() => {

            if (statusElement) {

                statusElement.textContent = 'Comprobante de destino subido. La orden qued como completada.';

                statusElement.classList.remove('text-gray-500');

                statusElement.classList.remove('text-red-600');

                statusElement.classList.add('text-green-600');

            }

        })

        .catch((error) => {

            console.error('Error al subir comprobante de destino:', error);

            if (statusElement) {

                statusElement.textContent = `Error al subir el comprobante: ${error.message}`;

                statusElement.classList.remove('text-gray-500');

                statusElement.classList.remove('text-green-600');

                statusElement.classList.add('text-red-600');

            }

        })

        .finally(() => {

            uploadButton.disabled = false;

            if (fileInput) fileInput.value = '';

        });

}



async function uploadAdminReceipt(transactionPath, file) {

    if (!storage || !db) {

        throw new Error('Firebase Storage no est inicializado.');

    }



    const storagePath = `${transactionPath}/receipts/admin/${Date.now()}-${file.name}`;

    const fileRef = storageRef(storage, storagePath);

    await uploadBytes(fileRef, file);

    const downloadUrl = await getDownloadURL(fileRef);



    await updateDoc(doc(db, transactionPath), {

        adminReceiptUrl: downloadUrl,

        status: 'Completado',

        adminReceiptUploadedAt: serverTimestamp(),

        completedAt: serverTimestamp(),

    });

}

function handleTransactionHistoryClick(event) {

    const viewReceiptButton = event.target.closest('.view-receipt-btn');

    if (!viewReceiptButton) return;



    const opened = openReceiptFromButton(viewReceiptButton);

    if (opened) {

        event.preventDefault();

    }

}



function setupAdminTransactionsListener() { // Nota: el nombre de la variable de lista se cambi en initializeDOM

    if (!db || !isCurrentUserAdmin || !adminPendingTransactionsList || !adminCompletedTransactionsList) {

        return;

    }



    if (adminTransactionsUnsubscribe) {

        adminTransactionsUnsubscribe();

    }



    const transactionsQuery = collectionGroup(db, 'transactions');

    adminTransactionsUnsubscribe = onSnapshot(transactionsQuery, (snapshot) => {

        const transactions = [];

        snapshot.forEach((docSnap) => {

            const docPath = docSnap.ref.path;

            if (!docPath.includes(`artifacts/${appId}/`)) {

                return;

            }

            const data = docSnap.data();

            transactions.push({

                id: docSnap.id,

                path: docPath,

                ...data,

            });

        });



        transactions.sort((a, b) => {

            const aTime = a.timestamp?.seconds || 0;

            const bTime = b.timestamp?.seconds || 0;

            return bTime - aTime;

        });



        renderAdminTransactions(transactions);

    }, (error) => {

        console.error('Error al escuchar transacciones (admin):', error);

        if (adminPendingTransactionsList) {

            adminPendingTransactionsList.innerHTML = '<p class="text-sm text-red-600">Error al cargar las órdenes.</p>';

        }

        if (adminCompletedTransactionsList) {

            adminCompletedTransactionsList.innerHTML = '<p class="text-sm text-red-600">Error al cargar las órdenes.</p>';

        }

    });

}



function renderAdminTransactions(transactions) {

    if (!adminPendingTransactionsList || !adminCompletedTransactionsList) return;

    const pending = transactions.filter(tx => tx.status !== 'Completado');

    const completed = transactions.filter(tx => tx.status === 'Completado');

    const renderList = (txList, container) => {

        container.innerHTML = '';

        if (txList.length === 0) {

            const message = container.id.includes('pending')

                ? 'No hay órdenes pendientes.'

                : 'No hay órdenes completadas.';

            container.innerHTML = `<p class="text-sm text-gray-500 p-2">${message}</p>`;

            return;

        }



        txList.forEach((tx) => {

        const amountSendText = formatCurrency(tx.amountSend || 0, tx.currencySend || 'CLP');

        const amountReceiveText = formatCurrency(tx.amountReceive || 0, tx.currencyReceive || 'CLP');

        const badgeClass = tx.status === 'Completado'

            ? 'bg-green-100 text-green-700'

            : tx.status === 'Pendiente'

                ? 'bg-orange-100 text-orange-700'

                : 'bg-gray-200 text-gray-600';





        const card = document.createElement('div');

        card.className = 'admin-transaction-card border border-yellow-200 bg-white rounded-lg p-4 space-y-3 shadow-sm';

        card.setAttribute('data-transaction-id', tx.id);

        card.setAttribute('data-transaction-path', tx.path);





        const rateRow = tx.rateApplied

            ? createCopyRow('Tasa aplicada', tx.rateApplied.toFixed(tx.currencyReceive === 'CLP' ? 2 : 4))

            : '';



        const userReceiptSection = tx.userReceiptUrl ?

            `<button class="view-receipt-btn text-cyan-700 hover:underline text-xs md:text-sm" data-receipt-url="${tx.userReceiptUrl}" data-receipt-title="Comprobante del Cliente (Orden ${tx.id.slice(0, 8).toUpperCase()})">Ver comprobante del cliente</button>` :

            '<span class="text-xs text-orange-600">Comprobante del cliente pendiente</span>';



        const adminReceiptSection = tx.adminReceiptUrl ?

            `<button class="view-receipt-btn text-cyan-700 hover:underline text-xs md:text-sm" data-receipt-url="${tx.adminReceiptUrl}" data-receipt-title="Comprobante de Destino (Orden ${tx.id.slice(0, 8).toUpperCase()})">Ver comprobante de destino</button>` :

            '<span class="text-xs text-gray-500">Comprobante de destino no cargado</span>';



        const destinationMarkup = buildUserDestinationMarkup(tx);





        card.innerHTML = `

            <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-2">

                <div>

                    <p class="text-sm font-semibold text-gray-800">Orden ${tx.id.slice(0, 8).toUpperCase()}</p>

                    <p class="text-xs text-gray-500">Usuario: ${tx.userId || 'N/A'}</p>

                </div>

                <span class="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${badgeClass}">${tx.status || 'Sin comprobante'}</span>

            </div>

            <div class="space-y-2">

                ${createCopyRow('Monto enviado', amountSendText)}

                ${createCopyRow('Monto destino', amountReceiveText)}

                ${rateRow}

            </div>

            ${destinationMarkup ? `<div class="space-y-2">${destinationMarkup}</div>` : ''}

            <div class="space-y-1 text-xs text-gray-600">

                ${userReceiptSection}<br>

                ${adminReceiptSection}

            </div>

            <div class="mt-2 border-t border-gray-200 pt-3">

                <label class="block text-xs font-semibold text-gray-700 mb-2">Subir comprobante de destino</label>

                <div class="flex flex-col md:flex-row gap-3">

                    <input type="file" class="admin-receipt-input flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-500" accept="image/*,.pdf">

                    <button class="admin-upload-btn px-4 py-2 bg-yellow-600 text-white text-sm font-semibold rounded-lg hover:bg-yellow-700 transition duration-300 disabled:opacity-60 disabled:cursor-not-allowed">

                        Marcar como completada

                    </button>

                </div>

                <p class="admin-upload-status text-xs text-gray-500 mt-2 hidden"></p>

            </div>

        `;

        container.appendChild(card);

        });

    };



    renderList(pending, adminPendingTransactionsList);

    renderList(completed, adminCompletedTransactionsList);





    if (adminTransactionsSection) {

        adminTransactionsSection.classList.remove('hidden');

    }

}



// --- Inicializacin y Listeners ---



window.onload = function () {

    initializeDOM();

    initializeFirebase();



    setTimeout(() => {

        fetchDynamicRates();

    }, 500);



    if (amountSendInput) amountSendInput.addEventListener('input', calculateExchange);

    if (currencySendSelect) currencySendSelect.addEventListener('change', calculateExchange);

    if (currencyReceiveSelect) currencyReceiveSelect.addEventListener('change', calculateExchange);

    if (swapButton) swapButton.addEventListener('click', swapCurrencies);



    if (toggleOrderCreationButton) {

        toggleOrderCreationButton.addEventListener('click', () => {

            orderCreationSection.classList.toggle('hidden');

            const isHidden = orderCreationSection.classList.contains('hidden');

            toggleOrderCreationButton.textContent = isHidden ? 'Mostrar Calculadora de Órdenes' : 'Ocultar Calculadora de Órdenes';

        });

    }



    if (toggleAdminButton) {

        toggleAdminButton.addEventListener('click', () => {

            adminPanel.classList.toggle('hidden');

            const isHidden = adminPanel.classList.contains('hidden');

            toggleAdminButton.textContent = isHidden ? 'Mostrar Panel de Configuración' : 'Ocultar Panel de Configuración';

        });

    }



    if (saveAccountsButton) saveAccountsButton.addEventListener('click', saveAdminAccounts);

    const toggleAccountsButton = document.getElementById('toggle-accounts-section-button');

    const accountsSection = document.getElementById('accounts-management-section');

    const accountsArrowIcon = document.getElementById('accounts-arrow-icon');

    if (toggleAccountsButton && accountsSection && accountsArrowIcon) {

        toggleAccountsButton.addEventListener('click', () => {

            accountsSection.classList.toggle('hidden');

            accountsArrowIcon.classList.toggle('rotate-180');

        });

    }



    if (saveMarginsButton) saveMarginsButton.addEventListener('click', saveMarginConfig);

    if (uploadReceiptButton) uploadReceiptButton.addEventListener('click', handleUserReceiptUpload);

    if (savedAccountsList) savedAccountsList.addEventListener('click', handleSavedAccountsListClick);

    if (adminPendingTransactionsList) adminPendingTransactionsList.addEventListener('click', handleAdminTransactionsListClick);

    if (adminCompletedTransactionsList) adminCompletedTransactionsList.addEventListener('click', handleAdminTransactionsListClick);

    if (historyContainer) historyContainer.addEventListener('click', handleTransactionHistoryClick);



    if (closeImageViewerButton) {

        closeImageViewerButton.addEventListener('click', closeImageViewer);

    }

    if (imageViewerModal) {

        imageViewerModal.addEventListener('click', (event) => {

            // Cierra el modal si se hace clic en el fondo oscuro (overlay)

            if (event.target === imageViewerModal) closeImageViewer();

        });

    }



    // Listeners para los nuevos formularios de autenticacin

    if (registerForm) registerForm.addEventListener('submit', handleRegistration);

    if (loginForm) loginForm.addEventListener('submit', handleLogin);

    if (logoutButton) logoutButton.addEventListener('click', handleLogout);



    if (showRegisterButton) {

        showRegisterButton.addEventListener('click', () => {

            loginForm.classList.add('hidden');

            registerForm.classList.remove('hidden');

        });

    }

    if (showLoginButton) {

        showLoginButton.addEventListener('click', () => {

            registerForm.classList.add('hidden');

            loginForm.classList.remove('hidden');

        });

    }



    if (paymentButton) paymentButton.addEventListener('click', showPaymentModal);

    if (closeModalButton) {

        closeModalButton.addEventListener('click', () => {

            paymentModal.classList.add('hidden');

        });

    }



    if (adminAccountDetailsContainer) {

        adminAccountDetailsContainer.addEventListener('click', (event) => {

            const button = event.target.closest('.copy-btn');

            if (button) {

                const textToCopy = button.dataset.copy;

                copyToClipboard(textToCopy, button);

            }

        });

    }

};
