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

        console.error('Error al escuchar m+írgenes:', error);

        if (error?.code === 'permission-denied') {

            console.warn('El usuario no tiene permisos para leer config/pricing. Se usar+ín m+írgenes por defecto.');

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

        throw new Error(`Ingrese un valor num+®rico v+ílido para ${label}.`);

    }

    if (numeric < 0 || numeric > 100) {

        throw new Error(`${label} debe estar entre 0% y 100%.`);

    }

    return numeric / 100;

}



async function saveMarginConfig(event) {

    if (event) event.preventDefault();

    if (!isAuthReady || !db) {

        showMarginStatus('Error: conexi+¦n no lista.', true);

        return;

    }

    if (!ADMIN_UIDS.includes(userId)) {

        showMarginStatus('No autorizado para actualizar m+írgenes.', true);

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

        discountWldClp = readPercentInput(marginWldClpInput, 'Descuento WLD ÔåÆ CLP', currentConfig.discountWldClp);

        discountClpVes = readPercentInput(marginClpVesInput, 'Descuento CLP -> VES', currentConfig.discountClpVes);

        marginUsdtClp = readPercentInput(marginUsdtClpInput, 'Margen USDT -> CLP', currentConfig.marginUsdtClp);

    } catch (validationError) {

        showMarginStatus(validationError.message, true);

        return;

    }



    const configDocRef = doc(db, MARGIN_CONFIG_COLLECTION, MARGIN_CONFIG_DOC_ID);



    try {

        showMarginStatus('Guardando m+írgenes...');

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

        showMarginStatus('M+írgenes guardados correctamente.');

        setTimeout(() => hideMarginStatus(), 3000);

    } catch (error) {

        console.error('Error al guardar m+írgenes:', error);

        showMarginStatus(`Error al guardar m+írgenes: ${error.message}`, true);

    } finally {

        if (saveMarginsButton) {

            saveMarginsButton.disabled = false;

            saveMarginsButton.textContent = 'Guardar M+írgenes';

        }

    }

}



// --- L+¦gica de Autenticaci+¦n por Email ---

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
        registerStatus.textContent = 'Las contrase+¦as no coinciden.';
        registerStatus.classList.remove('hidden');
        return;
    }

    registerStatus.textContent = 'Registrando...';
    registerStatus.classList.remove('hidden', 'text-red-500');
    registerStatus.classList.add('text-gray-600');

    try {
        await createUserWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged se encargar+í de redirigir a la app.
        registerStatus.textContent = '-íRegistro exitoso! Redirigiendo...';
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
 * Maneja el inicio de sesi+¦n de un usuario existente.
 */
async function handleLogin(event) {
    event.preventDefault();
    if (!auth) return;

    const email = loginForm.querySelector('#login-email').value;
    const password = loginForm.querySelector('#login-password').value;

    loginStatus.textContent = 'Iniciando sesi+¦n...';
    loginStatus.classList.remove('hidden', 'text-red-500');
    loginStatus.classList.add('text-gray-600');

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged se encargar+í de redirigir a la app.
        loginStatus.textContent = '-íInicio de sesi+¦n exitoso! Redirigiendo...';
        loginStatus.classList.remove('text-red-500', 'text-gray-600');
        loginStatus.classList.add('text-green-600');
    } catch (error) {
        console.error('Error de inicio de sesi+¦n:', error);
        let message = 'Error al iniciar sesi+¦n. Verifica tus credenciales.';
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            message = 'Correo o contrase+¦a incorrectos.';
        } else {
            message = `Error: ${error.message}`;
        }
        loginStatus.textContent = message;
        loginStatus.classList.remove('hidden', 'text-gray-600', 'text-green-600');
        loginStatus.classList.add('text-red-500');
    }
}

/**
 * Maneja el cierre de sesi+¦n del usuario.
 */
async function handleLogout() {
    if (!auth) return;
    try {
        await signOut(auth);
        // onAuthStateChanged se encargar+í de limpiar la UI y mostrar el login.
        console.log('Usuario cerr+¦ sesi+¦n.');
        // Limpiar estados globales que persisten tras logout
        currentTransactionId = null;
        currentTransactionPath = null;
        isCurrentUserAdmin = false;
        if (adminTransactionsUnsubscribe) {
            adminTransactionsUnsubscribe();
            adminTransactionsUnsubscribe = null;
        }
    } catch (error) {
        console.error('Error al cerrar sesi+¦n:', error);
        authStatus.textContent = `Error al cerrar sesi+¦n: ${error.message}`;
    }
}

// --- Lgica de Administracin de Cuentas ---



