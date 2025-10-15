# Broadcasting Test Suite

Comprehensive test suite for the ts-broadcasting package.

## Test Structure

```
test/
├── unit/                   # Unit tests for individual components
│   ├── channels.test.ts    # ChannelManager tests
│   ├── broadcaster.test.ts # Broadcaster tests
│   ├── helpers.test.ts     # BroadcastHelpers tests
│   └── middleware.test.ts  # All middleware components tests
├── integration/            # Integration tests for server functionality
│   ├── server.test.ts      # Core server functionality
│   ├── channels.test.ts    # Channel subscriptions (public, private, presence)
│   ├── auth.test.ts        # Authentication flows
│   ├── rate-limiting.test.ts # Rate limiting
│   └── security.test.ts    # Security features
├── e2e/                    # End-to-end tests
│   └── client-sdk.test.ts  # Client SDK (Echo) tests
└── helpers/                # Test utilities and helpers
    ├── test-server.ts      # Server creation and management utilities
    ├── mock-redis.ts       # Mock Redis client for testing
    └── assertions.ts       # Custom assertion helpers

## Running Tests

### Run all tests
```bash
bun test
```

### Run specific test suite
```bash
bun test test/unit/
bun test test/integration/
bun test test/e2e/
```

### Run specific test file
```bash
bun test test/unit/channels.test.ts
```

### Run with coverage
```bash
bun test --coverage
```

### Watch mode
```bash
bun test --watch
```

## Test Categories

### Unit Tests
Tests individual components in isolation with mocked dependencies.

- **channels.test.ts**: ChannelManager functionality
  - Channel type identification (public, private, presence)
  - Subscription/unsubscription
  - Authorization callbacks
  - Pattern matching
  - Presence member tracking

- **broadcaster.test.ts**: Broadcasting functionality
  - Basic broadcasting
  - Fluent interface (BroadcastTo)
  - Anonymous events
  - Channel patterns
  - Queue management

- **helpers.test.ts**: Helper utilities
  - User broadcasting (toUser, toUsers)
  - Notifications
  - Global broadcasting
  - Role-based broadcasting
  - Model broadcasting
  - Presence helpers

- **middleware.test.ts**: All middleware components
  - AuthenticationManager: Token/cookie authentication
  - RateLimiter: Rate limiting logic
  - MonitoringManager: Event emission and metrics
  - MessageValidationManager: Message validation
  - SecurityManager: XSS prevention, size limits

### Integration Tests
Tests components working together in realistic scenarios.

- **server.test.ts**: Core server functionality
  - Server lifecycle (start/stop)
  - WebSocket connections
  - Health and stats endpoints
  - Error handling
  - Connection cleanup

- **channels.test.ts**: Channel operations
  - Public channel subscriptions
  - Private channel authorization
  - Presence channel functionality
  - Client events (whisper)
  - Broadcasting to channels

- **auth.test.ts**: Authentication flows
  - Bearer token authentication
  - Cookie authentication
  - User-based authorization
  - Role-based access control
  - Authentication failures

- **rate-limiting.test.ts**: Rate limiting
  - Message rate limiting
  - Per-connection limits
  - Rate limit reset
  - Custom rate limit configuration

- **security.test.ts**: Security features
  - Message size limits
  - Message validation
  - XSS prevention
  - Custom validators
  - Error message sanitization

### End-to-End Tests
Tests the entire system including client SDK.

- **client-sdk.test.ts**: Echo client functionality
  - Connection and reconnection
  - Public channels
  - Private channels with whisper
  - Presence channels with member tracking
  - Connection events
  - Error handling

## Test Helpers

### Test Server Utilities
Located in `helpers/test-server.ts`:

- `createTestServer(options)`: Create a test server with configurable features
- `createTestClient(port, path)`: Create a WebSocket client
- `waitForMessage(ws, eventName)`: Wait for specific message
- `sendAndWait(ws, message, expectedEvent)`: Send and wait for response
- `closeWebSocket(ws)`: Close WebSocket gracefully
- `cleanupTestServer(server)`: Stop and cleanup server
- `waitFor(condition, timeout)`: Wait for condition to be true

### Mock Redis
Located in `helpers/mock-redis.ts`:

In-memory Redis implementation for testing without actual Redis:
- String operations (get, set, del, incr)
- Set operations (sadd, srem, smembers)
- Hash operations (hmset, hgetall)
- Pub/Sub operations (subscribe, publish)

### Custom Assertions
Located in `helpers/assertions.ts`:

- `assertWebSocketMessage()`: Validate WebSocket message structure
- `assertArrayContains()`: Check array contains matching item
- `assertRejects()`: Verify promise rejection
- `assertThrows()`: Verify function throws
- `assertEventEmitted()`: Verify event emission

## Writing New Tests

### Unit Test Template
```typescript
import { beforeEach, describe, expect, it } from 'bun:test'

describe('MyComponent', () => {
  let component: MyComponent

  beforeEach(() => {
    component = new MyComponent()
  })

  it('should do something', () => {
    const result = component.doSomething()
    expect(result).toBe(expected)
  })
})
```

### Integration Test Template
```typescript
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { cleanupTestServer, createTestServer } from '../helpers/test-server'

describe('MyFeature', () => {
  let server: BroadcastServer
  let port: number

  beforeEach(async () => {
    server = await createTestServer({ port: 0 })
    port = getServerPort(server)
  })

  afterEach(async () => {
    await cleanupTestServer(server)
  })

  it('should work correctly', async () => {
    // Test implementation
  })
})
```

## Test Coverage Goals

- **Unit Tests**: 90%+ coverage for individual components
- **Integration Tests**: Cover all major workflows and edge cases
- **E2E Tests**: Cover critical user journeys

## Continuous Integration

Tests are automatically run on:
- Every commit
- Pull requests
- Before releases

## Debugging Tests

### Enable verbose logging
```bash
DEBUG=* bun test
```

### Run single test
```bash
bun test --test-name-pattern "should connect to broadcast server"
```

### Increase timeout for slow tests
```typescript
it('slow test', async () => {
  // Test implementation
}, { timeout: 10000 }) // 10 seconds
```

## Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Always cleanup resources (servers, connections)
3. **Naming**: Use descriptive test names
4. **Assertions**: Use specific assertions, avoid generic `toBeTruthy()`
5. **Async**: Use `await` with async operations
6. **Mocking**: Mock external dependencies in unit tests
7. **Real servers**: Use real servers in integration tests

## Common Issues

### Port already in use
Use `port: 0` to get a random available port:
```typescript
server = await createTestServer({ port: 0 })
```

### Test timeouts
Increase timeout or check for race conditions:
```typescript
await waitFor(() => condition, 5000) // 5 second timeout
```

### Flaky tests
Ensure proper cleanup and avoid timing dependencies.
