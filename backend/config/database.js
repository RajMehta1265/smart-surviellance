const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT && !isNaN(Number(process.env.DB_PORT)) ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 5,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
});
console.log("Database Pool Created:", typeof pool, typeof pool?.getConnection);

const initializeDB = async () => {
    let conn;
    try {
        conn = await pool.getConnection();
        console.log("⏳ Initializing database tables...");
        
        // Create users table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'security_guard'
            )
        `);
        
        // Create alerts table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS alerts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                label VARCHAR(255) NOT NULL,
                confidence FLOAT NOT NULL,
                person_id INT NOT NULL,
                timestamp DATETIME NOT NULL,
                snapshot VARCHAR(255) NOT NULL,
                ai_analysis TEXT DEFAULT NULL
            )
        `);
        
        // Seed mock alerts if empty
        const [countRes] = await conn.query("SELECT COUNT(*) as count FROM alerts");
        if (countRes && countRes[0] && Number(countRes[0].count) === 0) {
            console.log("🌱 Seeding mock surveillance alerts for demo...");
            const now = new Date();
            const formatMySQLDate = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
            const time1_1 = formatMySQLDate(new Date(now.getTime() - 15 * 60 * 1000 - 10000));
            const time1_2 = formatMySQLDate(new Date(now.getTime() - 15 * 60 * 1000));
            const time2 = formatMySQLDate(new Date(now.getTime() - 5 * 60 * 1000));
            
            await conn.query(`
                INSERT INTO alerts (label, confidence, person_id, timestamp, snapshot)
                VALUES 
                ('person', 0.88, 1, ?, 'intrusion_1_demo.jpg'),
                ('person', 0.94, 1, ?, 'intrusion_1_demo.jpg'),
                ('person', 0.91, 2, ?, 'intrusion_2_demo.jpg')
            `, [time1_1, time1_2, time2]);
            
            // Also seed sample event history in events.txt
            try {
                const fs = require("fs");
                const path = require("path");
                const logDir = path.join(__dirname, "../../ai-service/logs");
                const logFile = path.join(logDir, "events.txt");
                fs.mkdirSync(logDir, { recursive: true });
                fs.writeFileSync(logFile, 
                    `[${time1_1}] ALERT: Person ID 1 entered restricted zone\n` +
                    `[${time1_2}] ALERT: Person ID 1 left restricted zone\n` +
                    `[${time2}] ALERT: Person ID 2 entered restricted zone\n`
                );
            } catch (err) {
                console.error("Failed to seed event text file:", err.message);
            }
            
            console.log("🌱 Seeding complete.");
        }
        
        console.log("✅ Database tables checked/created/seeded successfully.");
    } catch (error) {
        console.error("❌ Database Initialization Error:", error);
    } finally {
        if (conn) conn.release();
    }
};

// Run initialization automatically
initializeDB();

module.exports = pool;