'use client';

import Image from 'next/image';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { apiBaseUrl } from '../lib/config';
import { Badge, Button, Card, Feedback, Field, Table } from './ui';

type Session = {
  user: {
    id: string;
    username: string;
    fullName: string;
    roles: string[];
    permissions: string[];
    mfaEnabled: boolean;
    mfaRequired: boolean;
  };
  passwordExpired: boolean;
  passwordExpiresAt: string;
  sessionExpiresAt: string;
  csrfToken: string;
  mfaEnrollmentRequired: boolean;
};
type Catalog = {
  departments: Array<{
    id: string;
    code: string;
    name: string;
    active: boolean;
  }>;
  roles: Array<{
    id: string;
    code: string;
    name: string;
    description?: string | null;
    active: boolean;
    mfaRequired: boolean;
    systemRole: boolean;
    permissions: string[];
  }>;
  permissions: Array<{ code: string; description: string }>;
};
type UserRow = {
  id: string;
  username: string;
  fullName: string;
  status: string;
  department: string | null;
  mustChangePassword: boolean;
  mfaEnabled: boolean;
  roles: string[];
};
type EventRow = {
  id: string;
  eventType: string;
  actorUserId: string | null;
  actorName: string | null;
  reason: string | null;
  createdAt: string;
};
type AuditUser = { id: string; fullName: string };
const api = apiBaseUrl();

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(
  path: string,
  init: RequestInit = {},
  csrf?: string,
): Promise<T> {
  const response = await fetch(`${api}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      typeof body.message === 'string'
        ? body.message
        : 'The request could not be completed.',
      response.status,
    );
  return body as T;
}
const displayDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

export function AuthPortal() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState('account');
  useEffect(() => {
    call<Session>('/auth/session')
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);
  const act = async (work: () => Promise<void>) => {
    setError('');
    setNotice('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.');
    }
  };
  const sessionAct = async (work: () => Promise<void>) => {
    setError('');
    setNotice('');
    try {
      await work();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setSession(null);
        setError('Your session has expired. Please sign in again to continue.');
        return;
      }
      setError(e instanceof Error ? e.message : 'Request failed.');
    }
  };
  if (loading)
    return (
      <div className="route-state">
        <p className="eyebrow">ZENOVEL ACCESS CONTROL</p>
        <h1>Loading secure session…</h1>
      </div>
    );
  if (!session)
    return (
      <SignIn onLogin={setSession} act={act} error={error} notice={notice} />
    );
  if (session.passwordExpired)
    return (
      <Gate title="Password change required">
        <PasswordPanel
          session={session}
          act={sessionAct}
          done={() => {
            setNotice('Password changed successfully. Please sign in again.');
            setSession(null);
          }}
        />
        {error && <Feedback error>{error}</Feedback>}
      </Gate>
    );
  if (session.mfaEnrollmentRequired)
    return (
      <Gate title="Authenticator enrollment required">
        <MfaPanel
          session={session}
          act={sessionAct}
          done={() => setSession(null)}
        />
        {error && <Feedback error>{error}</Feedback>}
      </Gate>
    );
  const admin = session.user.permissions.includes('Administer');
  const audit = session.user.permissions.includes('AuditReview');
  const roleManager = session.user.roles.some((role) =>
    ['QMS', 'SYSTEM_ADMINISTRATOR'].includes(role),
  );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">ACCESS CONTROL</div>
        <nav aria-label="Stage 2 navigation">
          <Nav active={view === 'account'} onClick={() => setView('account')}>
            Account
          </Nav>
          {admin && (
            <Nav active={view === 'users'} onClick={() => setView('users')}>
              Users
            </Nav>
          )}
          {roleManager && (
            <Nav active={view === 'access'} onClick={() => setView('access')}>
              Roles & permissions
            </Nav>
          )}
          {audit && (
            <Nav active={view === 'events'} onClick={() => setView('events')}>
              Audit Trail
            </Nav>
          )}
        </nav>
        <div className="sidebar-note">
          <span className="small-label">STAGE 2 BOUNDARY</span>
          <p>Identity and access</p>
          <small>Project and monitoring workflows remain unavailable.</small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            ZENOVEL <span className="separator">/</span> Access Control
          </span>
          <div className="header-actions">
            <Badge tone="success">Authenticated</Badge>
            <Button
              className="button-secondary"
              onClick={() =>
                void act(async () => {
                  await call(
                    '/auth/logout',
                    { method: 'POST' },
                    session.csrfToken,
                  );
                  setSession(null);
                })
              }
            >
              Log out
            </Button>
          </div>
        </header>
        <main id="main">
          <div className="page-intro compact">
            <p className="eyebrow">SECURE INDIVIDUAL ACCESS</p>
            <h1>
              {view === 'account'
                ? `Welcome, ${session.user.fullName}`
                : view === 'users'
                  ? 'User administration'
                  : view === 'access'
                    ? 'Roles and permissions'
                    : 'Audit Trail'}
            </h1>
            <p className="intro-copy">
              Backend-authoritative authentication, session and permission
              controls for Stage 2.
            </p>
          </div>
          {error && <Feedback error>{error}</Feedback>}
          {notice && <Feedback>{notice}</Feedback>}
          {view === 'account' && (
            <Account
              session={session}
              act={sessionAct}
              done={() => {
                setNotice(
                  'Password changed successfully. Please sign in again.',
                );
                setSession(null);
              }}
            />
          )}{' '}
          {view === 'users' && admin && (
            <Users session={session} act={sessionAct} notify={setNotice} />
          )}{' '}
          {view === 'access' && roleManager && (
            <Access session={session} act={sessionAct} notify={setNotice} />
          )}{' '}
          {view === 'events' && audit && <Events session={session} />}
          <footer className="page-footer">
            <span>ZENOVEL Pharma Services</span>
            <span>Master Architecture v1.1 · Stage 2 only</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="brand">
      <Image
        src="/brand/zenovel-logo.svg"
        alt="ZENOVEL Pharma Services"
        width={201}
        height={53}
        priority
      />
    </div>
  );
}
function Nav({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`nav-item nav-button ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      <span aria-hidden="true">◇</span>
      {children}
    </button>
  );
}
function Gate({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <Brand />
      </div>
      <Card className="auth-card">
        <p className="eyebrow">PROTECTED ACCOUNT</p>
        <h1>{title}</h1>
        <p className="intro-copy">
          Complete this security requirement before ordinary access is
          available.
        </p>
        {children}
      </Card>
    </div>
  );
}

