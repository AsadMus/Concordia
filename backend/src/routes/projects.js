// TODO - Collaboration tracker (feature iii) -> projects.html, dashboard "Projects" card
// Tables: projects, project_collaborators. Follow the pattern in contacts.js.
// GET  /           list; support ?status= filter. Include collaborators (names + credit) for each project.
// POST /:id/collaborators  body { contactId, credit }  - check the contact belongs to req.user.id first!
const router = require('express').Router();
const db = require('../db/pool');
const { asyncHandler, httpError } = require('../middleware/errors');
const todo = require('./_todo');

router.get('/', todo('GET /'));
router.get('/:id', todo('GET /:id'));
router.post('/', todo('POST /'));
router.put('/:id', todo('PUT /:id'));
router.delete('/:id', todo('DELETE /:id'));
router.post('/:id/collaborators', todo('POST /:id/collaborators'));
router.delete('/:id/collaborators/:contactId', todo('DELETE /:id/collaborators/:contactId'));

module.exports = router;
