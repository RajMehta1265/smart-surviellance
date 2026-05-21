const User = require("../models/User");

const {
    comparePassword
} = require("../utils/hashPassword");

const generateToken =
    require("../utils/generateToken");

const login = async (req, res) => {

    try {

        const { username, password } = req.body;

        const user =
            await User.getUserByUsername(
                username
            );

        if (!user) {

            return res.status(401).json({
                message: "Invalid username"
            });
        }

        const validPassword =
            await comparePassword(
                password,
                user.password
            );

        if (!validPassword) {

            return res.status(401).json({
                message: "Invalid password"
            });
        }

        const token =
            generateToken(user);

        return res.json({
            token,
            role: user.role,
            username: user.username
        });

    } catch (error) {

        console.log(error);

        return res.status(500).json({
            message: "Server Error"
        });
    }
};

module.exports = {
    login
};