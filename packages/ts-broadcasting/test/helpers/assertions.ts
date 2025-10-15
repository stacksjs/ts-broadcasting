/**
 * Custom Test Assertions
 *
 * Additional assertion helpers for testing
 */

import { expect } from 'bun:test'

/**
 * Assert that a WebSocket message has expected structure
 */
export function assertWebSocketMessage(message: any, expectedEvent: string, expectedData?: any): void {
  expect(message).toBeDefined()
  expect(message.event).toBe(expectedEvent)

  if (expectedData !== undefined) {
    expect(message.data).toEqual(expectedData)
  }
}

/**
 * Assert that an array contains an item matching predicate
 */
export function assertArrayContains<T>(array: T[], predicate: (item: T) => boolean, _message?: string): void {
  const found = array.some(predicate)
  expect(found).toBe(true)
}

/**
 * Assert that a promise rejects with specific error
 */
export async function assertRejects(
  promise: Promise<any>,
  errorMessage?: string,
): Promise<void> {
  try {
    await promise
    throw new Error('Expected promise to reject')
  }
  catch (error) {
    if (errorMessage) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain(errorMessage)
    }
  }
}

/**
 * Assert that a function throws with specific error
 */
export function assertThrows(fn: () => void, errorMessage?: string): void {
  try {
    fn()
    throw new Error('Expected function to throw')
  }
  catch (error) {
    if (errorMessage) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain(errorMessage)
    }
  }
}

/**
 * Assert event was emitted with expected data
 */
export function assertEventEmitted(
  events: any[],
  eventType: string,
  predicate?: (event: any) => boolean,
): any {
  const found = events.find(e => e.type === eventType && (!predicate || predicate(e)))
  expect(found).toBeDefined()
  return found
}
