// Mlango mkuu wa moduli ya WhatsApp Cloud API (V2)
module.exports = {
  cloudApiClient: require("./cloudApiClient"),
  webhookRoutes: require("./webhookRoutes"),
  connectionService: require("./connectionService"),
  messageSender: require("./messageSender"),
  tokenService: require("./tokenService"),
  cloudApiAdapter: require("./adapters/cloudApiAdapter"),
};
