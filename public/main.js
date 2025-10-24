import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";

import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import { getFirestore, doc, addDoc, onSnapshot, collection, query, serverTimestamp, setLogLevel, deleteDoc, setDoc, updateDoc, collectionGroup } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
let userIdDisplay, userIdContainer, authStatus, amountSendInput, currencySendSelect, currencyReceiveSelect, swapButton, amountReceiveDisplay, rateDisplay, paymentButton, errorMessage, historyContainer, loadingHistory, adminPanel, toggleAdminButton, rateFetchStatus, savedAccountsList, accountCount, wldUsdtDisplay, usdtClpP2pWldDisplay, clpUsdtP2pDisplay, vesUsdtP2pDisplay, usdtClpMarginDisplay, adminBankNameInput, adminAccountHolderInput, adminAccountNumberInput, adminRutInput, adminAccountTypeInput, adminEmailInput, saveAccountsButton, accountStatus, paymentModal, closeModalButton, modalAmountSend, modalAmountReceive, noAccountsMessage, modalCryptoWarning, modalTransferCurrency, adminToggleContainer, marginWldClpInput, marginClpVesInput, marginUsdtClpInput, saveMarginsButton, marginStatus, marginWldClpLabel, marginClpVesLabel, marginUsdtClpLabel, receiptUploadInput, uploadReceiptButton, receiptUploadStatus, adminTransactionsSection, adminPendingTransactionsList, adminCompletedTransactionsList, usdtDestinationForm, usdtWalletInput, usdtNetworkSelect, usdtNotesInput, vesDestinationForm, vesBeneficiaryInput, vesIdInput, vesBankInput, vesAccountTypeInput, vesAccountNumberInput, vesNotesInput, imageViewerModal, closeImageViewerButton, imageViewerImg, imageViewerTitle, orderCreationSection, toggleOrderCreationButton, adminAccountSelect, selectedAdminAccountDetails;

let currentTransactionId = null;
let currentTransactionPath = null;
let isCurrentUserAdmin = false;
let adminTransactionsUnsubscribe = null;
let transactionListenerUnsubscribe = null;
let adminAccountsUnsubscribe = null;
let authContainer, appContainer, authFormsSection, registerForm, loginForm, logoutButton, showRegisterButton, showLoginButton;
let registerStatus, loginStatus;
let usdtDestinationSaveTimeout = null;
let vesDestinationSaveTimeout = null;

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
            authStatus.textContent = "Error: Configuración de Firebase no disponible.";
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
                    userIdDisplay.textContent = `Anónimo (${userId.substring(0, 8)}...)`;
                    if (authFormsSection) authFormsSection.classList.remove('hidden');
                    logoutButton.classList.add('hidden');
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
                if (user && user.isAnonymous) {
                    await signOut(auth);
                }
                userId = null;
                isCurrentUserAdmin = false;
                if(authStatus) authStatus.textContent = "Por favor, inicie sesión o regístrese.";
                if(userIdContainer) userIdContainer.classList.add('hidden');
                if(authFormsSection) authFormsSection.classList.remove('hidden');
                if(logoutButton) logoutButton.classList.add('hidden');
                if (adminPanel) adminPanel.classList.add('hidden');
                if (adminToggleContainer) adminToggleContainer.classList.add('hidden');
                if (historyContainer) historyContainer.innerHTML = '<p class="text-gray-500 text-sm p-2">Inicie sesión para ver su historial.</p>';
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
                console.error("Error de inicio de sesión:", error);
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
                statusElement.textContent = "Las contraseñas no coinciden.";
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
        console.error('Error al escuchar márgenes:', error);
        marginConfig = { ...DEFAULT_MARGIN_CONFIG };
        applyMarginConfigToUI();
        calculateExchange();
    });
}

