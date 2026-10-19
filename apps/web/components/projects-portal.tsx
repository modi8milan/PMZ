'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { apiBaseUrl } from '../lib/config';
import { Badge, Button, Card, Feedback, Field, Table } from './ui';

type Session = {
  user: { roles: string[]; permissions: string[] };
  csrfToken: string;
  businessTimeZone: string;
};
type Props = { session: Session; notify: (message: string) => void };
type Project = {
  id: string;
  serialNo: string;
  inHouseProjectId: string;
  sponsorProjectId?: string;
  sponsorName?: string;
  clientCode: string;
  title: string;
  status: string;
  assignmentState: string;
  pmUserId: string | null;
  pmName: string | null;
  receiptDate: string;
  visitCount: number;
};
type Tracker = Project & {
  visitId: string;
  visitSequence: number;
  visitType: string;
  visitStatus: string;
  reportStatus: string;
  capaStatus: string;
  monitorName: string | null;
  visitEndDate: string | null;
  firstDraftSubmittedAt: string | null;
  reportSharedToSponsorAt: string | null;
  signedReportSharedAt: string | null;
  sponsorDeadlineDate: string | null;
  sponsorReportOverdue: boolean;
  deviationRequired: boolean;
};
type Option = { id: string; fullName: string; username: string };
type Options = { projectManagers: Option[]; monitors: Option[] };
type Dashboard = {
  total: number;
  preInitiation: number;
  active: number;
  completed: number;
  archived: number;
  visits: number;
  overdue: number;
  deviationRequired: number;
};
type Notice = {
  id: string;
  message: string;
  priority: string;
  createdAt: string;
};
type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

const PAGE_SIZE = 25;

const api = apiBaseUrl();
const fullTrackerRoles = [
  'PROJECT_MANAGER',
  'ASSOCIATE_DIRECTOR_GCP',
  'QMS',
  'DIRECTOR',
  'DIRECTOR_OPERATIONS',
];

async function projectCall<T>(
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
const label = (value: string) =>
  value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/(^|\s)\S/g, (character) => character.toUpperCase());

