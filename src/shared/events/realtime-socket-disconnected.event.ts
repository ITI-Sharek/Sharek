/**
 * Emitted by `RealtimeGateway.handleDisconnect` when an *authenticated*
 * socket on the `/realtime` namespace disconnects. A socket that never
 * completed authentication never had a `userId` to report, so it never
 * fires this.
 */
export const REALTIME_SOCKET_DISCONNECTED_EVENT = 'realtime.socket.disconnected';

export type RealtimeSocketDisconnectedEvent = {
  userId: string;
  socketId: string;
};
