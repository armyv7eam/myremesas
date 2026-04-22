const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const force = args.has("--force");

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function round4(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 10000) / 10000;
}

function round6(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 1000000) / 1000000;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseLocaleNumber(raw) {
  if (!raw) return null;
  let text = String(raw).trim();
  if (!text) return null;

  text = text.replace(/\s+/g, "");
  const hasDot = text.includes(".");
  const hasComma = text.includes(",");

  if (hasDot && hasComma) {
    if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    text = text.replace(",", ".");
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractFromNote(note) {
  const text = String(note || "");
  if (!text) return { ves: null, rate: null, source: null };

  const vesMatch = text.match(/equivalente a\s*([\d.,\s]+)\s*ves/i);
  const rateMatch = text.match(/@\s*([\d.,]+)/i);

  const ves = vesMatch ? parseLocaleNumber(vesMatch[1]) : null;
  const rate = rateMatch ? parseLocaleNumber(rateMatch[1]) : null;

  if (ves !== null || rate !== null) {
    return { ves, rate, source: "note" };
  }
  return { ves: null, rate: null, source: null };
}

function extractFromOrder(orderData) {
  if (!orderData) return { ves: null, source: null };

  const base = toNumber(orderData.destinationAmount);
  if (!(base > 0)) return { ves: null, source: null };

  const fee = toNumber(orderData.bankFee);
  const adminCommission = toNumber(orderData.adminCommission);
  const tilloCommission = toNumber(orderData.tilloCommission);
  const ves = base + fee + adminCommission + tilloCommission;

  if (!(ves > 0)) return { ves: null, source: null };
  return { ves: round2(ves), source: "order" };
}

async function loadOrdersByIds(orderIds) {
  const result = new Map();
  const ids = Array.from(orderIds).filter(Boolean);
  const chunkSize = 300;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const refs = chunk.map((id) => db.collection("orders").doc(id));
    const snaps = await db.getAll(...refs);
    snaps.forEach((snap) => {
      if (snap.exists) result.set(snap.id, snap.data());
    });
  }

  return result;
}

async function main() {
  const historySnap = await db.collection("clp_balance_history").get();
  const entries = historySnap.docs.map((docSnap) => ({ id: docSnap.id, ref: docSnap.ref, data: docSnap.data() }));

  const orderIds = new Set();
  entries.forEach((entry) => {
    const orderId = entry.data?.orderId;
    if (typeof orderId === "string" && orderId.trim()) orderIds.add(orderId.trim());
  });
  const ordersById = await loadOrdersByIds(orderIds);

  let touched = 0;
  let unresolved = 0;
  let alreadyComplete = 0;
  let derivedFromOrder = 0;
  let derivedFromNote = 0;
  let derivedRateFromDivision = 0;

  const pendingUpdates = [];
  const unresolvedSamples = [];

  for (const entry of entries) {
    const data = entry.data || {};
    const clpAmount = round2(toNumber(data.amount));

    const hasRate = typeof data.purchaseRateVESUsed === "number" && data.purchaseRateVESUsed > 0;
    const hasVes = typeof data.vesAmountAtCalc === "number" && data.vesAmountAtCalc > 0;
    const hasClpComputed = typeof data.clpAmountComputed === "number" && data.clpAmountComputed > 0;

    if (!force && hasRate && hasVes && hasClpComputed) {
      alreadyComplete += 1;
      continue;
    }

    const updates = {};

    if (!hasClpComputed || force) {
      if (clpAmount > 0) {
        updates.clpAmountComputed = clpAmount;
      }
    }

    let derivedVes = null;
    let derivedRate = null;

    const orderId = typeof data.orderId === "string" ? data.orderId.trim() : "";
    if (orderId && ordersById.has(orderId)) {
      const orderDerived = extractFromOrder(ordersById.get(orderId));
      if (orderDerived.ves !== null) {
        derivedVes = orderDerived.ves;
        derivedFromOrder += 1;
      }
    }

    if (derivedVes === null) {
      const fromNote = extractFromNote(data.note || data.description || "");
      if (fromNote.ves !== null) {
        derivedVes = round6(fromNote.ves);
        derivedFromNote += 1;
      }
      if (fromNote.rate !== null) {
        derivedRate = round4(fromNote.rate);
      }
    }

    if (derivedRate === null) {
      const vesForRate = derivedVes !== null ? derivedVes : (typeof data.vesAmountAtCalc === "number" ? data.vesAmountAtCalc : null);
      const clpForRate = clpAmount > 0 ? clpAmount : (typeof data.clpAmountComputed === "number" ? data.clpAmountComputed : 0);
      if (vesForRate && clpForRate > 0) {
        derivedRate = round4(vesForRate / clpForRate);
        derivedRateFromDivision += 1;
      }
    }

    if ((!hasVes || force) && derivedVes !== null) {
      updates.vesAmountAtCalc = derivedVes;
    }
    if ((!hasRate || force) && derivedRate !== null) {
      updates.purchaseRateVESUsed = derivedRate;
    }

    if (Object.keys(updates).length > 0) {
      updates.metadataBackfilledAt = FieldValue.serverTimestamp();
      pendingUpdates.push({ ref: entry.ref, updates });
      touched += 1;
    } else {
      unresolved += 1;
      if (unresolvedSamples.length < 20) {
        unresolvedSamples.push({
          id: entry.id,
          type: data.type || "",
          orderId: data.orderId || "",
          amount: clpAmount,
          note: (data.note || data.description || "").slice(0, 120),
        });
      }
    }
  }

  console.log("=== BACKFILL CLP METADATA ===");
  console.log(`mode: ${apply ? "APPLY" : "DRY_RUN"}`);
  console.log(`force: ${force ? "true" : "false"}`);
  console.log(`total_docs: ${entries.length}`);
  console.log(`already_complete: ${alreadyComplete}`);
  console.log(`to_update: ${pendingUpdates.length}`);
  console.log(`unresolved: ${unresolved}`);
  console.log(`derived_from_order: ${derivedFromOrder}`);
  console.log(`derived_from_note: ${derivedFromNote}`);
  console.log(`derived_rate_from_division: ${derivedRateFromDivision}`);

  if (unresolvedSamples.length > 0) {
    console.log("--- unresolved_samples ---");
    unresolvedSamples.forEach((s, idx) => {
      console.log(`${idx + 1}. id=${s.id} type=${s.type} orderId=${s.orderId} amount=${s.amount} note="${s.note}"`);
    });
  }

  if (!apply) return;
  if (pendingUpdates.length === 0) return;

  const chunkSize = 400;
  let committed = 0;

  for (let i = 0; i < pendingUpdates.length; i += chunkSize) {
    const chunk = pendingUpdates.slice(i, i + chunkSize);
    const batch = db.batch();
    chunk.forEach((item) => batch.set(item.ref, item.updates, { merge: true }));
    await batch.commit();
    committed += chunk.length;
    console.log(`committed: ${committed}/${pendingUpdates.length}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("BACKFILL_ERROR:", error?.message || error);
    process.exit(1);
  });
