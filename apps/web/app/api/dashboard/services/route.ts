import { Agent } from "undici"
import { NextResponse } from "next/server"
import net from "node:net"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { existsSync } from "node:fs"

import type {
  DashboardResponse,
  ServiceHealthCheck,
  ServiceStatus,
  ServiceStatusState,
} from "@/types/dashboard"

const DEFAULT_HEALTH_TIMEOUT = 5000
const DEFAULT_CACHE_TTL = 30
const DOCKER_SOCKET_PATH = process.env.DASHBOARD_DOCKER_SOCKET ?? null
const HEALTH_TIMEOUT_MS = Math.max(
  0,
  parseEnvNumber(
    process.env.DASHBOARD_HEALTH_CHECK_TIMEOUT,
    DEFAULT_HEALTH_TIMEOUT
  )
)
const CACHE_TTL_MS =
  Math.max(
    0,
    parseEnvNumber(process.env.DASHBOARD_CACHE_TTL, DEFAULT_CACHE_TTL)
  ) * 1000
const dockerAgent = DOCKER_SOCKET_PATH
  ? new Agent({ connect: { path: DOCKER_SOCKET_PATH } })
  : undefined
const EXTERNAL_DOCKER_CONTEXT = process.env.DASHBOARD_EXTERNAL_CONTEXT
const execFileAsync = promisify(execFile)

type ExternalEndpoint = { host: string; port: number; path: string }

function parseExternalEndpoint(
  value: string | undefined,
  defaultPath: string
): ExternalEndpoint {
  if (!value) {
    return { host: "localhost", port: 80, path: defaultPath }
  }
  try {
    const url = new URL(value)
    return {
      host: url.hostname,
      port: Number(url.port || 80),
      path: defaultPath,
    }
  } catch {
    return { host: "localhost", port: 80, path: defaultPath }
  }
}

const externalTei = parseExternalEndpoint(
  process.env.DASHBOARD_EXTERNAL_TEI_URL,
  "/v1/health"
)
const externalQdrant = parseExternalEndpoint(
  process.env.DASHBOARD_EXTERNAL_QDRANT_URL,
  "/health"
)
const externalOllama = parseExternalEndpoint(
  process.env.DASHBOARD_EXTERNAL_OLLAMA_URL,
  "/"
)

interface ServiceDefinition {
  name: string
  port: number | null
  health?: {
    protocol: "http" | "tcp" | "none"
    host: string
    port: number
    path: string
  }
  volumes?: string[]
  external?: boolean
}

