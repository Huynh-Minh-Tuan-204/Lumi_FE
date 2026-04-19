export const RTC_FALLBACK_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

export const RECORDING_MIME_TYPES = [
  'video/webm;codecs=vp9',
  'video/webm',
  'video/mp4',
]

export const CALL_ICE_FETCH_TIMEOUT_MS = 4000

