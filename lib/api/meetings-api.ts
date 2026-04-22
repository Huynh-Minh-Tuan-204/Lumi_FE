import { request } from './base'

export const meetingsApi = {
  getMyMeetings: (token: string) =>
    request<any[]>(`/Meetings`, { token }),

  getMeeting: (token: string, idOrCode: string | number) =>
    request<any>(`/Meetings/${idOrCode}`, { token }),

  getMeetingByGuid: (token: string, guid: string) =>
    request<any>(`/Meetings/${guid}`, { token }),

  startGlobalMeeting: (token: string, title?: string, callType: string = 'video') =>
    request<any>(`/Meetings/start-global`, {
      method: 'POST',
      body: JSON.stringify({ title: title, type: callType }),
      token
    }),

  startMeeting: (token: string, conversationId: number, title: string, participantIds: number[], callType: string = 'video') =>
    request<any>(`/Meetings/start/${conversationId}`, {
      method: 'POST',
      body: JSON.stringify({ title: title, type: callType, participantIds: participantIds }),
      token,
    }),

  // ✅ SỬA — cho phép string | number
joinMeeting: (token: string, id: string | number) =>
    request<any>(`/Meetings/${id}/join`, { method: 'POST', token }),

  leaveMeeting: (token: string, id: number) =>
    request<any>(`/Meetings/${id}/leave`, { method: 'POST', token }),

  endMeeting: (token: string, idOrGuid: string | number) =>
    request<any>(`/Meetings/end/${idOrGuid}`, { method: 'POST', token }),

  deleteMeeting: (token: string, idOrGuid: string | number) =>
    request<any>(`/Meetings/${idOrGuid}`, { method: 'DELETE', token }),

  declineCall: (token: string, id: number) =>
    request<any>(`/Meetings/${id}/decline`, { method: 'POST', token }),

  getParticipants: (token: string, id: number) =>
    request<any[]>(`/Meetings/${id}/participants`, { token }),
}

