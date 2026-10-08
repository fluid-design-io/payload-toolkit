import { execFileSync } from 'node:child_process'

// Tests run in Bun; subprocesses exercise the delivered CLI and fixtures in Node.
export const nodeExecutable = execFileSync('node', ['-p', 'process.execPath'], {
  encoding: 'utf8',
}).trim()
