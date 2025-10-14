/**
 * Prometheus Metrics Exporter
 *
 * Exports metrics in Prometheus format for monitoring and alerting
 */

import type { BroadcastServer } from '../server'
import process from 'node:process'

export interface PrometheusMetrics {
  /**
   * Total number of connections
   */
  connections_total: number

  /**
   * Current number of active connections
   */
  connections_active: number

  /**
   * Total number of channels
   */
  channels_total: number

  /**
   * Total messages broadcasted
   */
  messages_total: number

  /**
   * Total messages received
   */
  messages_received_total: number

  /**
   * Total subscriptions
   */
  subscriptions_total: number

  /**
   * Total errors
   */
  errors_total: number

  /**
   * Server uptime in seconds
   */
  uptime_seconds: number

  /**
   * Memory usage in bytes
   */
  memory_usage_bytes: number

  /**
   * CPU usage percentage (0-100)
   */
  cpu_usage_percent: number

  /**
   * Total HTTP requests to health endpoint
   */
  http_requests_total: Record<string, number>

  /**
   * Rate limit hits
   */
  rate_limit_hits_total: number

  /**
   * Authentication failures
   */
  auth_failures_total: number

  /**
   * Webhook deliveries
   */
  webhook_deliveries_total: number

  /**
   * Webhook delivery failures
   */
  webhook_failures_total: number

  /**
   * Queue stats (if enabled)
   */
  queue_jobs_waiting: number
  queue_jobs_active: number
  queue_jobs_completed: number
  queue_jobs_failed: number
  queue_jobs_delayed: number
}

export class PrometheusExporter {
  private server: BroadcastServer
  private metrics: Partial<PrometheusMetrics> = {}
  private startTime: number = Date.now()

  constructor(server: BroadcastServer) {
    this.server = server
    this.initializeMetrics()
  }

  /**
   * Initialize all metrics with default values
   */
  private initializeMetrics(): void {
    this.metrics = {
      connections_total: 0,
      connections_active: 0,
      channels_total: 0,
      messages_total: 0,
      messages_received_total: 0,
      subscriptions_total: 0,
      errors_total: 0,
      uptime_seconds: 0,
      memory_usage_bytes: 0,
      cpu_usage_percent: 0,
      http_requests_total: {},
      rate_limit_hits_total: 0,
      auth_failures_total: 0,
      webhook_deliveries_total: 0,
      webhook_failures_total: 0,
      queue_jobs_waiting: 0,
      queue_jobs_active: 0,
      queue_jobs_completed: 0,
      queue_jobs_failed: 0,
      queue_jobs_delayed: 0,
    }
  }

  /**
   * Increment a counter metric
   */
  increment(metric: keyof PrometheusMetrics, value: number = 1): void {
    if (typeof this.metrics[metric] === 'number') {
      (this.metrics[metric] as number) += value
    }
  }

  /**
   * Set a gauge metric
   */
  set(metric: keyof PrometheusMetrics, value: number): void {
    (this.metrics[metric] as number) = value
  }

  /**
   * Increment an HTTP request counter
   */
  incrementHttpRequest(path: string, status: number): void {
    const key = `${path}_${status}`
    if (!this.metrics.http_requests_total) {
      this.metrics.http_requests_total = {}
    }
    this.metrics.http_requests_total[key] = (this.metrics.http_requests_total[key] || 0) + 1
  }

  /**
   * Update system metrics
   */
  private updateSystemMetrics(): void {
    // Update uptime
    this.metrics.uptime_seconds = Math.floor((Date.now() - this.startTime) / 1000)

    // Update memory usage
    if (typeof process.memoryUsage === 'function') {
      const mem = process.memoryUsage()
      this.metrics.memory_usage_bytes = mem.heapUsed
    }

    // Update CPU usage (simplified - would need more sophisticated tracking in production)
    if (typeof process.cpuUsage === 'function') {
      const usage = process.cpuUsage()
      this.metrics.cpu_usage_percent = (usage.user + usage.system) / 1000000 // Convert to seconds
    }

    // Update connection and channel counts
    this.metrics.connections_active = this.server.getConnectionCount()
    this.metrics.channels_total = this.server.channels.getChannelCount()
  }

  /**
   * Update queue metrics if queue is enabled
   */
  private async updateQueueMetrics(): Promise<void> {
    if (!(this.server as any).queueManager) {
      return
    }

    try {
      const queueStats = await (this.server as any).queueManager.getStats()
      if (queueStats) {
        this.metrics.queue_jobs_waiting = queueStats.waiting
        this.metrics.queue_jobs_active = queueStats.active
        this.metrics.queue_jobs_completed = queueStats.completed
        this.metrics.queue_jobs_failed = queueStats.failed
        this.metrics.queue_jobs_delayed = queueStats.delayed
      }
    }
    catch {
      // Queue metrics not available
    }
  }

