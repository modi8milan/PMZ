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
    active: boolean;
    mfaRequired: boolean;
    permissions: string[];
  }>;
  permissions: Array<{ code: string }>;
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
  outcome: string;
  actorUserId: string | null;
  subjectUserId: string | null;
  createdAt: string;
};
const api = apiBaseUrl();

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
    throw new Error(
      typeof body.message === 'string'
        ? body.message
        : 'The request could not be completed.',
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
          act={act}
          done={() => setSession(null)}
        />
        {error && <Feedback error>{error}</Feedback>}
      </Gate>
    );
  if (session.mfaEnrollmentRequired)
    return (
      <Gate title="Authenticator enrollment required">
        <MfaPanel session={session} act={act} done={() => setSession(null)} />
        {error && <Feedback error>{error}</Feedback>}
      </Gate>
    );
  const admin = session.user.permissions.includes('Administer');
  const audit = session.user.permissions.includes('AuditReview');
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
          {admin && (
            <Nav active={view === 'access'} onClick={() => setView('access')}>
              Roles & departments
            </Nav>
          )}
          {audit && (
            <Nav active={view === 'events'} onClick={() => setView('events')}>
              Security events
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
                    ? 'Roles and departments'
                    : 'Security events'}
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
              act={act}
              done={() => setSession(null)}
            />
          )}{' '}
          {view === 'users' && admin && (
            <Users session={session} act={act} notify={setNotice} />
          )}{' '}
          {view === 'access' && admin && (
            <Access session={session} act={act} notify={setNotice} />
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
  const [mfaCode, setMfa] = useState('');
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
              mfaCode: mfaCode || undefined,
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
            <Field
              id="mfa-code"
              label="Authenticator or recovery code"
              value={mfaCode}
              onChange={(e) => setMfa(e.target.value)}
              hint="Required after MFA enrollment."
            />
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
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void act(async () => {
          await call(
            '/auth/password',
            {
              method: 'POST',
              body: JSON.stringify({ currentPassword, newPassword }),
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
  const [code, setCode] = useState('');
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
            { method: 'POST', body: JSON.stringify({ password, code }) },
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
        id="disable-mfa-code"
        label="Authenticator or recovery code"
        value={code}
        onChange={(event) => setCode(event.target.value)}
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
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [roleId, setRole] = useState('');
  const [departmentId, setDepartment] = useState('');
  const [token, setToken] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const load = useCallback(async () => {
    const [u, c] = await Promise.all([
      call<UserRow[]>('/admin/users'),
      call<Catalog>('/admin/catalog'),
    ]);
    setUsers(u);
    setCatalog(c);
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.all([
      call<UserRow[]>('/admin/users'),
      call<Catalog>('/admin/catalog'),
    ]).then(([loadedUsers, loadedCatalog]) => {
      if (active) {
        setUsers(loadedUsers);
        setCatalog(loadedCatalog);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  const action = (path: string, method = 'POST', body?: object) =>
    act(async () => {
      const result = await call<{ resetToken?: string }>(
        path,
        { method, body: body ? JSON.stringify(body) : undefined },
        session.csrfToken,
      );
      if (result.resetToken) setToken(result.resetToken);
      notify('Administrative action completed and recorded.');
      await load();
    });
  return (
    <>
      <Card>
        <p className="eyebrow">CONTROLLED PROVISIONING</p>
        <h2>Create individual account</h2>
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            void action('/admin/users', 'POST', {
              username,
              fullName,
              roleIds: [roleId],
              departmentId: departmentId || undefined,
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
          <Button type="submit">Create account</Button>
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
              <td>{u.roles.join(', ')}</td>
              <td>
                <Badge tone={u.status === 'active' ? 'success' : 'error'}>
                  {u.status}
                </Badge>
              </td>
              <td className="table-actions">
                <Button
                  className="button-small button-secondary"
                  onClick={() =>
                    void action(`/admin/users/${u.id}`, 'PATCH', {
                      status: u.status === 'active' ? 'inactive' : 'active',
                    })
                  }
                >
                  {u.status === 'active' ? 'Deactivate' : 'Activate'}
                </Button>
                <Button
                  className="button-small button-secondary"
                  onClick={() => void action(`/admin/users/${u.id}/reset`)}
                >
                  Reset
                </Button>
                <Button
                  className="button-small button-secondary"
                  onClick={() =>
                    void action(`/admin/users/${u.id}/revoke-sessions`)
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
                      })
                    }
                    disabled={!adminPassword}
                  >
                    Reset MFA
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
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
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const load = useCallback(
    () => call<Catalog>('/admin/catalog').then(setCatalog),
    [],
  );
  useEffect(() => {
    let active = true;
    void call<Catalog>('/admin/catalog').then((loadedCatalog) => {
      if (active) setCatalog(loadedCatalog);
    });
    return () => {
      active = false;
    };
  }, []);
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
  const update = (path: string, method: 'PATCH' | 'PUT', body: object) =>
    act(async () => {
      await call(
        path,
        { method, body: JSON.stringify(body) },
        session.csrfToken,
      );
      notify('Configuration change recorded.');
      await load();
    });
  if (!catalog) return <Card>Loading access-control catalog…</Card>;
  return (
    <div className="content-grid">
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
      <Card>
        <p className="eyebrow">ROLES & PERMISSIONS</p>
        <h2>Configured roles</h2>
        <ul className="control-list">
          {catalog.roles.map((r) => (
            <li key={r.id}>
              <span>
                <strong>{r.name}</strong>
                <small>{r.permissions.join(', ') || 'No permissions'}</small>
              </span>
              <span className="inline-controls">
                {r.mfaRequired && <Badge tone="warning">MFA</Badge>}
                <Button
                  className="button-small button-secondary"
                  onClick={() =>
                    void update(`/admin/roles/${r.id}`, 'PATCH', {
                      mfaRequired: !r.mfaRequired,
                    })
                  }
                >
                  {r.mfaRequired ? 'Make MFA optional' : 'Require MFA'}
                </Button>
                <Button
                  className="button-small button-secondary"
                  onClick={() =>
                    void update(`/admin/roles/${r.id}`, 'PATCH', {
                      active: !r.active,
                    })
                  }
                >
                  {r.active ? 'Deactivate' : 'Activate'}
                </Button>
              </span>
            </li>
          ))}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create('/admin/roles', { code: rc, name: rn });
          }}
        >
          <Field
            id="role-code"
            label="Code"
            value={rc}
            onChange={(e) => setRc(e.target.value.toUpperCase())}
            required
          />
          <Field
            id="role-name"
            label="Name"
            value={rn}
            onChange={(e) => setRn(e.target.value)}
            required
          />
          <Button>Add role</Button>
        </form>
        <hr className="control-divider" />
        <h3>Permission mapping</h3>
        <label className="select-field">
          Role
          <select
            value={selectedRoleId}
            onChange={(e) => {
              const role = catalog.roles.find(
                (item) => item.id === e.target.value,
              );
              setSelectedRoleId(e.target.value);
              setSelectedPermissions(role?.permissions ?? []);
            }}
          >
            <option value="">Select role</option>
            {catalog.roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>
        {selectedRoleId && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void update(`/admin/roles/${selectedRoleId}/permissions`, 'PUT', {
                permissions: selectedPermissions,
              });
            }}
          >
            <div className="permission-grid">
              {catalog.permissions.map((permission) => (
                <label key={permission.code}>
                  <input
                    type="checkbox"
                    checked={selectedPermissions.includes(permission.code)}
                    onChange={(e) =>
                      setSelectedPermissions((current) =>
                        e.target.checked
                          ? [...current, permission.code]
                          : current.filter((code) => code !== permission.code),
                      )
                    }
                  />
                  {permission.code}
                </label>
              ))}
            </div>
            <Button>Save permission mapping</Button>
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
function Events({ session }: { session: Session }) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    call<EventRow[]>('/admin/security-events')
      .then(setEvents)
      .catch(() => setFailed(true));
  }, [session]);
  return (
    <Card>
      {failed ? (
        <Feedback error>Security events could not be loaded.</Feedback>
      ) : (
        <Table
          caption="Recent security events"
          headings={['Time', 'Event', 'Outcome', 'Actor', 'Subject']}
        >
          {events.map((e) => (
            <tr key={e.id}>
              <td>{displayDate(e.createdAt)}</td>
              <th scope="row">{e.eventType}</th>
              <td>
                <Badge tone={e.outcome === 'success' ? 'success' : 'error'}>
                  {e.outcome}
                </Badge>
              </td>
              <td>{e.actorUserId ?? 'System'}</td>
              <td>{e.subjectUserId ?? 'None'}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