function SignIn({
  onLogin,
  act,
  error,
  notice,
}: {
  onLogin: (s: Session) => void;
  act: (w: () => Promise<void>) => Promise<void>;
  error: string;
  notice: string;
}) {
  const [mode, setMode] = useState<'login' | 'recovery' | 'reset'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authenticatorCode, setAuthenticatorCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [token, setToken] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void act(async () => {
      if (mode === 'login')
        onLogin(
          await call<Session>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({
              username,
              password,
              authenticatorCode: authenticatorCode || undefined,
              recoveryCode: recoveryCode || undefined,
            }),
          }),
        );
      else if (mode === 'recovery')
        await call('/auth/recovery', {
          method: 'POST',
          body: JSON.stringify({ username }),
        });
      else {
        await call('/auth/reset', {
          method: 'POST',
          body: JSON.stringify({ token, newPassword: password }),
        });
        setMode('login');
      }
    });
  };
  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <Brand />
        <p>Controlled access for ZENOVEL Pharma Services</p>
      </div>
      <Card className="auth-card">
        <p className="eyebrow">STAGE 2 · IDENTITY</p>
        <h1>
          {mode === 'login'
            ? 'Sign in'
            : mode === 'recovery'
              ? 'Recover access'
              : 'Complete password reset'}
        </h1>
        {error && <Feedback error>{error}</Feedback>}
        {notice && <Feedback>{notice}</Feedback>}
        <form onSubmit={submit}>
          {mode !== 'reset' && (
            <Field
              id="username"
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          )}
          {mode === 'reset' && (
            <Field
              id="token"
              label="Single-use reset token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
          )}
          {mode !== 'recovery' && (
            <Field
              id="password"
              label={mode === 'login' ? 'Password' : 'New password'}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={mode === 'reset' ? 12 : undefined}
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              required
            />
          )}
          {mode === 'login' && (
            <>
              <Field
                id="authenticator-code"
                label="Authenticator code"
                value={authenticatorCode}
                onChange={(e) => setAuthenticatorCode(e.target.value)}
                pattern="[0-9]{6}"
                hint="Enter the current six-digit code from your authenticator app."
              />
              <Field
                id="login-recovery-code"
                label="One-time recovery code"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                hint="Use this only when your authenticator app is unavailable."
              />
            </>
          )}
          {mode === 'recovery' && (
            <p className="muted">
              An authorized administrator must deliver a single-use token
              through an approved out-of-band channel. Responses do not disclose
              whether an account exists.
            </p>
          )}
          <Button type="submit">
            {mode === 'login'
              ? 'Sign in securely'
              : mode === 'recovery'
                ? 'Request recovery'
                : 'Set new password'}
          </Button>
        </form>
        <div className="auth-links">
          <button
            onClick={() => setMode(mode === 'recovery' ? 'login' : 'recovery')}
          >
            {mode === 'recovery'
              ? 'Return to sign in'
              : 'Need account recovery?'}
          </button>
          <button onClick={() => setMode(mode === 'reset' ? 'login' : 'reset')}>
            {mode === 'reset' ? 'Return to sign in' : 'Have a reset token?'}
          </button>
        </div>
        <p className="security-note">No public registration is available.</p>
      </Card>
    </div>
  );
}

