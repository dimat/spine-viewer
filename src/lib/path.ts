export function joinPath(folderPath: string, relativePath: string): string {
  const sep = folderPath.includes('\\') ? '\\' : '/'
  return folderPath.replace(/[/\\]+$/, '') + sep + relativePath.replace(/^[/\\]+/, '')
}
