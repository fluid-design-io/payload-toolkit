'use client'

import { useEffect, useState, type FormEvent } from 'react'

type ExampleFormProps = {
  formId: string | number
  /** Use the host's real Payload REST prefix if it differs from /api. */
  endpoint?: string
}

export function ExampleForm({ formId, endpoint = '/api/form-submissions' }: ExampleFormProps) {
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setReady(true), [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const form = event.currentTarget
    const fields = new FormData(form)
    setPending(true)
    setSaved(false)
    setError(null)
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form: formId,
          submissionData: ['name', 'email', 'message'].map((field) => ({
            field,
            value: String(fields.get(field) ?? '').trim(),
          })),
        }),
      })
      const body: unknown = await response.json()
      if (!response.ok)
        throw new Error('Your submission could not be saved. Check the fields and try again.')
      if (
        typeof body !== 'object' ||
        body === null ||
        !('doc' in body) ||
        typeof body.doc !== 'object' ||
        body.doc === null ||
        !('id' in body.doc) ||
        (typeof body.doc.id !== 'string' && typeof body.doc.id !== 'number')
      ) {
        throw new Error('The server did not confirm a saved submission. Please try again.')
      }
      setSaved(true)
      form.reset()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Your submission could not be saved. Please try again.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} aria-label="Example contact form">
      <label>
        Name
        <input name="name" autoComplete="name" required maxLength={120} />
      </label>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required maxLength={254} />
      </label>
      <label>
        Message
        <textarea name="message" required maxLength={5000} />
      </label>
      <button type="submit" disabled={!ready || pending}>
        {pending ? 'Sending...' : 'Send'}
      </button>
      <noscript>Enable JavaScript to send this form.</noscript>
      {saved && <p role="status">Thank you. Your submission was saved.</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
