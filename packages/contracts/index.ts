export type DependencyState = 'up' | 'down';
export interface HealthResponse {
  status: 'ok';
  service: 'zenovel-api';
  timestamp: string;
}
export interface ReadinessResponse {
  status: 'ready' | 'not_ready';
  checks: { database: DependencyState; schema: DependencyState };
  timestamp: string;
}
export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
  timestamp: string;
}
