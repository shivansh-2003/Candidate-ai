# LiveKit Connection Issues - Fix Summary

## Problem Description

The application was experiencing "already connected to room" errors when reloading the website locally. The errors indicated that:

1. Multiple connection attempts were being made to the same room
2. Old connections weren't being properly cleaned up on page reload
3. The LiveKitRoom component was trying to connect when already connected
4. **React Strict Mode** in development was causing double-mounting, leading to duplicate connection attempts

## Root Causes Identified

1. **Missing Disconnect on Unmount**: The `VoiceInterface` component wasn't calling `room.disconnect()` in its cleanup function
2. **No Main Component Cleanup**: The `VoiceAgent` component had no cleanup effect to disconnect on unmount
3. **Unstable shouldConnect Logic**: The `shouldConnect` variable was recalculated on every render, potentially causing reconnection loops
4. **No Page Reload Handling**: No `beforeunload` event handler to ensure cleanup when page is refreshed
5. **Room Reference Not Tracked**: The main component wasn't tracking the room instance for cleanup

## Fixes Implemented

### 1. Room Disconnect in VoiceInterface Component (Line 117-123)

Added proper disconnect logic in the useEffect cleanup:

```typescript
return () => {
  room.off(RoomEvent.Reconnecting, handleReconnecting);
  room.off(RoomEvent.Reconnected, handleReconnected);
  room.off(RoomEvent.Disconnected, handleDisconnected);

  // Disconnect room on component unmount to prevent stale connections
  if (room.state === 'connected' || room.state === 'connecting') {
    console.log('Cleaning up room connection on unmount');
    room.disconnect().catch((err) => {
      console.warn('Error disconnecting room during cleanup:', err);
    });
  }
};
```

### 2. Room Reference Tracking (Line 69-86, 673-675)

Added `onRoomReady` callback prop to VoiceInterface to pass room reference to parent:

```typescript
// Pass room reference to parent
useEffect(() => {
  if (room && onRoomReady) {
    onRoomReady(room);
  }
}, [room, onRoomReady]);
```

Parent captures the reference:

```typescript
<VoiceInterface
  onRoomReady={(room) => {
    roomRef.current = room;
  }}
  // ... other props
/>
```

### 3. Main Component Cleanup Effect (Line 442-491)

Added comprehensive cleanup with `beforeunload` handler:

```typescript
useEffect(() => {
  // Handle page reload/close - ensure room is disconnected
  const handleBeforeUnload = () => {
    console.log('Page unloading, disconnecting room');
    if (roomRef.current) {
      const room = roomRef.current;
      if (room.state === 'connected' || room.state === 'connecting') {
        try {
          room.disconnect();
        } catch (err) {
          console.warn('Error disconnecting room during beforeunload:', err);
        }
      }
    }
  };

  window.addEventListener('beforeunload', handleBeforeUnload);

  return () => {
    // Reset all connection tracking refs
    hasConnectedRef.current = false;
    isConnectingRef.current = false;
    connectionAttemptedRef.current = false;
    connectInitiatedRef.current = false;

    // Disconnect room if connected
    if (roomRef.current) {
      const room = roomRef.current;
      if (room.state === 'connected' || room.state === 'connecting') {
        room.disconnect().catch((err) => {
          console.warn('Error disconnecting room during unmount:', err);
        });
      }
      roomRef.current = null;
    }
  };
}, []);
```

### 4. Stable shouldConnect with useMemo (Line 418-440)

Replaced variable recalculation with memoized value:

```typescript
const shouldConnect = useMemo(() => {
  // Don't connect if no token or user hasn't started session
  if (!token || !userInteracted) {
    return false;
  }

  // If already initiated, keep connection active
  if (connectInitiatedRef.current) {
    return true;
  }

  // Only initiate connection when in a connecting state
  const needsConnection = connectionState === 'connecting' ||
                          connectionState === 'waiting-agent' ||
                          connectionState === 'reconnecting';

  if (needsConnection) {
    connectInitiatedRef.current = true;
    return true;
  }

  return false;
}, [token, userInteracted, connectionState]);
```

### 5. Clear Room Reference on Disconnect (Line 679)

Updated `onDisconnected` callback to clear room reference:

