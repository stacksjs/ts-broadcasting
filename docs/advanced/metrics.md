# Prometheus Metrics

ts-broadcasting includes a built-in Prometheus metrics exporter accessible at the `/metrics` HTTP endpoint.

## Setup

The `/metrics` (and `/stats`) endpoint is off by default. Enable it with
`endpoints`, ideally behind a token:

```ts
const server = new BroadcastServer({
  driver: 'bun',
  connections: {
    bun: { driver: 'bun', host: '0.0.0.0', port: 6001 },
  },
  endpoints: {
    metrics: true,
    stats: true,
    token: process.env.BROADCAST_ENDPOINT_TOKEN, // optional
  },
})

await server.start()
// Metrics available at http://localhost:6001/metrics
// (with a token: curl -H "Authorization: Bearer $BROADCAST_ENDPOINT_TOKEN" ...)
```

A disabled endpoint answers 404, and an enabled one with a `token` answers 401
to any request without `Authorization: Bearer <token>`. Before 0.0.11 both
endpoints were served to anyone who could reach the port.

## Available Metrics

The `/metrics` endpoint returns Prometheus text format with these metrics:

| Metric | Type | Description |
|--------|------|-------------|
| `broadcasting_connections_total` | counter | Total connections since start |
| `broadcasting_connections_active` | gauge | Current active connections |
| `broadcasting_channels_total` | gauge | Current active channels |
| `broadcasting_messages_total` | counter | Total messages sent |
| `broadcasting_messages_received_total` | counter | Total messages received |
| `broadcasting_subscriptions_total` | counter | Total subscription events |
| `broadcasting_errors_total` | counter | Total errors |
| `broadcasting_uptime_seconds` | gauge | Server uptime in seconds |
| `broadcasting_memory_usage_bytes` | gauge | Current memory usage |
| `broadcasting_cpu_usage_percent` | gauge | Current CPU usage |
| `broadcasting_rate_limit_hits_total` | counter | Rate limit hits |
| `broadcasting_auth_failures_total` | counter | Authentication failures |
| `broadcasting_webhook_deliveries_total` | counter | Webhook deliveries |
| `broadcasting_webhook_failures_total` | counter | Webhook failures |
| `broadcasting_queue_jobs_waiting` | gauge | Queue jobs waiting |
| `broadcasting_queue_jobs_active` | gauge | Queue jobs active |
| `broadcasting_queue_jobs_completed` | counter | Queue jobs completed |
| `broadcasting_queue_jobs_failed` | counter | Queue jobs failed |

## Prometheus Configuration

Add ts-broadcasting as a scrape target in your `prometheus.yml`:

```yaml
scrape_configs:

  - job_name: 'ts-broadcasting'

    scrape_interval: 15s
    static_configs:

      - targets: ['localhost:6001']

    metrics_path: '/metrics'
```

## Grafana Dashboard

Example queries for Grafana:

```promql
# Active connections
broadcasting_connections_active

# Messages per second
rate(broadcasting_messages_total[5m])

# Error rate
rate(broadcasting_errors_total[5m])

# Memory usage
broadcasting_memory_usage_bytes
```

## Using PrometheusExporter Directly

```ts
import { PrometheusExporter } from 'ts-broadcasting'

const exporter = new PrometheusExporter(server)
const metricsText = await exporter.export()
console.log(metricsText)
```

## Stats Endpoint

The `/stats` endpoint (enabled with `endpoints.stats`) returns JSON statistics:

```json
{
  "connections": 42,
  "channels": 15,
  "uptime": 3600.5,
  "metrics": {
    "connections_total": 150,
    "messages_total": 5000,
    "errors_total": 2
  }
}
```

## Monitoring Manager

The monitoring manager tracks events internally:

```ts
const metrics = server.monitoring?.getMetrics()
```

## Next Steps

- [Load Management](/advanced/load-management) - Connection limits and load shedding
- [Circuit Breaker](/advanced/circuit-breaker) - Failure handling
