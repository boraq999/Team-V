import { useRef, useCallback } from "react";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

export function useWebRTC({ onStream, onDataChannel }) {
  const pcRef = useRef(null);
  const candidateQueue = useRef([]);

  const createPeer = useCallback(() => {
    console.log("[WebRTC] Creating PeerConnection...");
    if (pcRef.current) pcRef.current.close();
    
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;
    candidateQueue.current = [];

    pc.ontrack = (e) => {
      console.log("[WebRTC] Received remote track:", e.streams[0]);
      if (onStream) onStream(e.streams[0]);
    };

    pc.ondatachannel = (e) => {
      console.log("[WebRTC] Received DataChannel");
      if (onDataChannel) onDataChannel(e.channel);
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[WebRTC] ICE Connection State:", pc.iceConnectionState);
    };

    return pc;
  }, [onStream, onDataChannel]);

  const addStream = useCallback((stream) => {
    const pc = pcRef.current;
    if (!pc || !stream) return;
    console.log("[WebRTC] Adding stream tracks...");
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
  }, []);

  const createOffer = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return null;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    return offer;
  }, []);

  const createAnswer = useCallback(async (offer) => {
    const pc = pcRef.current;
    if (!pc) return null;
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    
    // Process queued candidates
    while (candidateQueue.current.length > 0) {
      const cand = candidateQueue.current.shift();
      await pc.addIceCandidate(cand);
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return answer;
  }, []);

  const setAnswer = useCallback(async (answer) => {
    const pc = pcRef.current;
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
    
    // Process queued candidates
    while (candidateQueue.current.length > 0) {
      const cand = candidateQueue.current.shift();
      await pc.addIceCandidate(cand);
    }
  }, []);

  const addIceCandidate = useCallback(async (candidate) => {
    const pc = pcRef.current;
    if (!pc) return;
    
    if (pc.remoteDescription) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } else {
      candidateQueue.current.push(new RTCIceCandidate(candidate));
    }
  }, []);

  const close = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
  }, []);

  return {
    pc: pcRef,
    createPeer,
    addStream,
    createOffer,
    createAnswer,
    setAnswer,
    addIceCandidate,
    close,
  };
}
