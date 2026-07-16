interface UploadProgressProps {
  progress: number // 0-100
}

export function UploadProgress({ progress }: UploadProgressProps) {
  return (
    <div className="w-full">
      <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
        <div
          className="h-full bg-indigo-500 transition-all duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-1 text-sm text-gray-500">{progress}%</p>
    </div>
  )
}
