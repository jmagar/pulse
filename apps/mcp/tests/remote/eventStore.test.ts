import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryEventStore } from '../../remote/eventStore.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

describe('InMemoryEventStore', () => {
  let eventStore: InMemoryEventStore;

  beforeEach(() => {
    eventStore = new InMemoryEventStore();
  });

  describe('storeEvent', () => {
    it('should store an event and return an event ID', async () => {
      const streamId = 'test-stream-123';
      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'test',
        params: { foo: 'bar' },
      };

      const eventId = await eventStore.storeEvent(streamId, message);

      expect(eventId).toBeTruthy();
      expect(typeof eventId).toBe('string');
      expect(eventId).toContain(streamId);
    });

    it('should generate unique event IDs for the same stream', async () => {
      const streamId = 'test-stream-456';
      const message1: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'test1',
      };
      const message2: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'test2',
      };

      const eventId1 = await eventStore.storeEvent(streamId, message1);
      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 2));
      const eventId2 = await eventStore.storeEvent(streamId, message2);

      expect(eventId1).not.toBe(eventId2);
      expect(eventId1).toContain(streamId);
      expect(eventId2).toContain(streamId);
    });

    it('should generate different event IDs for different streams', async () => {
      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'test',
      };

      const eventId1 = await eventStore.storeEvent('stream-1', message);
      const eventId2 = await eventStore.storeEvent('stream-2', message);

      expect(eventId1).not.toBe(eventId2);
      expect(eventId1).toContain('stream-1');
      expect(eventId2).toContain('stream-2');
    });
  });

  describe('replayEventsAfter', () => {
    it('should replay events after a specific event ID', async () => {
      const streamId = 'replay-stream-1';
      const messages: JSONRPCMessage[] = [
        { jsonrpc: '2.0', method: 'event1' },
        { jsonrpc: '2.0', method: 'event2' },
        { jsonrpc: '2.0', method: 'event3' },
      ];

      // Store events with small delays to ensure ordering
      const eventId1 = await eventStore.storeEvent(streamId, messages[0]);
      await new Promise((resolve) => setTimeout(resolve, 2));
      const eventId2 = await eventStore.storeEvent(streamId, messages[1]);
      await new Promise((resolve) => setTimeout(resolve, 2));
      await eventStore.storeEvent(streamId, messages[2]);

      // Replay events after the first event
      const replayedEvents: Array<{ eventId: string; message: JSONRPCMessage }> = [];
      const replayedStreamId = await eventStore.replayEventsAfter(eventId1, {
        send: async (eventId, message) => {
          replayedEvents.push({ eventId, message });
        },
      });

      expect(replayedStreamId).toBe(streamId);
      expect(replayedEvents).toHaveLength(2);
      expect(replayedEvents[0].message).toEqual(messages[1]);
      expect(replayedEvents[1].message).toEqual(messages[2]);
    });

    it('should return empty string for non-existent event ID', async () => {
      const result = await eventStore.replayEventsAfter('non-existent-id', {
        send: async () => {
          // Should not be called
        },
      });

      expect(result).toBe('');
    });

    it('should not replay events from different streams', async () => {
      const stream1 = 'stream-1';
      const stream2 = 'stream-2';
      const message: JSONRPCMessage = { jsonrpc: '2.0', method: 'test' };

      const eventId1 = await eventStore.storeEvent(stream1, message);
      await new Promise((resolve) => setTimeout(resolve, 2));
      await eventStore.storeEvent(stream2, message);

      const replayedEvents: JSONRPCMessage[] = [];
      await eventStore.replayEventsAfter(eventId1, {
        send: async (_eventId, message) => {
          replayedEvents.push(message);
        },
      });

      // Should not replay events from stream2
      expect(replayedEvents).toHaveLength(0);
    });

    it('should replay in chronological order', async () => {
      const streamId = 'ordered-stream';
      const messages: JSONRPCMessage[] = [
        { jsonrpc: '2.0', method: 'first' },
        { jsonrpc: '2.0', method: 'second' },
        { jsonrpc: '2.0', method: 'third' },
        { jsonrpc: '2.0', method: 'fourth' },
      ];

      // Store events
      const eventId1 = await eventStore.storeEvent(streamId, messages[0]);
      await new Promise((resolve) => setTimeout(resolve, 2));
      await eventStore.storeEvent(streamId, messages[1]);
      await new Promise((resolve) => setTimeout(resolve, 2));
      await eventStore.storeEvent(streamId, messages[2]);
      await new Promise((resolve) => setTimeout(resolve, 2));
      await eventStore.storeEvent(streamId, messages[3]);

      // Replay after first event
      const replayed: JSONRPCMessage[] = [];
      await eventStore.replayEventsAfter(eventId1, {
        send: async (_eventId, message) => {
          replayed.push(message);
        },
      });

      expect(replayed).toHaveLength(3);
      expect('method' in replayed[0] && replayed[0].method).toBe('second');
      expect('method' in replayed[1] && replayed[1].method).toBe('third');
      expect('method' in replayed[2] && replayed[2].method).toBe('fourth');
    });
  });
});
