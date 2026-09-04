import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Image, X } from 'lucide-react'
import { imagePathsFromDataTransfer, imagePathsFromFiles } from '../lib/keyframe-drop'
import { pathToFileUrl } from '../lib/file-url'

interface PromptImageSlotsProps {
  imagePaths: readonly string[]
  maxCount: number
  onChange: (imagePaths: string[]) => void
}

export function PromptImageSlots({
  imagePaths,
  maxCount,
  onChange,
}: PromptImageSlotsProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const targetIndexRef = useRef(0)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const normalizedMaxCount = Math.max(1, maxCount)
  const slots = Array.from({ length: normalizedMaxCount }, (_, index) => imagePaths[index] ?? null)

  const applyPaths = (paths: string[], targetIndex: number) => {
    if (paths.length === 0) return
    const next = imagePaths.slice(0, normalizedMaxCount)
    const insertionIndex = Math.min(targetIndex, next.length)
    if (targetIndex < next.length) {
      next.splice(targetIndex, 1, ...paths)
    } else {
      next.splice(insertionIndex, 0, ...paths)
    }
    onChange(next.slice(0, normalizedMaxCount))
  }

  const openPicker = (targetIndex: number) => {
    targetIndexRef.current = targetIndex
    inputRef.current?.click()
  }

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    applyPaths(imagePathsFromFiles(event.target.files ?? []), targetIndexRef.current)
    event.target.value = ''
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>, targetIndex: number) => {
    event.preventDefault()
    setDragOverIndex(null)
    applyPaths(imagePathsFromDataTransfer(event.dataTransfer), targetIndex)
  }

  return (
    <div className="mx-2 mt-2 flex flex-shrink-0 self-start gap-1">
      {slots.map((path, index) => (
        <div
          key={index}
          role="button"
          tabIndex={0}
          title={path ? `Reference image ${index + 1}` : `Add reference image ${index + 1}`}
          className={`relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
            dragOverIndex === index ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-700 hover:border-zinc-500'
          }`}
          onClick={() => openPicker(index)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            openPicker(index)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            setDragOverIndex(index)
          }}
          onDragLeave={() => setDragOverIndex(null)}
          onDrop={(event) => handleDrop(event, index)}
        >
          {path ? (
            <>
              <img src={pathToFileUrl(path)} alt="" className="h-full w-full rounded-md object-cover" />
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onChange(imagePaths.filter((_, imageIndex) => imageIndex !== index))
                }}
                className="absolute -right-1 -top-1 z-10 rounded-full bg-zinc-800 p-0.5 text-zinc-400 hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </>
          ) : (
            <Image className="h-4 w-4 text-zinc-500" />
          )}
        </div>
      ))}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  )
}
