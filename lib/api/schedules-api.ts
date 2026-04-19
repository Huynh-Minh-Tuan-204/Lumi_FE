import { request } from './base'

export interface ScheduleParticipant {
  userId: number;
  fullName: string;
  avatarPath: string;
  status: string;
}

export interface WorkScheduleResponse {
  id: number;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  location: string;
  userRole: string;
  participants: ScheduleParticipant[];
}

export const schedulesApi = {
  getMySchedules: (token: string) =>
    request<WorkScheduleResponse[]>('/WorkSchedules', { token }),

  getAllSchedules: (token: string) =>
    request<WorkScheduleResponse[]>('/WorkSchedules/all', { token }),

  create: (token: string, data: { title: string; description?: string; startTime: string; endTime: string; location?: string; participantIds?: number[] }) =>
    request<{ message: string; id: number }>('/WorkSchedules', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  updateStatus: (token: string, id: number, status: string) =>
    request<{ message: string }>(`/WorkSchedules/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify(status),
      token,
    }),

  delete: (token: string, id: number) =>
    request<void>(`/WorkSchedules/${id}/delete`, {
      method: 'POST',
      token,
    }),
}

