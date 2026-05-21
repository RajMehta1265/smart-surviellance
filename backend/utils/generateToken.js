const jwt = require("jsonwebtoken");

const generateToken = (user) => {

    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            role: user.role
        },
        process.env.JWT_SECRET,
        {
            expiresIn: "12h"
        }
    );
};

module.exports = generateToken;