  /**
   * Export metrics in Prometheus text format
   */
  async export(): Promise<string> {
    // Update dynamic metrics
    this.updateSystemMetrics()
    await this.updateQueueMetrics()

    const lines: string[] = []

    // Helper to format metrics
    const formatMetric = (name: string, value: number, help: string, type: 'counter' | 'gauge' = 'counter') => {
      lines.push(`# HELP ${name} ${help}`)
      lines.push(`# TYPE ${name} ${type}`)
      lines.push(`${name} ${value}`)
      lines.push('')
    }

    // Connection metrics
    formatMetric(
      'broadcasting_connections_total',
      this.metrics.connections_total || 0,
      'Total number of connections since server start',
      'counter',
    )

    formatMetric(
      'broadcasting_connections_active',
      this.metrics.connections_active || 0,
      'Current number of active connections',
      'gauge',
    )

    // Channel metrics
    formatMetric(
      'broadcasting_channels_total',
      this.metrics.channels_total || 0,
      'Current number of channels',
      'gauge',
    )

    formatMetric(
      'broadcasting_subscriptions_total',
      this.metrics.subscriptions_total || 0,
      'Total number of subscriptions',
      'counter',
    )

    // Message metrics
    formatMetric(
      'broadcasting_messages_total',
      this.metrics.messages_total || 0,
      'Total messages broadcasted',
      'counter',
    )

    formatMetric(
      'broadcasting_messages_received_total',
      this.metrics.messages_received_total || 0,
      'Total messages received from clients',
      'counter',
    )

    // Error metrics
    formatMetric(
      'broadcasting_errors_total',
      this.metrics.errors_total || 0,
      'Total errors encountered',
      'counter',
    )

    // System metrics
    formatMetric(
      'broadcasting_uptime_seconds',
      this.metrics.uptime_seconds || 0,
      'Server uptime in seconds',
      'gauge',
    )

    formatMetric(
      'broadcasting_memory_usage_bytes',
      this.metrics.memory_usage_bytes || 0,
      'Memory usage in bytes',
      'gauge',
    )

    formatMetric(
      'broadcasting_cpu_usage_percent',
      this.metrics.cpu_usage_percent || 0,
      'CPU usage percentage',
      'gauge',
    )

    // HTTP metrics
    if (this.metrics.http_requests_total && Object.keys(this.metrics.http_requests_total).length > 0) {
      lines.push('# HELP broadcasting_http_requests_total Total HTTP requests')
      lines.push('# TYPE broadcasting_http_requests_total counter')
      for (const [key, value] of Object.entries(this.metrics.http_requests_total)) {
        const [path, status] = key.split('_')
        lines.push(`broadcasting_http_requests_total{path="${path}",status="${status}"} ${value}`)
      }
      lines.push('')
    }

    // Rate limit metrics
    formatMetric(
      'broadcasting_rate_limit_hits_total',
      this.metrics.rate_limit_hits_total || 0,
      'Total rate limit hits',
      'counter',
    )

    // Auth metrics
    formatMetric(
      'broadcasting_auth_failures_total',
      this.metrics.auth_failures_total || 0,
      'Total authentication failures',
      'counter',
    )

    // Webhook metrics
    formatMetric(
      'broadcasting_webhook_deliveries_total',
      this.metrics.webhook_deliveries_total || 0,
      'Total webhook deliveries attempted',
      'counter',
    )

    formatMetric(
      'broadcasting_webhook_failures_total',
      this.metrics.webhook_failures_total || 0,
      'Total webhook delivery failures',
      'counter',
    )

    // Queue metrics (if enabled)
    if ((this.server as any).queueManager) {
      formatMetric(
        'broadcasting_queue_jobs_waiting',
        this.metrics.queue_jobs_waiting || 0,
        'Number of jobs waiting in queue',
        'gauge',
      )

      formatMetric(
        'broadcasting_queue_jobs_active',
        this.metrics.queue_jobs_active || 0,
        'Number of jobs currently being processed',
        'gauge',
      )

      formatMetric(
        'broadcasting_queue_jobs_completed',
        this.metrics.queue_jobs_completed || 0,
        'Total completed jobs',
        'counter',
      )

      formatMetric(
        'broadcasting_queue_jobs_failed',
        this.metrics.queue_jobs_failed || 0,
        'Total failed jobs',
        'counter',
      )

      formatMetric(
        'broadcasting_queue_jobs_delayed',
        this.metrics.queue_jobs_delayed || 0,
        'Number of delayed jobs',
        'gauge',
      )
    }

    return lines.join('\n')
  }

  /**
   * Get metrics as JSON
   */
  async toJSON(): Promise<PrometheusMetrics> {
    this.updateSystemMetrics()
    await this.updateQueueMetrics()
    return this.metrics as PrometheusMetrics
  }
}
