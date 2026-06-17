const express = require("express");
const router = express.Router();

const {
    getModels,
    describeIntruder,
    chatSecurity,
    getSurveillanceAlerts
} = require("../controllers/aiController");

// =========================================================
// OLLAMA GEN AI ROUTES
// =========================================================

// List all saved alerts without authentication (dashboard)
router.get("/alerts", getSurveillanceAlerts);

// List all installed Ollama models
router.get("/models", getModels);

// Describe intruder actions using Ollama
router.get("/describe/:person_id", describeIntruder);

// Chat with the AI security assistant
router.post("/chat", chatSecurity);

module.exports = router;
