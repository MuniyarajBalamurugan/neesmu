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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(100) UNIQUE,
        phone VARCHAR(20)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        order_item VARCHAR(100),
        quantity INT,
        amount INT,
        status VARCHAR(20)
      );
    `);

    console.log("Tables created or already exist.");
  } catch (err) {
    console.error("Error creating tables:", err);
  }
}

// Call table creation on server start
createTables();

// API: Save user and order
app.post('/api/saveOrder', async (req, res) => {
  const { name, email, phone, order_item, quantity, amount } = req.body;
  try {
    // 1️⃣ Insert or get user
    let user = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    let userId;
    if(user.rows.length === 0){
      const newUser = await pool.query(
        'INSERT INTO users(name,email,phone) VALUES($1,$2,$3) RETURNING id',
        [name,email,phone]
      );
      userId = newUser.rows[0].id;
    } else userId = user.rows[0].id;

    // 2️⃣ Insert order
    const newOrder = await pool.query(
      'INSERT INTO orders(user_id, order_item, quantity, amount, status) VALUES($1,$2,$3,$4,$5) RETURNING id',
      [userId, order_item, quantity, amount, 'pending']
    );

    // 3️⃣ Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: amount,
      currency: "INR",
      receipt: `order_rcptid_${newOrder.rows[0].id}`
    });

    res.json({ status: 'success', orderId: razorpayOrder.id, dbOrderId: newOrder.rows[0].id });
  } catch(err){
    console.error(err);
    res.json({ status: 'error', message: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log(`Server running on port ${PORT}`));
