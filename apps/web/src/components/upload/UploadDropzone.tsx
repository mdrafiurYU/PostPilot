'use client'

import { useRef, useState, DragEvent, ChangeEvent } from 'react'
import { createAsset } from '@/lib/api/assets'
import { validateUploadFile } from '@/lib/validation'

interface UploadDropzoneProps {
  onUploadComplete?: (assetId: string) => void
  onProgress?: (progress: number) => void
}

export function UploadDropzone({ onUploadComplete, onProgress }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)

  async function handleFile(file: File) {
    setError(null)
    setPendingFile(file)

    const result = validateUploadFile({ name: file.name, size: file.size, type: file.type })
    if (!result.valid) {
      setError(result.error)
      setPendingFile(null)
      return
    }

    try {
      const { asset, presigned_url } = await createAsset({
        filename: file.name,
        media_type: file.type.startsWith('video/') ? 'video' : 'image',
        size_bytes: file.size,
      })

      await uploadToS3(file, presigned_url, asset.id)
    } catch {
      setError('Upload failed. Please try again.')
      setProgress(null)
    }
  }

  function uploadToS3(file: File, presignedUrl: string, assetId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhrRef.current = xhr

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100)
          setProgress(pct)
          onProgress?.(pct)
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setProgress(100)
          setPendingFile(null)
          onUploadComplete?.(assetId)
          resolve()
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`))
        }
      })

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'))
      })

      xhr.open('PUT', presignedUrl)
      xhr.setRequestHeader('Content-Type', file.type)
      xhr.send(file)
    })
  }

  function handleRetry() {
    if (pendingFile) {
      setError(null)
      setProgress(null)
      handleFile(pendingFile)
    }
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave() {
    setIsDragging(false)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  return (
    <div>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? '#6366f1' : '#d1d5db'}`,
          borderRadius: 8,
          padding: 32,
          textAlign: 'center',
          cursor: 'pointer',
          background: isDragging ? '#eef2ff' : '#f9fafb',
        }}
        role="button"
        aria-label="Upload file"
      >
        <p style={{ margin: 0, color: '#6b7280' }}>
          Drag and drop a file here, or click to select
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#9ca3af' }}>
          MP4, MOV, WebM up to 10 GB · JPEG, PNG, GIF up to 500 MB
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".mp4,.mov,.webm,.jpeg,.jpg,.png,.gif"
          style={{ display: 'none' }}
          onChange={handleInputChange}
        />
      </div>

      {progress !== null && !error && (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              height: 8,
              background: '#e5e7eb',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                background: '#6366f1',
                transition: 'width 0.2s',
              }}
            />
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>{progress}%</p>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 12, color: '#dc2626', fontSize: 14 }}>
          <span>{error}</span>
          {pendingFile && (
            <button
              onClick={handleRetry}
              style={{
                marginLeft: 8,
                color: '#6366f1',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
                fontSize: 14,
              }}
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  )
}
