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



    if (toggleAdminButton) {

        toggleAdminButton.addEventListener('click', () => {

            adminPanel.classList.toggle('hidden');

            toggleAdminButton.textContent = adminPanel.classList.contains('hidden') ? 'Mostrar Panel de Administracin' : 'Ocultar Panel de Administracin';

        });

    }



    if (saveAccountsButton) saveAccountsButton.addEventListener('click', saveAdminAccounts);

    if (saveMarginsButton) saveMarginsButton.addEventListener('click', saveMarginConfig);

    if (uploadReceiptButton) uploadReceiptButton.addEventListener('click', handleUserReceiptUpload);

    if (savedAccountsList) savedAccountsList.addEventListener('click', handleSavedAccountsListClick);

    if (adminTransactionsList) adminTransactionsList.addEventListener('click', handleAdminTransactionsListClick);

    // Listeners para los nuevos formularios de autenticaci+¦n
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
