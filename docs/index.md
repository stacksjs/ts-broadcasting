---
layout: home

hero:
  name: "ts-broadcasting"
  text: "Real-time WebSocket broadcasting for TypeScript."
  tagline: "High-performance, type-safe broadcasting built on Bun."
  image: /images/logo-white.png
  actions:
    - theme: brand
      text: Get Started
      link: /intro
    - theme: alt
      text: View on GitHub
      link: https://github.com/stacksjs/ts-broadcasting

features:
  - title: "Built on Bun"
    icon: "🚀"
    details: "Leverages Bun's native WebSocket implementation for maximum performance with per-message compression."
  - title: "Channel Types"
    icon: "📡"
    details: "Public, private, and presence channels with flexible authorization and pattern matching."
  - title: "Laravel Echo Compatible"
    icon: "🔄"
    details: "Drop-in replacement for Laravel Echo with identical client API. Migrate in minutes."
  - title: "Type-Safe"
    icon: "🛡"
    details: "Full TypeScript support with generics throughout the entire API surface."
  - title: "Framework Integrations"
    icon: "⚡"
    details: "First-class Vue 3 composables and Svelte store integrations out of the box."
  - title: "Horizontal Scaling"
    icon: "📈"
    details: "Scale across multiple servers with the built-in Redis pub/sub adapter."
  - title: "End-to-End Encryption"
    icon: "🔒"
    details: "AES-256-GCM encryption for sensitive channels with automatic key rotation."
  - title: "Observability"
    icon: "📊"
    details: "Built-in Prometheus metrics, webhooks, health checks, and monitoring."
  - title: "CLI"
    icon: "🛠"
    details: "Command-line interface for starting, monitoring, and managing the broadcast server."
---