async function saveMarginConfig(event) {
    if (event) event.preventDefault();
    if (!isAuthReady || !db || !ADMIN_UIDS.includes(userId)) {
        showMarginStatus('No autorizado para actualizar márgenes.', true);
        return;
    }
    try {
        const newConfig = {
            discountWldClp: readPercentInput(marginWldClpInput, 'Descuento WLD -> CLP', marginConfig.discountWldClp),
            discountClpVes: readPercentInput(marginClpVesInput, 'Descuento CLP -> VES', marginConfig.discountClpVes),
            marginUsdtClp: readPercentInput(marginUsdtClpInput, 'Margen USDT -> CLP', marginConfig.marginUsdtClp),
        };
        showMarginStatus('Guardando márgenes...');
        if (saveMarginsButton) {
            saveMarginsButton.disabled = true;
            saveMarginsButton.textContent = 'Guardando...';
        }
        const configDocRef = doc(db, MARGIN_CONFIG_COLLECTION, MARGIN_CONFIG_DOC_ID);
        await setDoc(configDocRef, { ...newConfig, updatedAt: serverTimestamp(), updatedBy: userId }, { merge: true });
        marginConfig = newConfig;
        applyMarginConfigToUI();
        calculateExchange();
        showMarginStatus('Márgenes guardados correctamente.');
        setTimeout(hideMarginStatus, 3000);
    } catch (validationError) {
        showMarginStatus(validationError.message, true);
    } finally {
        if (saveMarginsButton) {
            saveMarginsButton.disabled = false;
            saveMarginsButton.textContent = 'Guardar Márgenes';
        }
    }
}

function readPercentInput(inputElement, label, fallbackDecimal) {
    if (!inputElement) return fallbackDecimal;
    const raw = (inputElement.value ?? '').toString().replace(',', '.').trim();
    if (raw === '') return fallbackDecimal;
    const numeric = parseFloat(raw);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
        throw new Error(`${label} debe ser un número entre 0 y 100.`);
    }
    return numeric / 100;
}

async function saveAdminAccounts() {
    if (!isAuthReady || !db) {
        accountStatus.textContent = "Error: Conexión no lista.";
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
        adminAccountHolderInput.value = 'Ender Javier Piña Rojas';
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
        accountStatus.textContent = "Error: Conexión no lista.";
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
            <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
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
            liveRates.USDT_to_CLP = data.USDT_to_CLP_P2P;
            liveRates.USDT_to_VES = data.VES_to_USDT_P2P; // CORREGIDO
            liveRates.WLD_to_USDT = data.WLD_to_USDT;
            wldUsdtDisplay.textContent = `WLD/USDT (spot): ${liveRates.WLD_to_USDT.toFixed(4)}`;
            clpUsdtP2pDisplay.textContent = `USDT/CLP: 1 USDT = ${liveRates.USDT_to_CLP.toFixed(2)} CLP`;
            usdtClpP2pWldDisplay.textContent = `USDT/CLP: ${liveRates.USDT_to_CLP.toFixed(2)} CLP / USDT`;
            vesUsdtP2pDisplay.textContent = `USDT/VES: 1 USDT = ${liveRates.USDT_to_VES.toFixed(2)} VES`;
            rateFetchStatus.textContent = 'Tasas obtenidas de la API.';
        } else {
            throw new Error("Respuesta de la API con formato inesperado.");
        }
    } catch (error) {
        console.warn("Fallo en la conexión con la API. Usando tasas de referencia fijas.", error);
        wldUsdtDisplay.textContent = `WLD/USDT: ${liveRates.WLD_to_USDT.toFixed(4)} (Fijo)`;
        clpUsdtP2pDisplay.textContent = `USDT/CLP: 1 USDT = ${liveRates.USDT_to_CLP.toFixed(2)} CLP (Fijo)`;
        usdtClpP2pWldDisplay.textContent = `USDT/CLP: ${liveRates.USDT_to_CLP.toFixed(2)} CLP / USDT (Fijo)`;
        vesUsdtP2pDisplay.textContent = `USDT/VES: 1 USDT = ${liveRates.USDT_to_VES.toFixed(2)} VES (Fijo)`;
        rateFetchStatus.textContent = 'Fallo de conexión. Usando tasas de Referencia Fijas.';
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
            usdtClpMarginDisplay.textContent = `1 USDT = ${finalUsdtToClp.toFixed(2)} CLP (Margen +${formatPercent(marginUsdtClp)}%)`;
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
        rateDisplay.textContent = "Ingrese un monto válido.";
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
        errorMessage.textContent = `Error: El intercambio de ${currencySend} a ${currencyReceive} no es una ruta válida.`;
        return;
    }
    if (enablePaymentButton) paymentButton.disabled = false;
    errorMessage.classList.add('hidden');
    const amountReceive = amountSend * rate;
    let rateText = `Tasa: 1 ${currencySend} = ${rate.toFixed(currencyReceive === 'WLD' ? 8 : 4)} ${currencyReceive}`;
    if (currencySend === currencyReceive) rateText = 'Intercambio 1:1';
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
        const collectionPath = `artifacts/${appId}/users/${userId}/transactions`;
        const docRef = await addDoc(collection(db, collectionPath), transactionData);
        return { id: docRef.id, path: `${collectionPath}/${docRef.id}` };
    } catch (error) {
        console.error('Error al registrar transacción:', error);
        return null;
    }
}

