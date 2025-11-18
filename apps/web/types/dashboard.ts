/**
 * Response shape from the dashboard services API.
 */
export interface DashboardResponse {
  timestamp: string
  services: ServiceStatus[]
  stack_cpu_percent: number
  stack_memory_mb: number
  stack_volume_bytes: number
}

export type ServiceStatusState = "running" | "paused" | "exited" | "unknown"
export type ServiceHealthStatus = "healthy" | "unhealthy" | "unknown"

/**
 * Represents the latest health check results for a service.
 */
export interface ServiceHealthCheck {
  status: ServiceHealthStatus
  last_check: string
  response_time_ms: number
}

/**
 * Represents the aggregated service status returned by the dashboard API.
 */
export interface ServiceStatus {
  name: string
  status: ServiceStatusState
  port: number | null
  restart_count: number
  uptime_seconds: number
  cpu_percent: number
  memory_mb: number
  health_check: ServiceHealthCheck
  replica_count: number
  volume_bytes: number
}
