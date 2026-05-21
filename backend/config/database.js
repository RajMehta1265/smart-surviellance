const mariadb = require("mariadb");
require("dotenv").config();

const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 5
});

const connectDB = async () => {

    let conn;

    try {

        conn = await pool.getConnection();

        console.log("✅ MariaDB Connected");

    } catch (error) {

        console.error(error);

    } finally {

        if (conn) conn.release();
    }
};

module.exports = pool;