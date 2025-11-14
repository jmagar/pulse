/**
 * @fileoverview Docker Compose logs as MCP resources
 *
 * Provides real-time access to Docker Compose service logs through MCP resources.
 * Executes `docker compose logs` commands via mounted Docker socket to retrieve
 * container logs on demand.
 *
 * @module resources/docker-logs
 */

import { exec } from "child_process";
import { promisify } from "util";
import type { ResourceData, ResourceContent } from "../storage/types.js";
import { logInfo, logError } from "../utils/logging.js";

const execAsync = promisify(exec);

/**
 * Docker Compose service configuration
 */
export interface DockerService {
  name: string;
  description: string;
  /** Docker context for remote hosts (optional) */
  context?: string;
}

/**
 * Configuration for Docker logs resource provider
 */
export interface DockerLogsConfig {
  /** Path to docker-compose.yaml file */
  composePath: string;
  /** Project name (from compose file or directory) */
  projectName: string;
  /** List of services to expose logs for */
  services: DockerService[];
}

/**
 * Docker logs resource provider
 *
 * Provides MCP resources for viewing Docker Compose service logs.
 * Executes docker compose commands via mounted socket to fetch logs.
 */
export class DockerLogsProvider {
  private config: DockerLogsConfig;

  constructor(config: DockerLogsConfig) {
    this.config = config;
  }

  /**
   * List all available Docker log resources
   *
   * Returns a resource for each configured service's logs.
   *
   * @returns Array of resource metadata
   */
  list(): ResourceData[] {
    return this.config.services.map((service) => ({
      uri: `docker://compose/${this.config.projectName}/${service.name}/logs`,
      name: `${service.name} logs`,
      description: service.description || `Container logs for ${service.name}`,
      mimeType: "text/plain",
      metadata: {
        url: `docker://compose/${this.config.projectName}/${service.name}`,
        timestamp: new Date().toISOString(),
        contentType: "text/plain",
        title: `${service.name} logs`,
        description: service.description,
      },
    }));
  }

  /**
   * Read logs for a specific service
   *
   * Executes `docker compose logs` command to retrieve recent container logs.
   *
   * @param uri - Resource URI (docker://compose/{project}/{service}/logs)
   * @returns Resource content with log text
   * @throws Error if URI is invalid or docker command fails
   */
  async read(uri: string): Promise<ResourceContent> {
    // Parse URI: docker://compose/{project}/{service}/logs
    const match = uri.match(
      /^docker:\/\/compose\/([^/]+)\/([^/]+)\/logs$/,
    );
    if (!match) {
      throw new Error(`Invalid Docker logs URI: ${uri}`);
    }

    const [, project, service] = match;

    if (project !== this.config.projectName) {
      throw new Error(
        `Unknown project: ${project} (expected ${this.config.projectName})`,
      );
    }

    // Verify service exists in config
    const serviceConfig = this.config.services.find((s) => s.name === service);
    if (!serviceConfig) {
      throw new Error(
        `Unknown service: ${service} (available: ${this.config.services.map((s) => s.name).join(", ")})`,
      );
    }

    try {
      logInfo("docker-logs", `Fetching logs for service: ${service}`);

      // Execute docker logs command directly on container
      // Container names are deterministic from docker-compose
      // --tail 500: Last 500 lines
      // --timestamps: Include timestamps
      // Support remote contexts via --context flag
      const contextFlag = serviceConfig.context
        ? `--context ${serviceConfig.context}`
        : "";
      const command = `docker ${contextFlag} logs --tail 500 --timestamps ${service}`;

      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large logs
      });

      if (stderr) {
        logError("docker-logs", new Error("Docker logs stderr"), {
          service,
          stderr,
        });
      }

      const logText = stdout || "(no logs available)";

      logInfo("docker-logs", `Retrieved ${logText.length} bytes of logs`, {
        service,
        lines: logText.split("\n").length,
      });

      return {
        uri,
        mimeType: "text/plain",
        text: logText,
      };
    } catch (error) {
      logError("docker-logs", error, { service, uri });
      throw new Error(
        `Failed to fetch logs for ${service}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Check if a URI is a Docker logs resource
   *
   * @param uri - Resource URI to check
   * @returns True if URI matches Docker logs pattern
   */
  static isDockerLogsUri(uri: string): boolean {
    return /^docker:\/\/compose\/[^/]+\/[^/]+\/logs$/.test(uri);
  }
}
