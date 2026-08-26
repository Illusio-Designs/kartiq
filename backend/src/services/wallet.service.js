// Tenant wallet for Pay-As-You-Go
//
// Tenants pre-fund a wallet and overages are debited in real-time.
// Uses the Knex-backed "prisma" shim with FOR UPDATE row locks for safety.

const db = require('../utils/db');
const prisma = require('../utils/prisma');
const { randomUUID } = require('crypto');

async function getOrCreateWallet(tenantId) {
  let wallet = await prisma.tenantWallet.findFirst({ where: { tenantId } });
  if (wallet) return wallet;

  try {
    wallet = await prisma.tenantWallet.create({
      data: { tenantId, balance: 0, currency: 'INR', lowBalanceThreshold: 100 },
    });
    return wallet;
  } catch (e) {
    // Concurrent first-touch: another request created the row between our
    // findFirst and create (tenant_wallets has UNIQUE(tenantId)). Re-read
    // instead of surfacing a 500.
    if (e && (e.code === 'ER_DUP_ENTRY' || e.errno === 1062)) {
      const existing = await prisma.tenantWallet.findFirst({ where: { tenantId } });
      if (existing) return existing;
    }
    throw e;
  }
}

async function getBalance(tenantId) {
  const w = await getOrCreateWallet(tenantId);
  return Number(w.balance || 0);
}

// Credit the wallet (TOPUP, REFUND, ADJUSTMENT_CREDIT). Idempotent on
// `paymentRef`: if a transaction with the same (tenantId, paymentRef) already
// exists we return it instead of double-crediting. Relies on the
// `wallet_txn_payment_ref_unique` unique key for race-safety under concurrent
// webhook + sync verify calls.
async function topup(tenantId, amount, { reference, description, createdById, paymentRef, type = 'TOPUP' } = {}) {
  const amt = Number(amount);
  if (!amt || amt <= 0) throw new Error('Topup amount must be positive');

  // Cheap pre-check — skip the txn if we've seen this paymentRef.
  if (paymentRef) {
    const existing = await db('wallet_transactions').where({ tenantId, paymentRef }).first();
    if (existing) {
      return {
        balanceAfter: Number(existing.balanceAfter),
        amount: Number(existing.amount),
        transactionId: existing.id,
        alreadyCredited: true,
      };
    }
  }

  await getOrCreateWallet(tenantId);
  try {
    return await db.transaction(async (trx) => {
      const [w] = await trx.raw('SELECT * FROM tenant_wallets WHERE tenantId = ? FOR UPDATE', [tenantId]);
      const row = Array.isArray(w) ? w[0] : w;
      const newBalance = Number(row.balance) + amt;
      await trx('tenant_wallets').where({ tenantId }).update({ balance: newBalance, updatedAt: new Date() });
      const txId = randomUUID();
      await trx('wallet_transactions').insert({
        id: txId, tenantId, walletId: row.id, type, amount: amt, balanceAfter: newBalance,
        reference: reference || null, description: description || null,
        createdById: createdById || null, paymentRef: paymentRef || null,
        createdAt: new Date(),
      });
      return { balanceAfter: newBalance, amount: amt, transactionId: txId };
    });
  } catch (err) {
    // Race: a concurrent caller inserted the same (tenantId,paymentRef)
    // between our pre-check and insert. Fall back to the existing row.
    if (paymentRef && (err?.code === 'ER_DUP_ENTRY' || /Duplicate entry/.test(err?.message || ''))) {
      const existing = await db('wallet_transactions').where({ tenantId, paymentRef }).first();
      if (existing) {
        return {
          balanceAfter: Number(existing.balanceAfter),
          amount: Number(existing.amount),
          transactionId: existing.id,
          alreadyCredited: true,
        };
      }
    }
    throw err;
  }
}

// Debit the wallet for overage usage. Returns { ok: false, ... } if insufficient funds.
async function debit(tenantId, amount, { metric, quantity, reference, description, createdById } = {}) {
  const amt = Number(amount);
  if (!amt || amt <= 0) throw new Error('Debit amount must be positive');

  await getOrCreateWallet(tenantId);
  return db.transaction(async (trx) => {
    const [w] = await trx.raw('SELECT * FROM tenant_wallets WHERE tenantId = ? FOR UPDATE', [tenantId]);
    const row = Array.isArray(w) ? w[0] : w;
    const current = Number(row.balance);
    if (current < amt) {
      return { ok: false, balance: current, required: amt };
    }
    const newBalance = current - amt;
    await trx('tenant_wallets').where({ tenantId }).update({ balance: newBalance, updatedAt: new Date() });
    const txId = randomUUID();
    await trx('wallet_transactions').insert({
      id: txId, tenantId, walletId: row.id, type: 'DEBIT', amount: -amt, balanceAfter: newBalance,
      metric: metric || null, quantity: quantity || null,
      reference: reference || null, description: description || null,
      createdById: createdById || null,
      createdAt: new Date(),
    });
    return { ok: true, balanceAfter: newBalance, amount: amt, transactionId: txId };
  });
}

async function history(tenantId, limit = 50) {
  return db('wallet_transactions')
    .where({ tenantId })
    .orderBy('createdAt', 'desc')
    .limit(Number(limit));
}

async function isLowBalance(tenantId) {
  const w = await getOrCreateWallet(tenantId);
  return Number(w.balance) < Number(w.lowBalanceThreshold);
}

module.exports = {
  getOrCreateWallet,
  getBalance,
  topup,
  debit,
  history,
  isLowBalance,
};
