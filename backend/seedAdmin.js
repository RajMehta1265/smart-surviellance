require("dotenv").config();

const User = require("./models/User");

const {
    hashPassword
} = require("./utils/hashPassword");

const createAdmin = async () => {

    const hashed =
        await hashPassword("admin123");

    await User.createUser(
        "admin",
        hashed,
        "admin"
    );

    console.log("Admin Created");
};

createAdmin();