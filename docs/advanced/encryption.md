# End-to-End Encryption

ts-broadcasting supports AES-256-GCM end-to-end encryption for sensitive broadcast channels.

## Server Setup

```ts
const server = new BroadcastServer({
  // ...
  encryption: {
    enabled: true,
    algorithm: 'aes-256-gcm',   // or 'aes-128-gcm'
    keyRotationInterval: 86400000, // 24 hours (optional)
  },
})
```

## Configuration

```ts
interface EncryptionConfig {
  enabled?: boolean
  algorithm?: 'aes-256-gcm' | 'aes-128-gcm'
  keyRotationInterval?: number  // Key rotation interval in ms
  channelKeys?: Map<string, string>  // Pre-configured channel keys
}
```

## Managing Encryption Keys

### Generate Channel Keys

```ts
// Generate a new key for a channel
const key = await server.encryption?.generateChannelKey('private-payments')

// Set a specific key for a channel
await server.encryption?.setChannelKey('private-payments', 'your-base64-key')
```

### Encrypt and Decrypt

```ts
// Server-side encryption
const encrypted = await server.encryption?.encrypt('private-payments', {
  amount: 99.99,
  cardLast4: '4242',
})

// Server-side decryption
const decrypted = await server.encryption?.decrypt('private-payments', encrypted)
```

## Client-Side Encryption

```ts
const client = new BroadcastClient({
  // ...
  encryption: {
    enabled: true,
    keys: {
      'private-payments': 'channel-encryption-key',
    },
  },
})

// Set keys at runtime
client.setEncryptionKey('private-payments', 'new-key')

// Retrieve keys
const key = client.getEncryptionKey('private-payments')
```

## How It Works

1. Each channel can have its own encryption key
2. Data is encrypted with AES-256-GCM before broadcasting
3. Only clients with the matching key can decrypt the data
4. Keys can be rotated at configurable intervals
5. The encryption uses authenticated encryption (GCM mode) to prevent tampering

## Next Steps

- [Redis](/advanced/redis) - Horizontal scaling
- [Queues](/advanced/queues) - Background job queuing
