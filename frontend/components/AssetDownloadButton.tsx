import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Download, Loader2, VolumeX } from 'lucide-react'
import { useFixedMenu } from '../hooks/use-fixed-menu'
import { pathToFileUrl } from '../lib/file-url'
import type { Asset } from '../types/project-model'

export function AssetDownloadButton({ asset, className }: {
  asset: Pick<Asset, 'id' | 'path' | 'type'>
  className?: string
}) {
  const { isOpen, setIsOpen, triggerRef, menuRef, style } = useFixedMenu('below')
  const [isSaving, setIsSaving] = useState(false)
  const savingRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [savedPath, setSavedPath] = useState<string | null>(null)
  const menuId = useId()
  const fileName = asset.path.split(/[\\/]/).pop() || `${asset.type}-${asset.id}`

  useEffect(() => {
    if (isOpen) menuRef.current?.querySelector('button')?.focus()
  }, [isOpen, menuRef])

  const downloadOriginal = () => {
    const anchor = document.createElement('a')
    anchor.href = pathToFileUrl(asset.path)
    anchor.download = fileName
    anchor.click()
    setIsOpen(false)
  }

  const downloadMuted = async () => {
    if (savingRef.current) return
    savingRef.current = true
    setIsSaving(true)
    setError(null)
    setSavedPath(null)
    try {
      const downloadsPath = await window.electronAPI.getDownloadsPath()
      const outputPath = await window.electronAPI.showSaveDialog({
        title: 'Download without audio',
        defaultPath: `${downloadsPath}/${fileName.replace(/\.[^.]+$/, '')}-muted.mp4`,
        filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
      })
      if (!outputPath) return

      const result = await window.electronAPI.saveMutedVideo({ sourcePath: asset.path, outputPath })
      if (!result.success) throw new Error(result.error)
      setSavedPath(result.path)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download the video without audio.')
    } finally {
      savingRef.current = false
      setIsSaving(false)
    }
  }

  return (
    <div ref={triggerRef} onClick={e => e.stopPropagation()}>
      <button
        type="button"
        title={asset.type === 'video' ? 'Download video' : 'Download image'}
        aria-label={asset.type === 'video' ? 'Download video' : 'Download image'}
        aria-expanded={asset.type === 'video' ? isOpen : undefined}
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => asset.type === 'video' ? setIsOpen(!isOpen) : downloadOriginal()}
        className={className ?? 'p-1.5 rounded-lg bg-black/40 backdrop-blur-md text-white hover:bg-black/60 transition-colors'}
      >
        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      </button>

      {isOpen && createPortal(
        <div
          id={menuId}
          ref={menuRef}
          role="group"
          aria-label="Download options"
          aria-busy={isSaving}
          style={{
            ...style,
            zIndex: 10020,
            maxHeight: typeof style.top === 'number' ? `calc(100dvh - ${style.top + 8}px)` : undefined,
          }}
          className="w-64 max-h-[60vh] overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-1.5 text-sm text-white shadow-xl"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => {
            e.stopPropagation()
            if (e.key === 'Escape') {
              setIsOpen(false)
              triggerRef.current?.querySelector('button')?.focus()
            }
          }}
        >
          <button
            type="button"
            onClick={downloadOriginal}
            disabled={isSaving}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-zinc-800 disabled:opacity-50"
          >
            <Download className="h-4 w-4 shrink-0" />
            Download original
          </button>
          <button
            type="button"
            onClick={() => void downloadMuted()}
            disabled={isSaving}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-zinc-800 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <VolumeX className="h-4 w-4 shrink-0" />}
            {isSaving ? 'Saving without audio...' : 'Download without audio'}
          </button>
          {error && <p role="alert" className="px-3 py-2 text-xs text-red-400 break-words">{error}</p>}
          {savedPath && (
            <div role="status" className="px-3 py-2 text-xs text-green-400">
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5" />Saved without audio</span>
              <button
                type="button"
                className="mt-1 text-zinc-300 underline hover:text-white"
                onClick={() => {
                  void window.electronAPI.showItemInFolder({ filePath: savedPath })
                    .catch(() => setError('Could not open the download folder.'))
                }}
              >
                Show in folder
              </button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
