import { useCallback, useEffect, useState } from 'react';
import { api, formatDate, titleCase } from '../api';
import Modal from '../components/Modal';
import { tabKeyboard } from '../utils/tabs';
import styles from './BrandLibraryPage.module.css';

const TABS = [
  { key: 'guidelines', label: 'Guidelines' },
  { key: 'facts', label: 'Approved facts' },
  { key: 'terminology', label: 'Terminology' },
  { key: 'assets', label: 'Brand assets' },
];
const TAB_KEYS = TABS.map((item) => item.key);

const CATEGORIES = ['Tone of voice', 'Terminology', 'Claims and facts', 'Accessibility', 'Channel', 'Visual identity', 'Other'];

const ENDPOINTS = {
  guidelines: '/api/library/guidelines',
  facts: '/api/library/facts',
  terminology: '/api/library/terminology',
  assets: '/api/library/assets',
};

function StatusChip({ status }) {
  return <span className={`chip ${status === 'active' ? 'chip-ok' : ''}`}>{titleCase(status)}</span>;
}

function GuidelineForm({ record, onCancel, onSaved }) {
  const editing = Boolean(record);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (editing) {
        await api.patch(`/api/library/guidelines/${record.id}`, {
          title: fields.title,
          category: fields.category,
          owner: fields.owner,
          body: fields.body,
          changeNote: fields.changeNote,
        });
        onSaved(`Guideline ${record.stable_id} updated. A new version was recorded.`);
      } else {
        await api.post('/api/library/guidelines', {
          stableId: fields.stableId,
          title: fields.title,
          category: fields.category,
          owner: fields.owner,
          body: fields.body,
          changeNote: fields.changeNote,
        });
        onSaved('Guideline created. Every later edit becomes a new version.');
      }
    } catch (submitError) {
      setError(submitError.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={styles.form}>
      <div className="grid grid-2">
        {!editing && (
          <div className="form-field">
            <label htmlFor="stableId">Guideline ID</label>
            <input id="stableId" name="stableId" className="input" placeholder="TONE-03" required />
            <span className="hint">Stable ID used by findings, e.g. TONE-03.</span>
          </div>
        )}
        <div className="form-field">
          <label htmlFor="title">Title</label>
          <input id="title" name="title" className="input" defaultValue={record?.title || ''} required />
        </div>
        <div className="form-field">
          <label htmlFor="category">Category</label>
          <select id="category" name="category" className="select" defaultValue={record?.category || CATEGORIES[0]}>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="owner">Owner</label>
          <input id="owner" name="owner" className="input" defaultValue={record?.owner || ''} placeholder="Brand team" />
        </div>
      </div>
      <div className="form-field">
        <label htmlFor="body">Guidance</label>
        <textarea id="body" name="body" className="textarea" defaultValue={record?.body || ''} required rows={9} />
        <span className="hint">Write the rule a person can apply, with an example if it helps.</span>
      </div>
      <div className="form-field">
        <label htmlFor="changeNote">Change note</label>
        <input
          id="changeNote"
          name="changeNote"
          className="input"
          defaultValue={editing ? '' : 'Initial version'}
          placeholder={editing ? 'What changed and why?' : 'Initial version'}
        />
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save new version' : 'Create guideline'}
        </button>
      </div>
    </form>
  );
}

