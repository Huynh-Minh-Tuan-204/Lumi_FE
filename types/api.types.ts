export interface ApiErrorResponse {
  error?: string
  message?: string
  errors?: Record<string, string[]>
}

export interface PaginatedResponse<T> {
  items: T[]
  totalCount: number
  pageNumber: number
  pageSize: number
}

export interface TokenResponse {
  accessToken: string
  refreshToken: string
}

// ========== DTOs camelCase (khớp CamelCase policy của .NET) ==========
export interface LoginDto {
  username: string
  password: string
}

export interface RegisterDto {
  employeeCode: string
  username: string
  password: string
  fullName: string
  email: string
  phone: string
  roleId: number
}

export interface RefreshTokenRequestDto {
  refreshToken: string
}

export interface TokenResponseDto {
  accessToken: string
  refreshToken: string
}

export interface CreateGroupDto {
  name: string;
  memberIds: number[];
}

export interface AddMemberDto {
  userId: number;
  roleInConversation: string;
}

export interface CreateAnnouncementDto {
  message: string;
  iv: string;
}

export interface StartMeetingDto {
  title: string;
  scheduledAt?: string;
  participantIds: number[];
}

