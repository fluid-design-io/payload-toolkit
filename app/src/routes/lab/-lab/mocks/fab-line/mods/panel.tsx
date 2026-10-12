/**
 * The Mods page of World settings: one row that opens the installed mods
 * in a nested sheet, one place to add a mod (a file, a folder, pasted JSON, or
 * a drop anywhere on the scene), and the samples as a gallery. A mod that
 * arrives, from any of those or a share link, is reviewed first: what it adds
 * and, for code, a box to tick before anything runs. It stays mounted while
 * the sheet is closed or shows the World page, so a drop or a share link
 * can open it.
 */
import { Alert, Button, Checkbox, Chip, cn, Description, Disclosure, TextArea, Toast, ToastQueue } from '@heroui/react'
import { RiArrowRightSLine, RiCheckLine, RiClipboardLine, RiDragDropLine, RiFileUploadLine, RiFolderOpenLine } from '@remixicon/react'
import { useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import type { Mode } from '../core/contract'
import type { Art } from '../world/categories'
import type { Contribution } from '../world/slots'
import { useWorld } from '../world/store'
import type { Mod } from '../world/store'
import { artOf, KIND, ModArt, SlotChips, slotsOf } from './art'
import { parseBundle, recipes, serialize } from './data'
import type { Bundle } from './data'
import { focusInstalled, InstalledSheet } from './installed'
import { bundleFromHash, clearHash, shareUrl } from './share'
import cctvJs from './samples/cctv/mod.js?raw'
import cctvJson from './samples/cctv/fabmod.json?raw'
import discoJs from './samples/disco/mod.js?raw'
import discoJson from './samples/disco/fabmod.json?raw'
import teleporterJs from './samples/teleporter/mod.js?raw'
import teleporterJson from './samples/teleporter/fabmod.json?raw'
import towerJs from './samples/tower/mod.js?raw'
import towerJson from './samples/tower/fabmod.json?raw'
import vaporwave from './samples/vaporwave.fabmod.json?raw'

const withCode = (json: string, code: string) => JSON.stringify({ ...JSON.parse(json), main: undefined, code })
const SAMPLES = [
  { label: 'Vaporwave', tier: 'data', text: vaporwave },
  { label: 'Disco', tier: 'code', text: withCode(discoJson, discoJs) },
  { label: 'Tower', tier: 'code', text: withCode(towerJson, towerJs) },
  { label: 'Teleporter', tier: 'code', text: withCode(teleporterJson, teleporterJs) },
  { label: 'CCTV', tier: 'code', text: withCode(cctvJson, cctvJs) },
]
const SAMPLE_BUNDLES = SAMPLES.map((s) => ({ ...s, bundle: parseBundle(s.text) }))
const RISK = "Runs with this site's permissions. Trust the author; an edited copy asks again."

/** A mod waiting on the user: one to review before install, an installed one whose code asks for trust (by id, so it follows the store), or one that failed. */
type Pending =
  | { kind: 'install'; bundle: Bundle; from: string }
  | { kind: 'trust'; id: string }
  | { kind: 'error'; error: string; from: string }

/** Turns dropped or picked files into one bundle: a .json bundle, a lone .js module, or a folder with fabmod.json. */
async function bundleOf(files: { path: string; file: File }[]): Promise<Bundle> {
  const base = (p: string) => p.split('/').pop() ?? p
  const manifest = files.find((f) => base(f.path) === 'fabmod.json')
  if (manifest) {
    const raw = JSON.parse(await manifest.file.text())
    const dir = manifest.path.slice(0, manifest.path.length - 'fabmod.json'.length)
    if (typeof raw.main === 'string') {
      const main = files.find((f) => f.path === dir + raw.main || base(f.path) === raw.main)
      if (!main) throw new Error(`fabmod.json names main "${raw.main}", which is not in the folder.`)
      raw.code = await main.file.text()
      delete raw.main
    }
    return parseBundle(JSON.stringify(raw))
  }
  if (files.length !== 1) throw new Error('Drop one .fabmod.json, one .js module, or a folder with fabmod.json.')
  const { file } = files[0]
  if (/\.(m?js)$/.test(file.name)) {
    const id = file.name.replace(/\.(fabmod\.)?m?js$/, '').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 32) || 'mod'
    return parseBundle(JSON.stringify({ fabmod: 1, id, name: file.name, code: await file.text() }))
  }
  return parseBundle(await file.text())
}

