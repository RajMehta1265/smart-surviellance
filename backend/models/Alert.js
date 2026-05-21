const { DataTypes } = require("sequelize");

const { sequelize } = require("../config/database");

const Alert = sequelize.define("Alert", {

    label: {
        type: DataTypes.STRING,
        allowNull: false
    },

    confidence: {
        type: DataTypes.FLOAT,
        allowNull: false
    },

    imagePath: {
        type: DataTypes.STRING
    }

});

module.exports = Alert;