import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";

import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import { getFirestore, doc, addDoc, onSnapshot, collection, query, serverTimestamp, setLogLevel, deleteDoc, setDoc, updateDoc, collectionGroup, getDoc, deleteField } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// Establecer nivel de log para depuracin de Firestore
setLogLevel('debug');

// --- CONFIGURACIN DE SEGURIDAD ---
// Lista de User IDs de administradores autorizados para ver el panel.
const ADMIN_UIDS_PLACEHOLDER = "R3QU4xRLmSQFiArCWWRwGBMEOhc2,R3QU4xRLmSQFiArCWWRwGBMEOhc2,71YiNOk9MOc6mNjxnnKBLST1Clh2";
const ADMIN_UIDS = ADMIN_UIDS_PLACEHOLDER.split(',').filter(uid => uid.trim() !== '');

// Variables Globales de Firebase (provistas por el entorno)
const appId = "1:775892034675:web:98ed2724bcaff2ed427606";
const firebaseConfig = {"apiKey":"AIzaSyCnXU8XU7ZzA_12CDaYaY9W2rWBmkGLB-g","authDomain":"studio-7601782447-44d81.firebaseapp.com","projectId":"studio-7601782447-44d81","storageBucket":"studio-7601782447-44d81.firebasestorage.app","messagingSenderId":"775892034675","appId":"1:775892034675:web:98ed2724bcaff2ed427606"};

let db;
let auth;
let storage;
let userId = null;
let isAuthReady = false;

// Tasas de cambio en vivo / referenciales
let liveRates = {
    WLD_to_USDT: 2.80,
    USDT_to_CLP: 950.00,
    USDT_to_VES: 36.50
};

// Cuentas de destino del administrador
let adminAccounts = [];

// Configuracin de mrgenes
const DEFAULT_MARGIN_CONFIG = {
    discountWldClp: 0.14,
    discountClpVes: 0.06,
    marginUsdtClp: 0.004,
};
const MARGIN_CONFIG_COLLECTION = 'config';
const MARGIN_CONFIG_DOC_ID = 'pricing';
let marginConfig = { ...DEFAULT_MARGIN_CONFIG };
let marginConfigUnsubscribe = null;

// --- DECLARACIN DE VARIABLES DEL DOM ---
let userIdDisplay, userIdContainer, authStatus, amountSendInput, currencySendSelect, currencyReceiveSelect, swapButton, amountReceiveDisplay, rateDisplay, paymentButton, errorMessage, historyContainer, loadingHistory, adminPanel, toggleAdminButton, rateFetchStatus, savedAccountsList, accountCount, wldUsdtDisplay, usdtClpP2pWldDisplay, clpUsdtP2pDisplay, vesUsdtP2pDisplay, usdtClpMarginDisplay, adminBankNameInput, adminAccountHolderInput, adminAccountNumberInput, adminRutInput, adminAccountTypeInput, adminEmailInput, saveAccountsButton, accountStatus, paymentModal, closeModalButton, modalAmountSend, modalAmountReceive, noAccountsMessage, modalCryptoWarning, modalTransferCurrency, adminToggleContainer, marginWldClpInput, marginClpVesInput, marginUsdtClpInput, saveMarginsButton, marginStatus, marginWldClpLabel, marginClpVesLabel, marginUsdtClpLabel, receiptUploadInput, uploadReceiptButton, receiptUploadStatus, adminTransactionsSection, adminPendingTransactionsList, adminCompletedTransactionsList, usdtDestinationForm, usdtWalletInput, usdtNetworkSelect, usdtNotesInput, vesDestinationForm, vesBeneficiaryInput, vesIdInput, vesBankInput, vesAccountTypeInput, vesAccountNumberInput, vesNotesInput, imageViewerModal, closeImageViewerButton, imageViewerImg, imageViewerTitle, orderCreationSection, toggleOrderCreationButton, adminAccountSelect, selectedAdminAccountDetails, binanceBalanceCard, usdtBalanceDisplay, refreshUsdtBalanceButton, usdtBalanceStatus;

let currentTransactionId = null;
let currentTransactionPath = null;
let currentTransactionRef = null;
let isCurrentUserAdmin = false;
let adminTransactionsUnsubscribe = null;
let transactionListenerUnsubscribe = null;
let adminAccountsUnsubscribe = null;
let authContainer, appContainer, authFormsSection, registerForm, loginForm, logoutButton, showRegisterButton, showLoginButton;
let registerStatus, loginStatus;
let usdtDestinationSaveTimeout = null;
let vesDestinationSaveTimeout = null;
/**
 * Redondea un número con el número especificado de decimales (redondeo matemático estándar)
 * @param {number} value - Valor a redondear
 * @param {number} decimals - Número de decimales (default: 2)
 * @returns {number} Valor redondeado
 */
function roundToDecimals(value, decimals = 2) {
    const multiplier = Math.pow(10, decimals);
    return Math.round(value * multiplier) / multiplier;
}

/**
 * Formatea un número con redondeo estándar y lo convierte a string con decimales fijos
 * @param {number} value - Valor a formatear
 * @param {number} decimals - Número de decimales (default: 2)
 * @returns {string} Valor formateado
 */
function formatRounded(value, decimals = 2) {
    return roundToDecimals(value, decimals).toFixed(decimals);
}


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
    adminAccountSelect = document.getElementById('admin-account-select');
    selectedAdminAccountDetails = document.getElementById('selected-admin-account-details');
    binanceBalanceCard = document.getElementById('binance-balance-card');
    usdtBalanceDisplay = document.getElementById('usdt-balance-display');
    refreshUsdtBalanceButton = document.getElementById('refresh-usdt-balance');
    usdtBalanceStatus = document.getElementById('usdt-balance-status');
    if (paymentButton) paymentButton.type = 'button';
    applyMarginConfigToUI();
    authContainer = document.getElementById('auth-container');
    appContainer = document.getElementById('app');
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

async function initializeFirebase() {
    try {
        if (!firebaseConfig) {
            authStatus.textContent = "Error: Configuraci�n de Firebase no disponible.";
            return;
        }
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        storage = getStorage(app);
        setupAuthEventListeners();
        onAuthStateChanged(auth, async (user) => {
            if (user && !user.isAnonymous) {
                authContainer.classList.add('hidden');
                appContainer.classList.remove('hidden');
                userId = user.uid;
                if (user.email) {
                    userIdDisplay.textContent = user.email;
                    if (authFormsSection) authFormsSection.classList.add('hidden');
                    logoutButton.classList.remove('hidden');
                } else {
                    userIdDisplay.textContent = `An�nimo (${userId.substring(0, 8)}...)`;
                    if (authFormsSection) authFormsSection.classList.remove('hidden');
                    logoutButton.classList.add('hidden');
                }
                userIdContainer.classList.remove('hidden');
                authStatus.textContent = "Autenticado. Listo para usar.";
                isAuthReady = true;
                const isAdminUser = ADMIN_UIDS.includes(userId);
                isCurrentUserAdmin = isAdminUser;
                setupMarginConfigListener();
                if (isAdminUser) {
                    adminToggleContainer.classList.remove('hidden');
                    toggleBinanceBalanceCard(true);
                    refreshBinanceBalance().catch(error => console.error('Error inicial al obtener saldo Binance:', error));
                    setupAdminTransactionsListener();
                    if (orderCreationSection) orderCreationSection.classList.add('hidden');
                } else {
                    if (orderCreationSection) orderCreationSection.classList.remove('hidden');
                    marginConfig = { ...DEFAULT_MARGIN_CONFIG };
                    applyMarginConfigToUI();
                    toggleBinanceBalanceCard(false);
                    setUsdtBalanceStatus('', false);
                    if (usdtBalanceDisplay) usdtBalanceDisplay.textContent = '--';
                    if (adminTransactionsSection) {
                        adminTransactionsSection.classList.add('hidden');
                        if (adminPendingTransactionsList) adminPendingTransactionsList.innerHTML = '';
                        if (adminCompletedTransactionsList) adminCompletedTransactionsList.innerHTML = '';
                    }
                }
                setupTransactionListener();
                setupAdminAccountsListener();
            } else {
                if (user && user.isAnonymous) {
                    await signOut(auth);
                }
                if (marginConfigUnsubscribe) {
                    marginConfigUnsubscribe();
                    marginConfigUnsubscribe = null;
                }
                userId = null;
                isCurrentUserAdmin = false;
                if(authStatus) authStatus.textContent = "Por favor, inicie sesi�n o reg�strese.";
                if(userIdContainer) userIdContainer.classList.add('hidden');
                if(authFormsSection) authFormsSection.classList.remove('hidden');
                if(logoutButton) logoutButton.classList.add('hidden');
                if (adminPanel) adminPanel.classList.add('hidden');
                if (adminToggleContainer) adminToggleContainer.classList.add('hidden');
                if (historyContainer) historyContainer.innerHTML = '<p class="text-gray-500 text-sm p-2">Inicie sesi�n para ver su historial.</p>';
                if (adminTransactionsSection) adminTransactionsSection.classList.add('hidden');
                authContainer.classList.remove('hidden');
                appContainer.classList.add('hidden');
                marginConfig = { ...DEFAULT_MARGIN_CONFIG };
                applyMarginConfigToUI();
                toggleBinanceBalanceCard(false);
                setUsdtBalanceStatus('', false);
                if (usdtBalanceDisplay) usdtBalanceDisplay.textContent = '--';
                currentTransactionId = null;
                currentTransactionPath = null;
                currentTransactionRef = null;
            }
        });
    } catch (error) {
        console.error("Error al inicializar o autenticar Firebase:", error);
        authStatus.textContent = `Error de Firebase: ${error.message}`;
    }
}