const SERVICE_DEFINITIONS: ServiceDefinition[] = [
  {
    name: "pulse_playwright",
    port: 50100,
    health: {
      protocol: "http",
      host: "pulse_playwright",
      port: 3000,
      path: "/",
    },
  },
  {
    name: "firecrawl",
    port: 50102,
    health: {
      protocol: "http",
      host: "firecrawl",
      port: 3002,
      path: "/v0/health/readiness",
    },
    volumes: [
      `${process.env.APPDATA_BASE ?? "/mnt/cache/appdata"}/pulse_firecrawl`,
    ],
  },
  {
    name: "pulse_redis",
    port: 50104,
    health: { protocol: "tcp", host: "pulse_redis", port: 6379, path: "" },
    volumes: [
      `${process.env.APPDATA_BASE ?? "/mnt/cache/appdata"}/pulse_redis`,
    ],
  },
  {
    name: "pulse_postgres",
    port: 50105,
    health: { protocol: "tcp", host: "pulse_postgres", port: 5432, path: "" },
    volumes: [
      `${process.env.APPDATA_BASE ?? "/mnt/cache/appdata"}/pulse_postgres`,
    ],
  },
  {
    name: "pulse_mcp",
    port: 50107,
    health: {
      protocol: "http",
      host: "pulse_mcp",
      port: 3060,
      path: "/health",
    },
    volumes: [
      `${process.env.APPDATA_BASE ?? "/mnt/cache/appdata"}/pulse_mcp/resources`,
    ],
  },
  {
    name: "pulse_webhook",
    port: 50108,
    health: {
      protocol: "http",
      host: "pulse_webhook",
      port: 52100,
      path: "/health",
    },
    volumes: [
      `${process.env.APPDATA_BASE ?? "/mnt/cache/appdata"}/pulse_webhook`,
    ],
  },
  {
    name: "pulse_webhook-worker",
    port: null,
    health: { protocol: "none", host: "", port: 0, path: "" },
    volumes: [
      `${process.env.APPDATA_BASE ?? "/mnt/cache/appdata"}/pulse_webhook/bm25`,
      `${process.env.APPDATA_BASE ?? "/mnt/cache/appdata"}/pulse_webhook/hf_cache`,
    ],
  },
  {
    name: "pulse_change-detection",
    port: 50109,
    health: {
      protocol: "http",
      host: "pulse_change-detection",
      port: 5000,
      path: "/",
    },
    volumes: [
      `${process.env.APPDATA_BASE ?? "/mnt/cache/appdata"}/pulse_change-detection`,
    ],
  },
  {
    name: "pulse_neo4j",
    port: 50210,
    health: { protocol: "http", host: "pulse_neo4j", port: 7474, path: "/" },
    volumes: [
      `${process.env.APPDATA_BASE ?? "/mnt/cache/appdata"}/pulse_neo4j/data`,
      `${process.env.APPDATA_BASE ?? "/mnt/cache/appdata"}/pulse_neo4j/logs`,
      `${process.env.APPDATA_BASE ?? "/mnt/cache/appdata"}/pulse_neo4j/plugins`,
    ],
  },
  {
    name: "pulse_web",
    port: 50110,
    health: {
      protocol: "http",
      host: "pulse_web",
      port: 3000,
      path: "/api/health",
    },
    volumes: ["/mnt/cache/compose/pulse"],
  },
  {
    name: "pulse_tei",
    port: 52000,
    health: {
      protocol: "http",
      host: externalTei.host,
      port: externalTei.port,
      path: externalTei.path,
    },
    volumes: [
      process.env.EXTERNAL_TEI_VOLUME ??
        `${process.env.APPDATA_BASE ?? "/mnt/cache/appdata"}/tei`,
    ],
    external: true,
  },
  {
    name: "pulse_qdrant",
    port: 52001,
    health: {
      protocol: "http",
      host: externalQdrant.host,
      port: externalQdrant.port,
      path: externalQdrant.path,
    },
    volumes: [
      process.env.EXTERNAL_QDRANT_VOLUME ??
        `${process.env.APPDATA_BASE ?? "/mnt/cache/appdata"}/qdrant`,
    ],
    external: true,
  },
  {
    name: "pulse_ollama",
    port: 52003,
    health: {
      protocol: "http",
      host: externalOllama.host,
      port: externalOllama.port,
      path: externalOllama.path,
    },
    volumes: [
      process.env.EXTERNAL_OLLAMA_VOLUME ??
        `${process.env.APPDATA_BASE ?? "/mnt/cache/appdata"}/ollama`,
    ],
    external: true,
  },
]

let cachedResponse: DashboardResponse | null = null
let cacheUpdatedAt = 0
let inflightRequest: Promise<DashboardResponse> | null = null

