'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useRoomContext,
  useTracks,
  useLocalParticipant,
  useRemoteParticipants,
} from '@livekit/components-react';
import { Track, RemoteParticipant, Participant, RoomEvent, DisconnectReason } from 'livekit-client';
import '@livekit/components-styles';
import RadialVisualizer from '../components/RadialVisualizer';
import { useAudioAnalyzer } from './hooks/useAudioAnalyzer';

// Inner component - must be inside LiveKitRoom
function VoiceInterface() {
  const room = useRoomContext();
  const localParticipant = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const tracks = useTracks([Track.Source.Microphone, Track.Source.Camera], { onlySubscribed: false });
  
  const [agentState, setAgentState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [isListening, setIsListening] = useState(false);
  const agentParticipantRef = useRef<RemoteParticipant | null>(null);

  // Find the agent participant (usually the first remote participant)
  useEffect(() => {
    const agentParticipant = Array.from(remoteParticipants.values())[0];
    if (agentParticipant) {
      agentParticipantRef.current = agentParticipant;
    }
  }, [remoteParticipants]);

  // Track agent connection and audio state
  useEffect(() => {
    const agentParticipant = agentParticipantRef.current;
    
    if (!agentParticipant) {
      // Agent not connected yet
      setAgentState('listening');
      setIsListening(true);
      return;
    }

    // Check if agent has audio tracks by filtering tracks from useTracks hook
    const agentTracks = tracks.filter(
      (trackRef) => trackRef.participant && trackRef.participant.identity === agentParticipant.identity && trackRef.source === Track.Source.Microphone
    );

    if (agentTracks.length === 0) {
      // Agent connected but no audio track yet - waiting
      setAgentState('listening');
      setIsListening(true);
      return;
    }

    // Agent is connected and has audio track - default to listening
    // The actual speaking state will be detected through audio visualization
    setAgentState('listening');
    setIsListening(true);
  }, [remoteParticipants, tracks]);

  // Listen for data messages from agent (if agent sends state updates)
  useEffect(() => {
    const handleDataReceived = (payload: Uint8Array, participant?: Participant) => {
      if (participant && participant !== localParticipant.localParticipant) {
        try {
          const decoder = new TextDecoder();
          const data = JSON.parse(decoder.decode(payload));
          if (data.state) {
            setAgentState(data.state);
          }
        } catch (e) {
          // Not JSON or not a state update, ignore
        }
      }
    };

    room.on(RoomEvent.DataReceived, handleDataReceived);
    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived);
    };
  }, [room, localParticipant]);

  const getStatusEmoji = () => {
    switch (agentState) {
      case 'listening': return '🎤';
      case 'thinking': return '🤔';
      case 'speaking': return '🗣️';
      default: return '💤';
    }
  };

  const getStatusText = () => {
    switch (agentState) {
      case 'listening': return 'Listening to you...';
      case 'thinking': return 'Processing...';
      case 'speaking': return 'Speaking...';
      default: return 'Ready to chat';
    }
  };

  const getStatusColor = () => {
    switch (agentState) {
      case 'listening': return 'bg-green-500';
      case 'thinking': return 'bg-yellow-500';
      case 'speaking': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  // Find agent audio MediaStreamTrack (first remote mic track)
  const agentMicTrack = useMemo(() => {
    const ref = tracks.find(
      (t) =>
        t.participant &&
        t.participant !== localParticipant.localParticipant &&
        t.source === Track.Source.Microphone &&
        t.publication?.track?.mediaStreamTrack
    );
    return ref?.publication?.track?.mediaStreamTrack ?? null;
  }, [localParticipant.localParticipant, tracks]);

  // Live audio analyzer bound to agent's audio
  const analyzer = useAudioAnalyzer(agentMicTrack, { fftSize: 1024, smoothingTimeConstant: 0.82 });

  const guideSections = useMemo(
    () => [
      {
        title: 'Experience Deep-Dives',
        items: [
          '“Walk me through your role at Acme Corp.”',
          '“How did you scale the payments platform?”',
          '“What impact did your work have on revenue?”',
        ],
      },
      {
        title: 'Interview Prep',
        items: [
          '“Give me a STAR answer for system outages.”',
          '“What questions should I ask a CTO?”',
          '“Mock me on behavioral leadership questions.”',
        ],
      },
      {
        title: 'Tech Refreshers',
        items: [
          '“Explain Kubernetes like I’m interviewing.”',
          '“How do you optimize SQL queries?”',
          '“Compare event-driven vs REST architectures.”',
        ],
      },
      {
        title: 'Story Crafting',
        items: [
          '“Help summarize my machine learning project.”',
          '“Polish my answer about cross-team collaboration.”',
          '“Draft a closing statement for onsite interviews.”',
        ],
      },
    ],
    []
  );

  return (
    <div className="flex flex-col items-center justify-center space-y-8 md:space-y-10 py-8 md:py-12">
      {/* Status Indicator */}
      <div className="flex flex-col items-center space-y-5">
        <div className="status-orb">
          <div className="status-orb-ring" />
          <div
            className={`status-dot ${
              agentState === 'speaking'
                ? 'state-speaking'
                : agentState === 'thinking'
                ? 'state-thinking'
                : agentState === 'listening'
                ? 'state-listening'
                : 'state-idle'
            }`}
          />
        </div>

        <div className="text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white drop-shadow-[0_6px_30px_rgba(56,189,248,0.45)] tracking-wide">
            {getStatusText()}
          </h2>
          <div className="mt-3 flex items-center justify-center gap-3 text-xs md:text-sm text-white/85 font-medium">
            <span className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 bg-emerald-500/15 border border-emerald-400/50 text-emerald-100 shadow-[0_8px_26px_-18px_rgba(34,197,94,0.9)]">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  room.state === 'connected'
                    ? 'bg-green-500'
                    : room.state === 'connecting'
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                }`}
              />
              {room.state}
            </span>
            <span className="text-white/60">•</span>
            <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 bg-sky-500/10 border border-sky-400/50 text-sky-100 shadow-[0_8px_26px_-18px_rgba(14,165,233,0.9)]">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19a3 3 0 0 0-6 0m9-7a4.5 4.5 0 0 0-9 0v.75a2.25 2.25 0 0 1-1.125 1.943l-.9.514A2.25 2.25 0 0 0 6 16.152V17.25A2.25 2.25 0 0 0 8.25 19.5h7.5A2.25 2.25 0 0 0 18 17.25v-1.098a2.25 2.25 0 0 0-1.125-1.943l-.9-.514A2.25 2.25 0 0 1 15 11.75V11.5Z" />
              </svg>
              {room.remoteParticipants.size + 1} participants
            </span>
          </div>
        </div>
      </div>
      {/* Audio Visualizer - radial canvas (real-time) */}
      <div className="w-full flex items-center justify-center">
        <RadialVisualizer
          data={analyzer}
          size={360}
          state={agentState}
        />
      </div>

      {/* Connection Info - subtle */}
      <div className="text-[11px] md:text-xs text-white/65 text-center">
        <p>Room: <span className="font-semibold text-white/80">{room.name}</span></p>
      </div>

      {/* Guide Sections */}
      <div className="w-full max-w-4xl pt-6 md:pt-8">
        <div className="text-center mb-4 md:mb-6">
          <span className="uppercase tracking-[0.45em] text-[11px] md:text-xs text-sky-200/90">
            What you can ask
          </span>
        </div>
        <div className="grid gap-4 md:gap-6 md:grid-cols-2">
          {guideSections.map((section) => (
            <div
              key={section.title}
              className="rounded-2xl border border-white/22 bg-slate-900/70 px-6 py-5 backdrop-blur-md shadow-[0_20px_40px_-18px_rgba(56,189,248,0.55)]"
            >
              <h3 className="text-sm md:text-base font-semibold text-white mb-4">
                {section.title}
              </h3>
              <ul className="space-y-2.5 text-xs md:text-sm text-white/80">
                {section.items.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-[6px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.8)]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Main component
export default function VoiceAgent() {
  const [token, setToken] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string>('');
  const [roomName] = useState('voice-agent-room');

  const fetchToken = useCallback(async () => {
    setIsConnecting(true);
    setError('');
    
    try {
      const response = await fetch(
        `/api/token?roomName=${roomName}&participantName=user-${Date.now()}`
      );
      
      if (!response.ok) {
        throw new Error(`Token fetch failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.token) {
        throw new Error('No token received');
      }
      
      setToken(data.token);
      console.log('Token received successfully');
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Token fetch error:', errorMessage);
      setError(errorMessage);
    } finally {
      setIsConnecting(false);
    }
  }, [roomName]);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  // Loading state
  if (isConnecting || !token) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto"></div>
          <p className="text-gray-600">Connecting to voice agent...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h3 className="text-red-800 font-semibold mb-2">Connection Error</h3>
          <p className="text-red-600 text-sm mb-4">{error}</p>
          <button
            onClick={fetchToken}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // Connected state
  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (!serverUrl) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h3 className="text-red-800 font-semibold mb-2">Configuration Error</h3>
          <p className="text-red-600 text-sm">
            NEXT_PUBLIC_LIVEKIT_URL is not configured. Please check your environment variables.
          </p>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect={true}
      audio={true}
      video={false}
      onConnected={() => {
        console.log('Connected to room');
      }}
      onDisconnected={(reason) => {
        console.log('Disconnected:', reason);
        // Optional: Auto-reconnect (skip if user initiated disconnect)
        if (reason !== DisconnectReason.CLIENT_INITIATED) {
          setTimeout(fetchToken, 2000);
        }
      }}
      onError={(error) => {
        console.error('Room error:', error);
        setError(error.message);
      }}
      className="h-screen w-full"
    >
      <VoiceInterface />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

