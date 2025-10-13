/**
 * Mock Redis Client
 *
 * In-memory Redis client for testing without actual Redis
 */

export class MockRedisClient {
  private data: Map<string, string> = new Map()
  private sets: Map<string, Set<string>> = new Map()
  private hashes: Map<string, Map<string, string>> = new Map()
  private subscribers: Map<string, Array<(message: string) => void>> = new Map()
  private connected = false

  async connect(): Promise<void> {
    this.connected = true
  }

  close(): void {
    this.connected = false
    this.data.clear()
    this.sets.clear()
    this.hashes.clear()
    this.subscribers.clear()
  }

  // String operations
  async get(key: string): Promise<string | null> {
    return this.data.get(key) || null
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value)
  }

  async del(key: string): Promise<void> {
    this.data.delete(key)
  }

  async incr(key: string): Promise<number> {
    const current = Number.parseInt(this.data.get(key) || '0')
    const newValue = current + 1
    this.data.set(key, newValue.toString())
    return newValue
  }

  async expire(key: string, seconds: number): Promise<void> {
    // In mock, we don't actually expire keys
    // You could implement this with setTimeout if needed
  }

  // Set operations
  async sadd(key: string, member: string): Promise<void> {
    if (!this.sets.has(key)) {
      this.sets.set(key, new Set())
    }
    this.sets.get(key)!.add(member)
  }

  async srem(key: string, member: string): Promise<void> {
    this.sets.get(key)?.delete(member)
  }

  async smembers(key: string): Promise<string[]> {
    return Array.from(this.sets.get(key) || [])
  }

  // Hash operations
  async hmset(key: string, values: string[]): Promise<void> {
    if (!this.hashes.has(key)) {
      this.hashes.set(key, new Map())
    }
    const hash = this.hashes.get(key)!
    for (let i = 0; i < values.length; i += 2) {
      hash.set(values[i], values[i + 1])
    }
  }

  // Pub/Sub operations
  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, [])
    }
    this.subscribers.get(channel)!.push(callback)
  }

  async publish(channel: string, message: string): Promise<void> {
    const callbacks = this.subscribers.get(channel) || []
    for (const callback of callbacks) {
      callback(message)
    }
  }

  // Generic command
  async send(command: string, args: string[]): Promise<any> {
    switch (command) {
      case 'PING':
        return 'PONG'

      case 'KEYS': {
        const pattern = args[0]
        const regex = new RegExp(`^${pattern.replace('*', '.*')}$`)
        const keys = Array.from(this.data.keys()).filter(key => regex.test(key))
        return keys
      }

      case 'HDEL': {
        const [key, field] = args
        this.hashes.get(key)?.delete(field)
        return
      }

      case 'HGETALL': {
        const key = args[0]
        const hash = this.hashes.get(key)
        if (!hash) {
          return []
        }
        const result: string[] = []
        for (const [field, value] of hash.entries()) {
          result.push(field, value)
        }
        return result
      }

      default:
        throw new Error(`Mock Redis command not implemented: ${command}`)
    }
  }

  // Test helpers
  clear(): void {
    this.data.clear()
    this.sets.clear()
    this.hashes.clear()
  }

  isConnected(): boolean {
    return this.connected
  }
}
