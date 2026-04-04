// config/db.js — MongoDB connection setup
const mongoose = require("mongoose");

/**
 * Connect to MongoDB.
 * Retries once every 5 seconds if the first attempt fails
 * (useful in Docker when Mongo container starts slightly later).
 */
const connectDB = async () => {
  const uri = process.env.MONGO_URI || "mongodb://localhost:27017/coedit-db";

  try {
    await mongoose.connect(uri);
    console.log("✅ MongoDB connected:", uri);
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    console.log("⏳ Retrying in 5 seconds...");
    setTimeout(connectDB, 5000);
  }
};

module.exports = connectDB;
