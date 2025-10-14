/**
 * Queue Manager for Broadcasting
 *
 * Integrates bun-queue for reliable message delivery and background processing
 */

import type { DeadLetterQueue, Job, JobContract, Queue } from 'bun-queue'
import type { BroadcastServer } from './server'
import { getQueueManager } from 'bun-queue'

export interface BroadcastQueueConfig {
  enabled?: boolean
  connection?: string
  defaultQueue?: string
  retry?: {
    attempts?: number
    backoff?: {
      type: 'fixed' | 'exponential'
      delay: number
    }
  }
  deadLetter?: {
    enabled?: boolean
    maxRetries?: number
  }
}

/**
 * Broadcast Job - queues a broadcast event for async delivery
 */
export class BroadcastJob implements JobContract {
  public connection?: string
  public queue?: string
  public delay?: number
  public tries?: number
  public timeout?: number
  public backoff?: [number, number]

  constructor(
    private channel: string,
    private event: string,
    private data: unknown,
    private excludeSocketId?: string,
  ) {
    this.tries = 3
    this.timeout = 30000 // 30 seconds
    this.backoff = [1000, 5000] // 1-5 second backoff
  }

  async handle(server: BroadcastServer): Promise<void> {
    try {
      server.broadcast(this.channel, this.event, this.data, this.excludeSocketId)
    }
    catch (error) {
      console.error(`Failed to broadcast to ${this.channel}:`, error)
      throw error
    }
  }

  failed(error: Error): void {
    console.error(`BroadcastJob failed for channel ${this.channel}:`, error.message)
  }
}

/**
 * Delayed Broadcast Job - schedules a broadcast for future delivery
 */
export class DelayedBroadcastJob extends BroadcastJob {
  constructor(
    channel: string,
    event: string,
    data: unknown,
    delayMs: number,
    excludeSocketId?: string,
  ) {
    super(channel, event, data, excludeSocketId)
    this.delay = delayMs
  }
}

/**
 * Recurring Broadcast Job - broadcasts at regular intervals
 */
export class RecurringBroadcastJob implements JobContract {
  public connection?: string
  public queue?: string
  public delay?: number
  public tries?: number
  public timeout?: number

  constructor(
    private channel: string,
    private event: string,
    private dataFn: () => unknown | Promise<unknown>,
    private cronExpression: string,
  ) {
    this.tries = 3
    this.timeout = 30000
  }

  async handle(server: BroadcastServer): Promise<void> {
    try {
      const data = typeof this.dataFn === 'function' ? await this.dataFn() : this.dataFn
      server.broadcast(this.channel, this.event, data)
    }
    catch (error) {
      console.error(`Failed to broadcast recurring event to ${this.channel}:`, error)
      throw error
    }
  }

  failed(error: Error): void {
    console.error(`RecurringBroadcastJob failed for channel ${this.channel}:`, error.message)
  }
}

/**
 * Queue Manager for Broadcasting System
 */
export class BroadcastQueueManager {
  private queue: Queue | null = null
  private server: BroadcastServer
  private config: Required<BroadcastQueueConfig>
  private deadLetterQueue?: DeadLetterQueue<any>

  constructor(server: BroadcastServer, config?: BroadcastQueueConfig) {
    this.server = server
    this.config = {
      enabled: config?.enabled ?? false,
      connection: config?.connection || 'default',
      defaultQueue: config?.defaultQueue || 'broadcasts',
      retry: {
        attempts: config?.retry?.attempts ?? 3,
        backoff: config?.retry?.backoff ?? { type: 'exponential', delay: 1000 },
      },
      deadLetter: {
        enabled: config?.deadLetter?.enabled ?? true,
        maxRetries: config?.deadLetter?.maxRetries ?? 3,
      },
    }

    if (this.config.enabled) {
      this.initializeQueue()
    }
  }

  /**
   * Initialize the queue system
   */
  private async initializeQueue(): Promise<void> {
    try {
      // Get the queue manager from bun-queue
      const manager = getQueueManager()

      // Get or create the queue
      this.queue = manager.connection(this.config.connection).queue(this.config.defaultQueue)

      // Initialize dead letter queue if enabled
      if (this.config.deadLetter.enabled) {
        this.deadLetterQueue = this.queue.getDeadLetterQueue()
      }

      // Start processing jobs
      this.queue.processJobs(10) // Process with 10 concurrent workers

      // eslint-disable-next-line no-console
      console.log(`✓ Broadcasting queue initialized: ${this.config.defaultQueue}`)
    }
    catch (error) {
      console.error('Failed to initialize broadcasting queue:', error)
      this.config.enabled = false
    }
  }