function PasswordPanel({
  session,
  act,
  done,
}: {
  session: Session;
  act: (w: () => Promise<void>) => Promise<void>;
  done: () => void;
}) {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNext] = useState('');
  const [confirmPassword, setConfirm] = useState('');
  const [authenticatorCode, setAuthenticatorCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void act(async () => {
          if (newPassword !== confirmPassword)
            throw new Error('New password and confirmation do not match.');
          await call(
            '/auth/password',
            {
              method: 'POST',
              body: JSON.stringify({
                currentPassword,
                newPassword,
                authenticatorCode: authenticatorCode || undefined,
                recoveryCode: recoveryCode || undefined,
              }),
            },
            session.csrfToken,
          );
          done();
        });
      }}
    >
      <Field
        id="current-password"
        label="Current password"
        type="password"
        value={currentPassword}
        onChange={(e) => setCurrent(e.target.value)}
        required
      />
      <Field
        id="new-password"
        label="New password"
        type="password"
        value={newPassword}
        onChange={(e) => setNext(e.target.value)}
        minLength={12}
        required
        hint="12+ characters with letters and numbers; the previous five cannot be reused."
      />
      <Field
        id="confirm-new-password"
        label="Confirm new password"
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirm(e.target.value)}
        minLength={12}
        required
      />
      {session.user.mfaEnabled && (
        <>
          <p className="muted">
            Additional verification is required. Enter one of the following.
          </p>
          <Field
            id="password-authenticator-code"
            label="Authenticator code"
            value={authenticatorCode}
            onChange={(e) => setAuthenticatorCode(e.target.value)}
            pattern="[0-9]{6}"
            hint="Enter the current six-digit code from your authenticator app."
          />
          <Field
            id="password-recovery-code"
            label="One-time recovery code"
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value)}
            hint="Use a recovery code only when your authenticator app is unavailable."
          />
        </>
      )}
      {session.user.mfaRequired && !session.user.mfaEnabled && (
        <Feedback>
          After changing your password and signing in again, ZENOVEL will guide
          you through required authenticator enrollment.
        </Feedback>
      )}
      <Button type="submit">Change password</Button>
    </form>
  );
}
function MfaPanel({
  session,
  act,
  done,
}: {
  session: Session;
  act: (w: () => Promise<void>) => Promise<void>;
  done: () => void;
}) {
  const [password, setPassword] = useState('');
  const [secret, setSecret] = useState('');
  const [uri, setUri] = useState('');
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  if (codes.length)
    return (
      <div>
        <Feedback>
          Save these one-time recovery codes securely. They will not be shown
          again.
        </Feedback>
        <pre className="recovery-codes">{codes.join('\n')}</pre>
        <Button onClick={done}>Return to sign in</Button>
      </div>
    );
  return !secret ? (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void act(async () => {
          const data = await call<{ secret: string; uri: string }>(
            '/auth/mfa/enroll',
            { method: 'POST', body: JSON.stringify({ password }) },
            session.csrfToken,
          );
          setSecret(data.secret);
          setUri(data.uri);
        });
      }}
    >
      <Field
        id="mfa-password"
        label="Current password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <Button type="submit">Begin enrollment</Button>
    </form>
  ) : (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void act(async () => {
          const data = await call<{ recoveryCodes: string[] }>(
            '/auth/mfa/confirm',
            { method: 'POST', body: JSON.stringify({ code }) },
            session.csrfToken,
          );
          setCodes(data.recoveryCodes);
        });
      }}
    >
      <p className="muted">
        Enter this secret manually in your authenticator app:
      </p>
      <code className="secret-value">{secret}</code>
      <details>
        <summary>Authenticator URI</summary>
        <code className="uri-value">{uri}</code>
      </details>
      <Field
        id="mfa-confirm"
        label="Six-digit code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        pattern="[0-9]{6}"
        required
      />
      <Button type="submit">Verify and enable</Button>
    </form>
  );
}

