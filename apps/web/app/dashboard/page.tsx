"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { TooltipProvider } from "@/components/ui/tooltip"
import { Header } from "@/components/header"
import { Skeleton } from "@/components/ui/skeleton"
import { ServiceStatusCard } from "@/components/service-status-card"
import { Button } from "@/components/ui/button"
import { LayoutGrid, Table } from "lucide-react"
import type { DashboardResponse } from "@/types/dashboard"

const REFRESH_SECONDS = Number(process.env.NEXT_PUBLIC_DASHBOARD_REFRESH_INTERVAL ?? 30)
const REFRESH_INTERVAL_MS = Math.max(5_000, REFRESH_SECONDS * 1_000)

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [viewMode, setViewMode] = useState<"grid" | "table">("table")
  const [sortKey, setSortKey] = useState<
    keyof Pick<
      DashboardResponse["services"][number],
      | "name"
      | "port"
      | "replica_count"
      | "uptime_seconds"
      | "restart_count"
      | "cpu_percent"
      | "memory_mb"
      | "health_check"
      | "volume_bytes"
    >
  >("name")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const initialLoadRef = useRef(true)

  const fetchServices = useCallback(async () => {
    try {
      if (initialLoadRef.current) {
        setLoading(true)
      }

      setError(null)
      const response = await fetch("/api/dashboard/services")
      if (!response.ok) {
        throw new Error(`Dashboard API error: ${response.status}`)
      }

      const body = (await response.json()) as DashboardResponse
      setDashboard(body)
      setLastUpdate(new Date(body.timestamp))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      if (initialLoadRef.current) {
        setLoading(false)
        initialLoadRef.current = false
      }
    }
  }, [])

  useEffect(() => {
    fetchServices()
    const interval = setInterval(() => {
      fetchServices()
    }, REFRESH_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [fetchServices])

  const formattedLastUpdate = lastUpdate
    ? lastUpdate.toLocaleString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "---"

  const services = dashboard?.services ?? []

  const sortedServices = [...services].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1
    switch (sortKey) {
      case "name":
        return a.name.localeCompare(b.name) * dir
      case "port":
        return ((a.port ?? 0) - (b.port ?? 0)) * dir
      case "replica_count":
        return (a.replica_count - b.replica_count) * dir
      case "uptime_seconds":
        return (a.uptime_seconds - b.uptime_seconds) * dir
      case "restart_count":
        return (a.restart_count - b.restart_count) * dir
      case "cpu_percent":
        return (a.cpu_percent - b.cpu_percent) * dir
      case "memory_mb":
        return (a.memory_mb - b.memory_mb) * dir
      case "volume_bytes":
        return (a.volume_bytes - b.volume_bytes) * dir
      case "health_check":
        return a.health_check.status.localeCompare(b.health_check.status) * dir
      default:
        return 0
    }
  })

  const toggleSort = (
    key: keyof Pick<
      DashboardResponse["services"][number],
      | "name"
      | "port"
      | "replica_count"
      | "uptime_seconds"
      | "restart_count"
      | "cpu_percent"
      | "memory_mb"
      | "health_check"
      | "volume_bytes"
    >,
  ) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  return (
    <TooltipProvider>
      <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-foreground">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.15),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.12),transparent_32%)]" />
        <div className="pointer-events-none absolute inset-0 mix-blend-screen opacity-10" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
        <Header />
        <div className="relative mx-auto flex max-w-screen-2xl flex-col gap-8 px-4 py-10">
          <header className="flex flex-col gap-3">
            <p className="text-sm font-medium uppercase tracking-[0.35em] text-indigo-200/80">
              Service Monitoring
            </p>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 items-center rounded-full bg-white/5 px-4 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-100 ring-1 ring-white/10 shadow-sm shadow-black/30">
                  Live
                </span>
                <h1 className="text-3xl font-semibold text-indigo-50 drop-shadow-sm">
                  Service Dashboard
                </h1>
              </div>
              <div className="flex items-center gap-3 rounded-full bg-white/5 px-3 py-1 text-xs text-indigo-100 ring-1 ring-white/10 shadow-sm shadow-black/30">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.35)]" />
                Last update: {formattedLastUpdate}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-indigo-200/70">
              <span>Auto-refresh every {Math.round(REFRESH_INTERVAL_MS / 1000)} seconds.</span>
              {dashboard && (
                <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-indigo-100 ring-1 ring-white/10 shadow-sm shadow-black/30">
                  <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  Up {dashboard.services.filter((s) => s.status === "running").length}
                  <span className="inline-flex h-2 w-2 rounded-full bg-amber-400" />
                  Degraded{" "}
                  {
                    dashboard.services.filter(
                      (s) => s.status === "running" && s.health_check.status !== "healthy"
                    ).length
                  }
                  <span className="inline-flex h-2 w-2 rounded-full bg-rose-500" />
                  Down {dashboard.services.filter((s) => s.status !== "running").length}
                </span>
              )}
              <div className="flex items-center gap-2">
                {dashboard && (
                  <div className="flex items-center gap-3 rounded-full bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-indigo-100 ring-1 ring-white/10 shadow-sm shadow-black/30">
                    <span>Stack CPU: {dashboard.stack_cpu_percent.toFixed(1)}%</span>
                    <span>Stack Mem: {dashboard.stack_memory_mb.toFixed(0)} MB</span>
                    <span>Volumes: {(dashboard.stack_volume_bytes / (1024 * 1024)).toFixed(1)} MB</span>
                  </div>
                )}
                <Button
                  size="sm"
                  variant={viewMode === "grid" ? "default" : "ghost"}
                  onClick={() => setViewMode("grid")}
                  className="gap-2"
                >
                  <LayoutGrid className="h-4 w-4" />
                  Grid
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === "table" ? "default" : "ghost"}
                  onClick={() => setViewMode("table")}
                  className="gap-2"
                >
                  <Table className="h-4 w-4" />
                  Table
                </Button>
              </div>
            </div>
          </header>

          {error && (
            <div className="rounded-2xl border border-destructive/50 bg-destructive/15 px-4 py-3 text-sm text-destructive shadow-lg shadow-destructive/20">
              <p className="font-semibold">Unable to load dashboard data.</p>
              <p className="text-xs text-destructive/80">{error}</p>
            </div>
          )}

          {viewMode === "grid" ? (
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {loading &&
                Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-64 rounded-2xl bg-white/5" />
                ))}

              {!loading && services.length === 0 && !error && (
                <div className="col-span-1 md:col-span-2 xl:grid-cols-3 rounded-2xl border border-dashed border-muted-foreground/60 bg-muted/10 p-6 text-center text-sm text-muted-foreground">
                  <p>No service data available yet.</p>
                </div>
              )}

              {!loading &&
                services.map((service) => (
                  <ServiceStatusCard key={service.name} service={service} />
                ))}
            </section>
          ) : (
            <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 shadow-lg shadow-black/40 backdrop-blur-lg">
              <div className="grid grid-cols-2 gap-2 border-b border-white/5 bg-white/5 px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-indigo-100 md:grid-cols-10">
                <button onClick={() => toggleSort("name")} className="col-span-2 flex items-center gap-1 md:col-span-2">
                  Service {sortKey === "name" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </button>
                <button onClick={() => toggleSort("port")} className="hidden md:flex items-center gap-1">
                  Port {sortKey === "port" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </button>
                <button onClick={() => toggleSort("replica_count")} className="hidden md:flex items-center gap-1">
                  Replicas {sortKey === "replica_count" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </button>
                <button onClick={() => toggleSort("uptime_seconds")} className="hidden md:flex items-center gap-1">
                  Uptime {sortKey === "uptime_seconds" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </button>
                <button onClick={() => toggleSort("restart_count")} className="hidden md:flex items-center gap-1">
                  Restarts {sortKey === "restart_count" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </button>
                <button onClick={() => toggleSort("cpu_percent")} className="hidden md:flex items-center gap-1">
                  CPU {sortKey === "cpu_percent" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </button>
                <button onClick={() => toggleSort("memory_mb")} className="hidden md:flex items-center gap-1">
                  Memory {sortKey === "memory_mb" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </button>
                <button onClick={() => toggleSort("volume_bytes")} className="hidden md:flex items-center gap-1">
                  Volume {sortKey === "volume_bytes" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </button>
                <button onClick={() => toggleSort("health_check")} className="hidden md:flex items-center gap-1">
                  Response {sortKey === "health_check" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </button>
              </div>
              <div className="divide-y divide-white/5">
                {loading &&
                  Array.from({ length: 4 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-2 gap-2 px-4 py-3 text-sm text-indigo-100/80 md:grid-cols-10"
                    >
                      <Skeleton className="h-4 w-24 bg-white/10" />
                    </div>
                  ))}
                {!loading && services.length === 0 && !error && (
                  <div className="px-4 py-6 text-center text-sm text-indigo-100/70">
                    No service data available yet.
                  </div>
                )}
                {!loading &&
                  sortedServices.map((service) => (
                    <div
                      key={service.name}
                      className="grid grid-cols-2 items-center gap-2 px-4 py-3 text-sm text-indigo-100/80 md:grid-cols-10 hover:bg-white/5"
                    >
                      <div className="col-span-2 flex items-center gap-2 md:col-span-2">
                        <span
                          className={`inline-flex h-2.5 w-2.5 rounded-full ${service.status === "running" ? "bg-emerald-400" : "bg-rose-400"}`}
                        />
                        <span className="truncate">{service.name}</span>
                      </div>
                      <div className="hidden md:block text-xs text-indigo-100/70">
                        {service.port ?? "—"}
                      </div>
                      <div className="hidden md:block text-xs text-indigo-100/70">
                        {service.replica_count}
                      </div>
                      <div className="hidden md:block text-xs text-indigo-100/70">
                        {formatUptime(service.uptime_seconds)}
                      </div>
                      <div className="hidden md:block text-xs text-indigo-100/70">
                        {service.restart_count}
                      </div>
                      <div className="hidden md:block text-xs text-indigo-100/70">
                        {service.cpu_percent.toFixed(1)}%
                      </div>
                      <div className="hidden md:block text-xs text-indigo-100/70">
                        {service.memory_mb.toFixed(0)} MB
                      </div>
                      <div className="hidden md:block text-xs text-indigo-100/70">
                        {(service.volume_bytes / (1024 * 1024)).toFixed(1)} MB
                      </div>
                      <div className="hidden md:block text-xs text-indigo-100/70">
                        {service.health_check.response_time_ms
                          ? `${service.health_check.response_time_ms} ms`
                          : "—"}
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

function formatUptime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—"
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  const segments: string[] = []
  if (days) segments.push(`${days}d`)
  if (hours) segments.push(`${hours}h`)
  if (minutes) segments.push(`${minutes}m`)
  return segments.length ? segments.join(" ") : `${seconds}s`
}
