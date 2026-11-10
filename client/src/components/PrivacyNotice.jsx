export default function PrivacyNotice({ externalAI, compact = false }) {
  return (
    <div className={`notice ${externalAI ? 'notice-warn' : ''}`}>
      <span className="notice-icon" aria-hidden="true">
        {externalAI ? '↗' : '⌂'}
      </span>
      <div>
        <strong>{externalAI ? 'External AI review is switched on.' : 'AI review runs on this server.'}</strong>{' '}
        {externalAI ? (
          <>
            Content in this submission may be sent to the configured external AI service for tone and claim review.
            Confidential patterns defined by your admin are masked before any external call and restored locally. API
            keys stay in environment variables. Humans make every final decision.
          </>
        ) : (
          <>
            The MOCK AI provider is active, so nothing is sent to an external AI service. You get realistic sample
            findings for the demo. Humans make every final decision.
          </>
        )}
        {!compact && (
          <span className="muted small" style={{ display: 'block', marginTop: 4 }}>
            Nothing is published automatically. Every suggestion needs an explicit creator decision.
          </span>
        )}
      </div>
    </div>
  );
}