function Account({
  session,
  act,
  done,
}: {
  session: Session;
  act: (w: () => Promise<void>) => Promise<void>;
  done: () => void;
}) {
  return (
    <div className="content-grid">
      <Card>
        <div className="section-heading">
          <div>
            <p className="eyebrow">CURRENT SESSION</p>
            <h2>{session.user.fullName}</h2>
          </div>
          <Badge tone="success">Active</Badge>
        </div>
        <dl className="detail-list">
          <div>
            <dt>Username</dt>
            <dd>{session.user.username}</dd>
          </div>
          <div>
            <dt>Roles</dt>
            <dd>{session.user.roles.join(', ') || 'None'}</dd>
          </div>
          <div>
            <dt>Password expires</dt>
            <dd>{displayDate(session.passwordExpiresAt)}</dd>
          </div>
          <div>
            <dt>Session expires</dt>
            <dd>{displayDate(session.sessionExpiresAt)}</dd>
          </div>
          <div>
            <dt>MFA</dt>
            <dd>{session.user.mfaEnabled ? 'Enabled' : 'Available'}</dd>
          </div>
        </dl>
      </Card>
      <Card>
        <p className="eyebrow">PASSWORD LIFECYCLE</p>
        <h2>Change password</h2>
        <PasswordPanel session={session} act={act} done={done} />
      </Card>
      {!session.user.mfaEnabled && (
        <Card>
          <p className="eyebrow">MULTI-FACTOR AUTHENTICATION</p>
          <h2>Authenticator app</h2>
          <MfaPanel session={session} act={act} done={done} />
        </Card>
      )}
      {session.user.mfaEnabled && (
        <Card>
          <p className="eyebrow">MULTI-FACTOR AUTHENTICATION</p>
          <h2>Disable authenticator</h2>
          <MfaDisablePanel session={session} act={act} done={done} />
        </Card>
      )}
    </div>
  );
}

function MfaDisablePanel({
  session,
  act,
  done,
}: {
  session: Session;
  act: (w: () => Promise<void>) => Promise<void>;
  done: () => void;
}) {
  const [password, setPassword] = useState('');
  const [authenticatorCode, setAuthenticatorCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [reason, setReason] = useState('');
  if (session.user.mfaRequired)
    return (
      <Feedback>
        MFA is required by an assigned role. An authorized administrator can
        reset enrollment when recovery is necessary.
      </Feedback>
    );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void act(async () => {
          await call(
            '/auth/mfa/disable',
            {
              method: 'POST',
              body: JSON.stringify({
                password,
                authenticatorCode: authenticatorCode || undefined,
                recoveryCode: recoveryCode || undefined,
                reason,
              }),
            },
            session.csrfToken,
          );
          done();
        });
      }}
    >
      <Field
        id="disable-mfa-password"
        label="Current password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      <Field
        id="disable-mfa-authenticator-code"
        label="Authenticator code"
        value={authenticatorCode}
        onChange={(event) => setAuthenticatorCode(event.target.value)}
        pattern="[0-9]{6}"
        hint="Enter the current six-digit code from your authenticator app."
      />
      <Field
        id="disable-mfa-recovery-code"
        label="One-time recovery code"
        value={recoveryCode}
        onChange={(event) => setRecoveryCode(event.target.value)}
        hint="Use this only if the authenticator app is unavailable."
      />
      <Field
        id="disable-mfa-reason"
        label="Reason for disabling MFA"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        required
      />
      <Button type="submit">Disable MFA</Button>
    </form>
  );
}