async function computeDashboardData(): Promise<DashboardResponse> {
  const { statuses, runningContainerIds } = await getDockerStatuses()
  const statsByContainer = await getDockerStats(runningContainerIds)

  if (EXTERNAL_DOCKER_CONTEXT) {
    const externalServices = SERVICE_DEFINITIONS.filter(
      (service) => service.external
    )
    if (externalServices.length) {
      const externalData = await getContextServiceData(
        EXTERNAL_DOCKER_CONTEXT,
        externalServices
      )
      Object.assign(statuses, externalData.statuses)
      Object.assign(statsByContainer, externalData.stats)
    }
  }
  const healthMap = await getHealthStatuses(HEALTH_TIMEOUT_MS)
  const volumeSizes = await getVolumeSizes()

  const services: ServiceStatus[] = SERVICE_DEFINITIONS.map((definition) => {
    const statusInfo = statuses[definition.name]
    const stats = statusInfo
      ? aggregateStats(statusInfo.containerIds ?? [], statsByContainer)
      : undefined
    const protocol = definition.health?.protocol
    let health = protocol === "none" ? undefined : healthMap[definition.name]

    if (!health && statusInfo?.containerHealth) {
      health = {
        status:
          statusInfo.containerHealth === "healthy" ? "healthy" : "unhealthy",
        last_check: new Date().toISOString(),
        response_time_ms: 0,
      }
    }

    if (!health && statusInfo) {
      health = {
        status: statusInfo.status === "running" ? "healthy" : "unhealthy",
        last_check: new Date().toISOString(),
        response_time_ms: 0,
      }
    }

    const computedStatus: ServiceStatusState =
      statusInfo?.status ??
      (health?.status === "healthy"
        ? "running"
        : health?.status === "unhealthy"
          ? "exited"
          : "unknown")

    return {
      name: definition.name,
      status: computedStatus,
      port: definition.port,
      restart_count: statusInfo?.restartCount ?? 0,
      uptime_seconds: statusInfo?.uptimeSeconds ?? 0,
      cpu_percent: stats?.cpu ?? 0,
      memory_mb: stats?.memory ?? 0,
      health_check: health ?? {
        status: "unknown",
        last_check: new Date().toISOString(),
        response_time_ms: 0,
      },
      replica_count: statusInfo?.replicaCount ?? (health ? 1 : 0),
      volume_bytes: volumeSizes[definition.name] ?? 0,
    }
  })

  const stack_cpu_percent = services.reduce(
    (sum, s) => sum + (s.cpu_percent || 0),
    0
  )
  const stack_memory_mb = services.reduce(
    (sum, s) => sum + (s.memory_mb || 0),
    0
  )
  const stack_volume_bytes = Object.values(volumeSizes).reduce(
    (sum, v) => sum + v,
    0
  )

  const response: DashboardResponse = {
    timestamp: new Date().toISOString(),
    services,
    stack_cpu_percent,
    stack_memory_mb,
    stack_volume_bytes,
  }

  return response
}

export async function GET(request: Request) {
  const now = Date.now()

  // Support force_refresh query parameter to bypass cache
  const url = new URL(request.url)
  const forceRefresh = url.searchParams.get("force_refresh") === "true"

  if (!forceRefresh && cachedResponse && now - cacheUpdatedAt < CACHE_TTL_MS) {
    return NextResponse.json(cachedResponse)
  }

  if (inflightRequest) {
    const response = await inflightRequest
    return NextResponse.json(response)
  }

  inflightRequest = computeDashboardData()
  try {
    const response = await inflightRequest
    cachedResponse = response
    cacheUpdatedAt = now
    return NextResponse.json(response)
  } catch (error) {
    console.error("dashboard/services", error)
    if (cachedResponse) {
      return NextResponse.json({
        ...cachedResponse,
        stale: true,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    }

    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        services: [],
        error: "Service unavailable",
      },
      { status: 500 }
    )
  } finally {
    inflightRequest = null
  }
}

async function getDockerStatuses() {
  const entries = await listPulseContainers()
  const statuses: Record<string, ContainerStatusInfo> = {}
  const runningContainerIds: string[] = []

  await Promise.all(
    SERVICE_DEFINITIONS.map(async (definition) => {
      const matched = findEntriesForService(definition.name, entries)
      if (!matched.length) {
        statuses[definition.name] = {
          status: "unknown",
          restartCount: 0,
          uptimeSeconds: 0,
          containerIds: [],
          containerNames: [],
          replicaCount: 0,
        }
        return
      }

      const inspected = await Promise.all(
        matched.map(async (entry) => ({
          entry,
          state: await inspectContainerState(entry.Id),
        }))
      )
      const valid = inspected.filter((item) => item.state)

      if (!valid.length) {
        statuses[definition.name] = {
          status: "unknown",
          restartCount: 0,
          uptimeSeconds: 0,
          containerIds: matched.map((m) => m.Id),
          containerNames: matched
            .map((m) => m.Names ?? [])
            .flat()
            .map((n) => sanitizeContainerName(n))
            .filter((name): name is string => name !== undefined),
          replicaCount: matched.length,
        }
        return
      }

      const aggregateStatus = aggregateStatuses(valid.map((v) => v.state!))
      const aggregateRestart = valid.reduce(
        (sum, v) =>
          sum +
          (Number.isFinite(v.state!.RestartCount)
            ? (v.state!.RestartCount ?? 0)
            : 0),
        0
      )
      const aggregateUptime = Math.max(
        ...valid.map((v) => computeUptimeSeconds(v.state!))
      )
      const containerIds = valid.map((v) => v.entry.Id)
      const containerNames = valid
        .map((v) => v.entry.Names ?? [])
        .flat()
        .map((n) => sanitizeContainerName(n))
        .filter((name): name is string => name !== undefined)
      const healthStates = valid
        .map((v) => v.state?.Health?.Status)
        .filter(Boolean) as string[]

      statuses[definition.name] = {
        status: aggregateStatus,
        restartCount: aggregateRestart,
        uptimeSeconds: aggregateUptime,
        containerIds,
        containerNames,
        replicaCount: matched.length,
        containerHealth: healthStates[0],
      }

      if (aggregateStatus === "running") {
        runningContainerIds.push(...containerIds)
      }
    })
  )

  return { statuses, runningContainerIds }
}

