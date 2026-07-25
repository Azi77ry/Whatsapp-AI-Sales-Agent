const jwt = require("jsonwebtoken");
const config = require("../config");

function authMiddleware(req, res, next) {
  // Ruhusu kupita bila token kwa endpoints za login na register (ingawa hazipo hapa, ni salama kuwa na ulinzi huu)
  if (req.path.startsWith("/auth/")) {
    return next();
  }

  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Ufikiaji umekataliwa. Token inahitajika." });
  }

  try {
    const verified = jwt.verify(token, config.jwtSecret);
    req.merchantId = verified.merchantId;
    req.merchantEmail = verified.email;
    next();
  } catch (err) {
    res.status(403).json({ error: "Token si sahihi au imeisha muda wake." });
  }
}

module.exports = authMiddleware;
