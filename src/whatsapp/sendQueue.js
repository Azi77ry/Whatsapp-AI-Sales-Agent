// 🛡️ FOLENI YA KUTUMA (Outbound Send Queue) - kila merchant ana foleni yake moja.
// Kila ujumbe unaotoka (majibu ya AI, taarifa za oda, nudges, OTP) LAZIMA upite hapa ili:
//   1. Ujumbe usitoke kwa mlipuko (burst) - kuna nafasi ya chini kati ya kila ujumbe
//   2. Kikomo cha siku kihesabu KILA ujumbe na kihifadhiwe kwenye database (hakipotei restart)
//   3. Namba mpya ianze na kikomo kidogo na kuongezeka polepole (warm-up)
//   4. Nudges (marketing) zisizidi sehemu ndogo ya kikomo cha siku
//
// Moduli hii haitegemei manager.js wala messageHandler.js ili kuepuka circular dependency.

const prisma = require("../db/client");

// Nafasi ya chini (ms) kati ya ujumbe mmoja na unaofuata kutoka namba moja, kwa kila aina
const GAPS = {
  reply: [1500, 3000], // Majibu kwa mteja aliyeandika kwanza
  transactional: [3000, 6000], // Taarifa za oda, OTP, special requests
  marketing: [20000, 45000], // Nudges za re-engagement
};

// Warm-up: kikomo cha siku kulingana na siku ngapi tangu namba iunganishwe
const WARMUP_STAGES = [
  { untilDay: 3, limit: 80 },
  { untilDay: 7, limit: 200 },
  { untilDay: 14, limit: 400 },
  { untilDay: Infinity, limit: 800 },
];

const MARKETING_SHARE = 0.15; // Nudges zisizidi 15% ya kikomo cha siku
const MARKETING_STOP_AT = 0.7; // Simamisha nudges kama 70% ya kikomo tayari kimetumika
const MAX_PENDING_MARKETING = 10; // Usiweke nudges nyingi kwenye foleni

const STATE_TTL_MS = 60 * 1000;

const queues = new Map(); // merchantId -> mkia wa Promise chain
const pendingCounts = new Map(); // merchantId -> idadi ya kazi zinazosubiri
const lastSentAt = new Map(); // merchantId -> timestamp
const states = new Map(); // merchantId -> hali iliyosomwa kutoka DB

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randBetween = ([min, max]) => min + Math.floor(Math.random() * (max - min));

