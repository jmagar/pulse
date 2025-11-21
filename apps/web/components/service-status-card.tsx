"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ServiceStatus } from "@/types/dashboard"

const statusLabels: Record<ServiceStatus["status"], string> = {
  running: "Running",
  paused: "Paused",
  exited: "Exited",
  unknown: "Unknown",
}

const healthLabels: Record<ServiceStatus["health_check"]["status"], string> = {
  healthy: "Healthy",
  unhealthy: "Unhealthy",
  unknown: "Unknown",
}

function formatUptime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "—"
  }

  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)

  const segments: string[] = []
  if (days) segments.push(`${days}d`)
  if (hours) segments.push(`${hours}h`)
  if (minutes) segments.push(`${minutes}m`)

  if (segments.length) {
    return segments.join(" ")
  }

  return `${seconds}s`
}

function getStatusVariant(
  status: ServiceStatus["status"],
  health: ServiceStatus["health_check"]["status"]
) {
  if (status !== "running") {
    return "destructive"
  }

  return health === "healthy" ? "default" : "secondary"
}

function getStatusEmoji(
  status: ServiceStatus["status"],
  health: ServiceStatus["health_check"]["status"]
) {
  if (status !== "running") {
    return "🔴"
  }

  return health === "healthy" ? "🟢" : "🟡"
}

function formatHealthTimestamp(timestamp: string) {
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) {
    return "—"
  }

  return parsed.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function getCpuBarColor(value: number) {
  if (value >= 85) return "rgba(244, 63, 94, 0.9)" // rose-500
  if (value >= 65) return "rgba(251, 191, 36, 0.9)" // amber-400
  if (value >= 40) return "rgba(52, 211, 153, 0.9)" // emerald-400
  return "rgba(34, 197, 235, 0.9)" // cyan-400
}

interface ServiceStatusCardProps {
  service: ServiceStatus
}

export function ServiceStatusCard({ service }: ServiceStatusCardProps) {
  const variant = getStatusVariant(service.status, service.health_check.status)
  const emoji = getStatusEmoji(service.status, service.health_check.status)
  const cpuValue = Number.isFinite(service.cpu_percent)
    ? Math.min(100, Math.max(0, service.cpu_percent))
    : 0
  const memoryValue = Number.isFinite(service.memory_mb) ? service.memory_mb : 0
  const healthTimestamp = formatHealthTimestamp(service.health_check.last_check)
  const responseTime = Number.isFinite(service.health_check.response_time_ms)
    ? `${service.health_check.response_time_ms} ms`
    : "—"
  const isUnmonitored =
    service.health_check.status === "unknown" &&
    service.health_check.response_time_ms === 0 &&
    service.port === null
  const replicaLabel =
    service.replica_count && service.replica_count > 1
      ? `${service.replica_count} replicas`
      : `${service.replica_count || 1} replica`
  const accent =
    variant === "destructive"
      ? "from-rose-500/25 via-orange-500/10 to-amber-500/10 border-rose-400/60"
      : variant === "secondary"
        ? "from-amber-400/20 via-yellow-400/10 to-lime-400/10 border-amber-300/60"
        : "from-emerald-400/25 via-cyan-400/10 to-blue-500/10 border-emerald-300/60"
  const cpuColor = getCpuBarColor(cpuValue)

  return (
    <Card
      className={`relative overflow-hidden border bg-slate-900/70 px-4 py-3 shadow-md shadow-black/40 backdrop-blur-lg sm:px-5 ${accent}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br opacity-70 blur-2xl" />
      <CardHeader className="relative z-10 flex flex-col gap-2 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 truncate">
            <span
              className={`inline-flex h-2.5 w-2.5 rounded-full shadow-[0_0_0_6px_rgba(255,255,255,0.08)] ${variant === "destructive" ? "bg-rose-400" : variant === "secondary" ? "bg-amber-300" : "bg-emerald-400"}`}
            />
            <CardTitle className="truncate text-sm font-semibold text-indigo-50 drop-shadow-sm">
              {service.name}
            </CardTitle>
          </div>
          <Badge
            variant={variant}
            aria-label={`${statusLabels[service.status]} status`}
            className="whitespace-nowrap"
          >
            {emoji} {statusLabels[service.status]}
          </Badge>
        </div>
        <p className="text-[10px] tracking-[0.25em] text-indigo-100/70 uppercase">
          {isUnmonitored
            ? "Health: Not monitored"
            : `Health: ${healthLabels[service.health_check.status]} · Last check: ${healthTimestamp}`}
        </p>
      </CardHeader>

      <CardContent className="relative z-10 space-y-3 pt-0">
        <div className="flex items-center justify-between text-[10px] tracking-[0.28em] text-indigo-100/70 uppercase">
          <span>{replicaLabel}</span>
          {service.replica_count > 1 && (
            <span className="text-indigo-100/60">Totals shown</span>
          )}
        </div>

        <div className="grid gap-3 text-xs text-indigo-100/80 md:grid-cols-3">
          <div>
            <p className="text-[10px] tracking-[0.25em] uppercase">Uptime</p>
            <p className="text-sm text-indigo-50">
              {formatUptime(service.uptime_seconds)}
            </p>
          </div>
          <div>
            <p className="text-[10px] tracking-[0.25em] uppercase">Restarts</p>
            <p className="text-sm text-indigo-50">{service.restart_count}</p>
          </div>
          <div>
            <p className="text-[10px] tracking-[0.25em] uppercase">
              Memory {service.replica_count > 1 ? "(total)" : ""}
            </p>
            <p className="text-sm text-indigo-50">
              {memoryValue.toFixed(0)} MB
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] tracking-[0.25em] text-indigo-100/80 uppercase">
            <span>CPU Usage {service.replica_count > 1 ? "(total)" : ""}</span>
            <span>{cpuValue.toFixed(1)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10 ring-1 ring-white/5">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${cpuValue}%`,
                background: cpuColor,
                boxShadow: `0 0 12px ${cpuColor}`,
              }}
            />
          </div>
        </div>

        <div className="grid gap-3 text-xs text-indigo-100/80 md:grid-cols-2">
          <div>
            <p className="text-[10px] tracking-[0.25em] uppercase">
              Health status
            </p>
            <p className="text-sm text-indigo-50 capitalize">
              {isUnmonitored
                ? "Not monitored"
                : healthLabels[service.health_check.status]}
            </p>
          </div>
          <div>
            <p className="text-[10px] tracking-[0.25em] uppercase">
              Response time
            </p>
            <p className="text-sm text-indigo-50">
              {isUnmonitored ? "—" : responseTime}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
