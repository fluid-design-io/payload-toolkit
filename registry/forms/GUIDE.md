# Integrate Payload forms

Guide version 0.1.0. This item targets Payload 4.0.0-canary.38, Next.js or TanStack Start, and MongoDB or PostgreSQL. It installs source and the official form-builder dependency. Your application's configuration and routes still need integration.

## Inspect the application

Read the project's agent instructions first. Locate its actual Payload config, native admin user collection, REST route mount, framework routes and generation scripts. Keep the existing database, authentication, email adapter and access policies. Do not install Better Auth. Check for existing Forms/Form Submissions collections or a form-builder plugin before adding another owner.

The files are relative to the application root:

- `payload-toolkit/forms/plugin.ts` exports `formsPlugin`.
- `payload-toolkit/forms/example-form.tsx` exports `ExampleForm`.
- `docs/payload-toolkit/forms/GUIDE.md` is this guide.

These paths do not assume a `src` directory or a path alias. Use real relative imports. If the host compiler restricts source to another directory, move these developer-owned files together and update imports. Review the diff afterward. A later `add forms` refuses divergent installed files rather than upgrading them.

## Register the plugin

Add `formsPlugin` once to the existing `plugins` array in the Payload config. Preserve every existing plugin and the native collection with `auth: true` selected by `admin.user`.

```ts
import { formsPlugin } from '../payload-toolkit/forms/plugin'

// In the existing buildConfig call, preserve the host's existing plugin list:
plugins: [...existingPlugins, formsPlugin]
```

The official plugin owns `forms` and `form-submissions`. Public callers can create submissions. Reads and deletes require a native user from the configured admin collection; updates are disabled. If the host has narrower admin authorization, apply it explicitly and verify it. The item adds a create-only console notification with the persisted submission ID. It does not log submitted values or replace configured email delivery. Leave example form emails empty to test console notifications without a mail provider.

## Create the example form

Sign in to the native Payload admin and create a Forms document with:

- A title such as `Contact example`.
- `Validate toolkit example fields` enabled.
- Required Text field named `name`, required Email field named `email`, required Textarea field named `message`.
- Confirmation type `message`, a required confirmation message such as `Thank you`, and no configured emails.

Copy the saved form ID. The `toolkitExample` checkbox activates server validation for exactly those three fields. The server rejects missing, duplicate or unknown fields, empty text, invalid email syntax and values exceeding 120, 254 and 5000 characters respectively. Other forms retain the upstream plugin behavior. This example is not a generic dynamic-field validator.

## Add a real route

The `ExampleForm` component accepts a saved form ID and an optional `endpoint`. Use the actual REST mount, which is commonly `/api/form-submissions`. Never embed database URLs, Payload secrets or admin credentials in client code. The example awaits a successful HTTP response containing a saved document ID before showing confirmation.

The example requires JavaScript. Send stays disabled until the client handler is ready, so an early click cannot submit the fields through the browser's default GET behavior.

For a Next App Router project, a route can render the component directly:

```tsx
import { ExampleForm } from '../../../payload-toolkit/forms/example-form'

export default function ContactPage() {
  return <ExampleForm formId="REPLACE_WITH_SAVED_FORM_ID" />
}
```

For TanStack Start, use the host's file-route convention:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { ExampleForm } from '../../payload-toolkit/forms/example-form'

export const Route = createFileRoute('/contact')({
  component: () => <ExampleForm formId="REPLACE_WITH_SAVED_FORM_ID" />,
})
```

Adjust imports to the actual route depth. A public form ID is ordinary configuration; load it through the host's existing server/data-loading conventions if appropriate. Do not import the server plugin into a client route. Keep the official Payload framework route adapter. No Next-specific imports belong in the portable example or the TanStack route.

## Generate and verify

Run the project's official import-map and Payload type-generation scripts, including any framework-generated route types, then typecheck and build. Start the application against its configured development database. Installation alone does not provision or validate that database.

Verify all of the following:

1. Native admin login works and the Forms and Form Submissions collections appear.
2. Valid browser input produces one saved submission with the three expected values. Confirmation appears after the response.
3. The admin can read the saved submission; an anonymous read of that same document fails.
4. Direct HTTP submissions with an invalid email, missing field or duplicate field fail even when browser validation is bypassed.
5. An invalid form ID and a stopped server produce visible errors instead of confirmation.
6. Server logs contain `Form submission received` with that saved submission ID. This establishes console notification, not email delivery.

Record the source revision, installed item/guide identity, commands and actual outcomes. A successful agent invocation is separate from passing these checks. Review changes to the host's access rules and routes before committing.