export function ProjectsPortal({ session, notify }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tracker, setTracker] = useState<Tracker[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [options, setOptions] = useState<Options>({
    projectManagers: [],
    monitors: [],
  });
  const [notifications, setNotifications] = useState<Notice[]>([]);
  const [projectError, setProjectError] = useState('');
  const [trackerError, setTrackerError] = useState('');
  const [dashboardError, setDashboardError] = useState('');
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [trackerLoading, setTrackerLoading] = useState(true);
  const [projectTotal, setProjectTotal] = useState(0);
  const [trackerTotal, setTrackerTotal] = useState(0);
  const [projectPage, setProjectPage] = useState(1);
  const [trackerPage, setTrackerPage] = useState(1);
  const [projectSort, setProjectSort] = useState('serialNo');
  const [projectDirection, setProjectDirection] = useState('asc');
  const [trackerSort, setTrackerSort] = useState('serialNo');
  const [trackerDirection, setTrackerDirection] = useState('asc');
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState('');
  const [sponsor, setSponsor] = useState('');
  const [projectIdFilter, setProjectIdFilter] = useState('');
  const [inHouseFilter, setInHouseFilter] = useState('');
  const [location, setLocation] = useState('');
  const [projectManagerId, setProjectManagerId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [visitType, setVisitType] = useState('');
  const [monitorId, setMonitorId] = useState('');
  const [visitStatus, setVisitStatus] = useState('');
  const [reportStatus, setReportStatus] = useState('');
  const [capaStatus, setCapaStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const roles = session.user.roles;
  const creator = roles.includes('ASSOCIATE_DIRECTOR_GCP');
  const pm = roles.includes('PROJECT_MANAGER');
  const canRecordMilestone = pm || creator || roles.includes('QMS');
  const canTrack = roles.some((role) => fullTrackerRoles.includes(role));
  const canExport =
    session.user.permissions.includes('Export') &&
    roles.some((role) =>
      ['PROJECT_MANAGER', 'ASSOCIATE_DIRECTOR_GCP', 'QMS'].includes(role),
    );
  const sponsorRedacted = roles.includes('CRA_MONITOR') && !canTrack;

  const sharedParams = useCallback(
    (page: number, sort: string, direction: string) => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        sort,
        direction,
      });
      const values = {
        title: filter,
        status,
        sponsor: sponsorRedacted ? '' : sponsor,
        projectId: sponsorRedacted ? '' : projectIdFilter,
        inHouseProjectId: inHouseFilter,
        location,
        projectManagerId,
        from,
        to,
      };
      for (const [key, value] of Object.entries(values))
        if (value.trim()) params.set(key, value.trim());
      return params;
    },
    [
      filter,
      from,
      inHouseFilter,
      location,
      projectIdFilter,
      projectManagerId,
      sponsor,
      sponsorRedacted,
      status,
      to,
    ],
  );

  const loadProjects = useCallback(
    async (requestedPage = projectPage) => {
      setProjectError('');
      setProjectsLoading(true);
      try {
        const params = sharedParams(
          requestedPage,
          projectSort,
          projectDirection,
        );
        const result = await projectCall<Paged<Project>>(`/projects?${params}`);
        setProjects(result.items);
        setProjectTotal(result.total);
        setProjectPage(result.page);
      } catch (error) {
        setProjectError(
          error instanceof Error
            ? error.message
            : 'Projects could not be loaded.',
        );
      } finally {
        setProjectsLoading(false);
      }
    },
    [projectDirection, projectPage, projectSort, sharedParams],
  );
  const loadTracker = useCallback(
    async (requestedPage = trackerPage) => {
      if (!canTrack) return;
      setTrackerError('');
      setTrackerLoading(true);
      try {
        const params = sharedParams(
          requestedPage,
          trackerSort,
          trackerDirection,
        );
        const values = {
          visitType,
          monitorId,
          visitStatus,
          reportStatus,
          capaStatus,
        };
        for (const [key, value] of Object.entries(values))
          if (value.trim()) params.set(key, value.trim());
        const result = await projectCall<Paged<Tracker>>(
          `/projects/tracker?${params}`,
        );
        setTracker(result.items);
        setTrackerTotal(result.total);
        setTrackerPage(result.page);
      } catch (error) {
        setTrackerError(
          error instanceof Error
            ? error.message
            : 'Tracker could not be loaded.',
        );
      } finally {
        setTrackerLoading(false);
      }
    },
    [
      canTrack,
      capaStatus,
      monitorId,
      reportStatus,
      sharedParams,
      trackerDirection,
      trackerPage,
      trackerSort,
      visitStatus,
      visitType,
    ],
  );
  const loadDashboard = useCallback(async () => {
    setDashboardError('');
    try {
      setDashboard(await projectCall<Dashboard>('/projects/dashboard'));
    } catch (error) {
      setDashboardError(
        error instanceof Error
          ? error.message
          : 'Dashboard could not be loaded.',
      );
    }
  }, []);
  const refresh = useCallback(async () => {
    await Promise.allSettled([
      loadProjects(),
      loadDashboard(),
      loadTracker(),
      projectCall<Notice[]>('/projects/notifications').then(setNotifications),
      canTrack
        ? projectCall<Options>('/projects/options').then(setOptions)
        : Promise.resolve(),
    ]);
  }, [canTrack, loadDashboard, loadProjects, loadTracker]);
  useEffect(() => {
    const pending = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(pending);
  }, [refresh]);

  const mutate = async (work: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setProjectError('');
    try {
      await work();
      notify(message);
      await refresh();
    } catch (error) {
      setProjectError(
        error instanceof Error
          ? error.message
          : 'The action could not be completed.',
      );
    } finally {
      setBusy(false);
    }
  };
  const assignment = (
    projectId: string,
    decision: 'accept' | 'decline' | 'return',
  ) => {
    const reason =
      decision !== 'accept'
        ? window.prompt(
            `Enter the required reason to ${decision} this assignment:`,
          )
        : undefined;
    if (decision !== 'accept' && !reason?.trim()) return;
    void mutate(
      () =>
        projectCall(
          `/projects/${projectId}/assignment-response`,
          {
            method: 'POST',
            body: JSON.stringify({ decision, ...(reason ? { reason } : {}) }),
          },
          session.csrfToken,
        ),
      decision === 'accept'
        ? 'Project assignment accepted.'
        : `Project assignment ${decision === 'decline' ? 'declined' : 'returned'}.`,
    );
  };
  const changeStatus = (item: Project) => {
    const allowed = [
      'PRE_INITIATION',
      'ACTIVE',
      'ON_HOLD',
      'COMPLETED',
      'ARCHIVED',
      'CANCELLED',
    ];
    const next = window.prompt(
      `Enter the new status: ${allowed.join(', ')}.`,
      item.status,
    );
    if (!next || !allowed.includes(next)) return;
    const reason = window.prompt(
      'Enter the required reason for this status change:',
    );
    if (!reason?.trim()) return;
    void mutate(
      () =>
        projectCall(
          `/projects/${item.id}/status`,
          {
            method: 'PATCH',
            body: JSON.stringify({ status: next, reason }),
          },
          session.csrfToken,
        ),
      'Project status updated.',
    );
  };
  const milestone = (
    visitId: string,
    milestoneType:
      | 'FIRST_DRAFT_SUBMITTED'
      | 'REPORT_SHARED_TO_SPONSOR'
      | 'SIGNED_REPORT_SHARED_TO_SPONSOR',
  ) => {
    if (!window.confirm('Record this milestone using the current server time?'))
      return;
    void mutate(
      () =>
        projectCall(
          `/projects/visits/${visitId}/milestones`,
          { method: 'POST', body: JSON.stringify({ milestoneType }) },
          session.csrfToken,
        ),
      'Milestone recorded with the current server time.',
    );
  };
  const overrideTimeline = (visitId: string) => {
    const value = window.prompt(
      'Enter the sponsor-sharing timeline in working days (1–60):',
      '5',
    );
    const workingDays = Number(value);
    if (!Number.isInteger(workingDays) || workingDays < 1 || workingDays > 60)
      return;
    const reason = window.prompt(
      'Enter the required reason for this timeline override:',
    );
    if (!reason?.trim()) return;
    void mutate(
      () =>
        projectCall(
          `/projects/visits/${visitId}/timeline`,
          {
            method: 'POST',
            body: JSON.stringify({ workingDays, reason }),
          },
          session.csrfToken,
        ),
      'Sponsor-sharing timeline updated with an audit history entry.',
    );
  };
  const download = async (format: 'csv' | 'xlsx') => {
    setTrackerError('');
    try {
      const params = sharedParams(1, trackerSort, trackerDirection);
      const values = {
        visitType,
        monitorId,
        visitStatus,
        reportStatus,
        capaStatus,
      };
      for (const [key, value] of Object.entries(values))
        if (value.trim()) params.set(key, value.trim());
      params.set('format', format);
      const response = await fetch(`${api}/projects/tracker/export?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Export could not be created.');
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `zenovel-project-tracker.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setTrackerError(
        error instanceof Error ? error.message : 'Export failed.',
      );
    }
  };

  return (
    <div className="projects-workspace">
      {notifications.length > 0 && (
        <Card className="notification-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">IN-APP NOTIFICATIONS</p>
              <h2>Project activity</h2>
            </div>
            <Badge
              tone={
                notifications.some((item) => item.priority === 'HIGH')
                  ? 'error'
                  : 'neutral'
              }
            >
              {notifications.length} recent
            </Badge>
          </div>
          <ul className="project-notifications">
            {notifications.slice(0, 5).map((item) => (
              <li key={item.id}>
                {item.message}{' '}
                <small>
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: session.businessTimeZone,
                  }).format(new Date(item.createdAt))}{' '}
                  ({session.businessTimeZone})
                </small>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {dashboardError && <Feedback error>{dashboardError}</Feedback>}
      {dashboard && (
        <section className="metric-grid" aria-label="Project dashboard">
          {(
            [
              ['Assigned projects', dashboard.total],
              ['Pre-Initiation', dashboard.preInitiation],
              ['Active / Ongoing', dashboard.active],
              ['Completed', dashboard.completed],
              ['Archived', dashboard.archived],
              ['Visits', dashboard.visits],
              ['Sponsor overdue', dashboard.overdue],
              ['Deviation required', dashboard.deviationRequired],
            ] as Array<[string, number]>
          ).map(([name, value]) => (
            <Card
              key={name}
              className={
                name === 'Sponsor overdue' && value > 0 ? 'metric-alert' : ''
              }
            >
              <span className="small-label">{name}</span>
              <strong>{value}</strong>
            </Card>
          ))}
        </section>
      )}
      {creator && (
        <CreateProject
          options={options}
          busy={busy}
          submit={(body) =>
            mutate(
              () =>
                projectCall(
                  '/projects',
                  { method: 'POST', body: JSON.stringify(body) },
                  session.csrfToken,
                ),
              'Project created and the selected PM was notified.',
            )
          }
        />
      )}

      <Card className="wide-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">AUTHORIZED PROJECT SCOPE</p>
            <h2>Projects</h2>
          </div>
        </div>
        <div className="project-filters">
          <Field
            id="project-search"
            label="Study title"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <Field
            id="in-house-filter"
            label="ZENOVEL Project ID"
            value={inHouseFilter}
            onChange={(event) => setInHouseFilter(event.target.value)}
          />
          {!sponsorRedacted && (
            <>
              <Field
                id="sponsor-filter"
                label="Sponsor / Client"
                value={sponsor}
                onChange={(event) => setSponsor(event.target.value)}
              />
              <Field
                id="sponsor-project-filter"
                label="Sponsor Project ID"
                value={projectIdFilter}
                onChange={(event) => setProjectIdFilter(event.target.value)}
              />
            </>
          )}
          <Field
            id="location-filter"
            label="CRO / Site"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
          />
          <Field
            id="project-from-filter"
            type="date"
            label="Receipt from"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
          <Field
            id="project-to-filter"
            type="date"
            label="Receipt to"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
          {options.projectManagers.length > 0 && (
            <label className="select-field">
              Project Manager
              <select
                value={projectManagerId}
                onChange={(event) => setProjectManagerId(event.target.value)}
              >
                <option value="">All PMs</option>
                {options.projectManagers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fullName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="select-field">
            Project status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All statuses</option>
              {[
                'PRE_INITIATION',
                'ACTIVE',
                'ON_HOLD',
                'COMPLETED',
                'ARCHIVED',
                'CANCELLED',
              ].map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="select-field">
            Sort projects by
            <select
              value={projectSort}
              onChange={(event) => {
                setProjectSort(event.target.value);
                setProjectPage(1);
              }}
            >
              <option value="serialNo">Sr. No.</option>
              <option value="title">Study title</option>
              <option value="receiptDate">Receipt date</option>
              <option value="status">Status</option>
            </select>
          </label>
          <label className="select-field">
            Direction
            <select
              value={projectDirection}
              onChange={(event) => {
                setProjectDirection(event.target.value);
                setProjectPage(1);
              }}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
          <div className="inline-controls">
            <Button
              onClick={() => {
                setProjectPage(1);
                void loadProjects(1);
              }}
            >
              Apply filters
            </Button>
            <Button
              className="button-secondary"
              onClick={() => {
                setFilter('');
                setStatus('');
                setSponsor('');
                setProjectIdFilter('');
                setInHouseFilter('');
                setLocation('');
                setProjectManagerId('');
                setFrom('');
                setTo('');
                setProjectPage(1);
              }}
            >
              Clear
            </Button>
          </div>
        </div>
        {projectError && <Feedback error>{projectError}</Feedback>}
        {projectsLoading ? (
          <Feedback>Loading authorized projects…</Feedback>
        ) : projects.length === 0 ? (
          <Feedback>
            No projects match the current authorized scope and filters.
          </Feedback>
        ) : (
          <Table
            caption="Authorized projects"
            headings={[
              'Sr. No.',
              'Project',
              'Client',
              'Status',
              'PM',
              'Visits',
              'Assignment',
            ]}
          >
            {projects.map((item) => (
              <tr key={item.id}>
                <td>{item.serialNo}</td>
                <th scope="row">
                  {item.title}
                  <small>{item.inHouseProjectId}</small>
                </th>
                <td>
                  {item.sponsorName ?? item.clientCode}
                  <small>{item.sponsorProjectId}</small>
                </td>
                <td>
                  <Badge
                    tone={item.status === 'ACTIVE' ? 'success' : 'neutral'}
                  >
                    {label(item.status)}
                  </Badge>
                </td>
                <td>{item.pmName ?? 'Awaiting reassignment'}</td>
                <td>{item.visitCount}</td>
                <td>
                  <Badge
                    tone={
                      item.assignmentState === 'ACCEPTED'
                        ? 'success'
                        : 'warning'
                    }
                  >
                    {label(item.assignmentState)}
                  </Badge>
                  {pm && item.assignmentState === 'PENDING' && (
                    <div className="table-actions">
                      <Button
                        disabled={busy}
                        className="button-small"
                        onClick={() => assignment(item.id, 'accept')}
                      >
                        Accept
                      </Button>
                      <Button
                        disabled={busy}
                        className="button-small button-secondary"
                        onClick={() => assignment(item.id, 'decline')}
                      >
                        Decline
                      </Button>
                    </div>
                  )}
                  {pm && item.assignmentState === 'ACCEPTED' && (
                    <div className="table-actions">
                      <Button
                        disabled={busy}
                        className="button-small button-secondary"
                        onClick={() => assignment(item.id, 'return')}
                      >
                        Return
                      </Button>
                      <Button
                        disabled={busy}
                        className="button-small button-secondary"
                        onClick={() => changeStatus(item)}
                      >
                        Change status
                      </Button>
                    </div>
                  )}
                  {creator && (
                    <div className="table-actions">
                      <Button
                        disabled={busy}
                        className="button-small button-secondary"
                        onClick={() => changeStatus(item)}
                      >
                        Change status
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
        {!projectsLoading && projectTotal > 0 && (
          <Pagination
            label="Projects"
            page={projectPage}
            total={projectTotal}
            setPage={setProjectPage}
          />
        )}
      </Card>

      {(creator || pm) && projects.length > 0 && (
        <VisitForm
          projects={projects}
          monitors={options.monitors}
          busy={busy}
          submit={(projectId, body) =>
            mutate(
              () =>
                projectCall(
                  `/projects/${projectId}/visits`,
                  { method: 'POST', body: JSON.stringify(body) },
                  session.csrfToken,
                ),
              'Visit row created. The sponsor deadline was calculated when a visit end date was provided.',
            )
          }
        />
      )}
      {creator && projects.length > 0 && (
        <TransferForm
          projects={projects.filter((item) => Boolean(item.pmUserId))}
          projectManagers={options.projectManagers}
          busy={busy}
          submit={(projectId, newPmUserId, reason) =>
            mutate(
              () =>
                projectCall(
                  `/projects/${projectId}/transfer`,
                  {
                    method: 'POST',
                    body: JSON.stringify({ newPmUserId, reason }),
                  },
                  session.csrfToken,
                ),
              'Project ownership transferred and the new PM was notified.',
            )
          }
        />
      )}

      {canTrack && (
        <Card className="wide-card tracker-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">LIVE POSTGRESQL REPOSITORY</p>
              <h2>Project Tracking Sheet</h2>
            </div>
            <div className="inline-controls">
              {canExport && (
                <Button
                  className="button-secondary"
                  onClick={() => void download('csv')}
                >
                  CSV
                </Button>
              )}
              {canExport && (
                <Button
                  className="button-secondary"
                  onClick={() => void download('xlsx')}
                >
                  Excel
                </Button>
              )}
              <Button
                className="button-secondary"
                onClick={() => window.print()}
              >
                Print
              </Button>
            </div>
          </div>
          <div className="project-filters tracker-filters">
            <Field
              id="visit-type-filter"
              label="Visit type"
              value={visitType}
              onChange={(event) => setVisitType(event.target.value)}
            />
            {options.monitors.length > 0 && (
              <label className="select-field">
                Monitor
                <select
                  value={monitorId}
                  onChange={(event) => setMonitorId(event.target.value)}
                >
                  <option value="">All monitors</option>
                  {options.monitors.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.fullName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="select-field">
              Visit status
              <select
                value={visitStatus}
                onChange={(event) => setVisitStatus(event.target.value)}
              >
                <option value="">All</option>
                {['PLANNED', 'ONGOING', 'COMPLETED', 'CANCELLED'].map(
                  (value) => (
                    <option key={value} value={value}>
                      {label(value)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="select-field">
              Report status
              <select
                value={reportStatus}
                onChange={(event) => setReportStatus(event.target.value)}
              >
                <option value="">All</option>
                {[
                  'NOT_STARTED',
                  'DRAFT',
                  'INITIAL_DRAFT_SUBMITTED',
                  'PM_REVIEW',
                  'CRA_CORRECTION',
                  'PM_VERIFICATION',
                  'QMS_REVIEW',
                  'QMS_CORRECTION',
                  'QMS_VERIFIED',
                  'AWAITING_DIRECTOR_APPROVAL',
                  'FINAL_APPROVED',
                  'SPONSOR_SHARED',
                  'CAPA_PENDING',
                  'CLOSED_ARCHIVED',
                ].map((value) => (
                  <option key={value} value={value}>
                    {label(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="select-field">
              CAPA status
              <select
                value={capaStatus}
                onChange={(event) => setCapaStatus(event.target.value)}
              >
                <option value="">All</option>
                {['NOT_APPLICABLE', 'PENDING', 'RECEIVED', 'CLOSED'].map(
                  (value) => (
                    <option key={value} value={value}>
                      {label(value)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="select-field">
              Sort tracker by
              <select
                value={trackerSort}
                onChange={(event) => {
                  setTrackerSort(event.target.value);
                  setTrackerPage(1);
                }}
              >
                <option value="serialNo">Sr. No.</option>
                <option value="title">Study title</option>
                <option value="visitSequence">Visit sequence</option>
                <option value="visitEndDate">Visit end date</option>
                <option value="sponsorDeadlineDate">Sponsor deadline</option>
                <option value="status">Project status</option>
              </select>
            </label>
            <label className="select-field">
              Direction
              <select
                value={trackerDirection}
                onChange={(event) => {
                  setTrackerDirection(event.target.value);
                  setTrackerPage(1);
                }}
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </label>
            <Button
              onClick={() => {
                setTrackerPage(1);
                void loadTracker(1);
              }}
            >
              Apply tracker filters
            </Button>
          </div>
          {trackerError && <Feedback error>{trackerError}</Feedback>}
          {trackerLoading ? (
            <Feedback>Loading authorized tracker rows…</Feedback>
          ) : tracker.length === 0 ? (
            <Feedback>No visit-level tracking rows are available.</Feedback>
          ) : (
            <Table
              caption="Project visit tracker"
              headings={[
                'Sr.',
                'Project',
                'Sponsor',
                'Visit',
                'Monitor',
                'Visit status',
                'Report status',
                'CAPA',
                'Visit end',
                'Sponsor deadline',
                'Required action',
                'Milestones',
              ]}
            >
              {tracker.map((row) => (
                <tr
                  key={row.visitId}
                  className={row.sponsorReportOverdue ? 'tracker-overdue' : ''}
                >
                  <td>
                    {row.serialNo}.{row.visitSequence}
                  </td>
                  <th scope="row">
                    {row.title}
                    <small>{row.inHouseProjectId}</small>
                  </th>
                  <td>{row.sponsorName ?? row.clientCode}</td>
                  <td>{row.visitType}</td>
                  <td>{row.monitorName ?? 'Unassigned'}</td>
                  <td>{label(row.visitStatus)}</td>
                  <td>{label(row.reportStatus)}</td>
                  <td>{label(row.capaStatus)}</td>
                  <td>{row.visitEndDate ?? 'Not recorded'}</td>
                  <td>{row.sponsorDeadlineDate ?? 'Pending visit end'}</td>
                  <td>
                    {row.sponsorReportOverdue && (
                      <Badge tone="error">Sponsor Report Overdue</Badge>
                    )}
                    {row.deviationRequired && (
                      <Badge tone="warning">Deviation Required</Badge>
                    )}
                  </td>
                  <td>
                    {canRecordMilestone && (
                      <div className="table-actions">
                        <Button
                          disabled={busy || Boolean(row.firstDraftSubmittedAt)}
                          className="button-small button-secondary"
                          onClick={() =>
                            milestone(row.visitId, 'FIRST_DRAFT_SUBMITTED')
                          }
                        >
                          {row.firstDraftSubmittedAt
                            ? 'First draft recorded'
                            : 'Record first draft'}
                        </Button>
                        <Button
                          disabled={
                            busy || Boolean(row.reportSharedToSponsorAt)
                          }
                          className="button-small"
                          onClick={() =>
                            milestone(row.visitId, 'REPORT_SHARED_TO_SPONSOR')
                          }
                        >
                          {row.reportSharedToSponsorAt
                            ? 'Report shared'
                            : 'Mark report shared'}
                        </Button>
                        <Button
                          disabled={busy || Boolean(row.signedReportSharedAt)}
                          className="button-small button-secondary"
                          onClick={() =>
                            milestone(
                              row.visitId,
                              'SIGNED_REPORT_SHARED_TO_SPONSOR',
                            )
                          }
                        >
                          {row.signedReportSharedAt
                            ? 'Signed report shared'
                            : 'Mark signed shared'}
                        </Button>
                        {pm && (
                          <Button
                            disabled={busy}
                            className="button-small button-secondary"
                            onClick={() => overrideTimeline(row.visitId)}
                          >
                            Timeline
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
          {!trackerLoading && trackerTotal > 0 && (
            <Pagination
              label="Tracker rows"
              page={trackerPage}
              total={trackerTotal}
              setPage={setTrackerPage}
            />
          )}
        </Card>
      )}
    </div>
  );
}

function Pagination({
  label,
  page,
  total,
  setPage,
}: {
  label: string;
  page: number;
  total: number;
  setPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="pagination" aria-label={`${label} pagination`}>
      <span>
        {label}: page {page} of {pages} · {total} total
      </span>
      <div className="inline-controls">
        <Button
          className="button-small button-secondary"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </Button>
        <Button
          className="button-small button-secondary"
          disabled={page >= pages}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function TransferForm({
  projects,
  projectManagers,
  busy,
  submit,
}: {
  projects: Project[];
  projectManagers: Option[];
  busy: boolean;
  submit: (
    projectId: string,
    newPmUserId: string,
    reason: string,
  ) => Promise<void>;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [newPmUserId, setNewPmUserId] = useState('');
  const [reason, setReason] = useState('');
  return (
    <Card className="wide-card">
      <p className="eyebrow">CONTROLLED OWNERSHIP</p>
      <h2>Transfer project manager</h2>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(projectId, newPmUserId, reason);
        }}
      >
        <label className="select-field">
          Project *
          <select
            required
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            {projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.inHouseProjectId} · {item.title}
              </option>
            ))}
          </select>
        </label>
        <label className="select-field">
          New Project Manager *
          <select
            required
            value={newPmUserId}
            onChange={(event) => setNewPmUserId(event.target.value)}
          >
            <option value="">Select PM</option>
            {projectManagers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.fullName} · {item.username}
              </option>
            ))}
          </select>
        </label>
        <Field
          required
          minLength={3}
          maxLength={500}
          id="transfer-reason"
          label="Reason for transfer"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <Button disabled={busy || !projectId || !newPmUserId} type="submit">
          Transfer ownership
        </Button>
      </form>
    </Card>
  );
}

function CreateProject({
  options,
  busy,
  submit,
}: {
  options: Options;
  busy: boolean;
  submit: (body: Record<string, string>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    inHouseProjectId: '',
    sponsorProjectId: '',
    sponsorName: '',
    clientCode: '',
    title: '',
    projectDetail: '',
    regulatorySubmissionDetails: '',
    croName: '',
    clinicalSite: '',
    bioanalyticalFacility: '',
    receiptDate: '',
    tentativeStartDate: '',
    category: '',
    pmUserId: '',
    provisionalMonitorId: '',
  });
  const field = (name: keyof typeof form) => ({
    value: form[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [name]: event.target.value })),
  });
  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await submit(
      Object.fromEntries(
        Object.entries(form).filter(([, value]) => value.trim()),
      ),
    );
  };
  return (
    <Card className="wide-card">
      <p className="eyebrow">ASSOCIATE DIRECTOR GCP</p>
      <h2>Create project</h2>
      <p className="muted">
        Required identifiers are checked by the API and database constraints.
      </p>
      <form
        className="form-grid project-form"
        onSubmit={(event) => void onSubmit(event)}
      >
        <Field
          required
          id="in-house-id"
          label="ZENOVEL / In-house Project ID"
          {...field('inHouseProjectId')}
        />
        <Field
          required
          id="sponsor-project-id"
          label="Sponsor / Client Project ID"
          {...field('sponsorProjectId')}
        />
        <Field
          required
          id="sponsor-name"
          label="Sponsor / Client Name"
          {...field('sponsorName')}
        />
        <Field
          required
          id="client-code"
          label="Client Code"
          {...field('clientCode')}
        />
        <Field
          required
          id="project-title"
          label="Study / Project Title"
          {...field('title')}
        />
        <Field
          id="project-detail"
          label="Project Detail"
          {...field('projectDetail')}
        />
        <Field
          id="regulatory-details"
          label="Regulatory Submission Status / Details"
          {...field('regulatorySubmissionDetails')}
        />
        <Field id="cro-name" label="CRO Name" {...field('croName')} />
        <Field
          id="clinical-site"
          label="Clinical Facility / Site"
          {...field('clinicalSite')}
        />
        <Field
          id="bio-facility"
          label="Bioanalytical Facility"
          {...field('bioanalyticalFacility')}
        />
        <Field
          required
          type="date"
          id="receipt-date"
          label="Project Receipt Date"
          {...field('receiptDate')}
        />
        <Field
          type="date"
          id="start-date"
          label="Tentative Project Start Date"
          {...field('tentativeStartDate')}
        />
        <Field
          id="project-category"
          label="Project Category"
          {...field('category')}
        />
        <label className="select-field">
          Project Manager *
          <select
            required
            value={form.pmUserId}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                pmUserId: event.target.value,
              }))
            }
          >
            <option value="">Select PM</option>
            {options.projectManagers.map((option) => (
              <option key={option.id} value={option.id}>
                {option.fullName} · {option.username}
              </option>
            ))}
          </select>
        </label>
        <label className="select-field">
          Provisional CRA / Monitor
          <select
            value={form.provisionalMonitorId}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                provisionalMonitorId: event.target.value,
              }))
            }
          >
            <option value="">None</option>
            {options.monitors.map((option) => (
              <option key={option.id} value={option.id}>
                {option.fullName} · {option.username}
              </option>
            ))}
          </select>
        </label>
        <Button disabled={busy} type="submit">
          {busy ? 'Saving…' : 'Create and notify PM'}
        </Button>
      </form>
    </Card>
  );
}

function VisitForm({
  projects,
  monitors,
  busy,
  submit,
}: {
  projects: Project[];
  monitors: Option[];
  busy: boolean;
  submit: (
    projectId: string,
    body: Record<string, string | boolean>,
  ) => Promise<void>;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [visitType, setVisitType] = useState('Monitoring Visit');
  const [monitorUserId, setMonitorUserId] = useState('');
  const [visitEndDate, setVisitEndDate] = useState('');
  const [agendaShared, setAgendaShared] = useState(false);
  return (
    <Card className="wide-card">
      <p className="eyebrow">VISIT-LEVEL FOUNDATION</p>
      <h2>Add tracking visit</h2>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(projectId, {
            visitType,
            agendaShared,
            ...(monitorUserId ? { monitorUserId } : {}),
            ...(visitEndDate ? { visitEndDate } : {}),
          });
        }}
      >
        <label className="select-field">
          Project *
          <select
            required
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            {projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.inHouseProjectId} · {item.title}
              </option>
            ))}
          </select>
        </label>
        <Field
          required
          id="visit-type"
          label="Type of Visit"
          value={visitType}
          onChange={(event) => setVisitType(event.target.value)}
        />
        <label className="select-field">
          Monitor / Auditor
          <select
            value={monitorUserId}
            onChange={(event) => setMonitorUserId(event.target.value)}
          >
            <option value="">Unassigned</option>
            {monitors.map((item) => (
              <option key={item.id} value={item.id}>
                {item.fullName}
              </option>
            ))}
          </select>
        </label>
        <Field
          type="date"
          id="visit-end-date"
          label="Visit End Date"
          value={visitEndDate}
          onChange={(event) => setVisitEndDate(event.target.value)}
        />
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={agendaShared}
            onChange={(event) => setAgendaShared(event.target.checked)}
          />{' '}
          Agenda shared
        </label>
        <Button disabled={busy || !projectId} type="submit">
          Add visit
        </Button>
      </form>
    </Card>
  );
}