function setupAuthEventListeners() {
    if (loginForm) {
        loginForm.querySelector('form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            const statusElement = document.getElementById('login-status');
            try {
                statusElement.classList.add('hidden');
                await signInWithEmailAndPassword(auth, email, password);
            } catch (error) {
                console.error("Error de inicio de sesi�n:", error);
                statusElement.textContent = `Error: ${error.message.replace("Firebase: ", "")}`;
                statusElement.classList.remove('hidden');
            }
        });
    }
    if (registerForm) {
        registerForm.querySelector('form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('register-email').value;
            const password = document.getElementById('register-password').value;
            const confirmPassword = document.getElementById('register-password-confirm').value;
            const statusElement = document.getElementById('register-status');
            if (password !== confirmPassword) {
                statusElement.textContent = "Las contrase�as no coinciden.";
                statusElement.classList.remove('hidden');
                return;
            }
            try {
                statusElement.classList.add('hidden');
                await createUserWithEmailAndPassword(auth, email, password);
            } catch (error) {
                console.error("Error de registro:", error);
                statusElement.textContent = `Error: ${error.message.replace("Firebase: ", "")}`;
                statusElement.classList.remove('hidden');
            }
        });
    }
    if (showRegisterButton) {
        showRegisterButton.addEventListener('click', () => {
            if (loginForm) loginForm.classList.add('hidden');
            if (registerForm) registerForm.classList.remove('hidden');
        });
    }
    if (showLoginButton) {
        showLoginButton.addEventListener('click', () => {
            if (registerForm) registerForm.classList.add('hidden');
            if (loginForm) loginForm.classList.remove('hidden');
        });
    }
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            await signOut(auth);
        });
    }
}

