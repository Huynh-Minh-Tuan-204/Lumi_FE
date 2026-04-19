'use client'

interface AttachmentImageProps {
  src: string
  alt?: string
  className?: string
  title?: string
  onClick?: () => void
}

export function AttachmentImage({ src, alt, className, title, onClick }: AttachmentImageProps) {
  return (
    <img
      src={src}
      alt={alt || "attachment"}
      className={className}
      title={title}
      onClick={onClick}
      onError={(e) => {
        const target = e.currentTarget
        target.onerror = null
        target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='280' height='160'%3E%3Crect width='280' height='160' fill='%23f3f4f6' rx='8'/%3E%3Ctext x='50%25' y='45%25' text-anchor='middle' dy='.3em' fill='%239ca3af' font-size='13' font-family='sans-serif'%3EKhông tải được ảnh%3C/text%3E%3Ctext x='50%25' y='65%25' text-anchor='middle' fill='%23d1d5db' font-size='10' font-family='sans-serif'%3E(File có thể đã bị xóa khỏi server)%3C/text%3E%3C/svg%3E"
      }}
    />
  )
}

