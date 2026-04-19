import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function getAvatarUrl(path?: any) {
  if (!path || typeof path !== 'string') return '';
  if (path.startsWith('http')) return path;
  
  const rawUrl = process.env.NEXT_PUBLIC_API_URL || 'https://mintuan-001-site1.ktempurl.com/api';
  const baseUrl = rawUrl.replace(/\/api\/?$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  if (path.includes('?')) return `${baseUrl}${cleanPath}`;
  return `${baseUrl}${cleanPath}?v=${Math.floor(Date.now() / 10000)}`;
}

export function getAttachmentUrl(id: number, token?: string) {
  const rawUrl = process.env.NEXT_PUBLIC_API_URL || 'https://mintuan-001-site1.ktempurl.com/api';
  let url = `${rawUrl}/Attachments/${id}/download`;
  if (token) {
    url += `?access_token=${token}`;
  }
  return url;
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
  
  const now = new Date()
  const todayStr = now.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
  const dateStr = date.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })

  if (dateStr === todayStr) return 'Hôm nay';
  
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const yesterdayStr = yesterday.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
  
  if (dateStr === yesterdayStr) return 'Hôm qua';

  const dayNameMapping: Record<number, string> = {
    0: 'Chủ Nhật', 1: 'Thứ 2', 2: 'Thứ 3', 3: 'Thứ 4', 4: 'Thứ 5', 5: 'Thứ 6', 6: 'Thứ 7'
  };
  const dayName = dayNameMapping[date.getDay()];
  const datePart = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays < 7 && date.getFullYear() === now.getFullYear()) {
    return `${dayName}, ${datePart}`;
  }

  return `${dayName}, ${datePart}/${date.getFullYear()}`;
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

export function formatZaloRelativeTime(dateInput: string | Date | null) {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 0) return 'Vừa xong';
  if (diffInSeconds < 60) return 'Vài giây';

  if (diffInSeconds < 3600) {
    const min = Math.floor(diffInSeconds / 60);
    return `${min} phút`;
  }

  const isToday = now.toDateString() === date.toDateString();
  if (isToday) {
    const hour = Math.floor(diffInSeconds / 3600);
    if (hour < 12) return `${hour} giờ`;
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = yesterday.toDateString() === date.toDateString();
  if (isYesterday) return 'Hôm qua';

  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  
  if (now.getFullYear() !== date.getFullYear()) {
    const yy = String(date.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
  }

  return `${dd}/${mm}`;
}

