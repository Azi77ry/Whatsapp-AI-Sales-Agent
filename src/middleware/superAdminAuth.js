// Middleware ya Super-Admin — inalinda routes za /api/superadmin/*
// Inahitaji mtumiaji awe na role === "superadmin" kwenye JWT token yake

const jwt = require("jsonwebtoken");
const config = require("../config");

function superAdminAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Token inahitajika." });
  }

  try {
    const verified = jwt.verify(token, config.jwtSecret);

    if (verified.role !== "superadmin") {
      return res.status(403).json({ error: "Ufikiaji umekataliwa. Super-Admin pekee." });
    }

    req.merchantId = verified.merchantId;
    req.merchantEmail = verified.email;
    req.role = verified.role;
    next();
  } catch (err) {
    res.status(403).json({ error: "Token si sahihi au imeisha muda wake." });
  }
}

module.exports = superAdminAuth;
