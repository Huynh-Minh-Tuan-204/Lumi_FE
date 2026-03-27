import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function getAvatarUrl(path?: string) {
  if (!path) return '';
  // Check if it's already an absolute URL
  if (path.startsWith('http')) return path;
  
  const rawUrl = process.env.NEXT_PUBLIC_API_URL || 'https://mintuan-001-site1.ktempurl.com/api';
  const baseUrl = rawUrl.replace(/\/api\/?$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  // Use a stable cache buster if not already provided
  if (path.includes('?')) return `${baseUrl}${cleanPath}`;
  return `${baseUrl}${cleanPath}?v=${Math.floor(Date.now() / 10000)}`; // changes every 10 seconds to avoid flicker but fix stale cache after upload
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
