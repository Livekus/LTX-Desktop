export function buildSharedVideoPrompt(centerPrompt: string, videoPrompt: string): string {
  const shared = centerPrompt.trim()
  const shot = videoPrompt.trim()
  if (!shared) return videoPrompt
  if (!shot) return shared
  return `Series prompt:\n${shared}\n\nVideo prompt:\n${shot}`
}
