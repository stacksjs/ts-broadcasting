# Circuit Breaker

ts-broadcasting includes a circuit breaker pattern implementation for protecting external service calls (Redis, webhooks, etc.) from cascading failures.

## Overview

The circuit breaker has three states:

| State | Description |
|-------|-------------|
| **CLOSED** | Normal operation. Failures are counted. |
| **OPEN** | Too many failures. All calls are rejected immediately. |
| **HALF_OPEN** | After a reset timeout, a limited number of calls are allowed to test recovery. |

## Usage

```ts
import { CircuitBreaker, CircuitBreakerManager } from 'ts-broadcasting'

// Create a circuit breaker
const breaker = new CircuitBreaker({
  failureThreshold: 5,     // Open after 5 failures
  failureWindow: 60000,    // Within 60 seconds
  resetTimeout: 30000,     // Try recovery after 30 seconds
  successThreshold: 2,     // Require 2 successes to close
  timeout: 5000,           // Call timeout
})

// Wrap external calls
try {
  const result = await breaker.execute(async () => {
    return await externalService.call()
  })
}
catch (error) {
  if (error instanceof CircuitBreakerError) {
    console.log('Circuit is open, call rejected')
  }
}
```

## Circuit Breaker Manager

Manage multiple circuit breakers:

```ts
const manager = new CircuitBreakerManager()

// Register breakers for different services
const redisBreaker = manager.register('redis', {
  failureThreshold: 3,
  resetTimeout: 10000,
})

const webhookBreaker = manager.register('webhooks', {
  failureThreshold: 5,
  resetTimeout: 30000,
})

// Use them
await manager.get('redis')?.execute(async () => {
  return await redis.ping()
})
```

## Configuration

```ts
interface CircuitBreakerConfig {
  failureThreshold?: number  // Failures to open (default: 5)
  failureWindow?: number     // Failure counting window in ms
  resetTimeout?: number      // Time before trying recovery in ms
  successThreshold?: number  // Successes needed to close in half-open
  timeout?: number           // Call timeout in ms
}
```

## Monitoring

```ts
const stats = breaker.getStats()
// {
//   state: 'CLOSED',
//   failures: 0,
//   successes: 10,
//   lastFailure: null,
//   lastSuccess: 1234567890,
// }

// Check current state
const state = breaker.getState() // 'CLOSED' | 'OPEN' | 'HALF_OPEN'

// Manually reset
breaker.reset()
```

## Next Steps

- [Load Management](/advanced/load-management) - Connection limits
- [Redis](/advanced/redis) - Horizontal scaling
