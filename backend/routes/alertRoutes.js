const express = require("express");

const router = express.Router();

// =========================================================
// MIDDLEWARE
// =========================================================
const authMiddleware =
    require("../middleware/authMiddleware");

const roleMiddleware =
    require("../middleware/roleMiddleware");

// =========================================================
// CONTROLLERS
// =========================================================
const {
    createAlert,
    getAlerts
} = require("../controllers/alertController");

// =========================================================
// CREATE ALERT
// AI SERVICE -> NODE BACKEND
// =========================================================
router.post(
    "/",
    createAlert
);

// =========================================================
// GET ALL ALERTS
// ONLY ADMIN + SECURITY GUARD
// =========================================================
router.get(
    "/",
    authMiddleware,
    roleMiddleware(
        "admin",
        "security_guard"
    ),
    getAlerts
);

module.exports = router;