function FactForm({ record, onCancel, onSaved }) {
  const editing = Boolean(record);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    const payload = {
      statement: fields.statement,
      source: fields.source,
      owner: fields.owner,
      effectiveDate: fields.effectiveDate,
      expiryDate: fields.expiryDate,
      keywords: fields.keywords,
    };
    try {
      if (editing) {
        await api.patch(`/api/library/facts/${record.id}`, payload);
        onSaved(`Fact ${record.stable_id} updated.`);
      } else {
        await api.post('/api/library/facts', {
          ...payload,
          stableId: fields.stableId,
          successorId: fields.successorId,
        });
        onSaved('Approved fact created. Only current facts can support a claim.');
      }
    } catch (submitError) {
      setError(submitError.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={styles.form}>
      <div className="grid grid-2">
        {!editing && (
          <div className="form-field">
            <label htmlFor="stableId">Fact ID</label>
            <input id="stableId" name="stableId" className="input" placeholder="FACT-07" required />
          </div>
        )}
        <div className="form-field">
          <label htmlFor="owner">Owner</label>
          <input id="owner" name="owner" className="input" defaultValue={record?.owner || ''} required />
        </div>
      </div>
      <div className="form-field">
        <label htmlFor="statement">Approved statement</label>
        <textarea
          id="statement"
          name="statement"
          className="textarea"
          defaultValue={record?.statement || ''}
          required
          rows={3}
        />
      </div>
      <div className="form-field">
        <label htmlFor="source">Source</label>
        <input id="source" name="source" className="input" defaultValue={record?.source || ''} required />
        <span className="hint">A verifiable record, filing or owner statement. Not a web search result.</span>
      </div>
      <div className="grid grid-2">
        <div className="form-field">
          <label htmlFor="effectiveDate">Effective date</label>
          <input id="effectiveDate" name="effectiveDate" type="date" className="input" defaultValue={record?.effective_date || ''} />
        </div>
        <div className="form-field">
          <label htmlFor="expiryDate">Expiry date</label>
          <input id="expiryDate" name="expiryDate" type="date" className="input" defaultValue={record?.expiry_date || ''} />
          <span className="hint">Leave blank for no expiry. Expired facts cannot support claims.</span>
        </div>
      </div>
      <div className="form-field">
        <label htmlFor="keywords">Detection keywords</label>
        <input
          id="keywords"
          name="keywords"
          className="input"
          defaultValue={(record?.keywords || []).join(', ')}
          placeholder="240 employees, 240 staff"
        />
        <span className="hint">Comma-separated phrases the rule engine should look for.</span>
      </div>
      {!editing && (
        <div className="form-field">
          <label htmlFor="successorId">Successor fact (optional)</label>
          <input id="successorId" name="successorId" className="input" placeholder="FACT-08" />
          <span className="hint">If this fact is replaced, findings can point to the newest approved fact.</span>
        </div>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save fact' : 'Create fact'}
        </button>
      </div>
    </form>
  );
}

function TerminologyForm({ record, onCancel, onSaved }) {
  const editing = Boolean(record);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    const payload = {
      preferredTerm: fields.preferredTerm,
      bannedTerms: fields.bannedTerms,
      notes: fields.notes,
      guidelineRef: fields.guidelineRef,
    };
    try {
      if (editing) {
        await api.patch(`/api/library/terminology/${record.id}`, payload);
        onSaved(`Terminology ${record.code} updated.`);
      } else {
        await api.post('/api/library/terminology', { ...payload, code: fields.code });
        onSaved('Terminology entry created. It is now checked on every review.');
      }
    } catch (submitError) {
      setError(submitError.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={styles.form}>
      <div className="grid grid-2">
        {!editing && (
          <div className="form-field">
            <label htmlFor="code">Term code</label>
            <input id="code" name="code" className="input" placeholder="TERM-06" required />
          </div>
        )}
        <div className="form-field">
          <label htmlFor="preferredTerm">Preferred term</label>
          <input id="preferredTerm" name="preferredTerm" className="input" defaultValue={record?.preferred_term || ''} required />
        </div>
      </div>
      <div className="form-field">
        <label htmlFor="bannedTerms">Banned or alternate terms</label>
        <input
          id="bannedTerms"
          name="bannedTerms"
          className="input"
          defaultValue={(record?.banned_terms || []).join(', ')}
          placeholder="login, log in, signin"
          required
        />
        <span className="hint">Comma-separated. At least one is required.</span>
      </div>
      <div className="form-field">
        <label htmlFor="guidelineRef">Guideline reference</label>
        <input id="guidelineRef" name="guidelineRef" className="input" defaultValue={record?.guideline_ref || 'TERM-01'} />
      </div>
      <div className="form-field">
        <label htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" className="textarea" defaultValue={record?.notes || ''} rows={3} />
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save term' : 'Create term'}
        </button>
      </div>
    </form>
  );
}

function AssetForm({ record, onCancel, onSaved }) {
  const editing = Boolean(record);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    try {
      if (editing) {
        await api.patch(`/api/library/assets/${record.id}`, {
          name: fields.name,
          value: fields.value,
          description: fields.description,
        });
        onSaved(`Asset ${record.name} updated.`);
      } else if (form.file?.files?.length) {
        const formData = new FormData();
        formData.append('name', fields.name);
        formData.append('type', fields.type);
        formData.append('description', fields.description || '');
        formData.append('file', form.file.files[0]);
        await api.postForm('/api/library/assets', formData);
        onSaved('Asset uploaded and added to the brand library.');
      } else {
        await api.post('/api/library/assets', {
          name: fields.name,
          type: fields.type,
          value: fields.value,
          description: fields.description,
        });
        onSaved('Brand asset added to the library.');
      }
    } catch (submitError) {
      setError(submitError.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={styles.form}>
      <div className="grid grid-2">
        <div className="form-field">
          <label htmlFor="name">Asset name</label>
          <input id="name" name="name" className="input" defaultValue={record?.name || ''} required />
        </div>
        <div className="form-field">
          <label htmlFor="type">Type</label>
          <select id="type" name="type" className="select" defaultValue={record?.type || 'logo'} disabled={editing}>
            <option value="logo">Logo</option>
            <option value="colour">Colour palette</option>
            <option value="image">Image</option>
          </select>
        </div>
      </div>
      <div className="form-field">
        <label htmlFor="value">{editing ? 'Current value' : 'Value'}</label>
        <input
          id="value"
          name="value"
          className="input"
          defaultValue={record?.value || ''}
          placeholder={editing ? '' : '#1F6F6B,#E8845B or usage instruction'}
        />
        <span className="hint">Colours are comma-separated hex values. Logo and image assets can use a file instead.</span>
      </div>
      {!editing && (
        <div className="form-field">
          <label htmlFor="file">Upload a file (optional)</label>
          <input id="file" name="file" type="file" className="input" accept=".png,.jpg,.jpeg" />
        </div>
      )}
      <div className="form-field">
        <label htmlFor="description">Description</label>
        <textarea id="description" name="description" className="textarea" defaultValue={record?.description || ''} rows={3} />
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save asset' : 'Add asset'}
        </button>
      </div>
    </form>
  );
}

function Palette({ value }) {
  const colours = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (!colours.length) return <span className="mono">{value || '—'}</span>;
  return (
    <span className={styles.palette} aria-label={`Colours: ${colours.join(', ')}`}>
      {colours.slice(0, 6).map((colour) => (
        <span key={colour} className={styles.swatch} style={{ background: colour }} title={colour} />
      ))}
      <span className="tiny muted">{colours.join(' · ')}</span>
    </span>
  );
}

export default function BrandLibraryPage() {
  const [tab, setTab] = useState('guidelines');
  const [data, setData] = useState({ guidelines: [], facts: [], terminology: [], assets: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [form, setForm] = useState(null);
  const [history, setHistory] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [guidelines, facts, terminology, assets] = await Promise.all([
        api.get('/api/library/guidelines'),
        api.get('/api/library/facts'),
        api.get('/api/library/terminology'),
        api.get('/api/library/assets'),
      ]);
      setData({
        guidelines: guidelines.guidelines,
        facts: facts.facts,
        terminology: terminology.terminology,
        assets: assets.assets,
      });
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onSaved = async (message) => {
    setForm(null);
    setFeedback(message);
    await load();
  };

  const toggle = async (kind, record) => {
    const action = record.status === 'active' ? 'deactivate' : 'reactivate';
    try {
      await api.post(`/api/library/${kind}/${record.id}/${action}`, {});
      setFeedback(`${titleCase(kind)} ${record.stable_id || record.code || record.name} ${action}d.`);
      await load();
    } catch (toggleError) {
      setError(toggleError.message);
    }
  };

  const openHistory = async (guideline) => {
    setHistory({ guideline, versions: [], loading: true });
    try {
      const payload = await api.get(`/api/library/guidelines/${guideline.id}/versions`);
      setHistory({ guideline, versions: payload.versions, loading: false });
    } catch (historyError) {
      setHistory({ guideline, versions: [], loading: false, error: historyError.message });
    }
  };

  const tabCount = (key) => data[key]?.length ?? 0;
  const current = data[tab] || [];

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Brand library · Admin</p>
          <h1 className="page-title">The source of truth.</h1>
          <p className="page-subtitle">
            Guidelines, approved facts, terminology and assets the review engine checks against. Every edit is
            versioned; nothing is hard-coded in the AI prompt.
          </p>
        </div>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => setForm({ kind: tab, record: null })}>
            Add {tab === 'facts' ? 'fact' : tab === 'assets' ? 'asset' : tab === 'terminology' ? 'term' : 'guideline'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={load} disabled={loading}>
            Refresh
          </button>
        </div>
      </header>

      {feedback && (
        <div className="notice" role="status">
          <span className="notice-icon" aria-hidden="true">
            ✓
          </span>
          <div>{feedback}</div>
        </div>
      )}
      {error && (
        <div className="notice notice-danger" role="alert">
          <span className="notice-icon" aria-hidden="true">
            !
          </span>
          <div>
            <strong>The brand library could not load.</strong> {error}
          </div>
        </div>
      )}

      <div className="tabs" role="tablist" aria-label="Brand library sections">
        {TABS.map((item) => (
          <button
            key={item.key}
            role="tab"
            type="button"
            aria-selected={tab === item.key}
            aria-controls={`panel-${item.key}`}
            id={`tab-${item.key}`}
            tabIndex={tab === item.key ? 0 : -1}
            onKeyDown={(event) => tabKeyboard(event, TAB_KEYS, tab, setTab, (key) => `tab-${key}`)}
            onClick={() => setTab(item.key)}
          >
            {item.label}
            <span className="tab-count">{tabCount(item.key)}</span>
          </button>
        ))}
      </div>

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="panel">
        {loading ? (
          <div className="loading-screen" role="status" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            <span>Reading the brand library…</span>
          </div>
        ) : tab === 'guidelines' ? (
          <div className="table-wrap">
            <table className="data-table">
              <caption className="sr-only">Brand guidelines with version and status</caption>
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Guideline</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Version</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {current.map((guideline) => (
                  <tr key={guideline.id}>
                    <td className="mono">{guideline.stable_id}</td>
                    <td>
                      <strong>{guideline.title}</strong>
                      <div className="tiny muted">{guideline.category}</div>
                    </td>
                    <td className="small">{guideline.owner || '—'}</td>
                    <td>
                      <span className="chip">v{guideline.current_version}</span>
                      <span className="tiny muted"> · {guideline.version_count} total</span>
                    </td>
                    <td>
                      <StatusChip status={guideline.status} />
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setForm({ kind: 'guidelines', record: guideline })}
                        >
                          Edit
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openHistory(guideline)}>
                          History
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggle('guidelines', guideline)}>
                          {guideline.status === 'active' ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : tab === 'facts' ? (
          <div className="table-wrap">
            <table className="data-table">
              <caption className="sr-only">Approved facts with source and expiry</caption>
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Fact</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Effective</th>
                  <th scope="col">Expiry</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {current.map((fact) => {
                  const expired = fact.expiry_date && fact.expiry_date < new Date().toISOString().slice(0, 10);
                  return (
                    <tr key={fact.id}>
                      <td className="mono">{fact.stable_id}</td>
                      <td>
                        <strong>{fact.statement}</strong>
                        <div className="tiny muted">Source: {fact.source}</div>
                        {fact.successor_stable_id && <div className="tiny muted">Successor: {fact.successor_stable_id}</div>}
                      </td>
                      <td className="small">{fact.owner}</td>
                      <td className="small">{formatDate(fact.effective_date)}</td>
                      <td className="small">
                        {fact.expiry_date ? (
                          <span className={`chip ${expired ? 'chip-danger' : ''}`}>
                            {formatDate(fact.expiry_date)}
                            {expired ? ' · expired' : ''}
                          </span>
                        ) : (
                          'No expiry'
                        )}
                      </td>
                      <td>
                        <StatusChip status={fact.status} />
                      </td>
                      <td>
                        <div className={styles.actions}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setForm({ kind: 'facts', record: fact })}
                          >
                            Edit
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggle('facts', fact)}>
                            {fact.status === 'active' ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : tab === 'terminology' ? (
          <div className="table-wrap">
            <table className="data-table">
              <caption className="sr-only">Preferred terminology and banned alternatives</caption>
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Preferred</th>
                  <th scope="col">Avoid</th>
                  <th scope="col">Notes</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {current.map((entry) => (
                  <tr key={entry.id}>
                    <td className="mono">{entry.code}</td>
                    <td>
                      <strong>{entry.preferred_term}</strong>
                      {entry.guideline_ref && <div className="tiny muted">{entry.guideline_ref}</div>}
                    </td>
                    <td>
                      <div className={styles.chipWrap}>
                        {(entry.banned_terms || []).map((term) => (
                          <span className="chip chip-danger" key={term}>
                            {term}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="small">{entry.notes || '—'}</td>
                    <td>
                      <StatusChip status={entry.status} />
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setForm({ kind: 'terminology', record: entry })}
                        >
                          Edit
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggle('terminology', entry)}>
                          {entry.status === 'active' ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.assetGrid}>
            {current.map((asset) => (
              <div className={styles.assetCard} key={asset.id}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="chip">{titleCase(asset.type)}</span>
                  <StatusChip status={asset.status} />
                </div>
                <h3 className={styles.assetName}>{asset.name}</h3>
                {asset.type === 'colour' ? (
                  <Palette value={asset.value} />
                ) : asset.value?.startsWith('/api/') ? (
                  <a href={asset.value} target="_blank" rel="noreferrer" className="small">
                    Open uploaded asset
                  </a>
                ) : (
                  <p className={styles.assetValue}>{asset.value || '—'}</p>
                )}
                <p className="small muted">{asset.description || 'No description yet.'}</p>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setForm({ kind: 'assets', record: asset })}
                  >
                    Edit
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggle('assets', asset)}>
                    {asset.status === 'active' ? 'Deactivate' : 'Reactivate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="tiny muted">
        Deactivating an item keeps its history and past findings intact. The review engine only checks active library
        items. Changes are attributed to you in the audit log.
      </p>

      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={
          form
            ? `${form.record ? 'Edit' : 'Add'} ${form.kind === 'facts' ? 'approved fact' : form.kind === 'assets' ? 'brand asset' : form.kind === 'terminology' ? 'terminology term' : 'guideline'}`
            : ''
        }
        description="Changes are versioned and attributed. Humans remain responsible for what is approved."
        wide={form?.kind === 'guidelines'}
      >
        {form?.kind === 'guidelines' && <GuidelineForm record={form.record} onCancel={() => setForm(null)} onSaved={onSaved} />}
        {form?.kind === 'facts' && <FactForm record={form.record} onCancel={() => setForm(null)} onSaved={onSaved} />}
        {form?.kind === 'terminology' && (
          <TerminologyForm record={form.record} onCancel={() => setForm(null)} onSaved={onSaved} />
        )}
        {form?.kind === 'assets' && <AssetForm record={form.record} onCancel={() => setForm(null)} onSaved={onSaved} />}
      </Modal>

      <Modal
        open={Boolean(history)}
        onClose={() => setHistory(null)}
        title={history ? `${history.guideline.stable_id} · version history` : ''}
        description="Append-only version history. Earlier versions are never rewritten."
        wide
      >
        {history?.loading ? (
          <div className="loading-screen" role="status">
            <span className="spinner" aria-hidden="true" />
            <span>Loading versions…</span>
          </div>
        ) : history?.error ? (
          <p className="error-text">{history.error}</p>
        ) : (
          <div className={styles.versionList}>
            {history?.versions.map((version) => (
              <article className={styles.version} key={version.id}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="chip chip-accent">Version {version.version}</span>
                  <span className="tiny muted">{formatDate(version.created_at)}</span>
                </div>
                <p className={styles.versionNote}>{version.change_note}</p>
                <p className="tiny muted">By {version.created_by_name || 'Unknown'}</p>
                <pre className={styles.versionBody}>{version.body}</pre>
              </article>
            ))}
          </div>
        )}
      </Modal>
    </section>
  );
}