  /**
   * Queue a broadcast for async delivery
   */
  async queueBroadcast(
    channel: string | string[],
    event: string,
    data: unknown,
    options?: {
      delay?: number
      excludeSocketId?: string
      priority?: number
    },
  ): Promise<Job<any> | Job<any>[]> {
    if (!this.isEnabled()) {
      throw new Error('Queue system is not enabled')
    }

    const channels = Array.isArray(channel) ? channel : [channel]
    const jobs: Job<any>[] = []

    for (const ch of channels) {
      const job = options?.delay
        ? new DelayedBroadcastJob(ch, event, data, options.delay, options?.excludeSocketId)
        : new BroadcastJob(ch, event, data, options?.excludeSocketId)

      const queuedJob = await this.queue!.dispatchJob(job, this.server)
      jobs.push(queuedJob)
    }

    return channels.length === 1 ? jobs[0] : jobs
  }

  /**
   * Schedule a recurring broadcast
   */
  async scheduleRecurringBroadcast(
    channel: string,
    event: string,
    dataFn: () => unknown | Promise<unknown>,
    cronExpression: string,
  ): Promise<string> {
    if (!this.isEnabled()) {
      throw new Error('Queue system is not enabled')
    }

    const job = new RecurringBroadcastJob(channel, event, dataFn, cronExpression)

    const jobId = await this.queue!.scheduleCron({
      cron: cronExpression,
      data: { job, server: this.server },
      name: `recurring-broadcast-${channel}-${event}`,
    })

    return jobId
  }

  /**
   * Cancel a scheduled recurring broadcast
   */
  async cancelRecurringBroadcast(jobId: string): Promise<boolean> {
    if (!this.isEnabled()) {
      return false
    }

    return this.queue!.unscheduleCron(jobId)
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    waiting: number
    active: number
    completed: number
    failed: number
    delayed: number
    deadLetter: number
  } | null> {
    if (!this.isEnabled()) {
      return null
    }

    const counts = await this.queue!.getJobCounts()
    const deadLetterJobs = this.deadLetterQueue
      ? await this.deadLetterQueue.getJobs()
      : []

    return {
      waiting: counts.waiting,
      active: counts.active,
      completed: counts.completed,
      failed: counts.failed,
      delayed: counts.delayed,
      deadLetter: deadLetterJobs.length,
    }
  }

  /**
   * Get failed jobs
   */
  async getFailedJobs(start = 0, end = -1): Promise<Job<any>[]> {
    if (!this.isEnabled()) {
      return []
    }

    return this.queue!.getJobs('failed', start, end)
  }

  /**
   * Get dead letter queue jobs
   */
  async getDeadLetterJobs(start = 0, end = -1): Promise<Job<any>[]> {
    if (!this.isEnabled() || !this.deadLetterQueue) {
      return []
    }

    return this.deadLetterQueue.getJobs(start, end)
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId: string): Promise<Job<any> | null> {
    if (!this.isEnabled()) {
      return null
    }

    return this.queue!.retryJob(jobId)
  }

  /**
   * Republish a job from dead letter queue
   */
  async republishDeadLetterJob(jobId: string, resetRetries = true): Promise<Job<any> | null> {
    if (!this.isEnabled() || !this.deadLetterQueue) {
      return null
    }

    return this.queue!.republishDeadLetterJob(jobId, { resetRetries })
  }

  /**
   * Clear failed jobs
   */
  async clearFailedJobs(): Promise<void> {
    if (!this.isEnabled()) {
      return
    }

    const failedJobs = await this.queue!.getJobs('failed')
    const jobIds = failedJobs.map(job => job.id)

    if (jobIds.length > 0) {
      await this.queue!.bulkRemove(jobIds)
    }
  }

  /**
   * Clear dead letter queue
   */
  async clearDeadLetterQueue(): Promise<void> {
    if (!this.isEnabled() || !this.deadLetterQueue) {
      return
    }

    await this.queue!.clearDeadLetterQueue()
  }

  /**
   * Check if queue is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled && this.queue !== null
  }

  /**
   * Close the queue connection
   */
  async close(): Promise<void> {
    if (this.queue) {
      await this.queue.close()
      this.queue = null
    }
  }
}