async function saveAdminAccounts() {

    if (!isAuthReady || !db) {

        accountStatus.textContent = "Error: Conexi+¦n no lista.";

        return;

    }



    const bankName = adminBankNameInput.value;

    const accountHolder = adminAccountHolderInput.value.trim();

    const accountNumber = adminAccountNumberInput.value.trim();

    const rut = adminRutInput.value.trim();

    const accountType = adminAccountTypeInput.value;

    const email = adminEmailInput.value.trim();



    if (!bankName || !accountHolder || !accountNumber || !rut || !accountType) {

        accountStatus.textContent = "Error: Complete todos los campos requeridos (Banco, Titular, N+¦mero, RUT, Tipo).";

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

        console.error("Error: Conexi+¦n a Firebase no lista.");

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



    const collectionPath = `artifacts/${appId}/public/data/admin_accounts`;

    const accountsCollectionRef = collection(db, collectionPath);

    const q = query(accountsCollectionRef);



    onSnapshot(q, (snapshot) => {

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





// --- L+¦gica de Intercambio (C+ílculo) ---



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

        rateDisplay.textContent = "Cargando tasas de cambio din+ímicas...";

        paymentButton.disabled = true;

        return;

    }



    if (isNaN(amountSend) || amountSend <= 0) {

        amountReceiveDisplay.textContent = formatCurrency(0, currencyReceive);

        rateDisplay.textContent = "Ingrese un monto v+ílido.";

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



    const collectionPath = `artifacts/${appId}/users/${userId}/transactions`;

    const transactionsCollectionRef = collection(db, collectionPath);

    const q = query(transactionsCollectionRef);



    onSnapshot(q, (snapshot) => {

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



        const item = document.createElement('div');

        item.className = 'p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm';

        item.innerHTML = `

            <p class="font-bold text-gray-800">${formatCurrency(tx.amountSend, tx.currencySend)}  ${formatCurrency(tx.amountReceive, tx.currencyReceive)}</p>

            <p class="text-xs text-gray-500 mt-1">

                Tasa: ${tx.rateApplied ? tx.rateApplied.toFixed(tx.currencySend === 'CLP' ? 8 : 4) : 'N/A'}

                | Fecha: ${date} ${time}

            </p>

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
        if (currencyReceive === 'USDT') {
            usdtDestinationForm.classList.remove('hidden');
        } else {
            usdtDestinationForm.classList.add('hidden');
            if (usdtWalletInput) usdtWalletInput.value = '';
            if (usdtNetworkSelect) usdtNetworkSelect.value = '';
            if (usdtNotesInput) usdtNotesInput.value = '';
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
        extraTransactionData.userUsdtDestination = {
            wallet: usdtWalletInput ? usdtWalletInput.value.trim() : '',
            network: usdtNetworkSelect ? usdtNetworkSelect.value : '',
            notes: usdtNotesInput ? usdtNotesInput.value.trim() : '',
        };
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

        adminAccountDetailsContainer.innerHTML = '<p class="text-center text-gray-600 p-4">La direcci+¦n de la Wallet ser+í proporcionada por el administrador una vez que confirme su intenci+¦n de enviar criptomonedas.</p>';

    } else {

        modalCryptoWarning.classList.remove('hidden');

        modalCryptoWarning.textContent = `Aviso: El mtodo de transferencia para ${currencySend} debe ser coordinado con el administrador.`;

        adminAccountDetailsContainer.innerHTML = '';

    }



    paymentModal.classList.remove('hidden');

}





function scheduleUsdtDestinationPersist() {
    if (!isAuthReady || !db || !currentTransactionPath) return;
    if (usdtDestinationForm && usdtDestinationForm.classList.contains('hidden')) return;
    if (usdtDestinationSaveTimeout) clearTimeout(usdtDestinationSaveTimeout);
    usdtDestinationSaveTimeout = setTimeout(async () => {
        try {
            await updateDoc(doc(db, currentTransactionPath), {
                userUsdtDestination: {
                    wallet: usdtWalletInput ? usdtWalletInput.value.trim() : '',
                    network: usdtNetworkSelect ? usdtNetworkSelect.value : '',
                    notes: usdtNotesInput ? usdtNotesInput.value.trim() : '',
                },
            });
        } catch (error) {
            console.error('Error al guardar destino USDT:', error);
        }
    }, 400);
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



function setupAdminTransactionsListener() {

    if (!db || !isCurrentUserAdmin || !adminTransactionsList) {

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

        if (adminTransactionsList) {

            adminTransactionsList.innerHTML = '<p class="text-sm text-red-600">Error al cargar las rdenes.</p>';

        }

    });

}



function renderAdminTransactions(transactions) {

    if (!adminTransactionsList) return;



    if (!transactions.length) {

        adminTransactionsList.innerHTML = '<p class="text-sm text-gray-500">No hay rdenes registradas todava.</p>';

        if (adminTransactionsSection) {

            adminTransactionsSection.classList.remove('hidden');

        }

        return;

    }



    adminTransactionsList.innerHTML = '';



    transactions.forEach((tx) => {

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



        const userReceiptSection = tx.userReceiptUrl

            ? `<a href="${tx.userReceiptUrl}" target="_blank" rel="noopener" class="text-cyan-700 hover:underline text-xs md:text-sm">Ver comprobante del cliente</a>`

            : '<span class="text-xs text-orange-600">Comprobante del cliente pendiente</span>';



        const adminReceiptSection = tx.adminReceiptUrl

            ? `<a href="${tx.adminReceiptUrl}" target="_blank" rel="noopener" class="text-cyan-700 hover:underline text-xs md:text-sm">Ver comprobante de destino</a>`

            : '<span class="text-xs text-gray-500">Comprobante de destino no cargado</span>';



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



        adminTransactionsList.appendChild(card);

    });



    if (adminTransactionsSection) {

        adminTransactionsSection.classList.remove('hidden');

    }

}



// --- Inicializacin y Listeners ---