```typescript
onDisconnected={(reason) => {
  console.log('Disconnected:', reason);
  hasConnectedRef.current = false;
  isConnectingRef.current = false;
  connectionAttemptedRef.current = false;
  connectInitiatedRef.current = false;
  roomRef.current = null; // Clear room reference
  // ... rest of disconnect handling
}}
```

## Expected Behavior After Fixes

1. ✅ **Clean Disconnection**: Room properly disconnects when component unmounts
2. ✅ **Page Reload Safety**: Room disconnects synchronously on page reload/close
3. ✅ **No Duplicate Connections**: `shouldConnect` is stable and prevents unnecessary reconnection attempts
4. ✅ **Proper State Reset**: All connection tracking refs are reset on disconnect and unmount
5. ✅ **Room Reference Management**: Room reference is properly tracked and cleared

## Testing Instructions

1. Start the voice session
2. Reload the page (Ctrl+R or Cmd+R)
3. Verify in console:
   - "Page unloading, disconnecting room" message appears
   - No "already connected to room" errors
   - New connection establishes cleanly
4. Test multiple reloads in succession
5. Test closing the tab and reopening

## Files Modified

- `/home/user/Candidate-ai/frontend/app/components/VoiceAgent.tsx`

## Additional Fixes (v2 - React Strict Mode)

After initial deployment, the issue persisted due to React Strict Mode causing double-mounting in development. Additional fixes were implemented:

### 6. Global Connection Guard (Line 28-30)

Added module-level flag and sessionStorage to track active connections across component remounts:

```typescript
// Module-level flag to prevent duplicate connections across React Strict Mode remounts
let globalConnectionActive = false;
const STORAGE_KEY = 'livekit_connection_active';
```

### 7. Enhanced Cleanup with Strict Mode Detection (Line 447-520)

Updated cleanup effect to:
- Clear stale connection flags on mount
- Use a delayed cleanup (100ms) to allow Strict Mode remounts to complete
- Clear global flags on beforeunload

```typescript
useEffect(() => {
  // Clear any stale connection flags from previous sessions on mount
  if (typeof window !== 'undefined') {
    const staleConnection = sessionStorage.getItem(STORAGE_KEY);
    if (staleConnection) {
      console.log('Clearing stale connection flag from previous session');
      sessionStorage.removeItem(STORAGE_KEY);
      globalConnectionActive = false;
    }
  }

  // ... beforeunload handler ...

  return () => {
    // Delayed cleanup to handle Strict Mode
    const disconnectTimeout = setTimeout(() => {
      // ... cleanup logic ...
    }, 100);

    return () => clearTimeout(disconnectTimeout);
  };
}, []);
```

### 8. Guard Against Duplicate LiveKitRoom Renders (Line 675-687)

Added check before rendering LiveKitRoom to prevent duplicate connections:

```typescript
if (globalConnectionActive && !roomRef.current) {
  console.log('Connection already active globally, preventing duplicate LiveKitRoom render');
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center space-y-4">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto"></div>
        <p className="text-white">Connecting to existing session...</p>
      </div>
    </div>
  );
}
```

### 9. Updated Connection Callbacks (Line 692-705, 706-729)

Enhanced `onConnected` and `onDisconnected` to manage global flags:

```typescript
onConnected={() => {
  if (hasConnectedRef.current || globalConnectionActive) {
    console.log('Already connected, skipping duplicate connection setup');
    return;
  }
  globalConnectionActive = true;
  sessionStorage.setItem(STORAGE_KEY, 'true');
  // ... rest of connection setup ...
}}

onDisconnected={(reason) => {
  // ... existing cleanup ...
  globalConnectionActive = false;
  sessionStorage.removeItem(STORAGE_KEY);
  // ... rest of disconnect handling ...
}}
```

## References

- [LiveKit Client SDK - Connection Handling](https://docs.livekit.io/home/client/connect/)
- [React Hooks - Cleanup Effects](https://react.dev/reference/react/useEffect#cleanup-function)
- [LiveKit Room State Management](https://docs.livekit.io/client-sdk-js/interfaces/RoomOptions.html)
- [React Strict Mode - Double Mounting](https://react.dev/reference/react/StrictMode#fixing-bugs-found-by-double-rendering-in-development)
