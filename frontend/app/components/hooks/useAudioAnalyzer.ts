import { useEffect, useMemo, useRef, useState } from 'react';

export type AnalyzerData = {
  freq: Uint8Array;
  time: Uint8Array;
  level: number; // 0..1 RMS-ish level
};

/**
 * useAudioAnalyzer
 * Connects a MediaStreamTrack to Web Audio API and exposes frequency/time-domain data at ~60fps.
 */
export function useAudioAnalyzer(mediaStreamTrack?: MediaStreamTrack | null, options?: {
  fftSize?: number;
  smoothingTimeConstant?: number;
}) {
  const { fftSize = 1024, smoothingTimeConstant = 0.8 } = options ?? {};
  const [data, setData] = useState<AnalyzerData | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const supportsMotion = useMemo(() => {
    if (typeof window === 'undefined') return true;
    return !window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    // Cleanup previous context/loop when track changes
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      try { sourceRef.current?.disconnect(); } catch {}
      try { analyserRef.current?.disconnect(); } catch {}
      try { audioCtxRef.current?.close(); } catch {}
      sourceRef.current = null;
      analyserRef.current = null;
      audioCtxRef.current = null; // reset
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaStreamTrack?.id]);

  useEffect(() => {
    if (!mediaStreamTrack) return;
    if (!supportsMotion) return; // honor reduced motion

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = smoothingTimeConstant;
    analyserRef.current = analyser;

    const stream = new MediaStream([mediaStreamTrack]);
    const src = ctx.createMediaStreamSource(stream);
    sourceRef.current = src;
    src.connect(analyser);

    const freq = new Uint8Array(analyser.frequencyBinCount);
    const time = new Uint8Array(analyser.fftSize);

    const loop = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(freq);
      analyserRef.current.getByteTimeDomainData(time);

      // Compute simple RMS-ish level from time-domain
      let sum = 0;
      for (let i = 0; i < time.length; i++) {
        const v = (time[i] - 128) / 128; // normalize -1..1
        sum += v * v;
      }
      const rms = Math.sqrt(sum / time.length);
      const level = Math.min(1, rms * 2.2); // scale

      setData({
        freq: new Uint8Array(freq),
        time: new Uint8Array(time),
        level,
      });
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try { src.disconnect(); } catch {}
      try { analyser.disconnect(); } catch {}
      ctx.close().catch(() => {});
    };
  }, [mediaStreamTrack, fftSize, smoothingTimeConstant, supportsMotion]);

  return data;
}


