// controllers/documentController.js — REST endpoint handlers for documents
const Document = require("../models/Document");

/**
 * GET /api/documents/:id
 * Load a document by its documentId. Creates one if it doesn't exist.
 */
const getDocument = async (req, res) => {
  try {
    const { id } = req.params;

    // findOrCreate pattern
    let doc = await Document.findOne({ documentId: id });
    if (!doc) {
      doc = await Document.create({ documentId: id });
    }

    res.json({
      documentId: doc.documentId,
      name: doc.name,
      content: doc.content,
      updatedAt: doc.updatedAt,
    });
  } catch (err) {
    console.error("[getDocument]", err);
    res.status(500).json({ error: "Failed to load document" });
  }
};

/**
 * PATCH /api/documents/:id
 * Save the latest document content (called by debounced auto-save).
 * Also pushes a revision snapshot.
 */
const saveDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { content, savedBy = "auto-save", name } = req.body;

    if (!content) {
      return res.status(400).json({ error: "content is required" });
    }

    const doc = await Document.findOneAndUpdate(
      { documentId: id },
      {
        $set: {
          content,
          ...(name ? { name } : {}),
        },
        $push: {
          revisions: {
            $each: [{ content, savedBy, savedAt: new Date() }],
            $slice: -50, // keep last 50 revisions
          },
        },
      },
      { upsert: true, new: true }
    );

    res.json({ ok: true, updatedAt: doc.updatedAt });
  } catch (err) {
    console.error("[saveDocument]", err);
    res.status(500).json({ error: "Failed to save document" });
  }
};

/**
 * GET /api/documents/:id/revisions
 * Return list of revisions (id, savedAt, savedBy) without full content.
 */
const getRevisions = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Document.findOne({ documentId: id }).select("revisions");

    if (!doc) return res.status(404).json({ error: "Document not found" });

    // Return revisions newest-first, omit full content for the list view
    const list = [...doc.revisions]
      .reverse()
      .map(({ _id, savedAt, savedBy }) => ({ _id, savedAt, savedBy }));

    res.json(list);
  } catch (err) {
    console.error("[getRevisions]", err);
    res.status(500).json({ error: "Failed to fetch revisions" });
  }
};

/**
 * GET /api/documents/:id/revisions/:revId
 * Return the full content of a specific revision.
 */
const getRevisionContent = async (req, res) => {
  try {
    const { id, revId } = req.params;
    const doc = await Document.findOne({ documentId: id });

    if (!doc) return res.status(404).json({ error: "Document not found" });

    const rev = doc.revisions.id(revId);
    if (!rev) return res.status(404).json({ error: "Revision not found" });

    res.json({ content: rev.content, savedAt: rev.savedAt, savedBy: rev.savedBy });
  } catch (err) {
    console.error("[getRevisionContent]", err);
    res.status(500).json({ error: "Failed to fetch revision" });
  }
};

/**
 * POST /api/documents/:id/restore/:revId
 * Restore document to a previous revision (saves current state first as a revision).
 */
const restoreRevision = async (req, res) => {
  try {
    const { id, revId } = req.params;
    const { restoredBy = "user" } = req.body;

    const doc = await Document.findOne({ documentId: id });
    if (!doc) return res.status(404).json({ error: "Document not found" });

    const rev = doc.revisions.id(revId);
    if (!rev) return res.status(404).json({ error: "Revision not found" });

    // Snapshot current state before overwriting
    doc.revisions.push({ content: doc.content, savedBy: "before-restore" });
    doc.content = rev.content;
    await doc.save();

    res.json({ ok: true, content: rev.content });
  } catch (err) {
    console.error("[restoreRevision]", err);
    res.status(500).json({ error: "Failed to restore revision" });
  }
};

module.exports = {
  getDocument,
  saveDocument,
  getRevisions,
  getRevisionContent,
  restoreRevision,
};
