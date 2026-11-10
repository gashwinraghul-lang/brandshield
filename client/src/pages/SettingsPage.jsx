import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, formatDate, formatDateTime, initials, titleCase } from '../api';
import { useAuth } from '../auth/AuthContext';
import Modal from '../components/Modal';
import { tabKeyboard } from '../utils/tabs';
import styles from './SettingsPage.module.css';

const TABS = [
  { key: 'workspace', label: 'Workspace & AI' },
  { key: 'patterns', label: 'Confidential patterns' },
  { key: 'people', label: 'User roles' },
  { key: 'workspaces', label: 'Workspaces & invitations' },
  { key: 'emails', label: 'Sent emails' },
];
const TAB_KEYS = TABS.map((item) => item.key);

const DISCLOSURES = ['none', 'AI-assisted', 'AI-generated'];
const ACCOUNT_STATES = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending approval' },
  { value: 'suspended', label: 'Suspended' },
];

function providerOptions(providers) {
  return [
    { value: 'auto', label: 'Auto (first configured of Gemini, Groq, OpenRouter, custom; otherwise MOCK)' },
    ...providers.map((provider) => ({
      value: provider.id,
      label: `${provider.label}${provider.requiresKey && !provider.configured ? ' — no key' : ''}`,
    })),
  ];
}

function accountStateChip(person) {
  if (person.deactivated_at) return { label: `Deactivated ${formatDate(person.deactivated_at)}`, className: 'chip chip-danger' };
  if (person.account_state === 'pending') return { label: 'Pending approval', className: 'chip chip-warn' };
  if (person.account_state === 'suspended') return { label: 'Suspended', className: 'chip chip-danger' };
  return { label: 'Active', className: 'chip chip-ok' };
}

function invitationStatus(invitation) {
  if (invitation.used_by_user_id) {
    return {
      label: `Used by ${invitation.used_by_name || invitation.used_by_email || 'a member'}`,
      className: 'chip',
    };
  }
  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    return { label: `Expired ${formatDate(invitation.expires_at)}`, className: 'chip chip-danger' };
  }
  return { label: `Active until ${formatDate(invitation.expires_at)}`, className: 'chip chip-ok' };
}

