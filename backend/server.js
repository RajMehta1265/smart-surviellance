require("dotenv").config(); // reload with key

const express = require("express");
const cors = require("cors");

const pool =
    require("./config/database");

const authRoutes =
    require("./routes/authRoutes");

const alertRoutes =
    require("./routes/alertRoutes");

const aiRoutes =
    require("./routes/aiRoutes");

const app = express();

// ======================================================
// MIDDLEWARE
// ======================================================

app.use(cors());

app.use(express.json());

// ======================================================
// DATABASE TEST
// ======================================================

pool.getConnection()
    .then((conn) => {

        console.log(
            "✅ MariaDB Connected"
        );

        conn.release();

    })
    .catch((err) => {

        console.log(
            "Database Error:",
            err
        );
    });

// ======================================================
// ROUTES
// ======================================================

app.get("/api/diagnose", async (req, res) => {
    const envVars = {
        DB_HOST: process.env.DB_HOST,
        DB_PORT: process.env.DB_PORT,
        DB_NAME: process.env.DB_NAME,
        DB_USER: process.env.DB_USER,
        DB_PASSWORD_EXISTS: !!process.env.DB_PASSWORD,
        GROQ_API_KEY_EXISTS: !!process.env.GROQ_API_KEY,
        PORT: process.env.PORT,
        NODE_ENV: process.env.NODE_ENV
    };

    let dbStatus = "Unknown";
    let dbError = null;

    try {
        const conn = await pool.getConnection();
        dbStatus = "Connected successfully";
        const [rows] = await conn.query("SHOW TABLES");
        dbStatus += `. Tables: ${JSON.stringify(rows.map(r => Object.values(r)[0]))}`;
        conn.release();
    } catch (err) {
        dbStatus = "Failed to connect";
        dbError = {
            message: err.message,
            code: err.code,
            errno: err.errno,
            sqlState: err.sqlState,
            stack: err.stack
        };
    }

    res.json({
        success: true,
        envVars,
        dbStatus,
        dbError
    });
});

app.use(
    "/api/auth",
    authRoutes
);

app.use(
    "/api/alerts",
    alertRoutes
);

app.use(
    "/api/ai",
    aiRoutes
);

// ======================================================
// HOME ROUTE
// ======================================================

app.get("/", (req, res) => {

    res.json({
        message:
            "AI Surveillance Backend Running"
    });
});

// ======================================================
// SERVER
// ======================================================

const PORT =
    process.env.PORT || 5000;

app.listen(PORT, () => {

    console.log(
        `🚀 Server running on port ${PORT}`
    );
});