import { useEffect, useRef, useState } from 'react';
import { api, getErrorMessage } from '../lib/api.js';

const IDLE_CALL = { status: 'idle' };
const VIDEO_SDK_URL = 'https://cdn.metered.ca/sdk/video/1.4.6/sdk.min.js';
let videoSdkPromise;

function loadVideoSdk() {
  if (window.Metered?.Meeting) return Promise.resolve();
  if (!videoSdkPromise) {
    videoSdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = VIDEO_SDK_URL;
      script.async = true;
      script.onload = () => {
        if (window.Metered?.Meeting) resolve();
        else reject(new Error('Metered Video SDK did not initialize.'));
      };
      script.onerror = () => reject(new Error('Could not load the Metered Video SDK.'));
      document.head.appendChild(script);
    }).catch((error) => {
      videoSdkPromise = null;
      throw error;
    });
  }
  return videoSdkPromise;
}

async function requestMicrophonePermission() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone access is unavailable. Open this site in Safari or Chrome over HTTPS.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  stream.getTracks().forEach((track) => track.stop());
}

export default function VoiceCall({ channel, conversationId, partnerId, partnerName, partnerOnline, showButton, userId, userName }) {
  const [call, setCall] = useState(IDLE_CALL);
  const [feedback, setFeedback] = useState('');
  const [duration, setDuration] = useState(0);
  const callRef = useRef(IDLE_CALL);
  const callIdRef = useRef(null);
  const targetRef = useRef(null);
  const timeoutRef = useRef(null);
  const audioContainerRef = useRef(null);
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
        if (isMountedRef.current) setFeedback('Could not coordinate calls across tabs.');
        resolve(false);
      });
    });
  }

  function updateCall(next) {
    callRef.current = next;
    if (isMountedRef.current) setCall(next);
  }

  function finishCall(message = '') {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    releaseCallLock();
    callIdRef.current = null;
    targetRef.current = null;
    updateCall(IDLE_CALL);
    if (isMountedRef.current) {
      setDuration(0);
      setFeedback(message);
    }
  }

  async function sendSignal(type, callId = callIdRef.current, targetConversationId = targetRef.current?.conversationId) {
    try {
      await api.post(`/calls/${targetConversationId}/signal`, { callId, type });
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

  async function startCall() {
    if (callRef.current.status !== 'idle' || !partnerOnline || !conversationId || !partnerId || !channel) return;
    setFeedback('');
    try {
      await requestMicrophonePermission();
    } catch (error) {
      console.error('[voice-call] microphone permission was not granted:', error);
      setFeedback(getErrorMessage(error, 'Allow microphone access to start a voice call.'));
      return;
    }

    if (!(await acquireCallLock())) {
      setFeedback('A call is already active in another chat tab.');
      return;
    }
    if (callRef.current.status !== 'idle') {
      releaseCallLock();
      return;
    }

    const callId = crypto.randomUUID();
    callIdRef.current = callId;
    targetRef.current = { conversationId, partnerId, partnerName };
    updateCall({ status: 'preparing', callId, partnerName, direction: 'outgoing' });

    try {
      const { data: meeting } = await api.post(`/calls/${conversationId}/voice-room`, { callId });
      if (callIdRef.current !== callId || callRef.current.status !== 'preparing') return;
      updateCall({ status: 'outgoing', callId, meeting, partnerName, direction: 'outgoing' });
      const sent = await sendSignal('invite', callId, conversationId);
      if (!sent && callIdRef.current === callId) {
        finishCall("Couldn't start the call.");
      } else if (sent && callIdRef.current === callId && callRef.current.status === 'outgoing') {
        timeoutRef.current = setTimeout(() => {
          if (callRef.current.status === 'outgoing' && callRef.current.callId === callId) {
            sendHangup(callId, conversationId);
            finishCall('No answer.');
          }
        }, 45_000);
      }
    } catch (error) {
      if (callIdRef.current !== callId) return;
      console.error('[voice-call] failed to prepare Metered room:', error);
      finishCall(getErrorMessage(error, 'Could not prepare the voice call.'));
    }
  }

  async function acceptCall() {
    const currentCall = callRef.current;
    if (currentCall.status !== 'incoming') return;
    setFeedback('');
    try {
      await requestMicrophonePermission();
    } catch (error) {
      console.error('[voice-call] microphone permission was not granted:', error);
      setFeedback(getErrorMessage(error, 'Allow microphone access to answer the voice call.'));
      return;
    }

    if (!(await acquireCallLock())) {
      const callId = currentCall.callId;
      sendSignal('reject', callId, targetRef.current?.conversationId);
      finishCall('Another chat tab is already handling a call.');
      return;
    }
    if (callRef.current.status !== 'incoming' || callRef.current.callId !== currentCall.callId) {
      releaseCallLock();
      return;
    }

    try {
      const target = targetRef.current;
      const { data: meeting } = await api.post(`/calls/${target.conversationId}/voice-token`, { callId: currentCall.callId });
      if (callRef.current.status !== 'incoming' || callRef.current.callId !== currentCall.callId) return;
      updateCall({ ...currentCall, status: 'joining', meeting, partnerName: target.partnerName, direction: 'incoming' });
      const sent = await sendSignal('accept', currentCall.callId, target.conversationId);
      if (!sent && callRef.current.callId === currentCall.callId) finishCall("Couldn't accept the call.");
    } catch (error) {
      if (callRef.current.callId !== currentCall.callId) return;
      console.error('[voice-call] failed to prepare Metered room access:', error);
      sendSignal('reject', currentCall.callId, targetRef.current?.conversationId);
      finishCall(getErrorMessage(error, 'Could not join the voice call.'));
    }
  }

  function declineCall() {
    const currentCall = callRef.current;
    if (currentCall.callId) sendSignal('reject', currentCall.callId);
    finishCall('');
  }

  function hangUp() {
    const currentCall = callRef.current;
    if (currentCall.callId) sendHangup(currentCall.callId);
    finishCall('');
  }

  useEffect(() => {
    isMountedRef.current = true;
    if (!channel) return undefined;

    const onSignal = (signal) => {
      if (signal.type === 'invite') {
        if (callRef.current.status !== 'idle') {
          sendSignal('reject', signal.callId, signal.conversationId);
          return;
        }
        targetRef.current = {
          conversationId: signal.conversationId,
          partnerId: signal.fromUserId,
          partnerName: signal.fromDisplayName || 'Anonymous',
        };
        callIdRef.current = signal.callId;
        updateCall({
          status: 'incoming',
          callId: signal.callId,
          partnerName: signal.fromDisplayName || 'Anonymous',
          direction: 'incoming',
        });
        return;
      }
      if (
        signal.conversationId !== targetRef.current?.conversationId ||
        signal.fromUserId !== targetRef.current?.partnerId ||
        signal.callId !== callIdRef.current
      ) return;

      if (signal.type === 'accept' && callRef.current.status === 'outgoing') {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        updateCall({ ...callRef.current, status: 'joining' });
      } else if (signal.type === 'reject') {
        finishCall('Call declined.');
      } else if (signal.type === 'hangup') {
        finishCall('The other person ended the call.');
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
      releaseCallLock();
      callRef.current = IDLE_CALL;
      callIdRef.current = null;
      targetRef.current = null;
    };
  }, [channel, userId]);

  useEffect(() => {
    if (call.status !== 'joining') return undefined;
    const callId = call.callId;
    const timeout = setTimeout(() => {
      if (callRef.current.callId === callId && callRef.current.status === 'joining') {
        sendHangup(callId);
        finishCall('Could not connect the voice call. Check microphone permission and network access.');
      }
    }, 30_000);
    return () => clearTimeout(timeout);
  }, [call.status, call.callId]);

  useEffect(() => {
    if (call.status !== 'active') return undefined;
    const startedAt = Date.now();
    const interval = setInterval(() => setDuration(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [call.status]);

  const shouldJoinMeeting = call.status === 'joining' || call.status === 'active';
  useEffect(() => {
    if (!shouldJoinMeeting || !call.meeting || !call.callId) return undefined;
    const audioContainer = audioContainerRef.current;
    if (!audioContainer) return undefined;

    let cancelled = false;
    const remoteAudioElements = new Map();
    let meeting;
    const joinVoiceCall = async () => {
      await loadVideoSdk();
      if (cancelled) return;
      meeting = new window.Metered.Meeting();
      const callId = call.callId;
      meeting.on('remoteTrackStarted', ({ streamId, type, track }) => {
        if (cancelled || type !== 'audio' || remoteAudioElements.has(streamId)) return;
        const audio = document.createElement('audio');
        audio.autoplay = true;
        audio.playsInline = true;
        audio.srcObject = new MediaStream([track]);
        audioContainer.append(audio);
        remoteAudioElements.set(streamId, audio);
        audio.play().catch((error) => {
          console.error('[voice-call] remote audio playback was blocked:', error);
        });
      });
      meeting.on('remoteTrackStopped', ({ streamId }) => {
        const audio = remoteAudioElements.get(streamId);
        if (!audio) return;
        audio.pause();
        audio.srcObject = null;
        audio.remove();
        remoteAudioElements.delete(streamId);
      });
      meeting.on('meetingEnded', () => {
        if (callRef.current.callId !== callId || callRef.current.status === 'idle') return;
        sendHangup(callId);
        finishCall('The voice call ended.');
      });
      await meeting.join({
        roomURL: call.meeting.roomURL,
        accessToken: call.meeting.accessToken,
        name: userName || 'Anonymous',
        receiveVideoStreamType: 'none',
      });
      if (cancelled) return;
      await meeting.startAudio();
      if (cancelled || callRef.current.callId !== callId || callRef.current.status === 'idle') return;
      setFeedback('');
      updateCall({ ...callRef.current, status: 'active' });
    };

    joinVoiceCall().catch((error) => {
      if (cancelled) return;
      console.error('[voice-call] Metered voice connection failed:', error);
      sendHangup(call.callId);
      finishCall(getErrorMessage(error, 'Could not connect the voice call.'));
    });

    return () => {
      cancelled = true;
      if (meeting) {
        meeting.leaveMeeting().catch((error) => {
          console.error('[voice-call] failed to leave the Metered meeting:', error);
        });
      }
      for (const audio of remoteAudioElements.values()) {
        audio.pause();
        audio.srcObject = null;
        audio.remove();
      }
      remoteAudioElements.clear();
    };
  }, [call.callId, call.meeting, shouldJoinMeeting, userName]);

  const callVisible = call.status !== 'idle';
  const currentPartnerName = call.partnerName || partnerName || 'Your chat partner';
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
          title={partnerOnline ? 'Start a voice call' : 'Your chat partner is offline'}
        >
          ☎ Voice call
        </button>
      )}
      {feedback && !callVisible && (
        <span role="status" className="basis-full text-right text-xs text-coral-500">{feedback}</span>
      )}
      {callVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Voice call">
          <div className="card flex min-h-[240px] w-full max-w-md flex-col gap-3 p-3 sm:p-5">
            <div className="flex shrink-0 items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-semibold">{currentPartnerName}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{statusText}</p>
              </div>
              {call.status !== 'incoming' && (
                <button type="button" className="btn-secondary !bg-coral-500 !text-white" onClick={hangUp}>
                  End call
                </button>
              )}
            </div>
            {feedback && <p role="status" className="shrink-0 text-sm text-coral-500">{feedback}</p>}
            <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl bg-slate-100 py-8 dark:bg-white/5">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-violet-500/15 text-2xl text-violet-400" aria-hidden="true">
                ☎
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {call.status === 'active' ? 'Voice call connected' : 'Connecting to voice call…'}
              </p>
              <div className="hidden" ref={audioContainerRef} />
            </div>
            {call.status === 'incoming' && (
              <div className="flex shrink-0 justify-center gap-3">
                <button type="button" className="btn-secondary" onClick={declineCall}>Decline</button>
                <button type="button" className="btn-primary" onClick={acceptCall}>Answer</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