function Users({
  session,
  act,
  notify,
}: {
  session: Session;
  act: (w: () => Promise<void>) => Promise<void>;
  notify: (v: string) => void;
}) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [roleId, setRole] = useState('');
  const [departmentId, setDepartment] = useState('');
  const [createReason, setCreateReason] = useState('');
  const [token, setToken] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminAuthenticatorCode, setAdminAuthenticatorCode] = useState('');
  const [adminRecoveryCode, setAdminRecoveryCode] = useState('');
  const [adminReason, setAdminReason] = useState('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingRoleIds, setEditingRoleIds] = useState<string[]>([]);
  const [roleReason, setRoleReason] = useState('');
  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError('');
    try {
      setUsers(await call<UserRow[]>('/admin/users'));
    } catch (error) {
      setUsersError(
        error instanceof Error
          ? error.message
          : 'The user list could not be loaded.',
      );
    } finally {
      setUsersLoading(false);
    }
  }, []);
  const loadCatalog = useCallback(async () => {
    setCatalogError('');
    try {
      setCatalog(await call<Catalog>('/admin/catalog'));
    } catch (error) {
      setCatalog(null);
      setCatalogError(
        error instanceof Error
          ? error.message
          : 'Roles and departments could not be loaded.',
      );
    }
  }, []);
  useEffect(() => {
    void loadUsers();
    void loadCatalog();
  }, [loadCatalog, loadUsers]);
  const action = (path: string, method = 'POST', body?: object) =>
    act(async () => {
      const result = await call<{ resetToken?: string }>(
        path,
        { method, body: body ? JSON.stringify(body) : undefined },
        session.csrfToken,
      );
      if (result.resetToken) setToken(result.resetToken);
      notify('Administrative action completed and recorded.');
      await Promise.all([loadUsers(), loadCatalog()]);
    });
  const reasonedAction = (
    label: string,
    path: string,
    method = 'POST',
    body: object = {},
  ) => {
    const reason = window.prompt(`Reason for ${label}:`);
    if (!reason?.trim()) return;
    void action(path, method, { ...body, reason: reason.trim() });
  };
  const beginRoleEdit = (user: UserRow) => {
    setEditingUserId(user.id);
    setEditingRoleIds(
      catalog?.roles
        .filter((role) => role.active && user.roles.includes(role.code))
        .map((role) => role.id) ?? [],
    );
    setRoleReason('');
  };
  const saveRoles = (user: UserRow) =>
    act(async () => {
      await call(
        `/admin/users/${user.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ roleIds: editingRoleIds, reason: roleReason }),
        },
        session.csrfToken,
      );
      await Promise.all([loadUsers(), loadCatalog()]);
      setEditingUserId(null);
      setEditingRoleIds([]);
      setRoleReason('');
      notify(`Roles updated for ${user.fullName}. Existing sessions revoked.`);
    });
  return (
    <>
      <Card>
        <p className="eyebrow">CONTROLLED PROVISIONING</p>
        <h2>Create individual account</h2>
        {catalogError && (
          <Feedback error>
            Roles and departments could not be loaded: {catalogError}
          </Feedback>
        )}
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            void action('/admin/users', 'POST', {
              username,
              fullName,
              roleIds: [roleId],
              departmentId: departmentId || undefined,
              reason: createReason,
            });
          }}
        >
          <Field
            id="new-user"
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <Field
            id="new-name"
            label="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
          <label className="select-field">
            Role
            <select
              value={roleId}
              onChange={(e) => setRole(e.target.value)}
              required
            >
              <option value="">Select role</option>
              {catalog?.roles
                .filter((r) => r.active)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="select-field">
            Department
            <select
              value={departmentId}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="">Unassigned</option>
              {catalog?.departments
                .filter((d) => d.active)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </label>
          <Button type="submit" disabled={!catalog}>
            Create account
          </Button>
          <Field
            id="create-user-reason"
            label="Reason for account creation"
            value={createReason}
            onChange={(e) => setCreateReason(e.target.value)}
            required
          />
        </form>
        {token && (
          <Feedback>
            <strong>Single-use reset token</strong>
            <code className="token-value">{token}</code>Transfer through an
            approved out-of-band channel.
          </Feedback>
        )}
      </Card>
      <Card className="wide-card">
        <Field
          id="admin-reauthentication"
          label="Administrator password for sensitive MFA reset"
          type="password"
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
          autoComplete="current-password"
          hint="Required only when resetting another user's MFA enrollment."
        />
        <Field
          id="admin-authenticator-code"
          label="Administrator authenticator code"
          value={adminAuthenticatorCode}
          onChange={(e) => setAdminAuthenticatorCode(e.target.value)}
          pattern="[0-9]{6}"
          hint="Enter the current six-digit code for sensitive MFA resets."
        />
        <Field
          id="admin-recovery-code"
          label="Administrator one-time recovery code"
          value={adminRecoveryCode}
          onChange={(e) => setAdminRecoveryCode(e.target.value)}
        />
        <Field
          id="admin-sensitive-reason"
          label="Reason for MFA reset"
          value={adminReason}
          onChange={(e) => setAdminReason(e.target.value)}
        />
        {usersLoading ? (
          <Feedback>Loading existing user accounts…</Feedback>
        ) : usersError ? (
          <Feedback error>
            User accounts could not be loaded: {usersError}
          </Feedback>
        ) : users.length === 0 ? (
          <Feedback>No user accounts were found.</Feedback>
        ) : (
          <Table
            caption="ZENOVEL user accounts"
            headings={['User', 'Department', 'Roles', 'Status', 'Controls']}
          >
            {users.map((u) => (
              <tr key={u.id}>
                <th scope="row">
                  {u.fullName}
                  <small>{u.username}</small>
                </th>
                <td>{u.department ?? 'Unassigned'}</td>
                <td>
                  {editingUserId === u.id ? (
                    <fieldset className="role-editor">
                      <legend>Roles for {u.fullName}</legend>
                      <small>
                        Currently assigned: {u.roles.join(', ') || 'None'}
                      </small>
                      <Field
                        id={`role-reason-${u.id}`}
                        label="Reason for role change"
                        value={roleReason}
                        onChange={(event) => setRoleReason(event.target.value)}
                        required
                      />
                      <div className="permission-grid">
                        {catalog?.roles
                          .filter((role) => role.active)
                          .map((role) => (
                            <label key={role.id}>
                              <input
                                type="checkbox"
                                checked={editingRoleIds.includes(role.id)}
                                onChange={(event) =>
                                  setEditingRoleIds((current) =>
                                    event.target.checked
                                      ? [...current, role.id]
                                      : current.filter((id) => id !== role.id),
                                  )
                                }
                              />
                              {role.name}
                            </label>
                          ))}
                      </div>
                      <small>
                        Select one or more active roles. Saving replaces the
                        current assignment.
                      </small>
                      <div className="inline-controls">
                        <Button
                          className="button-small"
                          onClick={() => void saveRoles(u)}
                          disabled={
                            editingRoleIds.length === 0 || !roleReason.trim()
                          }
                        >
                          Save
                        </Button>
                        <Button
                          className="button-small button-secondary"
                          onClick={() => {
                            setEditingUserId(null);
                            setEditingRoleIds([]);
                            setRoleReason('');
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </fieldset>
                  ) : (
                    u.roles.join(', ') || 'None'
                  )}
                </td>
                <td>
                  <Badge tone={u.status === 'active' ? 'success' : 'error'}>
                    {u.status}
                  </Badge>
                </td>
                <td className="table-actions">
                  <Button
                    className="button-small button-secondary"
                    onClick={() => beginRoleEdit(u)}
                    disabled={!catalog}
                  >
                    Edit roles
                  </Button>
                  <Button
                    className="button-small button-secondary"
                    onClick={() =>
                      reasonedAction(
                        u.status === 'active'
                          ? 'account deactivation'
                          : 'account activation',
                        `/admin/users/${u.id}`,
                        'PATCH',
                        {
                          status: u.status === 'active' ? 'inactive' : 'active',
                        },
                      )
                    }
                  >
                    {u.status === 'active' ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button
                    className="button-small button-secondary"
                    onClick={() =>
                      reasonedAction(
                        'administrator password reset',
                        `/admin/users/${u.id}/reset`,
                      )
                    }
                  >
                    Reset
                  </Button>
                  <Button
                    className="button-small button-secondary"
                    onClick={() =>
                      reasonedAction(
                        'session revocation',
                        `/admin/users/${u.id}/revoke-sessions`,
                      )
                    }
                  >
                    Revoke
                  </Button>
                  {u.mfaEnabled && (
                    <Button
                      className="button-small button-secondary"
                      onClick={() =>
                        void action(`/admin/users/${u.id}/mfa-reset`, 'POST', {
                          currentPassword: adminPassword,
                          authenticatorCode:
                            adminAuthenticatorCode || undefined,
                          recoveryCode: adminRecoveryCode || undefined,
                          reason: adminReason,
                        })
                      }
                      disabled={!adminPassword || !adminReason.trim()}
                    >
                      Reset MFA
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

function Access({
  session,
  act,
  notify,
}: {
  session: Session;
  act: (w: () => Promise<void>) => Promise<void>;
  notify: (v: string) => void;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [dc, setDc] = useState('');
  const [dn, setDn] = useState('');
  const [rc, setRc] = useState('');
  const [rn, setRn] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [roleReason, setRoleReason] = useState('');
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [roleMfa, setRoleMfa] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | 'new' | null>(
    null,
  );
  const [catalogError, setCatalogError] = useState('');
  const administrator = session.user.permissions.includes('Administer');
  const load = useCallback(async () => {
    setCatalogError('');
    try {
      setCatalog(await call<Catalog>('/admin/catalog'));
    } catch (error) {
      setCatalog(null);
      setCatalogError(
        error instanceof Error
          ? error.message
          : 'The access-control catalog could not be loaded.',
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const create = (path: string, body: object) =>
    act(async () => {
      await call(
        path,
        { method: 'POST', body: JSON.stringify(body) },
        session.csrfToken,
      );
      notify('Configuration change recorded.');
      await load();
    });
  const update = (
    path: string,
    method: 'PATCH' | 'PUT' | 'DELETE',
    body: object,
  ) =>
    act(async () => {
      await call(
        path,
        { method, body: JSON.stringify(body) },
        session.csrfToken,
      );
      notify('Configuration change recorded.');
      await load();
    });
  const closeRoleForm = () => {
    setEditingRoleId(null);
    setRc('');
    setRn('');
    setRoleDescription('');
    setRoleReason('');
    setRolePermissions([]);
    setRoleMfa(false);
  };
  const editRole = (role: Catalog['roles'][number]) => {
    setEditingRoleId(role.id);
    setRc(role.code);
    setRn(role.name);
    setRoleDescription(role.description ?? '');
    setRolePermissions(role.permissions);
    setRoleMfa(role.mfaRequired);
    setRoleReason('');
  };
  const saveRole = () =>
    act(async () => {
      const details = {
        name: rn,
        description: roleDescription || undefined,
        mfaRequired: roleMfa,
        permissions: rolePermissions,
        reason: roleReason,
      };
      const body = editingRoleId === 'new' ? { code: rc, ...details } : details;
      await call(
        editingRoleId === 'new'
          ? '/admin/roles'
          : `/admin/roles/${editingRoleId}`,
        {
          method: editingRoleId === 'new' ? 'POST' : 'PATCH',
          body: JSON.stringify(body),
        },
        session.csrfToken,
      );
      notify(
        editingRoleId === 'new'
          ? 'Role created and recorded.'
          : 'Role updated and recorded.',
      );
      closeRoleForm();
      await load();
    });
  const retireRole = (role: Catalog['roles'][number]) => {
    const reason = window.prompt(`Reason for retiring ${role.name}:`);
    if (
      !reason?.trim() ||
      !window.confirm(`Retire ${role.name}? This does not erase audit history.`)
    )
      return;
    void update(`/admin/roles/${role.id}`, 'DELETE', {
      reason: reason.trim(),
    });
  };
  if (catalogError)
    return (
      <Card>
        <p className="eyebrow">ROLES, PERMISSIONS & DEPARTMENTS</p>
        <h2>Administration data is unavailable</h2>
        <Feedback error>
          The access-control catalog could not be loaded: {catalogError}
        </Feedback>
        <Button className="button-secondary" onClick={() => void load()}>
          Retry
        </Button>
      </Card>
    );
  if (!catalog) return <Card>Loading access-control catalog…</Card>;
  return (
    <div className="content-grid">
      {administrator && (
        <Card>
          <p className="eyebrow">DEPARTMENTS</p>
          <h2>Organizational membership</h2>
          <ul className="control-list">
            {catalog.departments.map((d) => (
              <li key={d.id}>
                <span>
                  <strong>{d.code}</strong> · {d.name}
                </span>
                <span className="inline-controls">
                  <Badge tone={d.active ? 'success' : 'neutral'}>
                    {d.active ? 'Active' : 'Inactive'}
                  </Badge>
                  <Button
                    className="button-small button-secondary"
                    onClick={() =>
                      void update(`/admin/departments/${d.id}`, 'PATCH', {
                        active: !d.active,
                      })
                    }
                  >
                    {d.active ? 'Deactivate' : 'Activate'}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void create('/admin/departments', { code: dc, name: dn });
            }}
          >
            <Field
              id="department-code"
              label="Code"
              value={dc}
              onChange={(e) => setDc(e.target.value.toUpperCase())}
              required
            />
            <Field
              id="department-name"
              label="Name"
              value={dn}
              onChange={(e) => setDn(e.target.value)}
              required
            />
            <Button>Add department</Button>
          </form>
        </Card>
      )}
      <Card>
        <p className="eyebrow">ROLES & PERMISSIONS</p>
        <h2>Configured roles</h2>
        <Table
          caption="Configured roles"
          headings={['Role name', 'Status', 'Available role actions']}
        >
          {catalog.roles.map((role) => (
            <tr key={role.id}>
              <th scope="row">
                {role.name}
                <small>{role.code}</small>
              </th>
              <td>
                <Badge tone={role.active ? 'success' : 'neutral'}>
                  {role.active ? 'Active' : 'Retired'}
                </Badge>
              </td>
              <td className="table-actions">
                {role.code === 'SYSTEM_ADMINISTRATOR' ? (
                  <Badge tone="warning">Protected</Badge>
                ) : (
                  <Button
                    className="button-small button-secondary"
                    onClick={() => editRole(role)}
                  >
                    Edit role
                  </Button>
                )}
                {!role.systemRole && (
                  <Button
                    className="button-small button-secondary"
                    onClick={() => retireRole(role)}
                  >
                    Delete role
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
        {!editingRoleId && (
          <Button
            onClick={() => {
              closeRoleForm();
              setEditingRoleId('new');
            }}
          >
            Create role
          </Button>
        )}
        {editingRoleId && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveRole();
            }}
          >
            <h3>{editingRoleId === 'new' ? 'Create role' : 'Edit role'}</h3>
            <Field
              id="role-code"
              label="Role code"
              value={rc}
              onChange={(e) => setRc(e.target.value.toUpperCase())}
              required
              disabled={editingRoleId !== 'new'}
            />
            <Field
              id="role-name"
              label="Role name"
              value={rn}
              onChange={(e) => setRn(e.target.value)}
              required
            />
            <Field
              id="role-description"
              label="Description"
              value={roleDescription}
              onChange={(e) => setRoleDescription(e.target.value)}
            />
            <label>
              <input
                type="checkbox"
                checked={roleMfa}
                onChange={(e) => setRoleMfa(e.target.checked)}
              />{' '}
              Require MFA
            </label>
            <fieldset className="access-rights-editor">
              <legend>Access rights</legend>
              <p className="muted">
                Review the selected access rights before saving.
              </p>
              <div className="permission-grid">
                {catalog.permissions.map((permission) => (
                  <label key={permission.code}>
                    <input
                      type="checkbox"
                      checked={rolePermissions.includes(permission.code)}
                      onChange={(e) =>
                        setRolePermissions((current) =>
                          e.target.checked
                            ? [...current, permission.code]
                            : current.filter(
                                (code) => code !== permission.code,
                              ),
                        )
                      }
                    />
                    <span>
                      <strong>{permission.code}</strong>
                      <small>{permission.description}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Field
              id="role-change-reason"
              label="Reason for change"
              value={roleReason}
              onChange={(e) => setRoleReason(e.target.value)}
              required
            />
            <div className="inline-controls">
              <Button type="submit">Save role</Button>
              <Button
                type="button"
                className="button-secondary"
                onClick={closeRoleForm}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Card>
      <Card className="wide-card">
        <p className="eyebrow">GLOBAL RESTRICTION</p>
        <h2>Monitoring-report download</h2>
        <Feedback>
          Only Project Manager, QMS and Associate Director GCP role categories
          can receive monitoring-report download permission. The backend rejects
          broader grants.
        </Feedback>
      </Card>
    </div>
  );
}
const changeLabels: Record<string, string> = {
  user_roles_changed: 'User role changed.',
  role_permissions_changed: 'Role access rights updated.',
  role_changed: 'Role updated.',
  role_created: 'Role created.',
  role_retired: 'Role retired.',
  user_deactivated: 'Account deactivated.',
  user_activated: 'Account activated.',
  mfa_reset: 'MFA reset by administrator.',
  password_reset_issued: 'Password reset initiated by administrator.',
  sessions_revoked: 'Sessions revoked.',
};
function Events({ session }: { session: Session }) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [users, setUsers] = useState<AuditUser[]>([]);
  const [failed, setFailed] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [reason, setReason] = useState('');
  const [activeFilters, setActiveFilters] = useState('');
  const load = useCallback((query = '') => {
    setFailed(false);
    return call<EventRow[]>(`/admin/security-events${query}`)
      .then(setEvents)
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.all([
      call<EventRow[]>('/admin/security-events'),
      call<AuditUser[]>('/admin/audit-users'),
    ])
      .then(([loadedEvents, loadedUsers]) => {
        if (active) {
          setEvents(loadedEvents);
          setUsers(loadedUsers);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [session]);
  const apply = () => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (userFilter) params.set('user', userFilter);
    if (reason.trim()) params.set('reason', reason.trim());
    const query = params.size ? `?${params}` : '';
    setActiveFilters(query);
    void load(query);
  };
  const clear = () => {
    setFrom('');
    setTo('');
    setUserFilter('');
    setReason('');
    setActiveFilters('');
    void load();
  };
  return (
    <Card>
      <div className="audit-filters">
        <Field
          id="audit-from"
          label="From"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Field
          id="audit-to"
          label="To"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <label className="select-field">
          User
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
          >
            <option value="">All users</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.fullName} · {user.id}
              </option>
            ))}
          </select>
        </label>
        <Field
          id="audit-reason"
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="inline-controls">
          <Button onClick={apply}>Apply filters</Button>
          <Button className="button-secondary" onClick={clear}>
            Clear filters
          </Button>
        </div>
      </div>
      {activeFilters && <Feedback>Audit Trail filters are active.</Feedback>}
      {failed ? (
        <Feedback error>Audit trail could not be loaded.</Feedback>
      ) : events.length === 0 ? (
        <Feedback>No audit events match the selected filters.</Feedback>
      ) : (
        <Table
          caption="Recent audit trail events"
          headings={['Time Stamp', 'User', 'Change', 'Reason for Change']}
        >
          {events.map((e) => (
            <tr key={e.id}>
              <td>{displayDate(e.createdAt)}</td>
              <td className="audit-user">
                {e.actorName ?? 'System'}
                <small>{e.actorUserId ?? 'System event'}</small>
              </td>
              <th scope="row">
                {changeLabels[e.eventType] ?? e.eventType.replaceAll('_', ' ')}
              </th>
              <td>{e.reason ?? '—'}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
