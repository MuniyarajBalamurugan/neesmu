const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const Razorpay = require('razorpay');
const cors = require('cors');
const app = express();

app.use(bodyParser.json());
app.use(cors());

// PostgreSQL connection
const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT
});

// Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ----------------------------
// CREATE TABLES
// ----------------------------
async function createTables() {
  try {

    // USERS TABLE
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(100) UNIQUE,
        phone VARCHAR(20)
      );
    `);

    // MOVIES TABLE
    await pool.query(`
      CREATE TABLE IF NOT EXISTS movies (
        id SERIAL PRIMARY KEY,
        screen_no INTEGER NOT NULL,
        movie_name VARCHAR(100) NOT NULL,
        poster_url VARCHAR(255),
        trailer_url VARCHAR(255)
      );
    `);

    // SHOWTIMES TABLE
    await pool.query(`
      CREATE TABLE IF NOT EXISTS showtimes (
        id SERIAL PRIMARY KEY,
        time_slot VARCHAR(20) NOT NULL
      );
    `);

    // BOOKINGS TABLE
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        movie_id INT REFERENCES movies(id),
        date DATE NOT NULL,
        time_slot_id INT REFERENCES showtimes(id),
        seat_no VARCHAR(10) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // ⚡ Insert fixed movies (ONLY once)
    await pool.query(`TRUNCATE movies RESTART IDENTITY;`);
    await pool.query(`
      INSERT INTO movies (screen_no, movie_name, poster_url, trailer_url)
      VALUES
      (1, 'Mask', 'poster1.jpg', 'trailer1'),
      (2, 'Movie Two', 'poster2.jpg', 'trailer2');
    `);

    // ⚡ Insert showtimes (ONLY once)
    await pool.query(`TRUNCATE showtimes RESTART IDENTITY;`);
    await pool.query(`
      INSERT INTO showtimes (time_slot)
      VALUES 
      ('10:00 AM'),
      ('01:00 PM'),
      ('04:00 PM'),
      ('10:00 PM');
    `);

    console.log("Tables created + movies & showtimes inserted.");

  } catch (err) {
    console.error("Error creating tables:", err);
  }
}

createTables();

// ----------------------------
// API: GET MOVIES
// ----------------------------
app.get("/movies", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM movies");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err });
  }
});

// ----------------------------
// API: GET SHOWTIMES
// ----------------------------
app.get("/showtimes", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM showtimes");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err });
  }
});

// ----------------------------
// API: REGISTER USER
// ----------------------------
app.post("/register", async (req, res) => {
  const { name, email, phone } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO users (name, email, phone)
       VALUES ($1, $2, $3) RETURNING *`,
      [name, email, phone]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err });
  }
});

// ----------------------------
// API: BOOK SEAT
// ----------------------------
app.post("/book", async (req, res) => {
  const { user_id, movie_id, date, time_slot_id, seat_no } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO bookings (user_id, movie_id, date, time_slot_id, seat_no)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [user_id, movie_id, date, time_slot_id, seat_no]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err });
  }
});

// ----------------------------
// API: GET AVAILABLE SEATS
// ----------------------------
app.post("/available-seats", async (req, res) => {
  const { movie_id, date, time_slot_id } = req.body;

  const allSeats = [
    "A1","A2","A3","A4","A5","A6",
    "B1","B2","B3","B4","B5","B6",
    "C1","C2","C3","C4","C5","C6",
    "D1","D2","D3","D4","D5","D6",
    "E1","E2","E3","E4","E5","E6"
  ];

  try {
    const result = await pool.query(
      `SELECT seat_no FROM bookings
       WHERE movie_id=$1 AND date=$2 AND time_slot_id=$3`,
      [movie_id, date, time_slot_id]
    );

    const bookedSeats = result.rows.map(r => r.seat_no);

    const available = allSeats.filter(s => !bookedSeats.includes(s));

    res.json({ available });
  } catch (err) {
    res.status(500).json({ error: err });
  }
});

// Sample route
app.get("/sample", (req, res) => {
  res.json({ status: "success" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
