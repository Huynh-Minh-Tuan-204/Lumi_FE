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

// ========== DTOs PascalCase (khớp C#) ==========
export interface LoginDto {
  Username: string
  Password: string
}

export interface RegisterDto {
  EmployeeCode: string
  Username: string
  Password: string
  FullName: string
  Email: string
  Phone: string
  RoleId: number
}

export interface RefreshTokenRequestDto {
  RefreshToken: string
}

export interface TokenResponseDto {
  AccessToken: string
  RefreshToken: string
}

export interface CreateGroupDto {
  Name: string;
  MemberIds: number[];
}

export interface AddMemberDto {
  UserId: number;
  RoleInConversation: string;
}

export interface CreateAnnouncementDto {
  Message: string;
  IV: string;
}

export interface StartMeetingDto {
  Title: string;
  ScheduledAt?: string;
  ParticipantIds: number[];
}

