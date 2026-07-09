export interface HealthResponse {
  message: string;
  status: 'ok' | 'degraded' | 'offline';
}