async function listPulseContainers(): Promise<ContainerListEntry[]> {
  try {
    const nameFilters = SERVICE_DEFINITIONS.flatMap((definition) => [
      definition.name,
      `pulse_${definition.name}`,
    ])
    const filters = encodeURIComponent(JSON.stringify({ name: nameFilters }))
    const path = `/containers/json?all=1&filters=${filters}`
    return await dockerFetch<ContainerListEntry[]>(path)
  } catch (error) {
    console.error("dashboard/services", "docker ps failed", error)
    return []
  }
}

function findEntriesForService(
  serviceName: string,
  entries: ContainerListEntry[]
) {
  const normalizedTarget = normalizeContainerName(serviceName)

  return entries.filter((entry) =>
    entry.Names?.some((name) => {
      const normalized = normalizeContainerName(name)
      const base = stripReplicaSuffix(normalized)
      return base === normalizedTarget
    })
  )
}

async function inspectContainerState(
  containerId: string
): Promise<ContainerState | null> {
  try {
    const response = await dockerFetch<ContainerInspectResponse>(
      `/containers/${containerId}/json`
    )
    return response.State ?? null
  } catch (error) {
    console.error("dashboard/services", `inspect failed ${containerId}`, error)
    return null
  }
}

interface AggregateStats {
  cpu: number
  memory: number
}

async function getDockerStats(containerIds: string[]) {
  const stats: Record<string, AggregateStats> = {}
  if (!containerIds.length) {
    return stats
  }

  await Promise.all(
    containerIds.map(async (id) => {
      try {
        const statsResponse = await dockerFetch<ContainerStats>(
          `/containers/${id}/stats?stream=false`
        )
        stats[id] = {
          cpu: calculateCpuPercentage(statsResponse),
          memory: (statsResponse.memory_stats?.usage ?? 0) / (1024 * 1024),
        }
      } catch (error) {
        console.error("dashboard/services", "docker stats failed", error)
      }
    })
  )

  return stats
}

