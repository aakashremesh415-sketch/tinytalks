import { useEffect, useRef, useState } from 'react';
import { api, getErrorMessage } from '../lib/api.js';

const IDLE_CALL = { status: 'idle' };

export default function VoiceCall({ channel, conversationId, partnerId, partnerName, partnerOnline, showButton, userId }) {
  const [call, setCall] = useState(IDLE_CALL);
  const [feedback, setFeedback] = useState('');
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const callRef = useRef(IDLE_CALL);
  const peerRef = useRef(null);
  const streamRef = useRef(null);
  const audioRef = useRef(null);
  const callIdRef = useRef(null);
  const targetRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const timeoutRef = useRef(null);
  const connectionTimeoutRef = useRef(null);
  const callLockReleaseRef = useRef(null);
  const isMountedRef = useRef(true);

  function releaseCallLock() {
    const release = callLockReleaseRef.current;
    callLockReleaseRef.current = null;
    release?.();
  }

  function acquireCallLock() {
    if (callLockReleaseRef.current) return Promise.resolve(true);
    if (!navigator.locks?.request) return Promise.resolve(true);
    return new Promise((resolve) => {
      navigator.locks.request(`tinytalks-voice-call:${userId}`, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
        if (!lock) {
          resolve(false);
          return;
        }
        await new Promise((release) => {
          callLockReleaseRef.current = release;
          resolve(true);
        });
      }).catch((error) => {
        console.error('[voice-call] failed to coordinate calls across tabs:', error);
        if (isMountedRef.current) setFeedback('Could not coordinate voice calls across tabs.');
        resolve(false);
      });
    });
  }

  function updateCall(next) {
    if (next.status === 'connecting' && callRef.current.status !== 'connecting') {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = setTimeout(() => {
        if (callRef.current.status !== 'connecting') return;
        const callId = callRef.current.callId;
        sendHangup(callId);
        finishCall('Could not establish a connection. Check the network or TURN server settings and try again.');
      }, 30000);
    } else if (next.status === 'active') {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    callRef.current = next;
    if (isMountedRef.current) setCall(next);
  }

  function closeMedia() {
    clearTimeout(timeoutRef.current);
    clearTimeout(connectionTimeoutRef.current);
    releaseCallLock();
    timeoutRef.current = null;
    connectionTimeoutRef.current = null;
    if (peerRef.current) {
      peerRef.current.onicecandidate = null;
      peerRef.current.ontrack = null;
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.close();
      peerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    pendingCandidatesRef.current = [];
    callIdRef.current = null;
    targetRef.current = null;
    if (isMountedRef.current) {
      setMuted(false);
      setDuration(0);
    }
  }

  function finishCall(message = '') {
    closeMedia();
    updateCall(IDLE_CALL);
    if (isMountedRef.current) setFeedback(message);
  }

  async function sendSignal(type, data, callId = callIdRef.current, targetConversationId = targetRef.current?.conversationId) {
    try {
      await api.post(`/calls/${targetConversationId}/signal`, { callId, type, data });
      return true;
    } catch (error) {
      if (isMountedRef.current) setFeedback(getErrorMessage(error, "Couldn't send the call signal."));
      return false;
    }
  }

  async function sendHangup(callId, targetConversationId = targetRef.current?.conversationId) {
    try {
      await api.post(`/calls/${targetConversationId}/signal`, { callId, type: 'hangup' });
    } catch (error) {
      if (isMountedRef.current) setFeedback(getErrorMessage(error, "Couldn't notify the other person that the call ended."));
    }
  }

  async function createPeerConnection(callId) {
    const { data } = await api.get('/calls/ice-servers');
    if (!Array.isArray(data.iceServers) || data.iceServers.length === 0) {
      throw new Error('Voice call connection settings are unavailable.');
    }
    if (callIdRef.current !== callId) return null;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (callIdRef.current !== callId) {
      stream.getTracks().forEach((track) => track.stop());
      return null;
    }
    streamRef.current = stream;
    const peer = new RTCPeerConnection({ iceServers: data.iceServers });
    peerRef.current = peer;
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));

    peer.onicecandidate = (event) => {
      if (!event.candidate || !callIdRef.current) return;
      sendSignal('candidate', event.candidate.toJSON()).then((sent) => {
        if (!sent) finishCall("Couldn't establish the call connection.");
      });
    };
    peer.ontrack = (event) => {
      if (audioRef.current) {
        audioRef.current.srcObject = event.streams[0];
        audioRef.current.play().catch(() => {
          if (isMountedRef.current) setFeedback('Tap the call audio to start playback.');
        });
      }
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
        updateCall({ ...callRef.current, status: 'active' });
        setFeedback('');
      } else if (peer.connectionState === 'failed') {
        finishCall('Could not establish a connection. Check the network or TURN server settings and try again.');
      } else if (peer.connectionState === 'disconnected') {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = setTimeout(() => {
          if (peer.connectionState === 'disconnected') finishCall('The call connection was lost.');
        }, 10000);
      }
    };
    return peer;
  }

  async function addCandidate(candidate) {
    const peer = peerRef.current;
    if (!peer) return;
    if (!peer.remoteDescription) {
      pendingCandidatesRef.current.push(candidate);
      return;
    }
    await peer.addIceCandidate(new RTCIceCandidate(candidate));
  }

  async function flushCandidates() {
    const candidates = pendingCandidatesRef.current.splice(0);
    for (const candidate of candidates) {
      await peerRef.current?.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  async function startCall() {
    if (callRef.current.status !== 'idle' || !partnerOnline || !conversationId || !partnerId || !channel) return;
    setFeedback('');
    if (!(await acquireCallLock())) {
      setFeedback('A voice call is already active in another chat tab.');
      return;
    }
    if (callRef.current.status !== 'idle') {
      releaseCallLock();
      return;
    }
    targetRef.current = { conversationId, partnerId, partnerName };
    const callId = crypto.randomUUID();
    callIdRef.current = callId;
    updateCall({ status: 'preparing', callId, partnerName, direction: 'outgoing' });
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
        finishCall();
        setFeedback("This browser doesn't support voice calls.");
        return;
      }
      const peer = await createPeerConnection(callId);
      if (!peer || callRef.current.callId !== callId || callRef.current.status !== 'preparing') return;
      updateCall({ status: 'outgoing', callId, partnerName, direction: 'outgoing' });
      const sent = await sendSignal('invite');
      if (!sent && callRef.current.callId === callId) finishCall("Couldn't start the call.");
      else if (sent && callRef.current.callId === callId && callRef.current.status === 'outgoing') {
        timeoutRef.current = setTimeout(() => {
          if (callRef.current.status === 'outgoing' && callRef.current.callId === callId) {
            sendHangup(callId);
            finishCall('No answer.');
          }
        }, 45000);
      }
    } catch (error) {
      if (callRef.current.callId !== callId) return;
      closeMedia();
      updateCall(IDLE_CALL);
      setFeedback(error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError'
        ? 'Allow microphone access to make a voice call.'
        : getErrorMessage(error, 'Could not access your microphone.'));
    }
  }

  async function acceptCall() {
    const currentCall = callRef.current;
    if (currentCall.status !== 'incoming') return;
    setFeedback('');
    if (!(await acquireCallLock())) {
      finishCall('Another chat tab is already handling a voice call.');
      return;
    }
    if (callRef.current.status !== 'incoming' || callRef.current.callId !== currentCall.callId) {
      releaseCallLock();
      return;
    }
    updateCall({ ...currentCall, status: 'preparing', direction: 'incoming' });
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
        updateCall(currentCall);
        setFeedback("This browser doesn't support voice calls.");
        return;
      }
      const peer = await createPeerConnection(currentCall.callId);
      if (!peer || callRef.current.callId !== currentCall.callId || callRef.current.status !== 'preparing') return;
      updateCall({ ...callRef.current, status: 'connecting', partnerName: currentCall.fromDisplayName || partnerName });
      const sent = await sendSignal('accept', undefined, currentCall.callId);
      if (!sent) finishCall("Couldn't accept the call.");
    } catch (error) {
      if (callRef.current.callId !== currentCall.callId) return;
      sendSignal('reject', undefined, currentCall.callId);
      finishCall(error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError'
        ? 'Allow microphone access to answer the call.'
        : getErrorMessage(error, 'Could not access your microphone.'));
    }
  }

  function declineCall() {
    const callId = callRef.current.callId;
    sendSignal('reject', undefined, callId);
    finishCall('');
  }

  function hangUp() {
    const currentCall = callRef.current;
    if (currentCall.callId && !(currentCall.direction === 'outgoing' && currentCall.status === 'preparing')) {
      sendHangup(currentCall.callId);
    }
    finishCall('');
  }

  function toggleMute() {
    const nextMuted = !muted;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
    setMuted(nextMuted);
  }

  useEffect(() => {
    isMountedRef.current = true;
    if (!channel) return undefined;

    const onSignal = async (signal) => {
      if (signal.type === 'invite') {
        if (callRef.current.status !== 'idle') {
          sendSignal('reject', undefined, signal.callId, signal.conversationId);
          return;
        }
        targetRef.current = {
          conversationId: signal.conversationId,
          partnerId: signal.fromUserId,
          partnerName: signal.fromDisplayName || 'Anonymous',
        };
        callIdRef.current = signal.callId;
        updateCall({ status: 'incoming', callId: signal.callId, fromDisplayName: signal.fromDisplayName, direction: 'incoming' });
        return;
      }
      if (
        signal.conversationId !== targetRef.current?.conversationId ||
        signal.fromUserId !== targetRef.current?.partnerId ||
        signal.callId !== callIdRef.current
      ) return;

      try {
        if (signal.type === 'accept' && callRef.current.status === 'outgoing') {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
          const peer = peerRef.current;
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          updateCall({ ...callRef.current, status: 'connecting' });
          if (!(await sendSignal('offer', { type: peer.localDescription.type, sdp: peer.localDescription.sdp }))) {
            finishCall("Couldn't start the call.");
          }
        } else if (signal.type === 'offer' && callRef.current.status === 'connecting') {
          const peer = peerRef.current;
          await peer.setRemoteDescription(new RTCSessionDescription(signal.data));
          await flushCandidates();
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          if (!(await sendSignal('answer', { type: peer.localDescription.type, sdp: peer.localDescription.sdp }))) {
            finishCall("Couldn't answer the call.");
          }
        } else if (signal.type === 'answer' && callRef.current.status === 'connecting') {
          await peerRef.current.setRemoteDescription(new RTCSessionDescription(signal.data));
          await flushCandidates();
        } else if (signal.type === 'candidate') {
          await addCandidate(signal.data);
        } else if (signal.type === 'reject') {
          finishCall('Call declined.');
        } else if (signal.type === 'hangup') {
          finishCall('The other person ended the call.');
        }
      } catch (error) {
        console.error('[voice-call] signaling failed:', error);
        finishCall('The call could not be connected.');
        sendHangup(signal.callId, signal.conversationId);
      }
    };

    const onCallClaimed = ({ conversationId: claimedConversationId, callId, fromUserId }) => {
      if (
        fromUserId === userId &&
        claimedConversationId === targetRef.current?.conversationId &&
        callId === callIdRef.current &&
        callRef.current.status === 'incoming'
      ) {
        finishCall('Call answered in another session.');
      }
    };

    const onCallClosed = ({ conversationId: closedConversationId, callId, fromUserId }) => {
      if (
        fromUserId === userId &&
        closedConversationId === targetRef.current?.conversationId &&
        callId === callIdRef.current
      ) {
        finishCall('Call ended in another session.');
      }
    };

    channel.bind('call:signal', onSignal);
    channel.bind('call:claimed', onCallClaimed);
    channel.bind('call:closed', onCallClosed);
    return () => {
      channel.unbind('call:signal', onSignal);
      channel.unbind('call:claimed', onCallClaimed);
      channel.unbind('call:closed', onCallClosed);
      const callId = callIdRef.current;
      if (callId) {
        api.post(`/calls/${targetRef.current?.conversationId}/signal`, { callId, type: 'hangup' }).catch((error) => {
          console.error('[voice-call] failed to notify partner on unmount:', error);
        });
      }
      isMountedRef.current = false;
      closeMedia();
      callRef.current = IDLE_CALL;
    };
  }, [channel, userId]);

  useEffect(() => {
    if (call.status !== 'active') return undefined;
    const startedAt = Date.now();
    const interval = setInterval(() => setDuration(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [call.status]);

  const callVisible = call.status !== 'idle';
  const currentPartnerName = call.partnerName || call.fromDisplayName || partnerName || 'Your chat partner';
  const statusText = call.status === 'incoming'
    ? `${currentPartnerName} is calling`
    : call.status === 'outgoing'
      ? `Calling ${currentPartnerName}…`
      : call.status === 'active'
        ? `On call · ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`
        : 'Connecting…';

  return (
    <>
      {showButton && (
        <button
          type="button"
          className="btn-secondary !py-1.5 !px-3 text-sm"
          onClick={startCall}
          disabled={!partnerOnline || !channel || call.status !== 'idle'}
          title={partnerOnline ? 'Start a free voice call' : 'Your chat partner is offline'}
        >
          ☎ Voice call
        </button>
      )}
      {feedback && !callVisible && (
        <span role="status" className="basis-full text-right text-xs text-coral-500">{feedback}</span>
      )}
      {callVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Voice call">
          <div className="card w-full max-w-sm p-6 text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-violet-500/15 text-3xl">☎</div>
            <div>
              <p className="font-display text-lg font-semibold">{currentPartnerName}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{statusText}</p>
            </div>
            {feedback && <p role="status" className="text-sm text-coral-500">{feedback}</p>}
            <audio ref={audioRef} autoPlay playsInline />
            {call.status === 'incoming' ? (
              <div className="flex justify-center gap-3">
                <button type="button" className="btn-secondary" onClick={declineCall}>Decline</button>
                <button type="button" className="btn-primary" onClick={acceptCall}>Answer</button>
              </div>
            ) : (
              <div className="flex justify-center gap-3">
                {call.status === 'active' && (
                  <button type="button" className="btn-secondary" onClick={toggleMute}>
                    {muted ? 'Unmute' : 'Mute'}
                  </button>
                )}
                <button type="button" className="btn-secondary !bg-coral-500 !text-white" onClick={hangUp}>
                  End call
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
