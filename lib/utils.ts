import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function getAvatarUrl(path?: string) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  
  const rawUrl = process.env.NEXT_PUBLIC_API_URL || 'https://mintuan-001-site1.ktempurl.com/api';
  const baseUrl = rawUrl.replace(/\/api\/?$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  if (path.includes('?')) return `${baseUrl}${cleanPath}`;
  return `${baseUrl}${cleanPath}?v=${Math.floor(Date.now() / 10000)}`;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatToVNTime(dateInput: string | Date | null) {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '...';
  
  return date.toLocaleTimeString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatMessageTime(dateInput: string | Date | null) {
  return formatToVNTime(dateInput);
}

export function formatTime(dateInput: string | Date | null) {
  return formatToVNTime(dateInput);
}

export function formatToVNDate(dateInput: string | Date | null) {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '';
  
  const today = new Date()
  const todayStr = today.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
  const dateStr = date.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })

  if (dateStr === todayStr) return 'Hôm nay';
  
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
  
  if (dateStr === yesterdayStr) return 'Hôm qua';

  return date.toLocaleDateString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });
}

export function getInitials(name: string) {
  if (!name) return 'U';
  return name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