async function getHealthStatuses(timeoutMs: number) {
  const healthPromises = SERVICE_DEFINITIONS.map(async (definition) => {
    if (!definition.health) {
      return {
        name: definition.name,
        check: {
          status: "unknown" as const,
          last_check: new Date().toISOString(),
          response_time_ms: 0,
        },
      }
    }

    if (definition.health.protocol === "none") {
      return {
        name: definition.name,
        check: {
          status: "unknown",
          last_check: new Date().toISOString(),
          response_time_ms: 0,
        },
      }
    }

    if (definition.health.protocol === "tcp") {
      const start = Date.now()
      const ok = await tcpPing(
        definition.health.host,
        definition.health.port,
        timeoutMs
      )
      const duration = Date.now() - start
      return {
        name: definition.name,
        check: {
          status: ok ? "healthy" : "unhealthy",
          last_check: new Date().toISOString(),
          response_time_ms: duration,
        },
      }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const start = Date.now()

    try {
      const url = `http://${definition.health.host}:${definition.health.port}${definition.health.path}`
      const response = await fetch(url, { signal: controller.signal })
      const duration = Date.now() - start
      return {
        name: definition.name,
        check: {
          status:
            response.status >= 200 && response.status < 300
              ? "healthy"
              : "unhealthy",
          last_check: new Date().toISOString(),
          response_time_ms: duration,
        },
      }
    } catch (error) {
      const duration = Date.now() - start
      const fallback: ServiceHealthCheck = {
        status: "unhealthy",
        last_check: new Date().toISOString(),
        response_time_ms: Math.max(0, duration),
      }
      throw { serviceName: definition.name, fallback, error }
    } finally {
      clearTimeout(timer)
    }
  })

  const settled = await Promise.allSettled(healthPromises)
  const healthMap: Record<string, ServiceHealthCheck> = {}

  settled.forEach((entry) => {
    if (entry.status === "fulfilled") {
      healthMap[entry.value.name] = entry.value.check
      return
    }

    const reason = entry.reason as {
      serviceName?: string
      fallback?: ServiceHealthCheck
      error?: unknown
    }
    const name = reason?.serviceName ?? "unknown"
    healthMap[name] = reason?.fallback ?? {
      status: "unknown",
      last_check: new Date().toISOString(),
      response_time_ms: 0,
    }
  })

  return healthMap
}

function normalizeState(status?: string): ServiceStatusState {
  if (!status) {
    return "unknown"
  }

  const normalized = status.toLowerCase()
  if (normalized === "running") return "running"
  if (normalized === "paused") return "paused"
  if (normalized === "exited" || normalized === "dead") return "exited"
  return "unknown"
}

function parseEnvNumber(value: string | undefined, fallback: number) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}
function computeUptimeSeconds(state: ContainerState) {
  const startedAt = Date.parse(state.StartedAt ?? "")
  if (Number.isNaN(startedAt)) {
    return 0
  }

  if (state.Status === "running") {
    return Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  }

  const finishedAt = Date.parse(state.FinishedAt ?? "")
  if (!Number.isNaN(finishedAt)) {
    return Math.max(0, Math.floor((finishedAt - startedAt) / 1000))
  }

  return 0
}

function calculateCpuPercentage(stats: ContainerStats) {
  const cpuDelta =
    (stats.cpu_stats?.cpu_usage?.total_usage ?? 0) -
    (stats.precpu_stats?.cpu_usage?.total_usage ?? 0)
  const systemDelta =
    (stats.cpu_stats?.system_cpu_usage ?? 0) -
    (stats.precpu_stats?.system_cpu_usage ?? 0)
  const onlineCpus =
    stats.cpu_stats?.online_cpus ??
    stats.cpu_stats?.cpu_usage?.percpu_usage?.length ??
    0

  if (!systemDelta || systemDelta <= 0 || !onlineCpus) {
    return 0
  }

  return Math.min(100, Math.max(0, (cpuDelta / systemDelta) * onlineCpus * 100))
}

