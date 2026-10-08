import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { APIError, type CollectionBeforeValidateHook, type Plugin } from 'payload'

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** This validates only forms whose administrator enabled toolkitExample. */
const validateExample: CollectionBeforeValidateHook = async ({ data, operation, req }) => {
  if (operation !== 'create' || !data) return data
  const relation: unknown = data.form
  const formId = record(relation) ? relation.id : relation
  if (typeof formId !== 'string' && typeof formId !== 'number') return data

  const form = await req.payload.findByID({
    collection: 'forms',
    id: formId,
    depth: 0,
    overrideAccess: true,
    req,
  })
  if (!record(form) || form.toolkitExample !== true) return data

  const values: unknown = data.submissionData
  if (!Array.isArray(values) || values.length !== 3) {
    throw new APIError('Submit exactly Name, Email and Message.', 400)
  }
  const expected = new Map([
    ['name', 120],
    ['email', 254],
    ['message', 5000],
  ])
  for (const entry of values) {
    if (!record(entry) || typeof entry.field !== 'string' || typeof entry.value !== 'string') {
      throw new APIError('Each example field must have a text value.', 400)
    }
    const limit = expected.get(entry.field)
    if (limit === undefined || !entry.value.trim() || entry.value.length > limit) {
      throw new APIError(
        'Example fields must be unique, nonempty and within their length limits.',
        400,
      )
    }
    if (entry.field === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.value)) {
      throw new APIError('Enter a valid email address.', 400)
    }
    expected.delete(entry.field)
  }
  return data
}

/** Add once to the host's plugins array. Keep the host's native admin user collection. */
export const formsPlugin: Plugin = formBuilderPlugin({
  fields: { payment: false, upload: false },
  formOverrides: {
    fields: ({ defaultFields }) => [
      ...defaultFields,
      {
        name: 'toolkitExample',
        type: 'checkbox',
        defaultValue: false,
        label: 'Validate toolkit example fields',
        admin: { description: 'Require Name, Email and Message for the included example form.' },
      },
    ],
  },
  formSubmissionOverrides: {
    access: {
      create: () => true,
      read: ({ req }) => req.user?.collection === req.payload.config.admin.user,
      update: () => false,
      delete: ({ req }) => req.user?.collection === req.payload.config.admin.user,
    },
    hooks: {
      beforeValidate: [validateExample],
      afterChange: [
        ({ doc, operation, req }) => {
          if (operation === 'create') {
            req.payload.logger.info({ msg: 'Form submission received', submissionId: doc.id })
          }
          return doc
        },
      ],
    },
  },
})
