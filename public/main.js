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

            authStatus.textContent = "Error: Configucin de Firebase no disponible.";

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
            <button class="copy-btn absolute top-0 right-0 p-1.5 text-cyan-600 hover:bg-cyan-100 rounded-lg" data-copy="${copyText.replace(/