function PatternForm({ record, onCancel, onSaved }) {
  const editing = Boolean(record);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    const payload = {
      name: fields.name,
      pattern: fields.pattern,
      replacement: fields.replacement,
    };
    if (editing) payload.active = fields.active === 'on';
    try {
      if (editing) {
        await api.patch(`/api/settings/patterns/${record.id}`, payload);
        onSaved(`Pattern “${record.name}” updated.`);
      } else {
        await api.post('/api/settings/patterns', payload);
        onSaved('Confidential pattern created. It applies to future external AI reviews.');
      }
    } catch (submitError) {
      setError(submitError.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={styles.form}>
      <div className="form-field">
        <label htmlFor="pattern-name">Pattern name</label>
        <input id="pattern-name" name="name" className="input" defaultValue={record?.name || ''} required maxLength={120} />
      </div>
      <div className="form-field">
        <label htmlFor="pattern-regex">Regular expression</label>
        <input
          id="pattern-regex"
          name="pattern"
          className="input mono"
          defaultValue={record?.pattern || ''}
          required
          maxLength={500}
          placeholder="Project\\s+(Aurora|Meridian)"
        />
        <span className="hint">JavaScript regular expression. Test carefully; a malformed pattern is rejected.</span>
      </div>
      <div className="form-field">
        <label htmlFor="pattern-replacement">Replacement text</label>
        <input
          id="pattern-replacement"
          name="replacement"
          className="input"
          defaultValue={record?.replacement || '[REDACTED]'}
          maxLength={80}
        />
        <span className="hint">This appears in the masked copy sent to an external AI provider.</span>
      </div>
      {editing && (
        <label className="checkbox">
          <input type="checkbox" name="active" defaultChecked={Boolean(record.active)} />
          <span>Active — apply this pattern to external AI calls</span>
        </label>
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
          {busy ? 'Saving…' : editing ? 'Save pattern' : 'Add pattern'}
        </button>
      </div>
    </form>
  );
}

function UserForm({ record, roles, onCancel, onSaved }) {
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
        const payload = {
          name: fields.name,
          team: fields.team,
          role: fields.role,
        };
        if (fields.accountState) payload.accountState = fields.accountState;
        if (fields.password) payload.password = fields.password;
        await api.patch(`/api/users/${record.id}`, payload);
        onSaved(`User ${record.name} updated.`);
      } else {
        await api.post('/api/users', {
          name: fields.name,
          email: fields.email,
          role: fields.role,
          team: fields.team,
          password: fields.password,
        });
        onSaved('User created. Share the temporary password through a secure channel.');
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
          <label htmlFor="user-name">Name</label>
          <input id="user-name" name="name" className="input" defaultValue={record?.name || ''} required maxLength={120} />
        </div>
        <div className="form-field">
          <label htmlFor="user-team">Team</label>
          <input id="user-team" name="team" className="input" defaultValue={record?.team || ''} required maxLength={80} />
        </div>
      </div>
      {!editing && (
        <div className="form-field">
          <label htmlFor="user-email">Work email</label>
          <input id="user-email" name="email" type="email" className="input" required maxLength={254} autoComplete="off" />
        </div>
      )}
      <div className="grid grid-2">
        <div className="form-field">
          <label htmlFor="user-role">Role</label>
          <select id="user-role" name="role" className="select" defaultValue={record?.role_key || 'creator'}>
            {roles.map((role) => (
              <option key={role} value={role}>
                {titleCase(role)}
              </option>
            ))}
          </select>
          <span className="hint">Admins manage the library. Reviewers decide. Creators submit. Agencies work inside assigned workspaces. Leadership reads trends.</span>
        </div>
        {editing && (
          <div className="form-field">
            <label htmlFor="user-account-state">Account state</label>
            <select
              id="user-account-state"
              name="accountState"
              className="select"
              defaultValue={record?.account_state || 'active'}
            >
              {ACCOUNT_STATES.map((state) => (
                <option key={state.value} value={state.value}>
                  {state.label}
                </option>
              ))}
            </select>
            <span className="hint">Use Approve for pending agency accounts. Suspending blocks sign-in without deleting data.</span>
          </div>
        )}
      </div>
      <div className="form-field">
        <label htmlFor="user-password">{editing ? 'New password (optional)' : 'Temporary password'}</label>
        <input
          id="user-password"
          name="password"
          type="password"
          className="input"
          required={!editing}
          minLength={10}
          autoComplete="new-password"
        />
        <span className="hint">At least 10 characters with upper, lower, number and symbol. Passwords are hashed with bcrypt.</span>
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
          {busy ? 'Saving…' : editing ? 'Save user' : 'Create user'}
        </button>
      </div>
    </form>
  );
}

function ApproveForm({ record, roles, workspaces, onCancel, onSaved }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api.post(`/api/users/${record.id}/approve`, {
        role: fields.role,
        brandWorkspaceId: fields.brandWorkspaceId || undefined,
      });
      onSaved(`${record.name} approved${fields.brandWorkspaceId ? ' and added to the selected workspace' : ''}.`);
    } catch (submitError) {
      setError(submitError.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={styles.form}>
      <div className="notice notice-warn">
        <span className="notice-icon" aria-hidden="true">
          !
        </span>
        <div>
          <strong>{record.name}</strong> ({record.email}) signed up as {titleCase(record.account_type || 'agency')}
          {record.agency_name ? ` for ${record.agency_name}` : ''} and is waiting for approval.
        </div>
      </div>
      <div className="form-field">
        <label htmlFor="approve-role">Role</label>
        <select id="approve-role" name="role" className="select" defaultValue={record.account_type || 'agency'}>
          {roles.map((role) => (
            <option key={role} value={role}>
              {titleCase(role)}
            </option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label htmlFor="approve-workspace">Brand workspace</label>
        <select
          id="approve-workspace"
          name="brandWorkspaceId"
          className="select"
          defaultValue={workspaces[0]?.id || ''}
        >
          <option value="">No workspace yet</option>
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
        <span className="hint">Agency accounts can only create content inside workspaces they belong to.</span>
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
          {busy ? 'Approving…' : 'Approve account'}
        </button>
      </div>
    </form>
  );
}

function WorkspaceMembershipForm({ record, workspaces, onCancel, onSaved }) {
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get(`/api/users/${record.id}/workspaces`)
      .then((payload) => {
        if (active) setSelected(new Set(payload.workspaceIds || []));
      })
      .catch((loadError) => {
        if (active) setError(loadError.message);
      });
    return () => {
      active = false;
    };
  }, [record.id]);

  const toggle = (id) => {
    setSelected((current) => {
      const next = new Set(current || []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const current = await api.get(`/api/users/${record.id}/workspaces`);
      const currentIds = current.workspaceIds || [];
      const selectedIds = [...selected];
      const added = selectedIds.filter((id) => !currentIds.includes(id));
      const removed = currentIds.filter((id) => !selectedIds.includes(id));
      if (added.length) {
        await api.post(`/api/users/${record.id}/workspaces`, { brandWorkspaceIds: added });
      }
      for (const id of removed) {
        await api.delete(`/api/users/${record.id}/workspaces/${id}`);
      }
      onSaved(`Workspace access for ${record.name} updated.`);
    } catch (submitError) {
      setError(submitError.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={styles.form}>
      <p className="small muted">
        Creators, reviewers and agency users see content inside the workspaces they belong to. Reviewers can still review
        submissions assigned to them.
      </p>
      {!selected && !error && <p className="small muted">Loading workspace access…</p>}
      {selected && workspaces.length === 0 && <p className="small muted">No brand workspaces exist yet.</p>}
      {selected &&
        workspaces.map((workspace) => (
          <label key={workspace.id} className="checkbox">
            <input
              type="checkbox"
              checked={selected.has(workspace.id)}
              onChange={() => toggle(workspace.id)}
            />
            <span>
              <strong>{workspace.name}</strong>
              <span className="tiny muted">
                {' '}
                · {workspace.member_count} member{workspace.member_count === 1 ? '' : 's'} · {workspace.submission_count}{' '}
                submission{workspace.submission_count === 1 ? '' : 's'}
              </span>
            </span>
          </label>
        ))}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || !selected}>
          {busy ? 'Saving…' : 'Save workspace access'}
        </button>
      </div>
    </form>
  );
}

export default function SettingsPage() {
  const { user, refresh } = useAuth();
  const [tab, setTab] = useState('workspace');
  const [settings, setSettings] = useState(null);
  const [llm, setLlm] = useState({ keyConfigured: false, model: '', providers: [], configuredCount: 0 });
  const [patterns, setPatterns] = useState([]);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [patternForm, setPatternForm] = useState(null);
  const [userForm, setUserForm] = useState(null);
  const [approveForm, setApproveForm] = useState(null);
  const [membershipForm, setMembershipForm] = useState(null);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purging, setPurging] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const [inviting, setInviting] = useState(null);
  const [emailView, setEmailView] = useState(null);
  const [clearEmailsOpen, setClearEmailsOpen] = useState(false);
  const [clearingEmails, setClearingEmails] = useState(false);
  const [copyNote, setCopyNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsPayload, usersPayload, workspacesPayload, invitationsPayload, emailsPayload] = await Promise.all([
        api.get('/api/settings'),
        api.get('/api/users'),
        api.get('/api/workspaces'),
        api.get('/api/workspaces/invitations'),
        api.get('/api/settings/emails'),
      ]);
      setSettings(settingsPayload.settings);
      setLlm(settingsPayload.llm);
      setPatterns(settingsPayload.patterns);
      setUsers(usersPayload.users);
      setRoles(usersPayload.roles);
      setWorkspaces(workspacesPayload.workspaces || []);
      setInvitations(invitationsPayload.invitations || []);
      setEmails(emailsPayload.emails || []);
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

  const pendingUsers = useMemo(() => users.filter((person) => person.account_state === 'pending'), [users]);
  const providerList = llm.providers?.length ? llm.providers : [];
  const providers = useMemo(() => providerOptions(providerList), [providerList]);

  const onPatternSaved = async (message) => {
    setPatternForm(null);
    setFeedback(message);
    await load();
  };

  const onUserSaved = async (message) => {
    setUserForm(null);
    setFeedback(message);
    await load();
  };

  const onApproved = async (message) => {
    setApproveForm(null);
    setFeedback(message);
    await load();
  };

  const onMembershipSaved = async (message) => {
    setMembershipForm(null);
    setFeedback(message);
    await load();
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setFeedback('');
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api.patch('/api/settings', {
        org_name: fields.org_name,
        retention_days: Number(fields.retention_days),
        default_ai_disclosure: fields.default_ai_disclosure,
        external_llm_enabled: fields.external_llm_enabled === 'on',
        llm_provider: fields.llm_provider,
      });
      setFeedback('Workspace settings saved. The top bar and privacy notices update immediately.');
      await load();
      await refresh();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const togglePattern = async (pattern) => {
    setFeedback('');
    try {
      if (pattern.active) {
        await api.post(`/api/settings/patterns/${pattern.id}/deactivate`, {});
        setFeedback(`Pattern “${pattern.name}” deactivated.`);
      } else {
        await api.patch(`/api/settings/patterns/${pattern.id}`, { active: true });
        setFeedback(`Pattern “${pattern.name}” activated.`);
      }
      await load();
    } catch (toggleError) {
      setError(toggleError.message);
    }
  };

  const toggleUser = async (target) => {
    setFeedback('');
    setError('');
    try {
      if (target.deactivated_at) {
        await api.patch(`/api/users/${target.id}`, { reactivate: true });
        setFeedback(`${target.name} reactivated.`);
      } else {
        await api.patch(`/api/users/${target.id}`, { deactivate: true });
        setFeedback(`${target.name} deactivated. Their sessions will stop being accepted.`);
      }
      await load();
    } catch (toggleError) {
      setError(toggleError.message);
    }
  };

  const createWorkspace = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    setFeedback('');
    setError('');
    try {
      await api.post('/api/workspaces', { name: fields.name });
      form.reset();
      setFeedback(`Workspace “${fields.name}” created. Invite an agency partner next.`);
      await load();
    } catch (createError) {
      setError(createError.message);
    }
  };

  const createInvitation = async (workspace) => {
    setInviting(workspace.id);
    setError('');
    setFeedback('');
    setCopyNote('');
    try {
      const payload = await api.post(`/api/workspaces/${workspace.id}/invitations`, {});
      setInviteResult(payload.invitation);
      await load();
    } catch (inviteError) {
      setError(inviteError.message);
    } finally {
      setInviting(null);
    }
  };

  const copyInvitation = async () => {
    if (!inviteResult?.code) return;
    try {
      await navigator.clipboard.writeText(inviteResult.code);
      setCopyNote('Invitation code copied.');
    } catch {
      setCopyNote('Select the code and copy it manually.');
    }
  };

  const clearEmails = async () => {
    setClearingEmails(true);
    try {
      const result = await api.delete('/api/settings/emails');
      setClearEmailsOpen(false);
      setFeedback(`${result.deleted} sent email${result.deleted === 1 ? '' : 's'} cleared from the outbox.`);
      await load();
    } catch (clearError) {
      setError(clearError.message);
    } finally {
      setClearingEmails(false);
    }
  };

  const purge = async () => {
    setPurging(true);
    try {
      const result = await api.post('/api/settings/retention/purge', {});
      setPurgeOpen(false);
      setFeedback(
        result.deleted
          ? `${result.deleted} submission${result.deleted === 1 ? '' : 's'} older than ${result.retentionDays} days were removed.`
          : `No submissions were older than ${result.retentionDays} days. Nothing was removed.`
      );
      await load();
    } catch (purgeError) {
      setError(purgeError.message);
    } finally {
      setPurging(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <span>Opening workspace settings…</span>
      </div>
    );
  }

  if (!settings) {
    return (
      <section className="page">
        <div className="notice notice-danger" role="alert">
          <span className="notice-icon" aria-hidden="true">
            !
          </span>
          <div>
            <strong>Settings could not load.</strong> {error}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Settings · Admin</p>
          <h1 className="page-title">Keep the shield honest.</h1>
          <p className="page-subtitle">
            Control where content is processed, how long it is kept, which confidential patterns are masked, who can make
            decisions, and which partners can work inside the brand.
          </p>
        </div>
        <span className="chip chip-accent">Admin only</span>
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
          <div>{error}</div>
        </div>
      )}

      <div className="tabs" role="tablist" aria-label="Settings sections">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`settings-tab-${item.key}`}
            aria-selected={tab === item.key}
            aria-controls={`settings-panel-${item.key}`}
            tabIndex={tab === item.key ? 0 : -1}
            onKeyDown={(event) => tabKeyboard(event, TAB_KEYS, tab, setTab, (key) => `settings-tab-${key}`)}
            onClick={() => setTab(item.key)}
          >
            {item.label}
            {item.key === 'patterns' && <span className="tab-count">{patterns.length}</span>}
            {item.key === 'people' && <span className="tab-count">{users.length}</span>}
            {item.key === 'workspaces' && <span className="tab-count">{workspaces.length}</span>}
            {item.key === 'emails' && <span className="tab-count">{emails.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'workspace' && (
        <div id="settings-panel-workspace" role="tabpanel" aria-labelledby="settings-tab-workspace" className={styles.grid}>
          <form className="panel" onSubmit={saveSettings}>
            <div className="panel-heading">
              <div>
                <h2>Workspace</h2>
                <p className="tiny muted">Organisation details and content retention.</p>
              </div>
            </div>
            <div className="stack">
              <div className="form-field">
                <label htmlFor="org-name">Organisation name</label>
                <input id="org-name" name="org_name" className="input" defaultValue={settings.org_name} required maxLength={120} />
              </div>
              <div className="grid grid-2">
                <div className="form-field">
                  <label htmlFor="retention-days">Retention period (days)</label>
                  <input
                    id="retention-days"
                    name="retention_days"
                    type="number"
                    className="input"
                    min={1}
                    max={3650}
                    defaultValue={settings.retention_days}
                    required
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="default-disclosure">Default AI disclosure</label>
                  <select id="default-disclosure" name="default_ai_disclosure" className="select" defaultValue={settings.default_ai_disclosure}>
                    {DISCLOSURES.map((disclosure) => (
                      <option key={disclosure} value={disclosure}>
                        {disclosure === 'none' ? 'No AI used' : disclosure}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-field">
                <label htmlFor="llm-provider">AI provider</label>
                <select id="llm-provider" name="llm_provider" className="select" defaultValue={settings.llm_provider}>
                  {providers.map((provider) => (
                    <option key={provider.value} value={provider.value}>
                      {provider.label}
                    </option>
                  ))}
                </select>
                <span className="hint">
                  Keys are read from server-side environment variables. Nothing can be generated or embedded from the
                  browser.
                </span>
              </div>
              <label className="checkbox">
                <input type="checkbox" name="external_llm_enabled" defaultChecked={settings.external_llm_enabled} />
                <span>
                  Allow content to be sent to an external AI provider when a key is configured. Confidential patterns are
                  masked first.
                </span>
              </label>
              <div className={styles.saveRow}>
                <p className="tiny muted">Changes are audited with your name and a timestamp.</p>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save workspace settings'}
                </button>
              </div>
            </div>
          </form>

          <div className="stack">
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <h2>AI provider status</h2>
                  <p className="tiny muted">Keys stay in environment variables and are never shown in the interface.</p>
                </div>
                <span className={`chip ${settings.external_llm_enabled ? 'chip-warn' : 'chip-ok'}`}>
                  {settings.external_llm_enabled ? 'External allowed' : 'Local only'}
                </span>
              </div>
              <dl className={styles.statusList}>
                <div>
                  <dt>Selected provider</dt>
                  <dd>{settings.llm_provider}</dd>
                </div>
                <div>
                  <dt>Configured providers</dt>
                  <dd>{llm.configuredCount || 0}</dd>
                </div>
                <div>
                  <dt>Model</dt>
                  <dd className="mono">{llm.model || '—'}</dd>
                </div>
              </dl>
              <div className="table-wrap" style={{ marginTop: 14 }}>
                <table className="data-table">
                  <caption className="sr-only">AI provider configuration</caption>
                  <thead>
                    <tr>
                      <th scope="col">Provider</th>
                      <th scope="col">Network</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providerList.map((provider) => (
                      <tr key={provider.id}>
                        <td>
                          <strong>{provider.id}</strong>
                          <div className="tiny muted">{provider.label}</div>
                        </td>
                        <td className="small">{provider.external ? 'External' : 'Local'}</td>
                        <td>
                          <span className={`chip ${provider.configured ? 'chip-ok' : 'chip-warn'}`}>
                            {provider.configured ? 'Ready' : provider.requiresKey ? 'No key' : 'Ready'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {settings.external_llm_enabled && !llm.keyConfigured && !providerList.some((provider) => provider.id === 'pollinations') && (
                <div className="notice notice-warn" style={{ marginTop: 14 }}>
                  <span className="notice-icon" aria-hidden="true">
                    !
                  </span>
                  <div>
                    External AI is enabled but no API key is configured. Reviews will fall back to the local MOCK provider
                    with a clear notice; nothing will leave the server.
                  </div>
                </div>
              )}
              {settings.external_llm_enabled && !llm.keyConfigured && providerList.some((provider) => provider.id === 'pollinations') && (
                <div className="notice notice-warn" style={{ marginTop: 14 }}>
                  <span className="notice-icon" aria-hidden="true">
                    !
                  </span>
                  <div>
                    No keyed provider is configured. Selecting Auto will use MOCK; selecting Pollinations explicitly sends
                    masked content to an external keyless service.
                  </div>
                </div>
              )}
              {!settings.external_llm_enabled && (
                <div className="notice" style={{ marginTop: 14 }}>
                  <span className="notice-icon" aria-hidden="true">
                    ⌂
                  </span>
                  <div>
                    Content stays on this server. The MOCK provider gives realistic sample findings so the demo works
                    offline.
                  </div>
                </div>
              )}
            </div>

            <div className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Data retention</h2>
                  <p className="tiny muted">
                    Purge removes submissions last updated more than {settings.retention_days} days ago. Items awaiting
                    review are protected.
                  </p>
                </div>
              </div>
              <p className="small muted" style={{ marginBottom: 14 }}>
                The deletion itself is recorded in the audit log. Findings and revision history for the removed
                submission are deleted with it.
              </p>
              <button type="button" className="btn btn-danger" onClick={() => setPurgeOpen(true)}>
                Purge old submissions
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'patterns' && (
        <div id="settings-panel-patterns" role="tabpanel" aria-labelledby="settings-tab-patterns" className="panel">
          <div className="panel-heading">
            <div>
              <h2>Confidential patterns</h2>
              <p className="tiny muted">
                Masked before any external AI call, then restored locally. Patterns only apply when external AI is used.
              </p>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setPatternForm({ record: null })}>
              Add pattern
            </button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <caption className="sr-only">Confidential masking patterns</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Pattern</th>
                  <th scope="col">Replacement</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {patterns.map((pattern) => (
                  <tr key={pattern.id}>
                    <td>
                      <strong>{pattern.name}</strong>
                    </td>
                    <td className="mono">{pattern.pattern}</td>
                    <td className="mono">{pattern.replacement}</td>
                    <td>
                      <span className={`chip ${pattern.active ? 'chip-ok' : ''}`}>{pattern.active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPatternForm({ record: pattern })}>
                          Edit
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => togglePattern(pattern)}>
                          {pattern.active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tiny muted" style={{ marginTop: 12 }}>
            Avoid broad patterns that could mask ordinary words. Test with a sample before relying on a new rule.
          </p>
        </div>
      )}

      {tab === 'people' && (
        <div id="settings-panel-people" role="tabpanel" aria-labelledby="settings-tab-people" className="stack">
          {pendingUsers.length > 0 && (
            <div className="notice notice-warn" role="status">
              <span className="notice-icon" aria-hidden="true">
                !
              </span>
              <div>
                <strong>
                  {pendingUsers.length} account{pendingUsers.length === 1 ? '' : 's'} waiting for approval.
                </strong>{' '}
                Pending agency accounts cannot submit content until an administrator approves them and assigns a brand
                workspace.
              </div>
            </div>
          )}
          <div className="panel">
            <div className="panel-heading">
              <div>
                <h2>User roles</h2>
                <p className="tiny muted">Role-based access control. At least one active admin must remain.</p>
              </div>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setUserForm({ record: null })}>
                Add user
              </button>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <caption className="sr-only">Workspace users, roles and account states</caption>
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    <th scope="col">Role</th>
                    <th scope="col">Team</th>
                    <th scope="col">Workspaces</th>
                    <th scope="col">Submissions</th>
                    <th scope="col">Account</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((person) => {
                    const state = accountStateChip(person);
                    return (
                      <tr key={person.id}>
                        <td>
                          <div className={styles.person}>
                            <span className={styles.avatar} aria-hidden="true">
                              {initials(person.name)}
                            </span>
                            <div>
                              <strong>{person.name}</strong>
                              <div className="tiny muted">{person.email}</div>
                              <div className="tiny muted">
                                {person.email_verified_at ? 'Email verified' : 'Email not verified'}
                                {person.agency_name ? ` · ${person.agency_name}` : ''}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="chip">{titleCase(person.role_key)}</span>
                          <div className="tiny muted">{titleCase(person.account_type || person.role_key)}</div>
                        </td>
                        <td className="small">{person.team_name || person.team || '—'}</td>
                        <td className="small">{person.workspace_names || '—'}</td>
                        <td className="small">{person.submission_count}</td>
                        <td>
                          <span className={state.className}>{state.label}</span>
                        </td>
                        <td>
                          <div className={styles.actions}>
                            {person.account_state === 'pending' && (
                              <button type="button" className="btn btn-primary btn-sm" onClick={() => setApproveForm(person)}>
                                Approve
                              </button>
                            )}
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setUserForm({ record: person })}>
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => setMembershipForm(person)}
                            >
                              Workspaces
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => toggleUser(person)}
                              disabled={person.id === user.id}
                              title={person.id === user.id ? 'You cannot deactivate your own account' : undefined}
                            >
                              {person.deactivated_at ? 'Reactivate' : 'Deactivate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="tiny muted" style={{ marginTop: 12 }}>
              Reviewers can see all teams’ submissions and make the final decision. Creators and agency users only see
              their own content inside workspaces they belong to. Leadership sees dashboards and audit exports.
            </p>
          </div>
        </div>
      )}

      {tab === 'workspaces' && (
        <div id="settings-panel-workspaces" role="tabpanel" aria-labelledby="settings-tab-workspaces" className={styles.grid}>
          <div className="stack">
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Brand workspaces</h2>
                  <p className="tiny muted">Keep client work separated. Agency accounts only see workspaces they belong to.</p>
                </div>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <caption className="sr-only">Brand workspaces</caption>
                  <thead>
                    <tr>
                      <th scope="col">Workspace</th>
                      <th scope="col">Members</th>
                      <th scope="col">Submissions</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspaces.map((workspace) => (
                      <tr key={workspace.id}>
                        <td>
                          <strong>{workspace.name}</strong>
                          <div className="tiny muted mono">{workspace.id}</div>
                        </td>
                        <td className="small">{workspace.member_count}</td>
                        <td className="small">{workspace.submission_count}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => createInvitation(workspace)}
                            disabled={inviting === workspace.id}
                          >
                            {inviting === workspace.id ? 'Creating…' : 'New invitation'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Invitations</h2>
                  <p className="tiny muted">Only the hash of a code is stored. The plaintext code is shown once when it is created.</p>
                </div>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <caption className="sr-only">Brand workspace invitations</caption>
                  <thead>
                    <tr>
                      <th scope="col">Workspace</th>
                      <th scope="col">Created</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invitations.map((invitation) => {
                      const status = invitationStatus(invitation);
                      return (
                        <tr key={invitation.id}>
                          <td>
                            <strong>{invitation.workspace_name}</strong>
                            <div className="tiny muted mono">{invitation.id}</div>
                          </td>
                          <td className="small">{formatDateTime(invitation.created_at)}</td>
                          <td>
                            <span className={status.className}>{status.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {invitations.length === 0 && <p className="small muted" style={{ marginTop: 12 }}>No invitations have been issued yet.</p>}
            </div>
          </div>

          <div className="stack">
            <form className="panel" onSubmit={createWorkspace}>
              <div className="panel-heading">
                <div>
                  <h2>Create a workspace</h2>
                  <p className="tiny muted">Use a client or partner name that people will recognise.</p>
                </div>
              </div>
              <div className="stack">
                <div className="form-field">
                  <label htmlFor="workspace-name">Workspace name</label>
                  <input id="workspace-name" name="name" className="input" required maxLength={120} placeholder="e.g. Harbor & Finch partnership" />
                </div>
                <div className={styles.saveRow}>
                  <p className="tiny muted">Every workspace starts empty.</p>
                  <button type="submit" className="btn btn-primary">
                    Create workspace
                  </button>
                </div>
              </div>
            </form>

            <div className="panel">
              <h2>How invitations work</h2>
              <ol className="small muted" style={{ margin: '10px 0 0', paddingLeft: 20 }}>
                <li>Create or choose a brand workspace.</li>
                <li>Generate a single-use invitation code.</li>
                <li>Share it with the agency. Entering it at sign-up activates their agency account and links the workspace.</li>
                <li>Without a code, agency accounts wait for admin approval.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {tab === 'emails' && (
        <div id="settings-panel-emails" role="tabpanel" aria-labelledby="settings-tab-emails" className="panel">
          <div className="panel-heading">
            <div>
              <h2>Sent emails</h2>
              <p className="tiny muted">
                Mock email delivery. Verification and password-reset links are stored here and written to the server console.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => setClearEmailsOpen(true)}
              disabled={emails.length === 0}
            >
              Clear sent emails
            </button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <caption className="sr-only">Mock email outbox</caption>
              <thead>
                <tr>
                  <th scope="col">Sent</th>
                  <th scope="col">To</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Message</th>
                </tr>
              </thead>
              <tbody>
                {emails.map((email) => (
                  <tr key={email.id}>
                    <td className="small">{formatDateTime(email.created_at)}</td>
                    <td className="small">{email.to_email}</td>
                    <td className="small">{email.subject}</td>
                    <td>
                      <span className="chip">{titleCase(email.kind)}</span>
                    </td>
                    <td>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEmailView(email)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {emails.length === 0 && (
            <div className="empty-state">
              <p className="eyebrow">Nothing sent yet</p>
              <p className="small muted">Verification and reset emails will appear here after someone signs up or resets a password.</p>
            </div>
          )}
          <p className="tiny muted" style={{ marginTop: 12 }}>
            This is a demo. No external email service is contacted. Clearing the outbox does not invalidate links already
            issued.
          </p>
        </div>
      )}

      <Modal
        open={Boolean(patternForm)}
        onClose={() => setPatternForm(null)}
        title={patternForm?.record ? 'Edit confidential pattern' : 'Add confidential pattern'}
        description="Patterns are applied only when content is sent to an external AI provider. They are never used as brand rules."
      >
        {patternForm && (
          <PatternForm record={patternForm.record} onCancel={() => setPatternForm(null)} onSaved={onPatternSaved} />
        )}
      </Modal>

      <Modal
        open={Boolean(userForm)}
        onClose={() => setUserForm(null)}
        title={userForm?.record ? `Edit ${userForm.record.name}` : 'Add a user'}
        description="Passwords are hashed with bcrypt. Share temporary passwords through a secure channel."
      >
        {userForm && <UserForm record={userForm.record} roles={roles} onCancel={() => setUserForm(null)} onSaved={onUserSaved} />}
      </Modal>

      <Modal
        open={Boolean(approveForm)}
        onClose={() => setApproveForm(null)}
        title={`Approve ${approveForm?.name || 'account'}`}
        description="Approving activates the account and can assign the agency to a brand workspace."
      >
        {approveForm && (
          <ApproveForm
            record={approveForm}
            roles={roles}
            workspaces={workspaces}
            onCancel={() => setApproveForm(null)}
            onSaved={onApproved}
          />
        )}
      </Modal>

      <Modal
        open={Boolean(membershipForm)}
        onClose={() => setMembershipForm(null)}
        title={`Workspace access · ${membershipForm?.name || ''}`}
        description="Choose which brand workspaces this person can work inside."
      >
        {membershipForm && (
          <WorkspaceMembershipForm
            record={membershipForm}
            workspaces={workspaces}
            onCancel={() => setMembershipForm(null)}
            onSaved={onMembershipSaved}
          />
        )}
      </Modal>

      <Modal
        open={Boolean(inviteResult)}
        onClose={() => setInviteResult(null)}
        title="Invitation code created"
        description="This code is shown once. Only its hash is stored, so copy it now."
      >
        {inviteResult && (
          <div className="stack">
            <div className="notice" role="status">
              <span className="notice-icon" aria-hidden="true">
                ✓
              </span>
              <div>
                <strong>{inviteResult.workspaceName}</strong> invitation expires on {formatDate(inviteResult.expiresAt)}. The
                agency enters this code during sign-up to activate immediately.
              </div>
            </div>
            <div className="form-field">
              <label htmlFor="invitation-code">Invitation code</label>
              <input id="invitation-code" className="input mono" value={inviteResult.code} readOnly onFocus={(event) => event.target.select()} />
              <span className="hint">Single use. Expires after 14 days by default.</span>
            </div>
            {copyNote && (
              <p className="small" role="status">
                {copyNote}
              </p>
            )}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={copyInvitation}>
                Copy code
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setInviteResult(null)}>
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(emailView)}
        onClose={() => setEmailView(null)}
        title={emailView?.subject || 'Sent email'}
        description={emailView ? `To ${emailView.to_email} · ${formatDateTime(emailView.created_at)}` : undefined}
        wide
      >
        {emailView && (
          <div className="stack">
            <pre className="mono" style={{ whiteSpace: 'pre-wrap', margin: 0, overflowWrap: 'anywhere' }}>
              {emailView.body}
            </pre>
            <p className="tiny muted">Mock email delivery — no external email service was contacted.</p>
          </div>
        )}
      </Modal>

      <Modal
        open={clearEmailsOpen}
        onClose={() => setClearEmailsOpen(false)}
        title="Clear sent emails?"
        description="This removes every mock email from the outbox. Links already issued keep working until they expire."
      >
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={() => setClearEmailsOpen(false)} disabled={clearingEmails}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={clearEmails} disabled={clearingEmails}>
            {clearingEmails ? 'Clearing…' : 'Clear sent emails'}
          </button>
        </div>
      </Modal>

      <Modal
        open={purgeOpen}
        onClose={() => setPurgeOpen(false)}
        title="Purge old submissions?"
        description={`Submissions last updated more than ${settings.retention_days} days ago will be permanently deleted, except items awaiting review. This cannot be undone.`}
      >
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={() => setPurgeOpen(false)} disabled={purging}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={purge} disabled={purging}>
            {purging ? 'Purging…' : 'Purge submissions'}
          </button>
        </div>
      </Modal>
    </section>
  );
}
