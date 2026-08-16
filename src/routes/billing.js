const express = require("express");
const router = express.Router();
const prisma = require("../db/client");
const azampay = require("../services/azampay");
const { merchantAuth } = require("../middleware/auth");

// Msaidizi mdogo wa try/catch
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * 1. INITIATE CHECKOUT (Mfanyabiashara anaanza malipo)
 * Inahitaji Merchant Auth Token
 */
router.post("/checkout", merchantAuth, wrap(async (req, res) => {
  const { phoneNumber, provider } = req.body;
  const merchantId = req.merchant.id;

  if (!phoneNumber || !provider) {
    return res.status(400).json({ error: "Namba ya simu na mtandao vinahitajika." });
  }

  // Bei ya kifurushi (Kwa sasa tunatumia TZS 30,000 kama default)
  const SUBSCRIPTION_AMOUNT = 30000;
  
  // Tengeneza Reference ID ya kipekee (External ID)
  const externalId = `SUB-${merchantId}-${Date.now()}`;

  // 1. Andika kwenye Database kama "pending"
  const paymentRecord = await prisma.subscriptionPayment.create({
    data: {
      merchantId,
      amount: SUBSCRIPTION_AMOUNT,
      phoneNumber,
      provider,
      referenceId: externalId,
      status: "pending"
    }
  });

  try {
    // 2. Tuma ombi kwenda AzamPay MNO Checkout
    const azamResponse = await azampay.mnoCheckout(phoneNumber, SUBSCRIPTION_AMOUNT, provider, externalId);
    
    // Sasisha rekodi na ujumbe toka AzamPay
    await prisma.subscriptionPayment.update({
      where: { id: paymentRecord.id },
      data: { message: azamResponse.message || "Tafadhali weka PIN kwenye simu yako" }
    });

    res.json({
      success: true,
      message: "Tafadhali angalia simu yako na uweke PIN kukamilisha malipo.",
      referenceId: externalId
    });

  } catch (error) {
    // Ikishindikana, update db
    await prisma.subscriptionPayment.update({
      where: { id: paymentRecord.id },
      data: { status: "failed", message: error.message }
    });

    res.status(500).json({ error: error.message || "Kuna shida katika kuunganisha na mtandao wako." });
  }
}));

/**
 * 2. WEBHOOK CALLBACK (AzamPay inatuma majibu hapa baada ya mteja kuweka PIN)
 * Hii HAIHITAJI merchantAuth kwa sababu inaitwa na server ya AzamPay
 */
router.post("/webhook", wrap(async (req, res) => {
  // Payload mfano: { transactionId: '...', externalId: '...', amount: '...', status: 'SUCCESS' }
  const { transactionId, externalId, status, message } = req.body;

  if (!externalId) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const payment = await prisma.subscriptionPayment.findUnique({
    where: { referenceId: externalId }
  });

  if (!payment) {
    return res.status(404).json({ error: "Payment not found" });
  }

  // Kama ishakuwa success, usifanye tena (Idempotency)
  if (payment.status === "success") {
    return res.json({ success: true, message: "Already processed" });
  }

  const isSuccess = status && status.toUpperCase() === "SUCCESS";

  // Sasisha rekodi ya malipo
  await prisma.subscriptionPayment.update({
    where: { id: payment.id },
    data: {
      status: isSuccess ? "success" : "failed",
      azampayRef: transactionId,
      message: message || status
    }
  });

  // Kama amefanikiwa kulipa, muongezee siku 30 kwenye kifurushi chake
  if (isSuccess) {
    const merchant = await prisma.merchant.findUnique({ where: { id: payment.merchantId } });
    
    let newEndDate = new Date();
    // Kama bado ana kifurushi kinachoendelea, muongezee kuanzia siku kinaisha
    if (merchant.subscriptionEndDate && merchant.subscriptionEndDate > newEndDate) {
      newEndDate = merchant.subscriptionEndDate;
    }
    
    // Ongeza siku 30
    newEndDate.setDate(newEndDate.getDate() + 30);

    await prisma.merchant.update({
      where: { id: merchant.id },
      data: { 
        subscriptionPlan: "monthly",
        subscriptionEndDate: newEndDate,
        status: "active" // Activate account if it was suspended
      }
    });

    console.log(`✅ Merchant ${merchant.id} amefanikiwa kulipia kifurushi kupitia AzamPay.`);
  } else {
    console.log(`❌ Malipo ya Merchant ${payment.merchantId} yameshindikana: ${message}`);
  }

  // AzamPay wanatarajia kurudishiwa 200 OK ili wajue tumepata majibu yao
  res.json({ success: true });
}));

module.exports = router;
