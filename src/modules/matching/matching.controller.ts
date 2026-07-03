// Stub matching controller to avoid compilation errors
export async function runMatching(req, res) {
  res.status(501).json({ code: 'NOT_IMPLEMENTED', message: 'Matching service is not available.' });
}
