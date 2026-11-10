import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import PrivacyNotice from '../components/PrivacyNotice';
import styles from './NewSubmissionPage.module.css';

const CHANNELS = [
  { value: 'LinkedIn', label: 'LinkedIn', limit: '1,500 characters' },
  { value: 'website', label: 'Website', limit: '900 words' },
  { value: 'email', label: 'Email', limit: '400 words' },
  { value: 'print', label: 'Print', limit: '600 words' },
];

const ACCEPT = '.txt,.md,.docx,.png,.jpg,.jpeg';

function countWords(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export default function NewSubmissionPage() {
  const { privacy, user, workspaces } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const creatableWorkspaces =
    user.role === 'agency'
      ? workspaces.filter((workspace) => (user.workspaceIds || []).includes(workspace.id))
      : workspaces;
  const [mode, setMode] = useState('text');
  const [title, setTitle] = useState('');
  const [channel, setChannel] = useState('LinkedIn');
  const [disclosure, setDisclosure] = useState(privacy.defaultDisclosure || 'AI-assisted');
  const [content, setContent] = useState('');
  const [altText, setAltText] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!workspaceId && creatableWorkspaces.length) setWorkspaceId(creatableWorkspaces[0].id);
  }, [workspaceId, creatableWorkspaces]);

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      setPreview('');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onFileChange = (event) => {
    const chosen = event.target.files?.[0] || null;
    setFile(chosen);
    setError('');
    if (chosen && !title.trim()) {
      setTitle(chosen.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
    }
  };

  const switchMode = (next) => {
    setMode(next);
    setError('');
    if (next === 'text') {
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!title.trim()) {
      setError('Add a title so reviewers can find this content later.');
      return;
    }
    if (mode === 'file' && !file) {
      setError('Choose a file to upload, or switch to writing text.');
      return;
    }
    if (mode === 'text' && !content.trim()) {
      setError('Add the content you want reviewed.');
      return;
    }
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('channel', channel);
      formData.append('aiDisclosure', disclosure);
      formData.append('altText', altText.trim());
      if (workspaceId) formData.append('brandWorkspaceId', workspaceId);
      if (mode === 'file' && file) {
        formData.append('file', file);
      } else {
        formData.append('content', content);
        formData.append('type', 'text');
      }
      const payload = await api.postForm('/api/submissions', formData);
      navigate(`/submissions/${payload.submission.id}?analyse=1`, { replace: true });
    } catch (submitError) {
      if (submitError.details?.code === 'EMAIL_UNVERIFIED') {
        setError('Verify your email address before creating content. Use the banner at the top of the page to resend the verification link.');
      } else {
        setError(submitError.message);
      }
      setBusy(false);
    }
  };

  const words = countWords(content);
  const characters = content.length;
  const isImageFile = Boolean(file && file.type.startsWith('image/'));

  if (!user.emailVerified) {
    return (
      <section className="page">
        <header className="page-header">
          <div>
            <p className="eyebrow">New submission · Creator</p>
            <h1 className="page-title">Verify your email first.</h1>
            <p className="page-subtitle">
              BrandShield.ai locks content creation until your address is verified. The banner at the top of the page can
              send a fresh link.
            </p>
          </div>
        </header>
        <div className="notice notice-warn" role="alert">
          <span className="notice-icon" aria-hidden="true">
            !
          </span>
          <div>
            <strong>Your email is not verified.</strong> Reviews and submission history are tied to accountable people,
            so verify your address before creating content. <Link to="/dashboard">Back to the dashboard</Link>.
          </div>
        </div>
      </section>
    );
  }

  if (user.role === 'agency' && creatableWorkspaces.length === 0) {
    return (
      <section className="page">
        <header className="page-header">
          <div>
            <p className="eyebrow">New submission · Agency</p>
            <h1 className="page-title">No brand workspace yet.</h1>
            <p className="page-subtitle">
              Agency content must belong to an assigned brand workspace. An administrator can add you from Settings →
              User roles.
            </p>
          </div>
        </header>
        <div className="notice notice-warn" role="alert">
          <span className="notice-icon" aria-hidden="true">
            !
          </span>
          <div>
            <strong>You are not assigned to a workspace.</strong> Ask your brand administrator to approve the account and
            assign a workspace. <Link to="/dashboard">Back to the dashboard</Link>.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">New submission · Creator</p>
          <h1 className="page-title">Bring your content to the shield.</h1>
          <p className="page-subtitle">
            Paste or upload what you plan to publish. BrandShield.ai will check it against the live brand library,
            highlight grounded findings, and leave every decision to you.
          </p>
        </div>
        <span className="chip chip-accent">Reviews happen before publishing</span>
      </header>

      <div className={styles.layout}>
        <form className="panel" onSubmit={submit} noValidate>
          <div className="panel-heading">
            <div>
              <h2>Content details</h2>
              <p className="tiny muted">A clear title and channel help the engine apply the right guidance.</p>
            </div>
          </div>

          <div className="stack">
            <div className="form-field">
              <label htmlFor="title">Title</label>
              <input
                id="title"
                name="title"
                className="input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Northwind Atlas autumn release note"
                maxLength={200}
                required
              />
            </div>

            <div className="grid grid-2">
              <div className="form-field">
                <label htmlFor="channel">Channel</label>
                <select id="channel" name="channel" className="select" value={channel} onChange={(event) => setChannel(event.target.value)}>
                  {CHANNELS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label} · {item.limit}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="disclosure">AI disclosure</label>
                <select
                  id="disclosure"
                  name="disclosure"
                  className="select"
                  value={disclosure}
                  onChange={(event) => setDisclosure(event.target.value)}
                >
                  <option value="none">No AI used</option>
                  <option value="AI-assisted">AI-assisted</option>
                  <option value="AI-generated">AI-generated</option>
                </select>
                <span className="hint">Be explicit. The disclosure travels with the approved content.</span>
              </div>
            </div>

            {(user.role === 'agency' || creatableWorkspaces.length > 1) && (
              <div className="form-field">
                <label htmlFor="brandWorkspaceId">Brand workspace</label>
                <select
                  id="brandWorkspaceId"
                  name="brandWorkspaceId"
                  className="select"
                  value={workspaceId}
                  onChange={(event) => setWorkspaceId(event.target.value)}
                  required={user.role === 'agency'}
                >
                  {creatableWorkspaces.length === 0 && <option value="">No workspace assigned</option>}
                  {creatableWorkspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
                <span className="hint">
                  {user.role === 'agency'
                    ? 'Agency content stays inside the assigned workspace and only your own submissions are visible.'
                    : 'Reviewers in this workspace will see the submission in their queue.'}
                </span>
              </div>
            )}

            <div className={styles.modeRow}>
              <div className="segmented" role="group" aria-label="Content input method">
                <button type="button" aria-pressed={mode === 'text'} onClick={() => switchMode('text')}>
                  Write or paste text
                </button>
                <button type="button" aria-pressed={mode === 'file'} onClick={() => switchMode('file')}>
                  Upload a file
                </button>
              </div>
              <span className="tiny muted">
                {mode === 'text'
                  ? `${words} words · ${characters} characters`
                  : 'TXT, MD, DOCX, PNG or JPG · up to 10 MB'}
              </span>
            </div>

            {mode === 'text' ? (
              <div className="form-field">
                <label htmlFor="content">Content</label>
                <textarea
                  id="content"
                  name="content"
                  className={`textarea ${styles.editor}`}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="Paste the content exactly as it would be published. Markdown headings and links are welcome."
                  maxLength={200000}
                />
                <div className={styles.editorMeta}>
                  <span>{words} words</span>
                  <span>{characters.toLocaleString()} characters</span>
                  <span>{channel === 'LinkedIn' ? 'LinkedIn limit 1,500 characters' : `${channel} guidance applied`}</span>
                </div>
              </div>
            ) : (
              <div className="form-field">
                <label htmlFor="file">File</label>
                <div className={styles.drop}>
                  <input
                    ref={fileRef}
                    id="file"
                    name="file"
                    type="file"
                    accept={ACCEPT}
                    onChange={onFileChange}
                    className={styles.fileInput}
                  />
                  <p className={styles.dropTitle}>{file ? file.name : 'Choose a file from your device'}</p>
                  <p className="tiny muted">
                    {file
                      ? `${Math.round(file.size / 1024).toLocaleString()} KB · ${file.type || 'document'}`
                      : 'Text is extracted from documents. Images are reviewed for alt text and visual guidance.'}
                  </p>
                  {preview && <img src={preview} alt="Preview of the uploaded image" className={styles.preview} />}
                </div>
              </div>
            )}

            {isImageFile && (
              <div className="form-field">
                <label htmlFor="altText">Alt text</label>
                <textarea
                  id="altText"
                  name="altText"
                  className="textarea"
                  style={{ minHeight: 88 }}
                  value={altText}
                  onChange={(event) => setAltText(event.target.value)}
                  placeholder="Describe what the image shows and why it matters. Do not start with “image of”."
                  maxLength={1000}
                />
                <span className="hint">Missing alt text becomes a blocker, because it excludes people using screen readers.</span>
              </div>
            )}

            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}

            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => navigate('/dashboard')} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? (
                  <>
                    <span className="spinner" aria-hidden="true" /> Creating…
                  </>
                ) : (
                  'Create and review'
                )}
              </button>
            </div>
          </div>
        </form>

        <aside className="stack">
          <PrivacyNotice externalAI={privacy.externalAI} />
          <div className="panel">
            <h2 className={styles.sideTitle}>What happens next</h2>
            <ol className={styles.steps}>
              <li>
                <span className="mono">01</span>
                <div>
                  <strong>Deterministic checks run first</strong>
                  <p>Rules stored in the brand library check length, terms, claims, headings, links and alt text.</p>
                </div>
              </li>
              <li>
                <span className="mono">02</span>
                <div>
                  <strong>AI adds grounded suggestions</strong>
                  <p>Findings without a guideline, rule or fact reference are downgraded to suggestions only.</p>
                </div>
              </li>
              <li>
                <span className="mono">03</span>
                <div>
                  <strong>You decide each finding</strong>
                  <p>Accept, edit or reject. Nothing changes until you choose, and every choice is recorded.</p>
                </div>
              </li>
              <li>
                <span className="mono">04</span>
                <div>
                  <strong>A reviewer makes the final call</strong>
                  <p>Only a human reviewer can approve. BrandShield.ai never publishes automatically.</p>
                </div>
              </li>
            </ol>
          </div>
          <div className="panel">
            <h2 className={styles.sideTitle}>Channel notes</h2>
            <ul className={styles.channelList}>
              {CHANNELS.map((item) => (
                <li key={item.value} className={channel === item.value ? styles.channelActive : ''}>
                  <span>{item.label}</span>
                  <span className="tiny muted">{item.limit}</span>
                </li>
              ))}
            </ul>
            <p className="tiny muted" style={{ marginTop: 12 }}>
              Limits are configurable guidance, not automatic truncation. The review flags overlong content; you decide
              how to shorten it.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