/** Every file under a dropped folder, with its relative path. */
async function walk(entry: FileSystemEntry, out: { path: string; file: File }[]) {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej))
    out.push({ path: entry.fullPath.replace(/^\//, ''), file })
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej))
      if (!batch.length) break
      for (const e of batch) await walk(e, out)
    }
  }
}

export function ModsSection({ mode, onApply, onOpen, onNest }: {
  /** The scene's light or dark mode, for theme swatches. */
  mode: Mode
  /** Selects what a freshly installed mod adds. */
  onApply: (adds: Contribution) => void
  /** Opens the sheet on Mods when a mod arrives from outside it. */
  onOpen: () => void
  /** The installed mods' sheet opened or closed over World settings. */
  onNest: (open: boolean) => void
}) {
  const mods = useWorld((s) => s.mods)
  const [pending, setPending] = useState<Pending | null>(null)
  const [runCode, setRunCode] = useState(false)
  const [paste, setPaste] = useState<string | null>(null)
  const [managing, setManaging] = useState(false)
  const [toasts] = useState(() => new ToastQueue({ maxVisibleToasts: 2 }))
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const folder = useRef<HTMLInputElement>(null)
  const ids = useId()

  const trusting = pending?.kind === 'trust' ? mods.find((m) => m.bundle.id === pending.id && m.status === 'untrusted') : undefined
  const review = pending?.kind === 'install' ? pending.bundle : trusting?.bundle
  // Closing the review unmounts what had focus, so focus comes back to the panel instead of the page.
  const reviewed = useRef(false)
  useEffect(() => {
    if (reviewed.current && !review) root.current?.focus({ preventScroll: true })
    reviewed.current = !!review
  }, [review])
  // The installed row that opened the nested sheet leaves with the last mod, so closing the sheet then has nowhere to put focus.
  const managed = useRef(false)
  useEffect(() => {
    if (managed.current && !managing && !mods.length) root.current?.focus({ preventScroll: true })
    managed.current = managing
  }, [managing, mods.length])

  const manage = (open: boolean) => {
    setManaging(open)
    onNest(open)
  }
  const propose = (from: string, make: () => Promise<Bundle> | Bundle) => {
    onOpen()
    manage(false)
    setRunCode(false)
    Promise.resolve()
      .then(make)
      .then(
        (bundle) => setPending({ kind: 'install', bundle, from }),
        (e: Error) => setPending({ kind: 'error', error: e.message, from }),
      )
  }

  useEffect(() => {
    bundleFromHash().then(
      (b) => b && propose('a share link', () => b),
      (e: Error) => {
        onOpen()
        setPending({ kind: 'error', error: e.message, from: 'a share link' })
      },
    )
    // dragenter and dragleave fire for every element crossed, so a depth count tells when files leave the window.
    // A drag that ends without either (a drop something else handled) is over once the pointer moves again.
    let depth = 0
    const files = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files')
    const reset = () => {
      if (!depth) return
      depth = 0
      setDragging(false)
    }
    const enter = (e: DragEvent) => {
      if (!files(e)) return
      depth += 1
      setDragging(true)
    }
    const leave = (e: DragEvent) => {
      if (!files(e)) return
      depth = Math.max(0, depth - 1)
      if (!depth) setDragging(false)
    }
    const over = (e: DragEvent) => {
      if (files(e)) e.preventDefault()
    }
    const drop = (e: DragEvent) => {
      if (!files(e)) return
      depth = 0
      setDragging(false)
      e.preventDefault()
      const entries = [...(e.dataTransfer?.items ?? [])].map((i) => i.webkitGetAsEntry()).filter((x): x is FileSystemEntry => !!x)
      propose('a dropped file', async () => {
        const list: { path: string; file: File }[] = []
        for (const entry of entries) await walk(entry, list)
        return bundleOf(list)
      })
    }
    addEventListener('dragenter', enter)
    addEventListener('dragleave', leave)
    addEventListener('dragover', over)
    addEventListener('drop', drop)
    addEventListener('pointermove', reset)
    return () => {
      removeEventListener('dragenter', enter)
      removeEventListener('dragleave', leave)
      removeEventListener('dragover', over)
      removeEventListener('drop', drop)
      removeEventListener('pointermove', reset)
    }
  }, [])

  const confirm = async () => {
    const current = pending
    if (!current || current.kind === 'error') return
    const run = async () => {
      if (current.kind === 'trust') return useWorld.trust(current.id)
      const mod = await useWorld.install(current.bundle, runCode)
      if (current.from === 'a share link') clearHash()
      if (mod && mod.status !== 'error') onApply(mod.adds)
    }
    const from = current.kind === 'trust' ? 'its code' : current.from
    setBusy(true)
    try {
      await run()
      setPending((p) => (p === current ? null : p))
    } catch (e) {
      setPending({ kind: 'error', error: String((e as Error).message), from })
    }
    setBusy(false)
  }
  const cancel = () => {
    if (pending?.kind !== 'trust' && pending?.from === 'a share link') clearHash()
    setPending(null)
  }
  const share = async (m: Mod) => {
    try {
      await navigator.clipboard.writeText(await shareUrl(m.bundle))
      toasts.add({ title: `Copied a link to ${m.bundle.name}` }, { timeout: 3000 })
    } catch {
      toasts.add({ title: 'Could not copy the link', variant: 'danger' }, { timeout: 5000 })
    }
  }
  const download = (m: Mod) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(JSON.parse(serialize(m.bundle)), null, 2)], { type: 'application/json' }))
    a.download = `${m.bundle.id}.fabmod.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  /** Removes at once and offers an undo that puts each mod back as it was, so a slip costs nothing. */
  const remove = (ids: string[]) => {
    const removed = useWorld.remove(ids)
    if (!removed.length) return
    const key = toasts.add(
      {
        title: removed.length === 1 ? `Removed ${removed[0].mod.bundle.name}` : `Removed ${removed.length} mods`,
        actionProps: {
          children: 'Undo',
          variant: 'tertiary',
          // The toast region hands focus back only if focus is still inside it, so the restored row takes it before the toast closes.
          onPress: () => {
            flushSync(() => useWorld.restore(removed))
            if (!focusInstalled(removed[0].mod.bundle.id)) root.current?.focus({ preventScroll: true })
            toasts.close(key)
          },
        },
      },
      { timeout: 8000 },
    )
  }

  const installed = new Set(mods.map((m) => m.bundle.id))
  return (
    <div ref={root} tabIndex={-1} className="flex min-h-full flex-col gap-5 pb-2 text-xs outline-none" data-mods>
      {review ? (
        <Review
          bundle={review}
          from={pending?.kind === 'install' ? pending.from : null}
          replaces={pending?.kind === 'install' && installed.has(review.id)}
          art={artOf(review, mods.find((m) => m.bundle.id === review.id)?.adds ?? {}, mode)}
          runCode={!!trusting || runCode}
          onRunCode={trusting ? null : setRunCode}
          busy={busy}
          onConfirm={confirm}
          onCancel={cancel}
        />
      ) : (
        <>
          {pending?.kind === 'error' && (
            <Alert status="danger" data-pending>
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Could not read {pending.from}</Alert.Title>
                <Alert.Description>{pending.error}</Alert.Description>
                <Button size="sm" variant="outline" onPress={cancel} className="mt-2 w-fit">
                  Dismiss
                </Button>
              </Alert.Content>
            </Alert>
          )}

          {mods.length > 0 && <InstalledEntry mods={mods} mode={mode} open={managing} onPress={() => manage(true)} />}

          <div
            className={cn(
              'flex flex-col gap-3 rounded-2xl border-[1.5px] border-dashed border-border p-4 transition-colors',
              !mods.length && 'items-center py-7 text-center',
              dragging && 'border-accent bg-accent/8',
            )}
            data-drop={dragging ? 'over' : 'idle'}
          >
            <div className={cn('flex items-center gap-3', !mods.length && 'flex-col gap-2')}>
              <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl bg-default text-muted', dragging && 'bg-accent text-accent-foreground')}>
                <RiDragDropLine aria-hidden className="size-5" />
              </span>
              <div className="min-w-0 flex-1" aria-live="polite">
                <div className="text-sm font-medium">{dragging ? 'Drop it to review' : mods.length ? 'Add a mod' : 'Add your first mod'}</div>
                <p className="mt-0.5 leading-relaxed text-muted">
                  {mods.length
                    ? 'Drop a .fabmod.json or a mod folder anywhere on the scene, or pick one.'
                    : 'Mods add themes, transports, layouts and more. Drop a .fabmod.json or a mod folder anywhere on the scene, open a share link, or pick one here.'}
                </p>
              </div>
            </div>
            <div className={cn('flex flex-wrap gap-1.5', !mods.length && 'justify-center')}>
              <Button size="sm" variant={mods.length ? 'outline' : 'primary'} onPress={() => file.current?.click()}>
                <RiFileUploadLine aria-hidden className="size-4" />
                File
              </Button>
              <Button size="sm" variant="outline" onPress={() => folder.current?.click()}>
                <RiFolderOpenLine aria-hidden className="size-4" />
                Folder
              </Button>
              <Button size="sm" variant="outline" aria-expanded={paste !== null} onPress={() => setPaste(paste === null ? '' : null)}>
                <RiClipboardLine aria-hidden className="size-4" />
                Paste
              </Button>
            </div>
            {paste !== null && (
              <div className="flex w-full flex-col gap-2 text-start">
                <TextArea
                  autoFocus
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  aria-label="Mod JSON"
                  variant="secondary"
                  placeholder='{ "fabmod": 1, "id": "my-mod", "name": "My mod", "theme": [ … ] }'
                  className="h-24 font-mono text-[10.5px]"
                />
                <div className="flex gap-1.5">
                  <Button size="sm" isDisabled={!paste.trim()} onPress={() => { propose('pasted text', () => parseBundle(paste)); setPaste(null) }}>
                    Review
                  </Button>
                  <Button size="sm" variant="ghost" onPress={() => setPaste(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            <input
              ref={file}
              type="file"
              accept=".json,.fabmod,.js,.mjs,application/json,text/javascript"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) propose(f.name, () => bundleOf([{ path: f.name, file: f }]))
              }}
            />
            <input
              ref={folder}
              type="file"
              hidden
              {...({ webkitdirectory: '' } as object)}
              onChange={(e) => {
                const list = [...(e.target.files ?? [])].map((f) => ({ path: f.webkitRelativePath || f.name, file: f }))
                e.target.value = ''
                if (list.length) propose('a folder', () => bundleOf(list))
              }}
            />
          </div>

          <section aria-labelledby={`${ids}-samples`} className="flex flex-col gap-2">
            <h3 id={`${ids}-samples`} className="text-xs font-medium text-muted">
              Try a sample
            </h3>
            <ul className="-mx-5 flex snap-x scroll-px-5 gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:overflow-visible sm:px-0">
              {SAMPLE_BUNDLES.map((s) => {
                const added = installed.has(s.bundle.id)
                return (
                  <li key={s.label} className="flex w-[150px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl bg-surface-secondary sm:w-auto" data-sample={s.bundle.id}>
                    <ModArt art={artOf(s.bundle, {}, mode)} code={!!s.bundle.code} className="h-16 w-full rounded-none ring-0" />
                    <div className="flex flex-1 flex-col gap-1 p-3">
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-sm font-medium">{s.label}</span>
                        <Chip size="sm" variant="soft">
                          {KIND(s.bundle)}
                        </Chip>
                      </div>
                      <p className="line-clamp-2 leading-relaxed text-muted">{s.bundle.description}</p>
                      <Button
                        size="sm"
                        variant={added ? 'ghost' : 'outline'}
                        aria-label={added ? `Reinstall the ${s.label} sample` : `Add the ${s.label} sample`}
                        onPress={() => propose(`the ${s.label} sample`, () => s.bundle)}
                        className="mt-auto w-fit"
                        data-installed={added || undefined}
                      >
                        {added && <RiCheckLine aria-hidden className="size-4" />}
                        {added ? 'Installed' : 'Add'}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        </>
      )}

      <InstalledSheet
        isOpen={managing}
        onOpenChange={manage}
        mode={mode}
        anchor={root}
        onRemove={remove}
        onAction={(m, action) => {
          if (action === 'link') return share(m)
          if (action === 'save') return download(m)
          manage(false)
          setPending({ kind: 'trust', id: m.bundle.id })
        }}
      />
      <Toast.Provider queue={toasts} placement="top" />
    </div>
  )
}

/** The installed mods folded into one row: their pictures, names and anything that needs the user, opening the full list. */
function InstalledEntry({ mods, mode, open, onPress }: { mods: Mod[]; mode: Mode; open: boolean; onPress: () => void }) {
  const waiting = mods.filter((m) => m.status === 'untrusted').length
  const stopped = mods.filter((m) => m.status === 'error').length
  const attention = [waiting && `${waiting} ${waiting === 1 ? 'needs' : 'need'} trust`, stopped && `${stopped} stopped`].filter(Boolean).join(' · ')
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onPress}
      className="flex shrink-0 cursor-[var(--cursor-interactive)] items-center gap-3 rounded-2xl bg-surface-secondary p-3 text-start outline-none transition-colors hover:bg-surface-tertiary focus-visible:ring-2 focus-visible:ring-focus"
      data-installed-entry
    >
      <span className="flex shrink-0 -space-x-3">
        {mods.slice(0, 3).map((m) => (
          <ModArt key={m.bundle.id} art={artOf(m.bundle, m.adds, mode)} code={!!m.bundle.code} className="size-9 rounded-xl ring-2 ring-surface-secondary dark:ring-surface-secondary" />
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">
          Installed <span className="tabular-nums text-muted">· {mods.length}</span>
        </span>
        <span className="block truncate text-muted">
          {mods.map((m) => m.bundle.name).join(', ')}
          {attention && <span className={stopped ? 'text-danger' : 'text-warning'}> · {attention}</span>}
        </span>
      </span>
      <RiArrowRightSLine aria-hidden className="size-5 shrink-0 text-muted" />
    </button>
  )
}

/**
 * The step before a mod changes anything: who made it, what it adds, and for
 * code what running it means, with the source one tap away. `onRunCode` is
 * null when the user already asked to trust an installed mod's code.
 */
function Review({ bundle, from, replaces, art, runCode, onRunCode, busy, onConfirm, onCancel }: {
  bundle: Bundle
  /** Where a new mod came from; null for an installed one. */
  from: string | null
  /** An installed mod has this id and would be replaced. */
  replaces: boolean
  art: Art
  runCode: boolean
  onRunCode: ((run: boolean) => void) | null
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  const slots = slotsOf(recipes(bundle) as Contribution)
  const action = !onRunCode ? 'Trust and run' : bundle.code && !runCode ? 'Install without code' : 'Install'
  const kb = ((bundle.code?.length ?? 0) / 1024).toFixed(1)
  return (
    <div className="flex flex-1 flex-col gap-4" data-pending data-review={onRunCode ? 'install' : 'trust'}>
      <div className="flex items-center gap-3">
        <ModArt art={art} code={!!bundle.code} className="size-14 rounded-2xl" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 ref={heading} tabIndex={-1} className="truncate text-base font-medium outline-none">
              {bundle.name}
            </h3>
            <Chip size="sm" variant="soft">
              {KIND(bundle)}
            </Chip>
          </div>
          <div className="truncate text-muted">
            {bundle.id}
            {bundle.author && ` · by ${bundle.author}`}
            {from ? ` · from ${from}` : ' · installed'}
          </div>
        </div>
      </div>
      {bundle.description && <p className="leading-relaxed text-muted">{bundle.description}</p>}
      {replaces && <p className="text-warning">Replaces the installed {bundle.name}, and asks again before its code runs.</p>}
      <div className="flex flex-col gap-1.5">
        <div className="font-medium text-muted">Adds</div>
        {slots.length > 0 && <SlotChips slots={slots} />}
        {bundle.code && <p className="text-muted">{slots.length ? 'and whatever its code returns.' : 'Whatever its code returns.'}</p>}
        {!slots.length && !bundle.code && <p className="text-muted">Nothing.</p>}
      </div>
      {bundle.code && (
        <div className="flex flex-col gap-2 rounded-2xl bg-surface-secondary p-3">
          {onRunCode ? (
            <Checkbox isSelected={runCode} onChange={onRunCode}>
              <Checkbox.Content className="text-sm">
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                Run its code · {kb} KB
              </Checkbox.Content>
              <Description>{RISK}</Description>
            </Checkbox>
          ) : (
            <p className="text-muted">
              <span className="font-medium text-foreground">JavaScript · {kb} KB.</span> {RISK}
            </p>
          )}
          <Disclosure>
            <Disclosure.Heading>
              <Disclosure.Trigger className="flex items-center gap-1 text-xs font-medium">
                Read the code
                <Disclosure.Indicator />
              </Disclosure.Trigger>
            </Disclosure.Heading>
            <Disclosure.Content>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-default p-2 font-mono text-[10px]">{bundle.code}</pre>
            </Disclosure.Content>
          </Disclosure>
        </div>
      )}
      <div className="sticky bottom-0 -mx-5 mt-auto flex gap-2 bg-overlay px-5 pt-3 pb-1">
        <Button isDisabled={busy} isPending={busy} onPress={onConfirm}>
          {action}
        </Button>
        <Button variant="tertiary" isDisabled={busy} onPress={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
