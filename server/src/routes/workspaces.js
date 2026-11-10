const express = require('express');
const { requireRole } = require('../auth/middleware');
const { asyncHandler, httpError } = require('../utils/http');
const { asString, asNumber } = require('../utils/validate');
const { audit } = require('../utils/audit');
const { listWorkspaces, getWorkspace, createWorkspace } = require('../services/workspaces');
const { createInvitation, listInvitations } = require('../services/invitations');

const adminOnly = requireRole('admin');

function workspaceRouter(db) {
  const router = express.Router();

  router.get(
    '/workspaces',
    asyncHandler(async (req, res) => {
      let workspaces = listWorkspaces(db, req.user.id);
      if (req.user.role === 'agency') workspaces = workspaces.filter((workspace) => workspace.member);
      res.json({ workspaces });
    })
  );

  router.post(
    '/workspaces',
    adminOnly,
    asyncHandler(async (req, res) => {
      const name = asString(req.body?.name, 'Workspace name', { required: true, max: 120 });
      const workspace = createWorkspace(db, { name });
      audit(db, {
        userId: req.user.id,
        eventType: 'workspace.create',
        entityType: 'brand_workspace',
        entityId: workspace.id,
        metadata: { name },
      });
      res.status(201).json({ workspace });
    })
  );

  router.get(
    '/workspaces/invitations',
    adminOnly,
    asyncHandler(async (req, res) => {
      res.json({ invitations: listInvitations(db, req.query.workspaceId ? String(req.query.workspaceId) : null) });
    })
  );

  router.post(
    '/workspaces/:id/invitations',
    adminOnly,
    asyncHandler(async (req, res) => {
      const workspace = getWorkspace(db, req.params.id);
      if (!workspace) throw httpError(404, 'Workspace not found');
      const expiresInDays = req.body?.expiresInDays
        ? asNumber(req.body.expiresInDays, 'Expiry days', { min: 1, max: 90 })
        : undefined;
      const invitation = createInvitation(db, {
        brandWorkspaceId: workspace.id,
        createdBy: req.user.id,
        expiresInDays,
      });
      audit(db, {
        userId: req.user.id,
        eventType: 'workspace.invitation.create',
        entityType: 'brand_workspace',
        entityId: workspace.id,
        metadata: { invitationId: invitation.id, expiresAt: invitation.expiresAt },
      });
      // The plaintext code is returned exactly once. Only its hash is stored.
      res.status(201).json({ invitation: { ...invitation, workspaceName: workspace.name } });
    })
  );

  return router;
}

module.exports = { workspaceRouter };