// Siku ya leo kwa saa za Afrika Mashariki (EAT = UTC+3)
function todayEAT() {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function daysSince(date) {
  if (!date) return 0;
  return Math.floor((Date.now() - new Date(date).getTime()) / (24 * 60 * 60 * 1000));
}

function computeDailyLimit(state) {
  if (state.dailyMsgLimit && state.dailyMsgLimit > 0) return state.dailyMsgLimit;
  const day = daysSince(state.waLinkedAt);
  return WARMUP_STAGES.find((s) => day < s.untilDay).limit;
}

async function getState(mId) {
  const cached = states.get(mId);
  const today = todayEAT();
  if (cached && cached.loadedAt > Date.now() - STATE_TTL_MS && cached.sendCountDate === today) {
    return cached;
  }

  const m = await prisma.merchant.findUnique({
    where: { id: mId },
    select: {
      waBanned: true,
      waLinkedAt: true,
      dailyMsgLimit: true,
      sendCountDate: true,
      sendCountToday: true,
      marketingCountToday: true,
    },
  });
  if (!m) return null;

  const isToday = m.sendCountDate === today;
  const state = {
    ...m,
    sendCountDate: today,
    sendCountToday: isToday ? m.sendCountToday : 0,
    marketingCountToday: isToday ? m.marketingCountToday : 0,
    loadedAt: Date.now(),
  };
  states.set(mId, state);
  return state;
}

// Futa cache (itumike baada ya kubadilisha waBanned / waLinkedAt / dailyMsgLimit)
function invalidateState(merchantId) {
  states.delete(parseInt(merchantId, 10));
}

function blockReason(state, kind) {
  if (!state) return "merchant_not_found";
  if (state.waBanned) return "banned";
  const limit = computeDailyLimit(state);
  if (state.sendCountToday >= limit) return "daily_limit";
  if (kind === "marketing") {
    if (state.marketingCountToday >= Math.floor(limit * MARKETING_SHARE)) return "marketing_limit";
    if (state.sendCountToday >= Math.floor(limit * MARKETING_STOP_AT)) return "marketing_paused";
  }
  return null;
}

/**
 * Angalia kabla ya kazi nzito (mf. kuita AI) kama ujumbe wa aina hii utaruhusiwa.
 * Inarudisha null kama inaruhusiwa, au sababu ya kuzuia.
 */
async function checkCanSend(merchantId, kind = "reply") {
  const mId = parseInt(merchantId, 10);
  return blockReason(await getState(mId), kind);
}

async function recordSend(mId, state, kind) {
  state.sendCountToday += 1;
  if (kind === "marketing") state.marketingCountToday += 1;
  try {
    await prisma.merchant.update({
      where: { id: mId },
      data: {
        sendCountDate: state.sendCountDate,
        sendCountToday: state.sendCountToday,
        marketingCountToday: state.marketingCountToday,
      },
    });
  } catch (err) {
    console.error(`⚠️  Imeshindwa kuhifadhi hesabu ya ujumbe (Merchant #${mId}):`, err.message);
  }
}

async function runJob(mId, kind, sendFn) {
  const state = await getState(mId);
  const reason = blockReason(state, kind);
  if (reason) {
    console.warn(`🛡️  Merchant #${mId} - Ujumbe (${kind}) umezuiwa: ${reason}`);
    return false;
  }

  const wait = (lastSentAt.get(mId) || 0) + randBetween(GAPS[kind] || GAPS.reply) - Date.now();
  if (wait > 0) await sleep(wait);

  await sendFn();
  lastSentAt.set(mId, Date.now());
  await recordSend(mId, state, kind);
  return true;
}

/**
 * Weka ujumbe kwenye foleni ya merchant.
 * @param {number} merchantId
 * @param {"reply"|"transactional"|"marketing"} kind
 * @param {() => Promise<any>} sendFn - kazi inayotuma ujumbe halisi
 * @returns {Promise<boolean>} true kama umetumwa, false kama umezuiwa na kikomo/ban.
 *          Inarusha (throws) kama sendFn yenyewe imeshindwa.
 */
function enqueueSend(merchantId, kind, sendFn) {
  const mId = parseInt(merchantId, 10);
  const pending = pendingCounts.get(mId) || 0;

  if (kind === "marketing" && pending >= MAX_PENDING_MARKETING) {
    console.warn(`🛡️  Merchant #${mId} - Foleni imejaa, nudge imerukwa.`);
    return Promise.resolve(false);
  }

  pendingCounts.set(mId, pending + 1);
  const prev = queues.get(mId) || Promise.resolve();
  const job = prev.then(() => runJob(mId, kind, sendFn));
  const tail = job
    .catch(() => {})
    .finally(() => pendingCounts.set(mId, (pendingCounts.get(mId) || 1) - 1));
  queues.set(mId, tail);
  return job;
}

/**
 * Takwimu za usalama wa namba kwa ajili ya dashboard
 */
async function getSendStats(merchantId) {
  const mId = parseInt(merchantId, 10);
  const state = await getState(mId);
  if (!state) return null;
  const dailyLimit = computeDailyLimit(state);
  const day = daysSince(state.waLinkedAt);
  const stageIndex = WARMUP_STAGES.findIndex((s) => day < s.untilDay);
  return {
    sentToday: state.sendCountToday,
    dailyLimit,
    marketingSentToday: state.marketingCountToday,
    marketingLimit: Math.floor(dailyLimit * MARKETING_SHARE),
    customLimit: Boolean(state.dailyMsgLimit),
    linkedDays: state.waLinkedAt ? day : null,
    warmupStage: stageIndex + 1,
    warmupStages: WARMUP_STAGES.length,
    nextStageInDays: Number.isFinite(WARMUP_STAGES[stageIndex].untilDay)
      ? WARMUP_STAGES[stageIndex].untilDay - day
      : null,
    queueLength: pendingCounts.get(mId) || 0,
  };
}

module.exports = { enqueueSend, checkCanSend, getSendStats, invalidateState, todayEAT };
