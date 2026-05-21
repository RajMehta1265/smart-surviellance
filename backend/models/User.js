const  pool  = require("../config/database");

const createUser = async (
    username,
    password,
    role
) => {

    let conn;

    try {

        conn = await pool.getConnection();

        const result = await conn.query(
            `
            INSERT INTO users
            (username, password, role)
            VALUES (?, ?, ?)
            `,
            [username, password, role]
        );

        return result;

    } catch (error) {

        throw error;

    } finally {

        if (conn) conn.release();
    }
};

const getUserByUsername = async (
    username
) => {

    let conn;

    try {

        conn = await pool.getConnection();

        const rows = await conn.query(
            `
            SELECT * FROM users
            WHERE username = ?
            `,
            [username]
        );

        return rows[0];

    } catch (error) {

        throw error;

    } finally {

        if (conn) conn.release();
    }
};

module.exports = {
    createUser,
    getUserByUsername
};