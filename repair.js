const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function computeInterbankFee(amount) {
    if (typeof amount !== 'number' || amount <= 0) return 0;
    return Math.ceil((amount < 700 ? 2 : amount * 0.003) * 100) / 100;
}

async function repair() {
    const orderIds = ['D8XT3OjacJY1d1XhLRdU', 'SuVSihTN1xRq6yI9rl5a', 'MoeTzxgKXaFnKVG22J1S', 'mdqwYBE0SK2W61d3CvfA'];

    // User requested to use Lorena's Venezuela account for all these 4 orders
    const accId = 'LORENA_VENEZUELA';
    const sourceBank = 'Venezuela';

    for (const id of orderIds) {
        const orderRef = db.collection('orders').doc(id);
        const orderDoc = await orderRef.get();
        const data = orderDoc.data();

        console.log(`Processing ${id} for destination bank ${data.bank} using account ${accId}`);
        const accRef = db.collection('accounts').doc(accId);
        const accDoc = await accRef.get();
        const accData = accDoc.data();

        if (!accData || accData.balance === undefined) {
            console.log(`Could not find valid account data for ${accId}`);
            continue;
        }

        const baseAmount = data.destinationAmount;
        let appliedFee = 0;

        // They are all transferencias from Venezuela to other banks
        // We calculate fee if destination bank isn't Venezuela
        if (data.bank !== sourceBank) {
            appliedFee = computeInterbankFee(baseAmount);
        }

        const adminFee = Math.ceil(baseAmount * 0.01 * 100) / 100;
        const tilloFee = Math.ceil(baseAmount * 0.0015 * 100) / 100;
        const totalDebit = baseAmount + appliedFee + adminFee + tilloFee;
        let runningBalance = accData.balance;

        const ts = data.paidAt || FieldValue.serverTimestamp();
        const batch = db.batch();

        batch.update(accRef, { balance: FieldValue.increment(-totalDebit) });

        runningBalance -= baseAmount;
        batch.set(db.collection('balance_history').doc(), {
            amount: baseAmount,
            type: 'subtract',
            note: `Pago pedido ${id.slice(-5)} (VES)`,
            timestamp: ts,
            holder: accData.holder || 'Sin titular',
            bank: accData.bank || 'Sin banco',
            balanceAfter: runningBalance
        });

        if (appliedFee > 0) {
            runningBalance -= appliedFee;
            batch.set(db.collection('balance_history').doc(), {
                amount: appliedFee,
                type: 'fee',
                note: `Comisión pedido ${id.slice(-5)}`,
                timestamp: ts,
                holder: accData.holder || 'Sin titular',
                bank: accData.bank || 'Sin banco',
                balanceAfter: runningBalance
            });
        }

        runningBalance -= adminFee;
        batch.set(db.collection('balance_history').doc(), {
            amount: adminFee,
            type: 'admin_commission',
            note: `Comisión Admin pedido ${id.slice(-5)}`,
            timestamp: ts,
            holder: accData.holder || 'Sin titular',
            bank: accData.bank || 'Sin banco',
            balanceAfter: runningBalance
        });

        runningBalance -= tilloFee;
        batch.set(db.collection('balance_history').doc(), {
            amount: tilloFee,
            type: 'tillo_commission',
            note: `Mano Tillo pedido ${id.slice(-5)}`,
            timestamp: ts,
            holder: accData.holder || 'Sin titular',
            bank: accData.bank || 'Sin banco',
            balanceAfter: runningBalance
        });

        await batch.commit();
        console.log(`Finished processing ${id} - new balance ${runningBalance} (Fee: ${appliedFee})`);
    }
}

repair().catch(console.error).then(() => process.exit(0));
