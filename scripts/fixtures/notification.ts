import { stripVTControlCharacters } from 'node:util'

export function hasSubmissionNotification(log: string, id: string | number) {
  const lines = stripVTControlCharacters(log).split('\n')
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const start = line.indexOf('{')
    if (start >= 0) {
      try {
        const event = JSON.parse(line.slice(start))
        if (event.msg === 'Form submission received' && String(event.submissionId) === String(id))
          return true
      } catch {
        /* Pretty logger events are handled below. */
      }
    }
    if (!line.includes('Form submission received')) continue
    for (const detail of lines.slice(index + 1, index + 9)) {
      if (/^\[|\b(?:INFO|ERROR|WARN|DEBUG|TRACE|FATAL)\b/.test(detail)) break
      const match = detail.match(/^\s*submissionId:\s*(.*?)\s*$/)
      if (match && match[1].replace(/^['"]|['"]$/g, '') === String(id)) return true
    }
  }
  return false
}
