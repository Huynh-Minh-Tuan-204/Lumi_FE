import { API_BASE_URL } from '@/constants/api.constants'
import { ApiError } from './base'

export interface AttachmentUploadResponseDto {
  id: number;
  fileName: string;
  encryptedFilePath: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: number;
  uploadedAt: string;
}

export const attachmentsApi = {
  upload: (token: string, file: File | Blob, conversationId?: number, messageId?: number, iv?: string, signature?: string, fileName?: string) => {
    const formData = new FormData()
    formData.append('file', file, fileName)
    if (conversationId) formData.append('conversationId', conversationId.toString())
    if (messageId) formData.append('messageId', messageId.toString())
    if (iv) formData.append('iv', iv)
    if (signature) formData.append('signature', signature)

    console.log(`[AttachmentsAPI] Starting upload: ${fileName}, size=${(file as any).size || '?'}, conv=${conversationId}, hasIV=${!!iv}, hasSig=${!!signature}`);

    return fetch(`${API_BASE_URL}/Attachments/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        "ngrok-skip-browser-warning": "true"
      },
      body: formData
    }).then(async res => {
      if (!res.ok) {
        const errorText = await res.text();
        let errorMessage = errorText;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorJson.message || errorText;
        } catch (e) {
          // not json
        }
        console.error(`[AttachmentsAPI] Upload failed (${res.status}):`, errorMessage);
        throw new ApiError(errorMessage, res.status);
      }
      return res.json() as Promise<AttachmentUploadResponseDto>;
    });
  },

  downloadBlob: (token: string, id: number) => {
    return fetch(`${API_BASE_URL}/Attachments/${id}/download`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true'
      }
    }).then(async res => {
      if (!res.ok) throw new ApiError(await res.text(), res.status);
      return res.blob();
    });
  },
}

