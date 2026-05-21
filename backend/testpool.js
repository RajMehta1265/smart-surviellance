const { pool } = require("./config/database");

console.log(pool);
console.log(typeof pool.getConnection);