function sanitizeContainerName(name?: string) {
  if (!name) {
    return undefined
  }

  return name.replace(/^\//, "")
}

function normalizeContainerName(name: string) {
  const cleaned = name.replace(/^\//, "")
  // Strip leading project prefix if present (e.g., pulse_service-1 -> service-1)
  const withoutProject = cleaned.replace(/^[^_]+_/, "")
  return withoutProject
}

function stripReplicaSuffix(name: string) {
  return name.replace(/-\d+$/, "")
}

function tcpPing(host: string, port: number, timeout: number) {
  return new Promise<boolean>((resolve) => {
    const socket = new net.Socket()
    let resolved = false

    const done = (result: boolean) => {
      if (resolved) return
      resolved = true
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(timeout)
    socket.once("error", () => done(false))
    socket.once("timeout", () => done(false))
    socket.connect(port, host, () => done(true))
  })
}

function aggregateStats(
  ids: string[],
  stats: Record<string, AggregateStats>
): AggregateStats {
  return ids.reduce(
    (acc, id) => {
      const stat = stats[id]
      if (stat) {
        acc.cpu += stat.cpu
        acc.memory += stat.memory
      }
      return acc
    },
    { cpu: 0, memory: 0 } as AggregateStats
  )
}

function aggregateStatuses(states: ContainerState[]) {
  const normalized = states.map((s) => normalizeState(s.Status))
  if (normalized.includes("running")) return "running" as const
  if (normalized.includes("paused")) return "paused" as const
  if (normalized.includes("exited")) return "exited" as const
  return "unknown" as const
}

interface ContainerListEntry {
  Id: string
  Names?: string[]
}

interface ContainerInspectResponse {
  State?: ContainerState
}

interface ContainerState {
  Status?: string
  StartedAt?: string
  FinishedAt?: string
  RestartCount?: number
  Health?: {
    Status?: string
  }
}

interface ContainerStatusInfo {
  status: ServiceStatusState
  restartCount: number
  uptimeSeconds: number
  containerIds: string[]
  containerNames: string[]
  replicaCount: number
  containerHealth?: string
}

interface ContainerStats {
  cpu_stats?: {
    cpu_usage?: { total_usage?: number; percpu_usage?: number[] }
    system_cpu_usage?: number
    online_cpus?: number
  }
  precpu_stats?: {
    cpu_usage?: { total_usage?: number }
    system_cpu_usage?: number
  }
  memory_stats?: {
    usage?: number
  }
}

async function getVolumeSizes() {
  const entries = await Promise.all(
    SERVICE_DEFINITIONS.map(async (definition) => {
      const size = await sumPaths(definition.volumes ?? [])
      return [definition.name, size] as const
    })
  )
  return Object.fromEntries(entries)
}

function validateVolumePath(path: string): string {
  // Prevent path traversal
  if (path.includes("..")) {
    throw new Error(`Volume path contains '..': ${path}`)
  }
  // Require absolute paths
  if (!path.startsWith("/")) {
    throw new Error(`Volume path must be absolute: ${path}`)
  }
  return path
}

async function sumPaths(paths: string[]) {
  let total = 0
  for (const path of paths) {
    try {
      const validatedPath = validateVolumePath(path)
      const { stdout } = await execFileAsync("du", ["-sb", validatedPath])
      const value = Number(stdout.split("\t")[0])
      if (Number.isFinite(value)) {
        total += value
      }
    } catch (error) {
      // Log validation errors, ignore missing paths
      if (error instanceof Error && error.message.includes("Volume path")) {
        console.warn(`[dashboard] Invalid volume path: ${error.message}`)
      }
    }
  }
  return total
}

async function getContextServiceData(
  context: string,
  services: ServiceDefinition[]
) {
  console.log("[dashboard] querying external context", context, {
    services: services.map((s) => s.name),
  })
  const statuses: Record<string, ContainerStatusInfo> = {}
  const stats: Record<string, AggregateStats> = {}

  for (const service of services) {
    try {
      const inspectRaw = await execDocker(["inspect", service.name], context)
      const inspect = JSON.parse(inspectRaw)
      if (!Array.isArray(inspect) || !inspect.length) {
        console.warn("[dashboard] external inspect returned no data", {
          service: service.name,
          context,
          output: inspectRaw,
        })
        statuses[service.name] = {
          status: "unknown",
          restartCount: 0,
          uptimeSeconds: 0,
          containerIds: [],
          containerNames: [],
          replicaCount: 0,
        }
        continue
      }

      const container = inspect[0]
      const state = container.State ?? {}
      const containerId = container.Id ?? service.name
      const name = container.Name ?? service.name

      statuses[service.name] = {
        status: normalizeState(state.Status),
        restartCount: Number(state.RestartCount) || 0,
        uptimeSeconds: computeUptimeSeconds(state),
        containerIds: [containerId],
        containerNames: [sanitizeContainerName(name)].filter(
          (n): n is string => n !== undefined
        ),
        replicaCount: 1,
        containerHealth: state.Health?.Status,
      }
      console.log("[dashboard] external inspect success", {
        service: service.name,
        context,
        containerId,
        name,
        status: state.Status,
      })
    } catch (error) {
      console.error("[dashboard] external inspect failed", {
        service: service.name,
        context,
        error,
      })
      statuses[service.name] = {
        status: "unknown",
        restartCount: 0,
        uptimeSeconds: 0,
        containerIds: [],
        containerNames: [],
        replicaCount: 0,
      }
    }
  }

  const statTargets = Object.values(statuses)
    .flatMap((status) => status.containerIds)
    .filter((id): id is string => Boolean(id))

  if (statTargets.length) {
    try {
      const statsRaw = await execDocker(
        ["stats", "--no-stream", "--format", "{{json .}}", ...statTargets],
        context
      )
      statsRaw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          try {
            const parsed = JSON.parse(line)
            const id = parsed.Container || parsed.ID
            if (!id) return
            stats[id] = {
              cpu: parseCliCpu(parsed.CPUPerc),
              memory: parseCliMemory(parsed.MemUsage),
            }
          } catch (error) {
            console.error("[dashboard] external stats parse failed", {
              line,
              error,
            })
          }
        })
    } catch (error) {
      console.error("[dashboard] external stats failed", {
        context,
        statTargets,
        error,
      })
    }
  } else {
    console.warn("[dashboard] external stats skipped - no container IDs", {
      context,
      services: services.map((s) => s.name),
    })
  }

  console.log("[dashboard] external context results", {
    context,
    services: services.map((s) => s.name),
    statusCount: Object.keys(statuses).length,
    statsCount: Object.keys(stats).length,
    sampleStatus: statuses[services[0]?.name ?? ""],
    sampleStats: stats[Object.keys(stats)[0]],
  })
  return { statuses, stats }
}

// Validate and select Docker binary path
function getDockerBinaryPath(): string {
  const envPath = process.env.DASHBOARD_DOCKER_BIN
  if (envPath) {
    if (!existsSync(envPath)) {
      console.warn(
        `[dashboard] Custom DASHBOARD_DOCKER_BIN not found: ${envPath}`
      )
    }
    return envPath
  }

  // Check common locations in order of preference
  const paths = ["/usr/bin/docker", "/usr/local/bin/docker"]
  for (const path of paths) {
    if (existsSync(path)) {
      return path
    }
  }

  // Fallback to default if none exist (will fail at runtime if docker not in PATH)
  return "/usr/local/bin/docker"
}

const DOCKER_BIN = getDockerBinaryPath()

function validateContext(context: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(context)) {
    throw new Error(`Invalid Docker context name: ${context}`)
  }
  return context
}

