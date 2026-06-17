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