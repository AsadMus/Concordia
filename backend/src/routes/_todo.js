// Placeholder handler for endpoints that haven't been built yet. Delete once a route is done.
module.exports = (what) => (req, res) =>
  res.status(501).json({ error: `Not implemented yet: ${what}` });
