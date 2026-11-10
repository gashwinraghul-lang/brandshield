const express = require('express');
const { requireRole } = require('../auth/middleware');
const { asyncHandler, httpError } = require('../utils/http');
const { dashboard, insights } = require('../services/insightsService');
const { getSettings, withTimeout } = require('../services/reviewService');
const { resolveProvider } = require('../services/llm');
const { createMockProvider } = require('../services/llm/mock');
const { audit } = require('../utils/audit');

function dashboardRouter(db) {
  const router = express.Router();

  router.get(
    '/dashboard',
    asyncHandler(async (req, res) => {
      res.json(dashboard(db, req.user));
    })
  );

  router.get(
    '/insights',
    requireRole('admin', 'reviewer', 'leadership'),
    asyncHandler(async (_req, res) => {
      res.json(insights(db));
    })
  );

  router.post(
    '/insights/guidelines/:id/draft',
    requireRole('admin'),
    asyncHandler(async (req, res) => {
      const guideline = db
        .prepare(
          `SELECT g.*, v.body FROM brand_guidelines g
           LEFT JOIN brand_guideline_versions v ON v.guideline_id = g.id AND v.version = g.current_version
           WHERE g.id = ?`
        )
        .get(req.params.id);
      if (!guideline) throw httpError(404, 'Guideline not found');
      const issueRows = db
        .prepare(
          `SELECT s.team FROM issues i JOIN submissions s ON s.id = i.submission_id WHERE i.guideline_ref = ?`
        )
        .all(guideline.stable_id);
      const teams = [...new Set(issueRows.map((row) => row.team))];
      const settings = getSettings(db);
      const resolution = resolveProvider(settings);
      let result;
      let notice = null;
      try {
        result = await withTimeout(
          resolution.provider.draftGuideline({ guideline, issueCount: issueRows.length, teams }),
          12000
        );
      } catch {
        const fallback = createMockProvider();
        result = await fallback.draftGuideline({ guideline, issueCount: issueRows.length, teams });
        notice = 'The external AI draft was unavailable, so a local MOCK draft is shown.';
      }
      audit(db, {
        userId: req.user.id,
        eventType: 'insights.guideline.draft',
        entityType: 'brand_guideline',
        entityId: guideline.id,
        metadata: { provider: result.provider, providerVersion: result.version, external: Boolean(result.external) },
      });
      res.json({ draft: result.draft, provider: result.provider, providerVersion: result.version, externalAI: Boolean(result.external), notice });
    })
  );

  return router;
}

module.exports = { dashboardRouter };
