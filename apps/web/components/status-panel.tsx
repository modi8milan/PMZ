'use client';
import { useEffect, useState } from 'react';
import type { HealthResponse, ReadinessResponse } from '@zenovel/contracts';
import { apiBaseUrl } from '../lib/config';
import { Badge, Button, Card, Feedback, Table } from './ui';

type Snapshot = {
  health: HealthResponse | null;
  readiness: ReadinessResponse | null;
  checkedAt: string;
};
async function read<T>(path: string, ready = false): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}/${path}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok && !(ready && response.status === 503))
    throw new Error('Service unavailable');
  return response.json() as Promise<T>;
}
async function checkServices() {
  const [health, readiness] = await Promise.allSettled([
    read<HealthResponse>('health'),
    read<ReadinessResponse>('ready', true),
  ]);
  return {
    snapshot: {
      health: health.status === 'fulfilled' ? health.value : null,
      readiness: readiness.status === 'fulfilled' ? readiness.value : null,
      checkedAt: new Date().toISOString(),
    },
    failed: health.status === 'rejected' || readiness.status === 'rejected',
  };
}
export function StatusPanel() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const refresh = async () => {
    setLoading(true);
    setFailed(false);
    const result = await checkServices();
    setSnapshot(result.snapshot);
    setFailed(result.failed);
    setLoading(false);
  };
  useEffect(() => {
    let active = true;
    void checkServices().then((result) => {
      if (active) {
        setSnapshot(result.snapshot);
        setFailed(result.failed);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  const serviceUp = snapshot?.health?.status === 'ok';
  const databaseUp = snapshot?.readiness?.checks?.database === 'up';
  const schemaUp = snapshot?.readiness?.checks?.schema === 'up';
  const status = (up: boolean) =>
    loading ? (
      <Badge>Checking</Badge>
    ) : (
      <Badge tone={up ? 'success' : 'error'}>
        {up ? 'Available' : 'Unavailable'}
      </Badge>
    );
  return (
    <Card className="status-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">LIVE CONNECTIVITY</p>
          <h2>Foundation status</h2>
        </div>
        <Button onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Checking…' : '↻  Refresh status'}
        </Button>
      </div>
      <p className="muted">
        A direct check of the local API and its PostgreSQL dependency.
      </p>
      <div aria-live="polite" aria-busy={loading}>
        <Table
          caption="Local foundation dependency status"
          headings={['Component', 'Purpose', 'Status']}
        >
          <tr>
            <th scope="row">
              <span className="component-symbol" aria-hidden="true">
                N
              </span>
              Next.js frontend
            </th>
            <td>Application shell</td>
            <td>
              <Badge tone="success">Rendered</Badge>
            </td>
          </tr>
          <tr>
            <th scope="row">
              <span className="component-symbol" aria-hidden="true">
                A
              </span>
              NestJS API
            </th>
            <td>Service health</td>
            <td>{status(Boolean(serviceUp))}</td>
          </tr>
          <tr>
            <th scope="row">
              <span className="component-symbol" aria-hidden="true">
                D
              </span>
              PostgreSQL
            </th>
            <td>Database connection</td>
            <td>{status(Boolean(databaseUp))}</td>
          </tr>
          <tr>
            <th scope="row">
              <span className="component-symbol" aria-hidden="true">
                S
              </span>
              Database schema
            </th>
            <td>Foundation initialization</td>
            <td>{status(Boolean(schemaUp))}</td>
          </tr>
        </Table>
      </div>
      {!loading && (failed || !databaseUp || !schemaUp) && (
        <Feedback error>
          Some services are unavailable. Check the local API, database
          configuration and migrations, then refresh.
        </Feedback>
      )}
      <div className="status-footer">
        <span className="muted">
          {snapshot
            ? `Last checked: ${new Date(snapshot.checkedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`
            : 'Waiting for first check'}
        </span>
        <span className="muted">Local environment</span>
      </div>
    </Card>
  );
}
