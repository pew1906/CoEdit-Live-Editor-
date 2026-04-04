import mongoose from 'mongoose';

const revisionSchema = new mongoose.Schema({
  documentId: {
    type: String,
    required: true,
    index: true,
  },
  // Quill Delta snapshot at time of save
  content: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  savedAt: {
    type: Date,
    default: Date.now,
  },
});

// Keep only last 50 revisions per document (TTL-style cleanup via index)
revisionSchema.index({ documentId: 1, savedAt: -1 });

export const Revision = mongoose.model('Revision', revisionSchema);
