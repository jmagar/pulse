import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { EventStore, StreamId, EventId } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

/**
 * Simple in-memory implementation of the EventStore interface for resumability.
 *
 * This is primarily intended for MVP and development, not for production use
 * where a persistent storage solution (Redis, PostgreSQL, etc.) would be more appropriate.
 *
 * For production, consider:
 * - Redis with TTL for automatic cleanup
 * - PostgreSQL with event sourcing patterns
 * - DynamoDB for serverless deployments
 */
export class InMemoryEventStore implements EventStore {
  private events: Map<EventId, { streamId: StreamId; message: JSONRPCMessage }> = new Map();

  /**
   * Generates a unique event ID for a given stream ID
   */
  private generateEventId(streamId: StreamId): EventId {
    return `${streamId}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  /**
   * Extracts the stream ID from an event ID
   */
  private getStreamIdFromEventId(eventId: EventId): StreamId {
    const parts = eventId.split('_');
    return parts.length > 0 ? parts[0] : '';
  }

  /**
   * Stores an event with a generated event ID
   * Implements EventStore.storeEvent
   */
  async storeEvent(streamId: StreamId, message: JSONRPCMessage): Promise<EventId> {
    const eventId = this.generateEventId(streamId);
    this.events.set(eventId, { streamId, message });
    return eventId;
  }

  /**
   * Replays events that occurred after a specific event ID
   * Implements EventStore.replayEventsAfter
   */
  async replayEventsAfter(
    lastEventId: EventId,
    { send }: { send: (eventId: EventId, message: JSONRPCMessage) => Promise<void> }
  ): Promise<StreamId> {
    if (!lastEventId || !this.events.has(lastEventId)) {
      return '';
    }

    // Extract the stream ID from the event ID
    const streamId = this.getStreamIdFromEventId(lastEventId);
    if (!streamId) {
      return '';
    }

    let foundLastEvent = false;

    // Sort events by eventId for chronological ordering
    const sortedEvents = [...this.events.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    for (const [eventId, { streamId: eventStreamId, message }] of sortedEvents) {
      // Only include events from the same stream
      if (eventStreamId !== streamId) {
        continue;
      }

      // Start sending events after we find the lastEventId
      if (eventId === lastEventId) {
        foundLastEvent = true;
        continue;
      }

      if (foundLastEvent) {
        await send(eventId, message);
      }
    }

    return streamId;
  }
}
