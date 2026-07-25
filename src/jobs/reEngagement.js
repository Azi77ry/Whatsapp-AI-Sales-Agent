// RE-ENGAGEMENT JOB - Inatumia node-cron kutuma "abandoned cart nudge" kwa wateja
// walioshiriki mazungumzo ya ununuzi (4+ ujumbe) lakini hawakukamilisha oda yao.
// Imeboreshwa kwa SaaS: Inapitia wateja kwa kila mfanyabiashara (merchant) kipekee.

const cron = require("node-cron");
const prisma = require("../db/client");
const config = require("../config");
const { sendMessage } = require("../whatsapp/sender");
const { callAISimple } = require("../ai/callAISimple");

const MIN_MESSAGES = 4; // idadi ya chini ya ujumbe kuonyesha nia ya kununua

function currentHourEAT() {
  return (new Date().getUTCHours() + 3) % 24; // EAT = UTC+3, wrapped to stay within 0-23
}

async function generateNudge(customerName, recentMessages, contextSummary, merchant) {
  const name = customerName || "Rafiki";
  const shopName = merchant?.businessName || config.businessName || "WhatsApp Store";
  
  const historySnippet = recentMessages
    .slice(-6)
    .map((m) => `${m.sender === "customer" ? "Mteja" : "AI"}: ${m.content}`)
    .join("\n");

  const contextHint = contextSummary
    ? `Muhtasari wa mteja: ${contextSummary}`
    : `Mazungumzo ya hivi karibuni:\n${historySnippet}`;

  const customPromptContext = merchant?.businessContext
    ? `Miongozo na maelezo ya ziada ya duka la ${shopName}:\n"${merchant.businessContext}"\n`
    : "";

  const prompt = `Wewe ni muuzaji wa kidijitali wa duka linaloitwa "${shopName}" Tanzania. Mteja aliyeitwa "${name}" alianza mazungumzo ya kununua lakini hakukamilisha oda yake.
 
${customPromptContext}
${contextHint}
 
Andika ujumbe MFUPI wa WhatsApp (sentensi 1-2 tu) wa Kiswahili wa kirafiki unaomkumbusha mteja kuhusu bidhaa aliyokuwa akiangalia. Ujumbe uwe:
- Wa kirafiki na wa kawaida (siyo wa kuuza kwa nguvu)
- Utaje bidhaa halisi kama unajua ni bidhaa gani alitaka
- Uwe mfupi na wa asili kama rafiki anayekumbusha
- Tumia jina la mteja kama unajua
- Unaweza kutaja stoki kupungua kama inafaa
- Usiandike zaidi ya sentensi 2
 
Mfano wa jibu zuri: "Habari Juma! 😊 Bado unahitaji ile Jezi ya Barcelona? Stock imebaki chache tu — niambie ukiwa tayari nikukamilishie haraka!"
 
Andika ujumbe tu, bila maelezo mengine:`;

  const text = await callAISimple(prompt, { max_tokens: 100, temperature: 0.7 });
  if (text) return text;

  return `Habari ${name}! 😊 Tunaona bado hujakamilisha oda yako — tuko hapa kukusaidia ukiwa tayari. Jibu tu ujumbe huu! 🙌`;
}

// ── Kazi kuu ya re-engagement ─────────────────────────────────────────────────
async function runReEngagement() {
  const hourEAT = currentHourEAT();
  const now = new Date();

  // Pata wafanyabiashara wote pamoja na mipangilio yao
  const merchants = await prisma.merchant.findMany();

  for (const merchant of merchants) {
    const {
      id: merchantId,
      businessName,
      reEngagementMinHours,
      reEngagementMaxHours,
      reEngagementCooldownHours,
      reEngagementStartHour,
      reEngagementEndHour,
    } = merchant;

    // Angalia kama saa hii ni nzuri ya kutuma kulingana na mipangilio ya merchant huyu
    if (hourEAT < reEngagementStartHour || hourEAT >= reEngagementEndHour) {
      console.log(`⏰ Merchant #${merchantId} (${businessName}): Nje ya muda wa kutuma (saa ${hourEAT} EAT, Config: ${reEngagementStartHour}-${reEngagementEndHour}). Inarukwa.`);
      continue;
    }

    console.log(`🔎 Re-engagement: Inakagua wateja wa Merchant #${merchantId} (${businessName})...`);

    const minAgo = new Date(now.getTime() - reEngagementMinHours * 60 * 60 * 1000);
    const maxAgo = new Date(now.getTime() - reEngagementMaxHours * 60 * 60 * 1000);
    const cooldownAgo = new Date(now.getTime() - reEngagementCooldownHours * 60 * 60 * 1000);

    // Tafuta wateja wanaostahili nudge kwa merchant huyu
    const candidates = await prisma.conversation.findMany({
      where: {
        merchantId,
        contactType: "customer",
        updatedAt: { gte: maxAgo, lte: minAgo },
        OR: [
          { reEngagedAt: null },
          { reEngagedAt: { lte: cooldownAgo } },
        ],
        orders: { none: { status: { in: ["confirmed", "delivered"] } } },
      },
      include: {
        _count: { select: { messages: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 6 },
      },
      take: 5,
    });

    const eligible = candidates.filter((c) => c._count.messages >= MIN_MESSAGES);

    if (eligible.length === 0) {
      console.log(`📣 Merchant #${merchantId}: Hakuna wateja wanaostahili nudge kwa sasa.`);
      continue;
    }

    console.log(`📣 Merchant #${merchantId}: Watu ${eligible.length} wanaostahili nudge — inaanza kutuma...`);

    for (const conv of eligible) {
      try {
        const recentMessages = conv.messages.slice().reverse();
        const nudge = await generateNudge(conv.customerName, recentMessages, conv.contextSummary, merchant);

        const ok = await sendMessage(conv.customerPhone, nudge, merchantId);
        if (ok) {
          await prisma.conversation.update({
            where: { id: conv.id },
            data: { reEngagedAt: now },
          });
          console.log(`✅ Nudge imetumwa (Merchant #${merchantId}): ${conv.customerName || conv.customerPhone} → "${nudge.slice(0, 60)}..."`);
        } else {
          console.warn(`⚠️  Nudge imeshindwa kutumwa kwa Merchant #${merchantId}: ${conv.customerPhone}`);
        }

        await new Promise((r) => setTimeout(r, 2000));
      } catch (err) {
        console.error(`⚠️  Kosa la re-engagement kwa ${conv.customerPhone} (Merchant #${merchantId}):`, err.message);
      }
    }
  }
}

// ── Anzisha cron job ──────────────────────────────────────────────────────────
function startReEngagementJob() {
  cron.schedule("0 * * * *", () => {
    console.log(`\n⏰ Re-engagement cron inaanza (${new Date().toISOString()})...`);
    runReEngagement().catch((err) => {
      console.error("⚠️  Re-engagement cron imeshindwa:", err.message);
    });
  });

  console.log("⏰ Re-engagement cron job imeanzishwa (inakagua kila saa kwa wafanyabiashara wote).");
}

if (require.main === module) {
  console.log("🧪 Kuendesha re-engagement moja kwa moja kwa testing...");
  runReEngagement()
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { startReEngagementJob, runReEngagement };
