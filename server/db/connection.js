import mongoose from 'mongoose';

let isConnected = false;

export async function connectDB(uri) {
  if (isConnected) return;

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log('[DB] Connected to MongoDB');

    mongoose.connection.on('error', (err) => {
      console.error('[DB] Connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[DB] Disconnected from MongoDB');
      isConnected = false;
    });
  } catch (err) {
    console.error('[DB] Failed to connect:', err.message);
    throw err;
  }
}
