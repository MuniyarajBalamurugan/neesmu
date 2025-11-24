const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const Razorpay = require('razorpay');
const cors = require('cors');
const app = express();

app.use(bodyParser.json());
app.use(cors());

// PostgreSQL connection using environment variables
const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT
});

// Razorpay setup
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Function to create tables if they don't exist
async function createTables() {
  try {


    // MOVIES TABLE
    await pool.query(`
     TRUNCATE table movies `);

    console.log("Tables created or already exist.");

  } catch (err) {
    console.error("Error creating tables:", err);
  }
}

// Run table creation on server start
createTables();

app.get("/sample", (req, res) => {

  res.json({ status: "success" });
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
