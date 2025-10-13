/**
 * Channel Lifecycle Hooks
 *
 * Fire callbacks on channel lifecycle events
 */

export type ChannelLifecycleEvent = 'created' | 'subscribed' | 'unsubscribed' | 'empty' | 'destroyed'

export interface ChannelHookData {
  channel: string
  event: ChannelLifecycleEvent
  timestamp: number
  socketId?: string
  subscriberCount?: number
  data?: unknown
}

export type ChannelHookCallback = (data: ChannelHookData) => void | Promise<void>

export class ChannelLifecycleManager {
  private hooks: Map<ChannelLifecycleEvent | 'all', Set<ChannelHookCallback>> = new Map()

  /**
   * Register a lifecycle hook
   */
  on(event: ChannelLifecycleEvent | 'all', callback: ChannelHookCallback): void {
    if (!this.hooks.has(event)) {
      this.hooks.set(event, new Set())
    }

    this.hooks.get(event)!.add(callback)
  }

  /**
   * Remove a lifecycle hook
   */
  off(event: ChannelLifecycleEvent | 'all', callback: ChannelHookCallback): void {
    this.hooks.get(event)?.delete(callback)
  }

  /**
   * Fire lifecycle event
   */
  async fire(data: ChannelHookData): Promise<void> {
    // Fire event-specific hooks
    const eventHooks = this.hooks.get(data.event)
    if (eventHooks) {
      for (const callback of eventHooks) {
        try {
          await callback(data)
        }
        catch (error) {
          console.error(`Error in lifecycle hook for ${data.event}:`, error)
        }
      }
    }

    // Fire 'all' hooks
    const allHooks = this.hooks.get('all')
    if (allHooks) {
      for (const callback of allHooks) {
        try {
          await callback(data)
        }
        catch (error) {
          console.error(`Error in 'all' lifecycle hook:`, error)
        }
      }
    }
  }

  /**
   * Fire channel created event
   */
  async channelCreated(channel: string, socketId?: string): Promise<void> {
    await this.fire({
      channel,
      event: 'created',
      timestamp: Date.now(),
      socketId,
    })
  }

  /**
   * Fire channel subscribed event
   */
  async channelSubscribed(
    channel: string,
    socketId: string,
    subscriberCount: number,
  ): Promise<void> {
    await this.fire({
      channel,
      event: 'subscribed',
      timestamp: Date.now(),
      socketId,
      subscriberCount,
    })
  }

  /**
   * Fire channel unsubscribed event
   */
  async channelUnsubscribed(
    channel: string,
    socketId: string,
    subscriberCount: number,
  ): Promise<void> {
    await this.fire({
      channel,
      event: 'unsubscribed',
      timestamp: Date.now(),
      socketId,
      subscriberCount,
    })
  }

  /**
   * Fire channel empty event
   */
  async channelEmpty(channel: string): Promise<void> {
    await this.fire({
      channel,
      event: 'empty',
      timestamp: Date.now(),
      subscriberCount: 0,
    })
  }

  /**
   * Fire channel destroyed event
   */
  async channelDestroyed(channel: string): Promise<void> {
    await this.fire({
      channel,
      event: 'destroyed',
      timestamp: Date.now(),
    })
  }
}
