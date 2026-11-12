// TODO - Admin user management (proposal section 5: admins see accounts + basic management)
// Mount with requireAdmin from middleware/auth.js. Never return password_hash.
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
router.use(requireAdmin);
const db = require('../db/pool');
const { asyncHandler, httpError } = require('../middleware/errors');
const todo = require('./_todo');

router.get('/users', todo('GET /users'));
router.patch('/users/:id/role', todo('PATCH /users/:id/role'));
router.delete('/users/:id', todo('DELETE /users/:id'));

module.exports = router;