function setupTransactionListener() {
    if (!isAuthReady || !db || !userId) return;
    const collectionPath = `artifacts/${appId}/users/${userId}/transactions`;
    const q = query(collection(db, collectionPath));
    onSnapshot(q, (snapshot) => {
        const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
        historyContainer.innerHTML = '<p class="text-gray-500 text-sm p-2">Aún no hay transacciones.</p>';
        return;
    }
    transactions.forEach(tx => {
        const date = tx.timestamp?.toDate ? tx.timestamp.toDate().toLocaleDateString() : 'Cargando...';
        const time = tx.timestamp?.toDate ? tx.timestamp.toDate().toLocaleTimeString() : '';
        const item = document.createElement('div');
        item.className = 'p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm';
        item.innerHTML = `
            <p class="font-bold text-gray-800">${formatCurrency(tx.amountSend, tx.currencySend)} -> ${formatCurrency(tx.amountReceive, tx.currencyReceive)}</p>
            <p class="text-xs text-gray-500 mt-1">Tasa: ${tx.rateApplied ? tx.rateApplied.toFixed(4) : 'N/A'} | ${date} ${time}</p>
            <span class="inline-block mt-2 px-2 py-0.5 text-xs font-semibold rounded-full ${tx.status === 'Pendiente' ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}">${tx.status}</span>
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
    const transactionRecord = await recordTransaction(amountSend, currencySend, amountSend * rate, currencyReceive);
    if (!transactionRecord) {
        console.error('No se pudo registrar la transacción.');
        return;
    }
    currentTransactionId = transactionRecord.id;
    currentTransactionPath = transactionRecord.path;
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
        noAccountsMessage.innerHTML = '<p class="text-center text-gray-600 p-4">La dirección de la Wallet será proporcionada por el administrador.</p>';
    }
    paymentModal.classList.remove('hidden');
}

function handleAdminAccountSelection() {
    const selectedAccountId = adminAccountSelect.value;
    if (!selectedAccountId) {
        selectedAdminAccountDetails.classList.add('hidden');
        selectedAdminAccountDetails.innerHTML = '';
        return;
    }
    const selectedAccount = adminAccounts.find(acc => acc.id === selectedAccountId);
    if (selectedAccount) {
        selectedAdminAccountDetails.innerHTML = buildAccountDetailsMarkup(selectedAccount);
        selectedAdminAccountDetails.classList.remove('hidden');
    } else {
        selectedAdminAccountDetails.classList.add('hidden');
        selectedAdminAccountDetails.innerHTML = '';
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
        await updateDoc(doc(db, currentTransactionPath), {
            userReceiptUrl: downloadUrl,
            status: 'Pendiente',
            userReceiptUploadedAt: serverTimestamp(),
        });
        receiptUploadStatus.textContent = 'Comprobante subido. Tu orden está pendiente de revisión.';
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
    card.className = 'admin-transaction-card border border-yellow-200 bg-white rounded-lg p-4 space-y-3 shadow-sm';
    card.setAttribute('data-transaction-path', tx.path);
    const isCompleted = tx.status === 'Completado';
    const badgeClass = isCompleted ? 'bg-green-100 text-green-700' : tx.status === 'Pendiente' ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-600';
    card.innerHTML = `
        <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
            <div>
                <p class="text-sm font-semibold text-gray-800">Orden ${escapeHtml((tx.id || '').slice(0, 8).toUpperCase())}</p>
                <p class="text-xs text-gray-500">Usuario: ${escapeHtml(tx.userId || 'N/A')}</p>
            </div>
            <span class="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${badgeClass}">${escapeHtml(tx.status || 'N/A')}</span>
        </div>
        <div class="space-y-2">
            ${createCopyRow('Monto enviado', formatCurrency(tx.amountSend || 0, tx.currencySend || 'CLP'))}
            ${createCopyRow('Monto destino', formatCurrency(tx.amountReceive || 0, tx.currencyReceive || 'CLP'))}
            ${tx.rateApplied ? createCopyRow('Tasa aplicada', tx.rateApplied.toFixed(4)) : ''}
        </div>
        <div class="space-y-1 text-xs text-gray-600">
            ${tx.userReceiptUrl ? `<button class="copy-btn text-cyan-700 hover:underline text-xs" data-copy="${escapeHtml(tx.userReceiptUrl)}">Copiar comprobante cliente</button>` : '<span class="text-xs text-orange-600">Comprobante cliente pendiente</span>'}<br>
            ${tx.adminReceiptUrl ? `<button class="copy-btn text-cyan-700 hover:underline text-xs" data-copy="${escapeHtml(tx.adminReceiptUrl)}">Copiar comprobante destino</button>` : '<span class="text-xs text-gray-500">Comprobante destino no cargado</span>'}
        </div>
        <div class="mt-2 border-t border-gray-200 pt-3">
            <label class="block text-xs font-semibold text-gray-700 mb-2">Subir comprobante de destino</label>
            <div class="flex flex-col md:flex-row gap-3">
                <input type="file" class="admin-receipt-input flex-1 text-sm border rounded-lg px-3 py-2" accept="image/*,.pdf" ${isCompleted ? 'disabled' : ''}>
                <button class="admin-upload-btn px-4 py-2 bg-yellow-600 text-white text-sm font-semibold rounded-lg" ${isCompleted ? 'disabled' : ''}>${isCompleted ? 'Completada' : 'Subir y Completar'}</button>
            </div>
            <p class="admin-upload-status text-xs mt-2 hidden"></p>
        </div>
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
    const uploadButton = event.target.closest('.admin-upload-btn');
    if (!uploadButton) return;
    const card = uploadButton.closest('.admin-transaction-card');
    const fileInput = card?.querySelector('.admin-receipt-input');
    const statusElement = card?.querySelector('.admin-upload-status');
    const file = fileInput?.files?.[0];
    const transactionPath = card?.getAttribute('data-transaction-path');
    if (!file) {
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
    const storagePath = `${transactionPath}/receipts/admin/${Date.now()}-${file.name}`;
    const fileRef = storageRef(storage, storagePath);
    await uploadBytes(fileRef, file);
    const downloadUrl = await getDownloadURL(fileRef);
    await updateDoc(doc(db, transactionPath), {
        adminReceiptUrl: downloadUrl,
        status: 'Completado',
        completedAt: serverTimestamp(),
    });
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"/]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;'})[s]);
}

function createCopyRow(label, value) {
    return `
        <div class="flex items-center justify-between gap-2">
            <span class="text-xs md:text-sm text-gray-600">${escapeHtml(label)}: <span class="font-semibold text-gray-900">${escapeHtml(value)}</span></span>
            <button class="copy-btn inline-flex items-center gap-1 text-xs text-cyan-700 hover:underline" data-copy="${escapeHtml(`${label}: ${value}`)}">Copiar</button>
        </div>
    `;
}

function registerStaticEventListeners() {
    if (amountSendInput) amountSendInput.addEventListener('input', () => calculateExchange());
    if (currencySendSelect) currencySendSelect.addEventListener('change', () => calculateExchange());
    if (currencyReceiveSelect) currencyReceiveSelect.addEventListener('change', () => calculateExchange());
    if (swapButton) swapButton.addEventListener('click', () => { swapCurrencies(); calculateExchange(); });
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

function scheduleUsdtDestinationPersist() {
    if (!isAuthReady || !db || !currentTransactionPath || usdtDestinationForm.classList.contains('hidden')) return;
    if (usdtDestinationSaveTimeout) clearTimeout(usdtDestinationSaveTimeout);
    usdtDestinationSaveTimeout = setTimeout(async () => {
        try {
            await updateDoc(doc(db, currentTransactionPath), {
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
        try {
            await updateDoc(doc(db, currentTransactionPath), {
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
        calculateExchange();
        await initializeFirebase();
        setTimeout(() => fetchDynamicRates().catch(err => console.error('Error al obtener tasas:', err)), 500);
    } catch (error) {
        console.error('Error al iniciar la aplicación:', error);
        if (authStatus) {
            authStatus.textContent = 'No se pudo iniciar la aplicación.';
            authStatus.classList.remove('hidden');
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
    bootstrapApp();
}
