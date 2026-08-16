const config = require("../config");
// Tunatumia fetch (Node 18+) badala ya axios ili kupunguza dependencies

class AzamPayService {
  constructor() {
    this.env = process.env.AZAMPAY_ENV || 'sandbox';
    this.baseUrl = this.env === 'sandbox' 
      ? 'https://sandbox.azampay.co.tz' 
      : 'https://checkout.azampay.co.tz';
    this.authUrl = this.env === 'sandbox'
      ? 'https://authenticator-sandbox.azampay.co.tz/AppIntegration/api/v1/Token/GetToken'
      : 'https://authenticator.azampay.co.tz/AppIntegration/api/v1/Token/GetToken';
      
    this.clientId = process.env.AZAMPAY_CLIENT_ID;
    this.clientSecret = process.env.AZAMPAY_CLIENT_SECRET;
    this.appName = process.env.AZAMPAY_APP_NAME;
  }

  /**
   * Pata Bearer Token kwa ajili ya kufanya miamala
   */
  async getAuthToken() {
    // Kama AzamPay wamekupa 'Token' ya moja kwa moja, itumie hiyo badala ya kuomba mpya.
    if (process.env.AZAMPAY_TOKEN) {
      return process.env.AZAMPAY_TOKEN;
    }

    if (!this.clientId || !this.clientSecret) {
      throw new Error("AzamPay credentials hazijawekwa kwenye .env");
    }

    const payload = {
      appName: this.appName,
      clientId: this.clientId,
      clientSecret: this.clientSecret
    };

    try {
      const response = await fetch(this.authUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("AzamPay Auth Error:", errorText);
        throw new Error("Imeshindwa kupata token ya AzamPay");
      }

      const data = await response.json();
      return data.data.accessToken; // AzamPay hurudisha token hapa
    } catch (error) {
      console.error("AzamPay getAuthToken Error:", error.message);
      throw error;
    }
  }

  /**
   * Tuma "Push USSD" kwenye simu ya mteja (MNO Checkout)
   * @param {string} accountNumber - Namba ya simu ya mteja (mfano: 075X XXX XXX)
   * @param {number} amount - Kiasi cha kukata (TZS)
   * @param {string} provider - Tigo, Mpesa, Airtel, Halopesa
   * @param {string} externalId - Reference ID yetu (unique per transaction)
   */
  async mnoCheckout(accountNumber, amount, provider, externalId) {
    try {
      const token = await this.getAuthToken();

      const payload = {
        accountNumber: accountNumber,
        amount: amount.toString(),
        currency: "TZS",
        externalId: externalId,
        provider: provider
      };

      const checkoutUrl = `${this.baseUrl}/azampay/mno/checkout`;

      const response = await fetch(checkoutUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error("AzamPay Checkout Failed:", responseData);
        throw new Error(responseData.message || "Malipo yameshindikana kwa mtandao");
      }

      return responseData; // Kawaida hurudisha success, message, na transactionId (azampayRef)
    } catch (error) {
      console.error("AzamPay MNO Checkout Error:", error.message);
      throw error;
    }
  }
}

module.exports = new AzamPayService();