function formatCurrency(value, currencyCode) {
    // Aplicar redondeo estándar antes de formatear
    if (currencyCode === 'WLD') {
        const rounded = roundToDecimals(value, 4);
        return `${rounded.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} WLD`;
    }
    if (currencyCode === 'USDT') {
        const rounded = roundToDecimals(value, 2);
        return `${rounded.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
    }
    if (currencyCode === 'VES') {
        const rounded = roundToDecimals(value, 2);
        return rounded.toLocaleString('es-VE', { style: 'currency', currency: 'VES', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (currencyCode === 'CLP') {
        const rounded = Math.round(value); // CLP no usa decimales
        return rounded.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    const rounded = roundToDecimals(value, 2);
    return rounded.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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

function buildAccountDetailsMarkup(account) {
    const details = [
        { label: 'Banco', value: account.bankName },
        { label: 'Titular', value: account.accountHolder },
        { label: 'RUT', value: account.rut },
        { label: 'Tipo', value: account.accountType },
        { label: 'Numero', value: account.accountNumber },
    ];
    if (account.email && account.email !== 'N/A') {
        details.push({ label: 'Email', value: account.email });
    }
    const copyText = details.map(d => `${d.label}: ${d.value}`).join('\n');
    const sanitizedCopyText = copyText.replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
    const detailsHtml = details.map(d =>
        `<p class="leading-tight"><span class="font-medium">${d.label}:</span> ${d.value}</p>`
    ).join('');
    return `
        <div class="relative">
            <div class="text-xs md:text-sm text-gray-800 space-y-1">
                ${detailsHtml}
            </div>
            <button class="copy-btn absolute top-0 right-0 p-1.5 text-cyan-600 hover:bg-cyan-100 rounded-lg" data-copy="${sanitizedCopyText}">
                Copiar
            </button>
            <div class="copy-feedback absolute top-0 right-12 -translate-y-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 transition-all duration-200 pointer-events-none">
                Copiado!
            </div>
        </div>
    `;
}

function sanitizeCopyText(details) {
    const joined = details.map(d => `${d.label}: ${d.value}`).join('\n');
    return escapeHtml(joined).replace(/\n/g, '&#10;');
}

function buildDetailsSection(title, details, { enableCopy = false } = {}) {
    const cleanDetails = details
        .filter(detail => detail && detail.label && detail.value && String(detail.value).trim() !== '')
        .map(detail => ({
            label: detail.label,
            value: String(detail.value).trim()
        }));
    if (!cleanDetails.length) return '';
    const listItems = cleanDetails.map(detail => `
        <div class="flex items-start justify-between gap-2">
            <span class="text-gray-500">${escapeHtml(detail.label)}:</span>
            <span class="font-semibold text-gray-800 text-right break-words break-all max-w-full">${escapeHtml(detail.value)}</span>
        </div>
    `).join('');
    const sanitizedCopyText = enableCopy ? sanitizeCopyText(cleanDetails) : null;
    const copyMarkup = enableCopy ? `
        <span class="relative inline-flex">
            <button class="copy-btn relative inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-cyan-700 border border-cyan-200 rounded-md bg-white hover:bg-cyan-50 transition focus:outline-none focus:ring-2 focus:ring-cyan-300" data-copy="${sanitizedCopyText}">
                Copiar datos
                <span class="copy-feedback opacity-0 absolute inset-x-0 -top-6 mx-auto text-xs text-white bg-gray-900 px-2 py-1 rounded transition-all duration-200 pointer-events-none">Copiado!</span>
            </button>
        </span>
    ` : '';
    return `
        <div class="destination-details-block bg-white border border-cyan-100 rounded-lg p-3 space-y-2">
            <div class="flex items-start justify-between gap-2">
                <span class="text-xs font-semibold text-gray-700 uppercase tracking-wide sm:text-sm">${escapeHtml(title)}</span>
                ${copyMarkup}
            </div>
            <div class="space-y-1 text-xs sm:text-sm">
                ${listItems}
            </div>
        </div>
    `;
}

function buildDestinationDetailsMarkup(tx, { enableCopy = false } = {}) {
    if (!tx) return '';
    const blocks = [];
    if (tx.adminDestinationAccount) {
        const account = tx.adminDestinationAccount;
        const accountDetails = [
            { label: 'Banco', value: account.bankName },
            { label: 'Titular', value: account.accountHolder },
            { label: 'RUT', value: account.rut },
            { label: 'Tipo', value: account.accountType },
            { label: 'Numero', value: account.accountNumber },
            { label: 'Email', value: account.email },
        ];
        blocks.push(buildDetailsSection('Cuenta para depositar al administrador', accountDetails, { enableCopy }));
    }
    if (tx.userVesDestination) {
        const dest = tx.userVesDestination;
        const destDetails = [
            { label: 'Beneficiario', value: dest.beneficiary },
            { label: 'Documento', value: dest.idNumber },
            { label: 'Banco', value: dest.bank },
            { label: 'Tipo de cuenta', value: dest.accountType },
            { label: 'Numero de cuenta', value: dest.accountNumber },
            { label: 'Notas', value: dest.notes },
        ];
        blocks.push(buildDetailsSection('Cuenta destino (VES)', destDetails, { enableCopy }));
    }
    if (tx.userUsdtDestination) {
        const dest = tx.userUsdtDestination;
        const usdtDetails = [
            { label: 'Wallet', value: dest.wallet },
            { label: 'Red', value: dest.network },
            { label: 'Notas', value: dest.notes },
        ];
        blocks.push(buildDetailsSection('Wallet destino (USDT)', usdtDetails, { enableCopy }));
    }
    return blocks.filter(Boolean).join('');
}

const IMAGE_FILE_REGEX = /\.(png|jpe?g|gif|bmp|webp|svg)$/i;

function isImageLikeUrl(url) {
    try {
        const parsed = new URL(url, window.location.href);
        return IMAGE_FILE_REGEX.test(parsed.pathname.toLowerCase());
    } catch (error) {
        console.warn('No se pudo analizar la URL del comprobante:', error);
        return false;
    }
}

function openReceiptViewer(url, title = 'Comprobante') {
    if (!url) return;
    if (isImageLikeUrl(url) && imageViewerModal && imageViewerImg && imageViewerTitle) {
        imageViewerImg.src = url;
        imageViewerTitle.textContent = title;
        imageViewerModal.classList.remove('hidden');
    } else {
        window.open(url, '_blank', 'noopener,noreferrer');
    }
}

function closeReceiptViewer() {
    if (!imageViewerModal) return;
    imageViewerModal.classList.add('hidden');
    if (imageViewerImg) imageViewerImg.src = '';
}

function handleViewReceiptButton(button) {
    if (!button) return;
    const url = button.getAttribute('data-url');
    if (!url) {
        alert('El comprobante no est� disponible.');
        return;
    }
    const title = button.getAttribute('data-title') || 'Comprobante';
    openReceiptViewer(url, title);
}

function getMarginValue(key) {
    const value = marginConfig[key];
    return (typeof value === 'number' && !Number.isNaN(value)) ? value : DEFAULT_MARGIN_CONFIG[key];
}

function formatPercent(value) {
    const percent = value * 100;
    if (!Number.isFinite(percent)) return '0';
    return percent.toFixed(2).replace(/\.?0+$/, '');
}

function hideMarginStatus() {
    if (marginStatus) marginStatus.classList.add('hidden');
}

function showMarginStatus(message, isError = false) {
    if (!marginStatus) return;
    marginStatus.textContent = message;
    marginStatus.classList.remove('hidden');
    marginStatus.classList.toggle('text-red-600', isError);
    marginStatus.classList.toggle('text-yellow-800', !isError);
}

function applyMarginConfigToUI() {
    const discountWldClp = getMarginValue('discountWldClp');
    const discountClpVes = getMarginValue('discountClpVes');
    const marginUsdtClp = getMarginValue('marginUsdtClp');
    if (marginWldClpLabel) marginWldClpLabel.textContent = formatPercent(discountWldClp);
    if (marginClpVesLabel) marginClpVesLabel.textContent = formatPercent(discountClpVes);
    if (marginUsdtClpLabel) marginUsdtClpLabel.textContent = formatPercent(marginUsdtClp);
    if (marginWldClpInput && document.activeElement !== marginWldClpInput) marginWldClpInput.value = formatPercent(discountWldClp);
    if (marginClpVesInput && document.activeElement !== marginClpVesInput) marginClpVesInput.value = formatPercent(discountClpVes);
    if (marginUsdtClpInput && document.activeElement !== marginUsdtClpInput) marginUsdtClpInput.value = formatPercent(marginUsdtClp);
    hideMarginStatus();
}

function setupMarginConfigListener() {
    if (!db || marginConfigUnsubscribe) return;
    const configDocRef = doc(db, MARGIN_CONFIG_COLLECTION, MARGIN_CONFIG_DOC_ID);
    marginConfigUnsubscribe = onSnapshot(configDocRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            marginConfig = {
                discountWldClp: data.discountWldClp ?? DEFAULT_MARGIN_CONFIG.discountWldClp,
                discountClpVes: data.discountClpVes ?? DEFAULT_MARGIN_CONFIG.discountClpVes,
                marginUsdtClp: data.marginUsdtClp ?? DEFAULT_MARGIN_CONFIG.marginUsdtClp,
            };
        } else {
            marginConfig = { ...DEFAULT_MARGIN_CONFIG };
        }
        applyMarginConfigToUI();
        calculateExchange();
    }, (error) => {
        console.error('Error al escuchar m�rgenes:', error);
        marginConfig = { ...DEFAULT_MARGIN_CONFIG };
        applyMarginConfigToUI();
        calculateExchange();
    });
}

async function saveMarginConfig(event) {
    if (event) event.preventDefault();
    if (!isAuthReady || !db || !ADMIN_UIDS.includes(userId)) {
        showMarginStatus('No autorizado para actualizar m�rgenes.', true);
        return;
    }
    try {
        const newConfig = {
            discountWldClp: readPercentInput(marginWldClpInput, 'Descuento WLD -> CLP', marginConfig.discountWldClp),
            discountClpVes: readPercentInput(marginClpVesInput, 'Descuento CLP -> VES', marginConfig.discountClpVes),
            marginUsdtClp: readPercentInput(marginUsdtClpInput, 'Margen USDT -> CLP', marginConfig.marginUsdtClp),
        };
        showMarginStatus('Guardando m�rgenes...');
        if (saveMarginsButton) {
            saveMarginsButton.disabled = true;
            saveMarginsButton.textContent = 'Guardando...';
        }
        const configDocRef = doc(db, MARGIN_CONFIG_COLLECTION, MARGIN_CONFIG_DOC_ID);
        await setDoc(configDocRef, { ...newConfig, updatedAt: serverTimestamp(), updatedBy: userId }, { merge: true });
        marginConfig = newConfig;
        applyMarginConfigToUI();
        calculateExchange();
        showMarginStatus('M�rgenes guardados correctamente.');
        setTimeout(hideMarginStatus, 3000);
    } catch (validationError) {
        showMarginStatus(validationError.message, true);
    } finally {
        if (saveMarginsButton) {
            saveMarginsButton.disabled = false;
            saveMarginsButton.textContent = 'Guardar M�rgenes';
        }
    }
}

function readPercentInput(inputElement, label, fallbackDecimal) {
    if (!inputElement) return fallbackDecimal;
    const raw = (inputElement.value ?? '').toString().replace(',', '.').trim();
    if (raw === '') return fallbackDecimal;
    const numeric = parseFloat(raw);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
        throw new Error(`${label} debe ser un n�mero entre 0 y 100.`);
    }
    return numeric / 100;
}

async function saveAdminAccounts() {
    if (!isAuthReady || !db) {
        accountStatus.textContent = "Error: Conexi�n no lista.";
        return;
    }
    const accountData = {
        bankName: adminBankNameInput.value,
        accountHolder: adminAccountHolderInput.value.trim(),
        accountNumber: adminAccountNumberInput.value.trim(),
        rut: adminRutInput.value.trim(),
        accountType: adminAccountTypeInput.value,
        email: adminEmailInput.value.trim() || 'N/A',
    };
    if (!accountData.bankName || !accountData.accountHolder || !accountData.accountNumber || !accountData.rut || !accountData.accountType) {
        accountStatus.textContent = "Error: Complete todos los campos requeridos.";
        return;
    }
    saveAccountsButton.disabled = true;
    saveAccountsButton.textContent = 'Guardando...';
    try {
        const collectionPath = `artifacts/${appId}/public/data/admin_accounts`;
        await addDoc(collection(db, collectionPath), { ...accountData, updatedBy: userId, timestamp: serverTimestamp() });
        adminBankNameInput.value = '';
        adminAccountHolderInput.value = 'Ender Javier Pi�a Rojas';
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
        accountStatus.textContent = "Error: Conexi�n no lista.";
        return;
    }
    try {
        const collectionPath = `artifacts/${appId}/public/data/admin_accounts`;
        await deleteDoc(doc(db, collectionPath, docId));
        accountStatus.textContent = `Cuenta ${accountName} eliminada correctamente.`;
    } catch (error) {
        console.error("Error al eliminar cuenta:", error);
        accountStatus.textContent = "Error al eliminar: " + error.message;
    }
}

function setupAdminAccountsListener() {
    if (!isAuthReady || !db) return;
    const collectionPath = `artifacts/${appId}/public/data/admin_accounts`;
    const q = query(collection(db, collectionPath));
    onSnapshot(q, (snapshot) => {
        adminAccounts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        adminAccounts.sort((a, b) => a.bankName.localeCompare(b.bankName));
        renderAdminAccountsList();
        accountCount.textContent = adminAccounts.length;
    }, (error) => {
        console.error("Error al escuchar cuentas:", error);
        accountStatus.textContent = "Error al cargar cuentas.";
    });
}

function renderAdminAccountsList() {
    if (!savedAccountsList) return;
    savedAccountsList.innerHTML = '';
    if (adminAccounts.length === 0) {
        savedAccountsList.innerHTML = '<p class="text-sm text-gray-500 p-2">No hay cuentas configuradas.</p>';
        return;
    }
    adminAccounts.forEach((account) => {
        const item = document.createElement('div');
        item.className = 'p-4 bg-white border border-yellow-200 rounded-lg space-y-3 text-sm text-left shadow-sm';
        item.innerHTML = `
            <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                <div>
                    <p class="text-sm font-semibold text-gray-800">${account.bankName}</p>
                    <p class="text-xs text-gray-500">${account.accountType}</p>
                </div>
                <button data-account-id="${account.id}" data-account-name="${account.bankName} (${account.accountType})" class="delete-account-btn text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded-md border border-red-200 bg-red-50">Eliminar</button>
            </div>
            <div class="space-y-2">${buildAccountDetailsMarkup(account)}</div>
        `;
        savedAccountsList.appendChild(item);
    });
}

async function fetchDynamicRates() {
    rateFetchStatus.textContent = 'Conectando con API...';
    try {
        const response = await fetch('/api/rates');
        if (!response.ok) throw new Error(`Respuesta de la API no fue exitosa: ${response.status}`);
        const data = await response.json();

        if (data?.success) {
            const newClpRate = parseFloat(data.USDT_to_CLP_P2P);
            if (!isNaN(newClpRate)) liveRates.USDT_to_CLP = newClpRate;

            const newVesRate = parseFloat(data.VES_to_USDT_P2P);
            if (!isNaN(newVesRate)) liveRates.USDT_to_VES = newVesRate;

            const newWldRate = parseFloat(data.WLD_to_USDT);
            if (!isNaN(newWldRate)) liveRates.WLD_to_USDT = newWldRate;
            
            wldUsdtDisplay.textContent = `WLD/USDT (${data.meta?.wld_source || '...'}): ${formatRounded(liveRates.WLD_to_USDT, 4)}`;
            clpUsdtP2pDisplay.textContent = `USDT/CLP (${data.meta?.clp_source || '...'}): 1 USDT = ${formatRounded(liveRates.USDT_to_CLP, 2)} CLP`;
            usdtClpP2pWldDisplay.textContent = `USDT/CLP (${data.meta?.clp_source || '...'}): ${formatRounded(liveRates.USDT_to_CLP, 2)} CLP / USDT`;
            vesUsdtP2pDisplay.textContent = `USDT/VES (${data.meta?.ves_source || '...'}): 1 USDT = ${formatRounded(liveRates.USDT_to_VES, 2)} VES`;
            rateFetchStatus.textContent = 'Tasas actualizadas.';

        } else {
            throw new Error(data.message || "Respuesta de la API con formato inesperado.");
        }
    } catch (error) {
        console.warn("Fallo en la conexi�n con la API. Usando tasas de referencia fijas.", error);
        wldUsdtDisplay.textContent = `WLD/USDT: ${formatRounded(liveRates.WLD_to_USDT, 4)} (Fijo)`;
        clpUsdtP2pDisplay.textContent = `USDT/CLP: 1 USDT = ${formatRounded(liveRates.USDT_to_CLP, 2)} CLP (Fijo)`;
        usdtClpP2pWldDisplay.textContent = `USDT/CLP: ${formatRounded(liveRates.USDT_to_CLP, 2)} CLP / USDT (Fijo)`;
        vesUsdtP2pDisplay.textContent = `USDT/VES: 1 USDT = ${formatRounded(liveRates.USDT_to_VES, 2)} VES (Fijo)`;
        rateFetchStatus.textContent = 'Fallo de conexi�n. Usando tasas de Referencia.';
    }
    calculateExchange();
}

function calculateFullRatesInternal() {
    const fullRates = {};
    const { WLD_to_USDT, USDT_to_CLP, USDT_to_VES } = liveRates;
    const { discountWldClp, discountClpVes, marginUsdtClp } = marginConfig;
    if (WLD_to_USDT && USDT_to_CLP) {
        const baseWldToClp = WLD_to_USDT * USDT_to_CLP;
        fullRates['WLD_to_CLP'] = baseWldToClp * (1 - discountWldClp);
        fullRates['CLP_to_WLD'] = 1 / fullRates['WLD_to_CLP'];
    }
    if (USDT_to_CLP && USDT_to_VES) {
        const baseClpToVesRate = USDT_to_VES / USDT_to_CLP;
        fullRates['CLP_to_VES'] = baseClpToVesRate * (1 - discountClpVes);
        fullRates['VES_to_CLP'] = 1 / fullRates['CLP_to_VES'];
    }
    if (USDT_to_CLP) {
        const finalUsdtToClp = USDT_to_CLP * (1 + marginUsdtClp);
        fullRates['USDT_to_CLP'] = finalUsdtToClp;
        fullRates['CLP_to_USDT'] = 1 / finalUsdtToClp;
        if (usdtClpMarginDisplay) {
            usdtClpMarginDisplay.textContent = `1 USDT = ${formatRounded(finalUsdtToClp, 2)} CLP (Margen +${formatPercent(marginUsdtClp)}%)`;
        }
    }
    fullRates['USDT_to_VES'] = USDT_to_VES;
    fullRates['VES_to_USDT'] = 1 / USDT_to_VES;
    ['CLP', 'VES', 'WLD', 'USDT'].forEach(c => fullRates[`${c}_to_${c}`] = 1);
    return fullRates;
}

function calculateExchange(enablePaymentButton = true) {
    const amountSend = parseFloat(amountSendInput.value);
    const currencySend = currencySendSelect.value;
    const currencyReceive = currencyReceiveSelect.value;
    const rates = calculateFullRatesInternal();
    if (isNaN(amountSend) || amountSend <= 0) {
        amountReceiveDisplay.textContent = formatCurrency(0, currencyReceive);
        rateDisplay.textContent = "Ingrese un monto v�lido.";
        paymentButton.disabled = true;
        errorMessage.classList.add('hidden');
        return;
    }
    const rateKey = `${currencySend}_to_${currencyReceive}`;
    const rate = rates[rateKey];
    if (rate == null) {
        amountReceiveDisplay.textContent = "N/A";
        rateDisplay.textContent = `Intercambio ${currencySend} a ${currencyReceive} no disponible.`;
        paymentButton.disabled = true;
        errorMessage.classList.remove('hidden');
        errorMessage.textContent = `Error: El intercambio de ${currencySend} a ${currencyReceive} no es una ruta v�lida.`;
        return;
    }
    if (enablePaymentButton) paymentButton.disabled = false;
    errorMessage.classList.add('hidden');
    const amountReceive = amountSend * rate;
    let rateText = `Tasa: 1 ${currencySend} = ${formatRounded(rate, currencyReceive === 'WLD' ? 8 : 4)} ${currencyReceive}`;
    if (currencySend === currencyReceive) {
        rateText = 'Intercambio 1:1';
    } else if (currencySend === 'CLP' && currencyReceive === 'USDT') {
        rateText = `Tasa: 1 USDT = ${formatRounded(1 / rate, 2)} CLP`;
    }
    amountReceiveDisplay.textContent = formatCurrency(amountReceive, currencyReceive);
    rateDisplay.textContent = rateText;
}

function swapCurrencies() {
    const sendVal = currencySendSelect.value;
    currencySendSelect.value = currencyReceiveSelect.value;
    currencyReceiveSelect.value = sendVal;
    calculateExchange();
}

async function recordTransaction(amountSend, currencySend, amountReceive, currencyReceive, extraData = {}) {
    if (!isAuthReady || !db || !userId) {
        console.error('Error: Firebase no listo para registrar.');
        return null;
    }
    const transactionData = {
        amountSend: Number.isFinite(amountSend) ? amountSend : 0,
        currencySend,
        amountReceive,
        currencyReceive,
        rateApplied: amountSend > 0 ? amountReceive / amountSend : null,
        timestamp: serverTimestamp(),
        userId,
        status: 'Sin comprobante',
        userReceiptUrl: null,
        adminReceiptUrl: null,
        ...extraData
    };
    try {
        const userTransactionsRef = collection(db, 'artifacts', appId, 'users', userId, 'transactions');
        const docRef = await addDoc(userTransactionsRef, transactionData);
        const pathSegments = ['artifacts', appId, 'users', userId, 'transactions', docRef.id];
        return { id: docRef.id, path: pathSegments.join('/'), ref: docRef, segments: pathSegments };
    } catch (error) {
        console.error('Error al registrar transacci�n:', error);
        return null;
    }
}

function setupTransactionListener() {
    if (!isAuthReady || !db || !userId) return;
    const userTransactionsRef = collection(db, 'artifacts', appId, 'users', userId, 'transactions');
    const q = query(userTransactionsRef);
    onSnapshot(q, (snapshot) => {
        const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        transactions.sort((a, b) => b.timestamp?.seconds - a.timestamp?.seconds);
        renderTransactionHistory(transactions);
    }, (error) => {
        console.error("Error al escuchar transacciones:", error);
        loadingHistory.textContent = "Error al cargar el historial.";
    });
}

function getStatusBadgeClasses(status) {
    switch (status) {
        case 'Pendiente':
            return 'bg-orange-100 text-orange-800';
        case 'Completado':
            return 'bg-green-100 text-green-800';
        case 'Cancelada':
            return 'bg-gray-200 text-gray-700';
        case 'Sin comprobante':
            return 'bg-blue-100 text-blue-800';
        default:
            return 'bg-gray-100 text-gray-700';
    }
}

function canCancelTransaction(status) {
    return status === 'Sin comprobante' || status === 'Pendiente';
}

function renderTransactionHistory(transactions) {
    historyContainer.innerHTML = '';
    if (transactions.length === 0) {
        historyContainer.innerHTML = '<p class="text-gray-500 text-xs sm:text-sm p-2">Aun no hay transacciones.</p>';
        return;
    }
    transactions.forEach(tx => {
        const date = tx.timestamp?.toDate ? tx.timestamp.toDate().toLocaleDateString() : 'Cargando...';
        const time = tx.timestamp?.toDate ? tx.timestamp.toDate().toLocaleTimeString() : '';
        const item = document.createElement('div');
        item.className = 'p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs sm:text-sm space-y-2 shadow-sm';
        item.setAttribute('data-transaction-id', tx.id || '');
        const badgeClasses = getStatusBadgeClasses(tx.status);
        const cancelButtonMarkup = canCancelTransaction(tx.status)
            ? `<button class="cancel-transaction-btn btn btn-danger btn-sm" data-transaction-id="${escapeHtml(tx.id || '')}">Cancelar orden</button>`
            : '';
        const destinationDetailsMarkup = buildDestinationDetailsMarkup(tx, { enableCopy: false });
        const receiptActionsMarkup = tx.userReceiptUrl
            ? `<div class="flex flex-wrap items-center gap-2 pt-2 border-t border-dashed border-gray-200">
                <span class="text-xs text-gray-600">Comprobante cliente:</span>
                <button class="view-receipt-btn btn btn-outline btn-sm" data-url="${escapeHtml(tx.userReceiptUrl)}" data-title="Comprobante cliente ${escapeHtml((tx.id || '').slice(0, 8).toUpperCase())}">
                    Ver
                </button>
                <button class="copy-btn btn btn-ghost btn-sm relative" data-copy="${escapeHtml(tx.userReceiptUrl)}">
                    Copiar enlace
                    <span class="copy-feedback opacity-0 absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded transition-all duration-200 pointer-events-none">Copiado!</span>
                </button>
            </div>`
            : '';
        const userUploadMarkup = (!tx.userReceiptUrl && tx.status !== 'Cancelada' && tx.status !== 'Completado')
            ? `<div class="history-upload-section pt-2 border-t border-dashed border-gray-200 space-y-2">
                <p class="text-xs text-gray-600">Sube tu comprobante para completar esta orden.</p>
                <div class="flex flex-col sm:flex-row sm:items-center gap-2">
                    <input type="file" class="history-receipt-input flex-1 text-xs sm:text-sm border border-gray-300 rounded-lg px-3 py-2" accept="image/*,.pdf" data-transaction-id="${escapeHtml(tx.id || '')}">
                    <button class="history-upload-btn btn btn-primary btn-sm shrink-0" data-transaction-id="${escapeHtml(tx.id || '')}">Subir comprobante</button>
                </div>
                <p class="history-upload-status text-xs text-gray-500 hidden"></p>
            </div>`
            : '';
        item.innerHTML = `
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <p class="font-semibold text-gray-800 text-sm sm:text-base">${formatCurrency(tx.amountSend, tx.currencySend)} -> ${formatCurrency(tx.amountReceive, tx.currencyReceive)}</p>
                <span class="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full ${badgeClasses}">${escapeHtml(tx.status || 'N/A')}</span>
            </div>
            <p class="text-xs text-gray-500">Tasa: ${tx.rateApplied ? formatRounded(tx.rateApplied, 4) : 'N/A'} - ${date} ${time}</p>
            ${destinationDetailsMarkup ? `<div class="pt-2 border-t border-gray-200 space-y-2">${destinationDetailsMarkup}</div>` : ''}
            ${receiptActionsMarkup}
            ${userUploadMarkup}
            <div class="flex flex-wrap items-center gap-2">
                ${cancelButtonMarkup}
            </div>
        `;
        historyContainer.appendChild(item);
    });
}
async function cancelUserTransaction(transactionId) {
    if (!transactionId || !db || !userId) throw new Error('Transacci�n no disponible.');
    const transactionRef = doc(db, 'artifacts', appId, 'users', userId, 'transactions', transactionId);
    const transactionSnap = await getDoc(transactionRef);
    if (!transactionSnap.exists()) {
        throw new Error('La orden no existe.');
    }
    const data = transactionSnap.data();
    if (data.status === 'Completado') {
        throw new Error('La orden ya fue completada.');
    }
    if (data.status === 'Cancelada') {
        return;
    }
    await updateDoc(transactionRef, {
        status: 'Cancelada',
        cancelledAt: serverTimestamp(),
    });
}

async function handleHistoryContainerClick(event) {
    const copyButton = event.target.closest('.copy-btn');
    if (copyButton) {
        event.preventDefault();
        copyToClipboard(copyButton.dataset.copy, copyButton);
        return;
    }
    const viewButton = event.target.closest('.view-receipt-btn');
    if (viewButton) {
        event.preventDefault();
        handleViewReceiptButton(viewButton);
        return;
    }
    const uploadButton = event.target.closest('.history-upload-btn');
    if (uploadButton) {
        event.preventDefault();
        const transactionId = uploadButton.getAttribute('data-transaction-id');
        if (!transactionId) return;
        const section = uploadButton.closest('.history-upload-section');
        const fileInput = section?.querySelector('.history-receipt-input');
        const statusElement = section?.querySelector('.history-upload-status');
        const file = fileInput?.files?.[0];
        if (!file) {
            if (statusElement) {
                statusElement.textContent = 'Selecciona un archivo.';
                statusElement.className = 'history-upload-status text-xs text-red-600';
                statusElement.classList.remove('hidden');
            }
            return;
        }
        if (file.size > 8 * 1024 * 1024) {
            if (statusElement) {
                statusElement.textContent = 'El archivo supera los 8 MB.';
                statusElement.className = 'history-upload-status text-xs text-red-600';
                statusElement.classList.remove('hidden');
            }
            return;
        }
        if (statusElement) {
            statusElement.textContent = 'Subiendo comprobante...';
            statusElement.className = 'history-upload-status text-xs text-gray-500';
            statusElement.classList.remove('hidden');
        }
        uploadButton.disabled = true;
        uploadReceiptFromHistory(transactionId, file)
            .then(() => {
                if (statusElement) {
                    statusElement.textContent = 'Comprobante subido. Tu orden esta pendiente de revision.';
                    statusElement.className = 'history-upload-status text-xs text-green-600';
                    statusElement.classList.remove('hidden');
                }
                if (fileInput) fileInput.value = '';
            })
            .catch(error => {
                console.error('Error al subir comprobante desde historial:', error);
                if (statusElement) {
                    statusElement.textContent = error.message || 'No se pudo subir el comprobante.';
                    statusElement.className = 'history-upload-status text-xs text-red-600';
                    statusElement.classList.remove('hidden');
                }
            })
            .finally(() => {
                uploadButton.disabled = false;
            });
        return;
    }
    const cancelButton = event.target.closest('.cancel-transaction-btn');
    if (!cancelButton) return;
    const transactionId = cancelButton.dataset.transactionId;
    if (!transactionId) return;
    const confirmed = window.confirm('�Deseas cancelar esta orden? Esta acci�n no se puede deshacer.');
    if (!confirmed) return;
    const originalText = cancelButton.textContent;
    cancelButton.disabled = true;
    cancelButton.textContent = 'Cancelando...';
    const previousOpacity = cancelButton.style.opacity;
    cancelButton.style.opacity = '0.6';
    try {
        await cancelUserTransaction(transactionId);
        cancelButton.textContent = 'Cancelada';
        cancelButton.style.opacity = previousOpacity || '';
        cancelButton.classList.add('bg-gray-100', 'border-gray-200', 'text-gray-500', 'cursor-not-allowed');
    } catch (error) {
        console.error('Error al cancelar la orden:', error);
        alert(`No se pudo cancelar la orden: ${error.message}`);
        cancelButton.disabled = false;
        cancelButton.textContent = originalText;
        cancelButton.style.opacity = previousOpacity || '';
    }
}

async function showPaymentModal() {
    const amountSend = parseFloat(amountSendInput.value);
    const currencySend = currencySendSelect.value;
    const currencyReceive = currencyReceiveSelect.value;
    const amountReceiveText = amountReceiveDisplay.textContent;
    currentTransactionId = null;
    currentTransactionPath = null;
    currentTransactionRef = null;
    if (usdtDestinationForm) {
        usdtDestinationForm.classList.toggle('hidden', currencyReceive !== 'USDT');
    }
    if (vesDestinationForm) {
        vesDestinationForm.classList.toggle('hidden', currencyReceive !== 'VES');
    }
    modalAmountSend.textContent = formatCurrency(amountSend, currencySend);
    modalAmountReceive.textContent = amountReceiveText;
    if (receiptUploadStatus) {
        receiptUploadStatus.textContent = '';
        receiptUploadStatus.classList.add('hidden');
    }
    if (receiptUploadInput) receiptUploadInput.value = '';
    const rates = calculateFullRatesInternal();
    const rate = rates[`${currencySend}_to_${currencyReceive}`] || 0;
    const extraMetadata = {};
    if (auth?.currentUser?.email) {
        extraMetadata.userEmail = auth.currentUser.email;
    }
    if (auth?.currentUser?.displayName) {
        extraMetadata.userDisplayName = auth.currentUser.displayName;
    }
    const transactionRecord = await recordTransaction(amountSend, currencySend, amountSend * rate, currencyReceive, extraMetadata);
    if (!transactionRecord) {
        console.error('No se pudo registrar la transacci�n.');
        return;
    }
    currentTransactionId = transactionRecord.id;
    currentTransactionPath = transactionRecord.path;
    currentTransactionRef = transactionRecord.ref;
    if (currencySend === 'CLP') {
        modalCryptoWarning.classList.add('hidden');
        modalTransferCurrency.textContent = 'CLP';
        adminAccountSelect.innerHTML = '<option value="">-- Selecciona una cuenta --</option>';
        selectedAdminAccountDetails.innerHTML = '';
        selectedAdminAccountDetails.classList.add('hidden');
        const clpAccounts = adminAccounts.filter(acc => acc.accountType?.includes('Cuenta') || acc.bankName === 'Mercado Pago' || acc.bankName === 'Global66');
        if (clpAccounts.length > 0) {
            noAccountsMessage.classList.add('hidden');
            adminAccountSelect.classList.remove('hidden');
            clpAccounts.forEach(account => {
                const option = document.createElement('option');
                option.value = account.id;
                option.textContent = `${account.bankName} - ${account.accountType}`;
                adminAccountSelect.appendChild(option);
            });
        } else {
            noAccountsMessage.classList.remove('hidden');
            adminAccountSelect.classList.add('hidden');
            noAccountsMessage.textContent = 'El administrador no ha configurado cuentas CLP.';
        }
    } else {
        modalCryptoWarning.classList.remove('hidden');
        modalTransferCurrency.textContent = currencySend;
        adminAccountSelect.classList.add('hidden');
        selectedAdminAccountDetails.classList.add('hidden');
        noAccountsMessage.classList.remove('hidden');
        noAccountsMessage.innerHTML = '<p class="text-center text-gray-600 p-4">La direcci�n de la Wallet ser� proporcionada por el administrador.</p>';
    }
    paymentModal.classList.remove('hidden');
}

async function handleAdminAccountSelection() {
    const selectedAccountId = adminAccountSelect.value;
    if (!selectedAccountId) {
        selectedAdminAccountDetails.classList.add('hidden');
        selectedAdminAccountDetails.innerHTML = '';
        const transactionRef = getCurrentTransactionDocRef();
        if (!transactionRef) {
            console.warn('No hay una orden activa para limpiar la cuenta destino.');
            return;
        }
        try {
            await updateDoc(transactionRef, {
                adminDestinationAccount: deleteField(),
            });
        } catch (error) {
            console.error('Error al limpiar cuenta destino seleccionada:', error);
        }
        return;
    }
    const selectedAccount = adminAccounts.find(acc => acc.id === selectedAccountId);
    if (selectedAccount) {
        selectedAdminAccountDetails.innerHTML = buildAccountDetailsMarkup(selectedAccount);
        selectedAdminAccountDetails.classList.remove('hidden');
        const transactionRef = getCurrentTransactionDocRef();
        if (!transactionRef) {
            console.warn('No hay una orden activa para guardar la cuenta destino.');
            return;
        }
        const accountPayload = {
            id: selectedAccount.id || '',
            bankName: selectedAccount.bankName || '',
            accountHolder: selectedAccount.accountHolder || '',
            rut: selectedAccount.rut || '',
            accountType: selectedAccount.accountType || '',
            accountNumber: selectedAccount.accountNumber || '',
            email: selectedAccount.email || '',
            savedAt: serverTimestamp(),
        };
        try {
            await updateDoc(transactionRef, {
                adminDestinationAccount: accountPayload,
            });
        } catch (error) {
            console.error('Error al guardar cuenta destino en la orden:', error);
        }
    } else {
        selectedAdminAccountDetails.classList.add('hidden');
        selectedAdminAccountDetails.innerHTML = '';
        const transactionRef = getCurrentTransactionDocRef();
        if (!transactionRef) {
            console.warn('No hay una orden activa para limpiar la cuenta destino.');
            return;
        }
        try {
            await updateDoc(transactionRef, {
                adminDestinationAccount: deleteField(),
            });
        } catch (error) {
            console.error('Error al limpiar cuenta destino seleccionada:', error);
        }
    }
}

async function handleUserReceiptUpload(event) {
    event.preventDefault();
    if (!uploadReceiptButton) return;
    if (!currentTransactionPath) {
        receiptUploadStatus.textContent = 'Primero genera una orden.';
        receiptUploadStatus.className = 'text-xs text-red-600';
        return;
    }
    const transactionRef = getCurrentTransactionDocRef();
    if (!transactionRef) {
        receiptUploadStatus.textContent = 'No se encontr� la orden actual.';
        receiptUploadStatus.className = 'text-xs text-red-600';
        return;
    }
    const file = receiptUploadInput?.files?.[0];
    if (!file) {
        receiptUploadStatus.textContent = 'Selecciona un archivo.';
        receiptUploadStatus.className = 'text-xs text-red-600';
        return;
    }
    if (file.size > 8 * 1024 * 1024) {
        receiptUploadStatus.textContent = 'El archivo supera los 8 MB.';
        receiptUploadStatus.className = 'text-xs text-red-600';
        return;
    }
    try {
        uploadReceiptButton.disabled = true;
        receiptUploadStatus.textContent = 'Subiendo comprobante...';
        receiptUploadStatus.className = 'text-xs text-gray-500';
        const storagePath = `${currentTransactionPath}/receipts/user/${Date.now()}-${file.name}`;
        const fileRef = storageRef(storage, storagePath);
        await uploadBytes(fileRef, file);
        const downloadUrl = await getDownloadURL(fileRef);
        await updateDoc(transactionRef, {
            userReceiptUrl: downloadUrl,
            status: 'Pendiente',
            userReceiptUploadedAt: serverTimestamp(),
        });
        receiptUploadStatus.textContent = 'Comprobante subido. Tu orden est� pendiente de revisi�n.';
        receiptUploadStatus.className = 'text-xs text-green-600';
    } catch (error) {
        console.error('Error al subir comprobante:', error);
        receiptUploadStatus.textContent = `Error: ${error.message}`;
        receiptUploadStatus.className = 'text-xs text-red-600';
    } finally {
        uploadReceiptButton.disabled = false;
        if (receiptUploadInput) receiptUploadInput.value = '';
    }
}


async function uploadReceiptFromHistory(transactionId, file) {
    if (!transactionId || !file) throw new Error('Datos insuficientes para subir el comprobante.');
    if (!storage || !db || !userId) throw new Error('Firebase no inicializado.');
    const transactionRef = doc(db, 'artifacts', appId, 'users', userId, 'transactions', transactionId);
    const transactionSnap = await getDoc(transactionRef);
    if (!transactionSnap.exists()) {
        throw new Error('La orden no existe.');
    }
    const transactionData = transactionSnap.data();
    if (transactionData.status === 'Completado') {
        throw new Error('La orden ya fue completada.');
    }
    const storagePath = `artifacts/${appId}/users/${userId}/transactions/${transactionId}/receipts/user/${Date.now()}-${file.name}`;
    const fileRef = storageRef(storage, storagePath);
    await uploadBytes(fileRef, file);
    const downloadUrl = await getDownloadURL(fileRef);
    await updateDoc(transactionRef, {
        userReceiptUrl: downloadUrl,
        status: 'Pendiente',
        userReceiptUploadedAt: serverTimestamp(),
    });
}

function setupAdminTransactionsListener() {
    if (!db || !isCurrentUserAdmin || !adminPendingTransactionsList || !adminCompletedTransactionsList) return;
    if (adminTransactionsUnsubscribe) adminTransactionsUnsubscribe();
    const transactionsQuery = collectionGroup(db, 'transactions');
    adminTransactionsUnsubscribe = onSnapshot(transactionsQuery, (snapshot) => {
        const transactions = snapshot.docs
            .filter(docSnap => docSnap.ref.path.includes(`artifacts/${appId}/`))
            .map(docSnap => ({ id: docSnap.id, path: docSnap.ref.path, ...docSnap.data() }));
        transactions.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        renderAdminTransactions(transactions);
    }, (error) => {
        console.error('Error al escuchar transacciones (admin):', error);
        const errorMarkup = '<p class="text-sm text-red-600">Error al cargar las ordenes.</p>';
        adminPendingTransactionsList.innerHTML = errorMarkup;
        adminCompletedTransactionsList.innerHTML = errorMarkup;
    });
}

function renderAdminTransactions(transactions) {
    if (!adminTransactionsSection || !adminPendingTransactionsList || !adminCompletedTransactionsList) return;
    adminPendingTransactionsList.innerHTML = '';
    adminCompletedTransactionsList.innerHTML = '';
    transactions.forEach(tx => {
        const targetList = tx.status === 'Completado' ? adminCompletedTransactionsList : adminPendingTransactionsList;
        const card = createAdminTransactionCard(tx);
        targetList.appendChild(card);
    });
    if (!adminPendingTransactionsList.children.length) adminPendingTransactionsList.innerHTML = '<p class="text-sm text-gray-500">No hay ordenes pendientes.</p>';
    if (!adminCompletedTransactionsList.children.length) adminCompletedTransactionsList.innerHTML = '<p class="text-sm text-gray-500">No hay ordenes completadas.</p>';
    adminTransactionsSection.classList.remove('hidden');
}

function createAdminTransactionCard(tx) {
    const card = document.createElement('div');
    card.className = 'admin-transaction-card border border-yellow-200 bg-white rounded-lg p-4 space-y-3 shadow-sm text-xs sm:text-sm';
    card.setAttribute('data-transaction-path', tx.path);
    card.setAttribute('data-user-has-receipt', tx.userReceiptUrl ? 'true' : 'false');
    const statusBadgeClass = getStatusBadgeClasses(tx.status);
    const ownerLabel = tx.userEmail || tx.userDisplayName || tx.userId || 'N/A';
    const isCompleted = tx.status === 'Completado';
    const awaitingClientReceipt = !tx.userReceiptUrl && !isCompleted;
    const canAdminCancel = canCancelTransaction(tx.status);
    const completionButtonDisabled = isCompleted || awaitingClientReceipt;
    const completionButtonText = isCompleted
        ? 'Completada'
        : awaitingClientReceipt
            ? 'Esperando comprobante'
            : 'Subir y Completar';
    const cancelButtonMarkup = canAdminCancel
        ? `<button class="admin-cancel-btn btn btn-danger btn-sm" data-transaction-path="${escapeHtml(tx.path)}">Cancelar orden</button>`
        : '';
    const destinationDetailsMarkup = buildDestinationDetailsMarkup(tx, { enableCopy: true });
    const userReceiptSection = tx.userReceiptUrl
        ? `<div class="flex flex-wrap items-center gap-2">
                <span class="font-semibold text-gray-700">Comprobante cliente:</span>
                <button class="view-receipt-btn btn btn-outline btn-sm" data-url="${escapeHtml(tx.userReceiptUrl)}" data-title="Comprobante cliente ${escapeHtml((tx.id || '').slice(0, 8).toUpperCase())}">Ver</button>
                <button class="copy-btn btn btn-ghost btn-sm relative" data-copy="${escapeHtml(tx.userReceiptUrl)}">
                    Copiar enlace
                    <span class="copy-feedback opacity-0 absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded transition-all duration-200 pointer-events-none">Copiado!</span>
                </button>
            </div>`
        : '<span class="text-xs text-orange-600">Comprobante cliente pendiente</span>';
    const adminReceiptSection = tx.adminReceiptUrl
        ? `<div class="flex flex-wrap items-center gap-2">
                <span class="font-semibold text-gray-700">Comprobante destino:</span>
                <button class="view-receipt-btn btn btn-outline btn-sm" data-url="${escapeHtml(tx.adminReceiptUrl)}" data-title="Comprobante destino ${escapeHtml((tx.id || '').slice(0, 8).toUpperCase())}">Ver</button>
                <button class="copy-btn btn btn-ghost btn-sm relative" data-copy="${escapeHtml(tx.adminReceiptUrl)}">
                    Copiar enlace
                    <span class="copy-feedback opacity-0 absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded transition-all duration-200 pointer-events-none">Copiado!</span>
                </button>
            </div>`
        : '<span class="text-xs text-gray-500">Comprobante destino no cargado</span>';
    card.innerHTML = `
        <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div class="space-y-1">
                <p class="text-sm sm:text-base font-semibold text-gray-800">Orden ${escapeHtml((tx.id || '').slice(0, 8).toUpperCase())}</p>
                <div class="flex flex-wrap items-center gap-2">
                    <span class="inline-flex items-center px-2 py-0.5 font-semibold uppercase tracking-wide bg-cyan-100 text-cyan-700 rounded-full" style="font-size:0.7rem;">Cliente</span>
                    <span class="text-xs text-gray-600 break-words" title="${escapeHtml(ownerLabel)}">${escapeHtml(ownerLabel)}</span>
                </div>
            </div>
            <span class="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full ${statusBadgeClass}">${escapeHtml(tx.status || 'N/A')}</span>
        </div>
        <div class="space-y-2">
            ${createCopyRow('Monto enviado', formatCurrency(tx.amountSend || 0, tx.currencySend || 'CLP'))}
            ${createCopyRow('Monto destino', formatCurrency(tx.amountReceive || 0, tx.currencyReceive || 'CLP'))}
            ${tx.rateApplied ? createCopyRow('Tasa aplicada', formatRounded(tx.rateApplied, 4)) : ''}
        </div>
        ${destinationDetailsMarkup ? `<div class="border-t border-dashed border-gray-200 pt-3 space-y-2">${destinationDetailsMarkup}</div>` : ''}
        <div class="space-y-2 text-xs text-gray-600">
            ${userReceiptSection}
            ${adminReceiptSection}
        </div>
        <div class="mt-2 border-t border-gray-200 pt-3">
            <label class="block text-xs font-semibold text-gray-700 mb-2">Subir comprobante de destino</label>
            <div class="flex flex-col md:flex-row gap-3">
                <input type="file" class="admin-receipt-input flex-1 text-sm border rounded-lg px-3 py-2" accept="image/*,.pdf" ${completionButtonDisabled ? 'disabled' : ''}>
                <button class="admin-upload-btn btn btn-primary btn-sm" ${completionButtonDisabled ? 'disabled' : ''} style="white-space:normal;">${completionButtonText}</button>
            </div>
            <p class="admin-upload-status text-xs mt-2 hidden"></p>
            ${awaitingClientReceipt ? '<p class="text-xs text-orange-600 mt-2">Esperando comprobante del cliente para habilitar esta accion.</p>' : ''}
        </div>
        ${cancelButtonMarkup ? `<div class="pt-2 border-t border-dashed border-gray-200 space-y-2">
            <p class="text-xs text-gray-600">Acciones administrativas</p>
            <div class="flex flex-wrap gap-2">${cancelButtonMarkup}</div>
        </div>` : ''}
    `;
    return card;
}
function handleAdminTransactionsListClick(event) {
    if (!isCurrentUserAdmin) return;
    const copyButton = event.target.closest('.copy-btn');
    if (copyButton) {
        copyToClipboard(copyButton.dataset.copy, copyButton);
        return;
    }
    const viewButton = event.target.closest('.view-receipt-btn');
    if (viewButton) {
        event.preventDefault();
        handleViewReceiptButton(viewButton);
        return;
    }
    const cancelButton = event.target.closest('.admin-cancel-btn');
    if (cancelButton) {
        const transactionPath = cancelButton.getAttribute('data-transaction-path');
        if (!transactionPath) return;
        const confirmed = window.confirm('�Deseas cancelar esta orden? Esta acci�n no se puede deshacer.');
        if (!confirmed) return;
        const originalText = cancelButton.textContent;
        cancelButton.disabled = true;
        cancelButton.textContent = 'Cancelando...';
        cancelButton.classList.add('opacity-60');
        cancelTransactionAsAdmin(transactionPath)
            .then(() => {
                cancelButton.textContent = 'Cancelada';
                const statusElement = cancelButton.closest('.admin-transaction-card')?.querySelector('.admin-upload-status');
                if (statusElement) {
                    statusElement.textContent = 'Orden cancelada por el administrador.';
                    statusElement.className = 'admin-upload-status text-xs text-gray-600';
                }
            })
            .catch(error => {
                console.error('Error al cancelar orden (admin):', error);
                alert(`No se pudo cancelar la orden: ${error.message}`);
                cancelButton.disabled = false;
                cancelButton.textContent = originalText;
                cancelButton.classList.remove('opacity-60');
            });
        return;
    }
    const uploadButton = event.target.closest('.admin-upload-btn');
    if (!uploadButton) return;
    const card = uploadButton.closest('.admin-transaction-card');
    const fileInput = card?.querySelector('.admin-receipt-input');
    const statusElement = card?.querySelector('.admin-upload-status');
    const hasUserReceipt = card?.getAttribute('data-user-has-receipt') === 'true';
    if (!hasUserReceipt) {
        if (statusElement) {
            statusElement.textContent = 'El cliente a�n no ha cargado su comprobante.';
            statusElement.className = 'admin-upload-status text-xs text-red-600';
        }
        return;
    }
    const file = fileInput?.files?.[0];
    const transactionPath = card?.getAttribute('data-transaction-path');
    if (!file) {
        if (!statusElement) return;
        statusElement.textContent = 'Selecciona un archivo.';
        statusElement.className = 'admin-upload-status text-xs text-red-600';
        return;
    }
    if (!transactionPath) return;
    uploadButton.disabled = true;
    statusElement.textContent = 'Subiendo...';
    statusElement.className = 'admin-upload-status text-xs text-gray-500';
    uploadAdminReceipt(transactionPath, file)
        .then(() => {
            statusElement.textContent = 'Comprobante subido y orden completada.';
            statusElement.className = 'admin-upload-status text-xs text-green-600';
        })
        .catch(error => {
            statusElement.textContent = `Error: ${error.message}`;
            statusElement.className = 'admin-upload-status text-xs text-red-600';
        })
        .finally(() => {
            uploadButton.disabled = false;
            if (fileInput) fileInput.value = '';
        });
}

async function uploadAdminReceipt(transactionPath, file) {
    if (!storage || !db) throw new Error('Firebase no inicializado.');
    const transactionRef = docRefFromAbsolutePath(transactionPath);
    if (!transactionRef) throw new Error('Ruta de transaccion invalida.');
    const transactionSnap = await getDoc(transactionRef);
    if (!transactionSnap.exists()) {
        throw new Error('La orden no existe.');
    }
    const transactionData = transactionSnap.data();
    if (!transactionData.userReceiptUrl) {
        throw new Error('El cliente a�n no ha cargado su comprobante.');
    }
    const storagePath = `${transactionPath}/receipts/admin/${Date.now()}-${file.name}`;
    const fileRef = storageRef(storage, storagePath);
    await uploadBytes(fileRef, file);
    const downloadUrl = await getDownloadURL(fileRef);
    await updateDoc(transactionRef, {
        adminReceiptUrl: downloadUrl,
        status: 'Completado',
        completedAt: serverTimestamp(),
    });
}

async function cancelTransactionAsAdmin(transactionPath) {
    if (!db) throw new Error('Firebase no inicializado.');
    const transactionRef = docRefFromAbsolutePath(transactionPath);
    if (!transactionRef) throw new Error('Ruta de transaccion invalida.');
    const transactionSnap = await getDoc(transactionRef);
    if (!transactionSnap.exists()) {
        throw new Error('La orden no existe.');
    }
    const data = transactionSnap.data();
    if (data.status === 'Completado') {
        throw new Error('La orden ya fue completada.');
    }
    if (data.status === 'Cancelada') {
        return;
    }
    const updatePayload = {
        status: 'Cancelada',
        cancelledAt: serverTimestamp(),
        cancelledBy: 'admin',
    };
    if (auth?.currentUser?.uid) {
        updatePayload.cancelledByUid = auth.currentUser.uid;
    }
    await updateDoc(transactionRef, updatePayload);
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"/]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;'})[s]);
}

function createCopyRow(label, value) {
    return `
        <div class="relative py-0.5">
            <p class="text-xs md:text-sm text-gray-600 leading-tight pr-16">${escapeHtml(label)}: <span class="font-semibold text-gray-900">${escapeHtml(value)}</span></p>
            <button class="copy-btn btn btn-ghost btn-sm shrink-0 absolute top-0 right-0" data-copy="${escapeHtml(`${label}: ${value}`)}">Copiar</button>
        </div>
    `;
}

function registerStaticEventListeners() {
    if (amountSendInput) amountSendInput.addEventListener('input', () => calculateExchange());
    if (currencySendSelect) currencySendSelect.addEventListener('change', () => calculateExchange());
    if (currencyReceiveSelect) currencyReceiveSelect.addEventListener('change', () => calculateExchange());
    if (swapButton) swapButton.addEventListener('click', () => { swapCurrencies(); calculateExchange(); });
    if (historyContainer) historyContainer.addEventListener('click', handleHistoryContainerClick);
    if (toggleAdminButton) toggleAdminButton.addEventListener('click', () => {
        const isHidden = adminPanel.classList.toggle('hidden');
        toggleAdminButton.textContent = isHidden ? 'Mostrar Panel' : 'Ocultar Panel';
    });
    if (saveAccountsButton) saveAccountsButton.addEventListener('click', saveAdminAccounts);
    if (saveMarginsButton) saveMarginsButton.addEventListener('click', saveMarginConfig);
    if (uploadReceiptButton) uploadReceiptButton.addEventListener('click', handleUserReceiptUpload);
    if (savedAccountsList) savedAccountsList.addEventListener('click', handleSavedAccountsListClick);
    if (adminPendingTransactionsList) adminPendingTransactionsList.addEventListener('click', handleAdminTransactionsListClick);
    if (adminCompletedTransactionsList) adminCompletedTransactionsList.addEventListener('click', handleAdminTransactionsListClick);
    if (paymentButton) paymentButton.addEventListener('click', showPaymentModal);
    if (closeModalButton) closeModalButton.addEventListener('click', () => paymentModal.classList.add('hidden'));
    if (adminAccountSelect) adminAccountSelect.addEventListener('change', handleAdminAccountSelection);
    if (selectedAdminAccountDetails) selectedAdminAccountDetails.addEventListener('click', (event) => {
        const button = event.target.closest('.copy-btn');
        if (button) copyToClipboard(button.dataset.copy, button);
    });
    if (refreshUsdtBalanceButton) refreshUsdtBalanceButton.addEventListener('click', () => {
        refreshBinanceBalance().catch(error => console.error('Error al actualizar saldo Binance:', error));
    });
    if (closeImageViewerButton) closeImageViewerButton.addEventListener('click', () => closeReceiptViewer());
    if (imageViewerModal) imageViewerModal.addEventListener('click', (event) => {
        if (event.target === imageViewerModal) closeReceiptViewer();
    });
    if (usdtWalletInput) usdtWalletInput.addEventListener('input', scheduleUsdtDestinationPersist);
    if (usdtNetworkSelect) usdtNetworkSelect.addEventListener('change', scheduleUsdtDestinationPersist);
    if (usdtNotesInput) usdtNotesInput.addEventListener('input', scheduleUsdtDestinationPersist);
    if (vesBeneficiaryInput) vesBeneficiaryInput.addEventListener('input', scheduleVesDestinationPersist);
    if (vesIdInput) vesIdInput.addEventListener('input', scheduleVesDestinationPersist);
    if (vesBankInput) vesBankInput.addEventListener('input', scheduleVesDestinationPersist);
    if (vesAccountTypeInput) vesAccountTypeInput.addEventListener('change', scheduleVesDestinationPersist);
    if (vesAccountNumberInput) vesAccountNumberInput.addEventListener('input', scheduleVesDestinationPersist);
    if (vesNotesInput) vesNotesInput.addEventListener('input', scheduleVesDestinationPersist);
    if (toggleOrderCreationButton) toggleOrderCreationButton.addEventListener('click', () => {
        const isHidden = orderCreationSection.classList.toggle('hidden');
        toggleOrderCreationButton.textContent = isHidden ? 'Mostrar creador de ordenes' : 'Ocultar creador de ordenes';
    });
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
        copyToClipboard(copyButton.dataset.copy, copyButton);
    }
}

function toggleBinanceBalanceCard(isVisible) {
    if (!binanceBalanceCard) return;
    binanceBalanceCard.classList.toggle('hidden', !isVisible);
}

function setUsdtBalanceStatus(message, isError = false) {
    if (!usdtBalanceStatus) return;
    if (!message) {
        usdtBalanceStatus.textContent = '';
        usdtBalanceStatus.classList.add('hidden');
        usdtBalanceStatus.classList.remove('text-red-600');
        usdtBalanceStatus.classList.add('text-gray-500');
        return;
    }
    usdtBalanceStatus.textContent = message;
    usdtBalanceStatus.classList.remove('hidden');
    if (isError) {
        usdtBalanceStatus.classList.add('text-red-600');
        usdtBalanceStatus.classList.remove('text-gray-500');
    } else {
        usdtBalanceStatus.classList.add('text-gray-500');
        usdtBalanceStatus.classList.remove('text-red-600');
    }
}

async function refreshBinanceBalance() {
    if (!isCurrentUserAdmin || !binanceBalanceCard) return;
    toggleBinanceBalanceCard(true);
    setUsdtBalanceStatus('Consultando saldo...', false);
    if (refreshUsdtBalanceButton) refreshUsdtBalanceButton.disabled = true;
    try {
        const response = await fetch('https://binancebalance-775892034675.us-central1.run.app?asset=USDT');
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) {
            throw new Error(payload.message || `HTTP ${response.status}`);
        }
        const balance = payload.balance;
        if (!balance) {
            if (usdtBalanceDisplay) usdtBalanceDisplay.textContent = '--';
            setUsdtBalanceStatus(payload.message || 'Sin balance disponible.', false);
            return;
        }
        const free = Number(balance.free || 0);
        const locked = Number(balance.locked || 0);
        const withdrawing = Number(balance.withdrawing || 0);
        const total = Number(balance.total != null ? balance.total : free + locked + withdrawing);
        if (usdtBalanceDisplay) {
            usdtBalanceDisplay.textContent = `${roundToDecimals(total, 2).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${payload.asset || 'USDT'}`;
        }
        const detailParts = [`Libre: ${roundToDecimals(free, 2).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`];
        if (locked > 0) detailParts.push(`Bloqueado: ${roundToDecimals(locked, 2).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        if (withdrawing > 0) detailParts.push(`En retiro: ${roundToDecimals(withdrawing, 2).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        const detailMessage = detailParts.join(' � ');
        if (detailMessage) {
            setUsdtBalanceStatus(detailMessage, false);
        } else {
            setUsdtBalanceStatus('', false);
        }
    } catch (error) {
        console.error('Error al obtener saldo Binance:', error);
        if (usdtBalanceDisplay) usdtBalanceDisplay.textContent = '--';
        const errorMessage = error?.message || '';
        const lowerMessage = errorMessage.toLowerCase();
        if (errorMessage.includes('404')) {
            setUsdtBalanceStatus('Endpoint de Binance no disponible. Verifica la configuraci�n en vercel.json y despliega nuevamente.', true);
        } else if (lowerMessage.includes('restricted location')) {
            setUsdtBalanceStatus('Binance bloque� la consulta desde esta ubicaci�n. Debes habilitar IP permitidas o usar una regi�n autorizada.', true);
        } else {
            setUsdtBalanceStatus(errorMessage || 'No se pudo obtener el saldo.', true);
        }
        throw error;
    } finally {
        if (refreshUsdtBalanceButton) refreshUsdtBalanceButton.disabled = false;
    }
}

function scheduleUsdtDestinationPersist() {
    if (!isAuthReady || !db || !currentTransactionPath || usdtDestinationForm.classList.contains('hidden')) return;
    if (usdtDestinationSaveTimeout) clearTimeout(usdtDestinationSaveTimeout);
    usdtDestinationSaveTimeout = setTimeout(async () => {
        const transactionRef = getCurrentTransactionDocRef();
        if (!transactionRef) return;
        try {
            await updateDoc(transactionRef, {
                userUsdtDestination: {
                    wallet: usdtWalletInput.value.trim(),
                    network: usdtNetworkSelect.value,
                    notes: usdtNotesInput.value.trim(),
                },
            });
        } catch (error) {
            console.error('Error al guardar destino USDT:', error);
        }
    }, 400);
}

function scheduleVesDestinationPersist() {
    if (!isAuthReady || !db || !currentTransactionPath || vesDestinationForm.classList.contains('hidden')) return;
    if (vesDestinationSaveTimeout) clearTimeout(vesDestinationSaveTimeout);
    vesDestinationSaveTimeout = setTimeout(async () => {
        const transactionRef = getCurrentTransactionDocRef();
        if (!transactionRef) return;
        try {
            await updateDoc(transactionRef, {
                userVesDestination: {
                    beneficiary: vesBeneficiaryInput.value.trim(),
                    idNumber: vesIdInput.value.trim(),
                    bank: vesBankInput.value.trim(),
                    accountType: vesAccountTypeInput.value,
                    accountNumber: vesAccountNumberInput.value.trim(),
                    notes: vesNotesInput.value.trim(),
                },
            });
        } catch (error) {
            console.error('Error al guardar destino VES:', error);
        }
    }, 400);
}

async function bootstrapApp() {
    try {
        initializeDOM();
        registerStaticEventListeners();
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeReceiptViewer();
        });
        calculateExchange();
        await initializeFirebase();
        setTimeout(() => fetchDynamicRates().catch(err => console.error('Error al obtener tasas:', err)), 500);
    } catch (error) {
        console.error('Error al iniciar la aplicaci�n:', error);
        if (authStatus) {
            authStatus.textContent = 'No se pudo iniciar la aplicaci�n.';
            authStatus.classList.remove('hidden');
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
    bootstrapApp();
}




