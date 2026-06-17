const pool = require("../config/database");

// =========================================================
// CREATE ALERT
// =========================================================
const createAlert = async (req, res) => {

    let conn;

    try {

        const {
            label,
            confidence,
            person_id,
            timestamp,
            snapshot
        } = req.body;

        conn = await pool.getConnection();

        await conn.query(
            `
            INSERT INTO alerts
            (
                label,
                confidence,
                person_id,
                timestamp,
                snapshot
            )
            VALUES (?, ?, ?, ?, ?)
            `,
            [
                label,
                confidence,
                person_id,
                timestamp,
                snapshot
            ]
        );

        console.log("Alert Stored:", req.body);

        res.status(201).json({
            success: true,
            message: "Alert stored successfully"
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            error: error.message
        });

    } finally {

        if (conn) conn.release();
    }
};

// =========================================================
// GET ALERTS
// =========================================================
const getAlerts = async (req, res) => {

    let conn;

    try {

        conn = await pool.getConnection();

        const alerts = await conn.query(
            `
            SELECT *
            FROM alerts
            ORDER BY id DESC
            `
        );

        res.json(alerts);

    } catch (error) {

        res.status(500).json({
            error: error.message
        });

    } finally {

        if (conn) conn.release();
    }
};

module.exports = {
    createAlert,
    getAlerts
};