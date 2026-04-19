import { API_BASE_URL } from '@/constants/api.constants'
import { request, ApiError } from './base'

export const recordingsApi = {
  upload: (token: string, meetingId: number, file: Blob | File, iv: string) => {
    const formData = new FormData()
    formData.append('meetingId', meetingId.toString())
    formData.append('file', file)
    formData.append('iv', iv)

    return fetch(`${API_BASE_URL}/Recordings/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true'
      },
      body: formData
    }).then(async res => {
      if (!res.ok) throw new ApiError(await res.text(), res.status)
      return res.json()
    })
  },

  getMeetingRecordings: (token: string, meetingId: number) =>
    request<any[]>(`/Recordings/meeting/${meetingId}`, { token }),
}

