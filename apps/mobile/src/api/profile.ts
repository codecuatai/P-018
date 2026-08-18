import { request } from './client';

export interface UserProfile {
  sub: string;
  email: string;
  role: string;
  full_name?: string;
  phone?: string;
  avatar_url?: string;
  language?: string;
  timezone?: string;
  onboarding_completed?: boolean;
}

export function getProfile(): Promise<UserProfile> {
  return request<UserProfile>('/api/v1/users/me');
}

/** Trả về label thành viên dựa trên role thật từ backend */
export function getMemberLabel(role: string): string {
  switch (role) {
    case 'admin': return 'Admin';
    case 'premium': return 'Premium Member';
    case 'staff': return 'Staff';
    default: return 'Member';
  }
}
