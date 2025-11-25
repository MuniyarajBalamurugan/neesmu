const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const Razorpay = require('razorpay');
const cors = require('cors');
const app = express();

app.use(bodyParser.json());
app.use(cors());
app.use(express.static("public"));

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

    // BOOKINGS TABLE (main booking)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        movie_id INT REFERENCES movies(id),
        date DATE NOT NULL,
        time_slot_id INT REFERENCES showtimes(id),
        total_amount INT,
        payment_status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // BOOKING SEATS TABLE (multiple seats for one booking)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS booking_seats (
        id SERIAL PRIMARY KEY,
        booking_id INT REFERENCES bookings(id),
        seat_no VARCHAR(10) NOT NULL
      );
    `);

    // PAYMENTS TABLE (razorpay log)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        booking_id INT REFERENCES bookings(id),
        razorpay_order_id VARCHAR(100),
        razorpay_payment_id VARCHAR(100),
        amount INT,
        currency VARCHAR(10),
        status VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("All tables created successfully!");

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
app.post("/showtimes", async (req, res) => {
  try {
    const { date, current_time } = req.body;

    // Fetch sorted showtimes
    const result = await pool.query(`
      SELECT *
      FROM showtimes
      ORDER BY to_timestamp(time_slot, 'HH12:MI AM') ASC
    `);

    const times = result.rows;

    // Today's date
    const today = new Date().toISOString().split("T")[0];

    // If the user selected a future date → return all times
    if (date !== today) {
      return res.json(times);
    }

    // Case: today selected
    const now = new Date(`${today} ${current_time}`);

    const upcoming = times.filter(slot => {
      const showStart = new Date(`${today} ${slot.time_slot}`);

      // +2 hours 15 minutes
      const showEnd = new Date(showStart.getTime() + (2 * 60 + 15) * 60 * 1000);

      return now <= showEnd;
    });

    return res.json(upcoming);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Cannot fetch showtimes" });
  }
});






// ----------------------------
// API: ADD MOVIE
// ----------------------------
app.post("/add-movie", async (req, res) => {
  const { screen_no, movie_name, poster_url, trailer_url } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO movies (screen_no, movie_name, poster_url, trailer_url)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [screen_no, movie_name, poster_url, trailer_url]
    );
    res.json({ status: "success", movie: result.rows[0] });
 } catch (err) {
  console.error("MOVIE INSERT ERROR:", err);
  res.status(500).json({ error: err.message });
}
});

// ----------------------------
// API: ADD SHOWTIME
// ----------------------------
app.post("/add-showtime", async (req, res) => {
  const { time_slot } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO showtimes (time_slot)
       VALUES ($1)
       RETURNING *`,
      [time_slot]
    );
    res.json({ status: "success", showtime: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to add showtime" });
  }
});

// ----------------------------
// API: BOOK TICKETS (MULTIPLE SEATS)
// ----------------------------
app.post("/book", async (req, res) => {
  const { user_id, movie_id, date, time_slot_id, seats, total_amount } = req.body;

  try {
    // Create booking
    const bookingResult = await pool.query(
      `INSERT INTO bookings (user_id, movie_id, date, time_slot_id, total_amount)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [user_id, movie_id, date, time_slot_id, total_amount]
    );

    const booking = bookingResult.rows[0];
    const booking_id = booking.id;

    // Insert multiple seats
    for (let seat of seats) {
      await pool.query(
        `INSERT INTO booking_seats (booking_id, seat_no)
         VALUES ($1, $2)`,
        [booking_id, seat]
      );
    }

    res.json({ status: "success", booking_id });

  } catch (err) {
    res.status(500).json({ error: err.message });
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
      `SELECT seat_no FROM booking_seats 
       WHERE booking_id IN (
         SELECT id FROM bookings 
         WHERE movie_id=$1 AND date=$2 AND time_slot_id=$3 AND payment_status='success'
       )`,
      [movie_id, date, time_slot_id]
    );

    const bookedSeats = result.rows.map(r => r.seat_no);

    const available = allSeats.filter(s => !bookedSeats.includes(s));

    res.json({ available });

  } catch (err) {
    res.status(500).json({ error: err });
  }
});

app.get("/sample", (req, res) => {
  res.json({ status: "success" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
