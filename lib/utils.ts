import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function getAvatarUrl(path?: string) {
  if (!path) return '';
  // Check if it's already an absolute URL
  if (path.startsWith('http')) return path;
  
  const baseUrl = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/api\/?$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  // Use a stable cache buster if not already provided
  if (path.includes('?')) return `${baseUrl}${cleanPath}`;
  return `${baseUrl}${cleanPath}?v=${new Date().getMinutes()}`; // Changes every minute to avoid super-frequent refreshes but fix stale cache
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
