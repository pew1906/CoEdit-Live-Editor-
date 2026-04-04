import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema(
  {
    _id: { type: String },
    // Yjs encoded state vector stored as binary
    yjsState: { type: Buffer, default: null },
  },
  {
    timestamps: true,
    _id: false,
  }
);

export const Document = mongoose.model('Document', documentSchema);
