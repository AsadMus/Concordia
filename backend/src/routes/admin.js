// TODO - Admin user management (proposal section 5: admins see accounts + basic management)
// Mount with requireAdmin from middleware/auth.js. Never return password_hash.
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
const db = require('../db/pool');
const { asyncHandler, httpError } = require('../middleware/errors');

router.use(requireAdmin);

const toJson = (r) => ({
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    phone: r.phone,
    role: r.role,
    stageName: r.stage_name,
    bio: r.bio,
    createdAt: r.created_at,
});

router.get('/users', asyncHandler(async (req, res) => {
    const { rows } = await db.query(
        `SELECT id, first_name, last_name, email, phone, role, stage_name, genres, bio, created_at
        FROM users
        ORDER BY created_at DESC, id ASC`
    );
    res.json(rows.map(toJson));
}));

router.patch('/users/:id/role', asyncHandler(async (req, res) => {
    const { role } = req.body;
    if (!role || !['user', 'admin'].includes(role)) {
        throw httpError(400, "role must be 'user' or 'admin'");
    }
    if (Number(req.params.id) === Number(req.user.id)) {
        throw httpError(400, 'Cannot change your own admin role');
    }

    const result = await db.query(
        `UPDATE users
        SET role = $1
        WHERE id = $2
        RETURNING id, first_name, last_name, email, phone, role, stage_name, genres, bio, created_at`,
        [role, req.params.id]
    );

    const row = result.rows.at(0);
    if (!row) throw httpError(404, 'User not found');
    res.json(toJson(row));
}));

router.delete('/users/:id', asyncHandler(async (req, res) => {
    if (Number(req.params.id) === Number(req.user.id)) {
        throw httpError(400, 'Cannot delete your own account');
    }

    const { rowCount } = await db.query(
        `DELETE FROM users WHERE id = $1`,
        [req.params.id]
    )
    if (!rowCount) throw httpError(404, 'User not found');
    res.status(204).end();
}));

module.exports = router;