async function execDocker(args: string[], context?: string) {
  const validatedContext = context ? validateContext(context) : undefined
  const finalArgs = validatedContext
    ? ["--context", validatedContext, ...args]
    : args
  console.log("[dashboard] exec docker", { args: finalArgs.join(" ") })
  const { stdout } = await execFileAsync(DOCKER_BIN, finalArgs)
  return stdout
}

function parseCliCpu(value?: string) {
  if (!value) return 0
  const numeric = parseFloat(value.replace("%", ""))
  return Number.isFinite(numeric) ? numeric : 0
}

// Memory conversion constants
const B_TO_MB = 1 / 1024 / 1024
const KB_TO_MB = 1 / 1024
const MB_TO_MB = 1
const GB_TO_MB = 1024
const TB_TO_MB = 1024 * 1024

function parseCliMemory(raw?: string) {
  if (!raw) return 0
  const usage = raw.split("/")[0]?.trim()
  if (!usage) return 0
  const match = usage.match(/([\d.]+)\s*(b|kb|mb|gb|tb|pb|ki|mi|gi|ti|pi)i?/i)
  if (!match) return 0
  const value = Number(match[1])
  if (!Number.isFinite(value)) return 0
  const unit = match[2].toLowerCase()
  switch (unit) {
    case "b":
      return value * B_TO_MB
    case "kb":
    case "ki":
      return value * KB_TO_MB
    case "mb":
    case "mi":
      return value * MB_TO_MB
    case "gb":
    case "gi":
      return value * GB_TO_MB
    case "tb":
    case "ti":
      return value * TB_TO_MB
    default:
      return value
  }
}

const DOCKER_BASE_URL = "http://localhost"

async function dockerFetch<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${DOCKER_BASE_URL}${path}`, {
    dispatcher: dockerAgent,
    ...init,
  })
  if (!response.ok) {
    throw new Error(`Docker request failed (${path}): ${response.status}`)
  }

  return (await response.json()) as T
}
