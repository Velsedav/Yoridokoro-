export type ChapterInputSubjectType = 'academic' | 'music'

/**
 * Turns the subject editor's compact chapter syntax into the exact names that
 * will be created. This function is deliberately shared by the live preview
 * and the save action so the two cannot drift apart.
 */
export function buildChapterNames(
  rawValue: string,
  existingMain: number,
  subjectType: ChapterInputSubjectType,
): string[] {
  const value = rawValue.trim()
  if (!value) return []

  if (rawValue.includes('\n')) {
    return rawValue
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map((line, index) => subjectType === 'music'
        ? line
        : `Chapt. ${existingMain + index + 1} ${line}`)
  }

  if (subjectType === 'music') return [value]

  const parsed = Number.parseInt(value, 10)
  if (!Number.isNaN(parsed) && parsed.toString() === value && parsed > 0 && parsed <= 50) {
    return Array.from({ length: parsed }, (_, index) => `Chapt. ${existingMain + index + 1}`)
  }

  if (value.includes('(')) {
    const groups: { name: string; subs: string[] }[] = []
    let depth = 0
    let current = ''

    for (const char of `${value},`) {
      if (char === '(') depth++
      else if (char === ')') depth--

      if (char === ',' && depth === 0) {
        const piece = current.trim()
        if (piece) {
          const match = piece.match(/^(.+?)\s*\((.+)\)\s*$/)
          groups.push(match
            ? { name: match[1].trim(), subs: match[2].split(',').map(sub => sub.trim()).filter(Boolean) }
            : { name: piece, subs: [] })
        }
        current = ''
      } else {
        current += char
      }
    }

    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const names: string[] = []
    let chapterNumber = existingMain
    for (const group of groups) {
      chapterNumber++
      names.push(`Chapt. ${chapterNumber} ${group.name}`)
      group.subs.forEach((sub, index) => {
        names.push(`  ${index < letters.length ? letters[index] : index + 1}. ${sub}`)
      })
    }
    return names
  }

  return [`Chapt. ${existingMain + 1} ${value}`]
}
