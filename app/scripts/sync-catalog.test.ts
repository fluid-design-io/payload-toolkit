import { describe, expect, test } from 'bun:test'
import { capturedImage, imageUrl, previewFields } from './sync-catalog'

const base = 'https://www.payload-components.xyz/r/hero-basic.json'

describe('imageUrl', () => {
  test('an absent image is omitted', () => {
    expect(imageUrl(undefined, 'meta.image', base)).toBe(undefined)
  })

  test('an absolute https image is kept', () => {
    expect(imageUrl('https://cdn.example.com/hero.png', 'meta.image')).toBe(
      'https://cdn.example.com/hero.png',
    )
  })

  test('a relative image resolves against the registry item URL', () => {
    expect(imageUrl('../previews/hero-basic.webp', 'meta.image', base)).toBe(
      'https://www.payload-components.xyz/previews/hero-basic.webp',
    )
  })

  test('other schemes, relative values without a base and non-strings throw', () => {
    expect(() => imageUrl('http://cdn.example.com/hero.png', 'meta.image')).toThrow(
      'meta.image must be an https URL: http://cdn.example.com/hero.png',
    )
    expect(() => imageUrl('data:image/png;base64,AAAA', 'meta.image', base)).toThrow(
      'meta.image must be an https URL: data:image/png;base64,AAAA',
    )
    expect(() => imageUrl('hero.png', 'meta.image')).toThrow(
      'meta.image is not a valid URL: hero.png',
    )
    expect(() => imageUrl(42, 'meta.image')).toThrow('meta.image must be a non-empty string')
  })
})

describe('previewFields', () => {
  test('directory templates support a registry without upstream metadata', () => {
    expect(
      previewFields(
        {},
        { url: 'https://example.com/preview/{name}', image: 'https://cdn.example.com/{name}.webp' },
        'hero-basic',
        base,
      ),
    ).toEqual({
      previewUrl: 'https://example.com/preview/hero-basic',
      image: 'https://cdn.example.com/hero-basic.webp',
    })
  })

  test('each field uses item override, upstream metadata, legacy image, then default', () => {
    const configured = {
      url: 'https://example.com/{name}',
      image: 'https://example.com/{name}.png',
      items: { 'hero-basic': { url: 'https://other.example.com/demo' } },
    }
    expect(
      previewFields(
        { preview: { url: '/demo', image: '../thumb.webp' }, image: '/legacy.png' },
        configured,
        'hero-basic',
        base,
      ),
    ).toEqual({
      previewUrl: 'https://other.example.com/demo',
      image: 'https://www.payload-components.xyz/thumb.webp',
    })
    expect(previewFields({ image: '/legacy.png' }, configured, 'other', base).image).toBe(
      'https://www.payload-components.xyz/legacy.png',
    )
    expect(previewFields({}, undefined, 'hero-basic', base)).toEqual({})
  })

  test('per-item opt out and upstream opt out preserve placeholder behavior', () => {
    expect(
      previewFields(
        { image: '/image.png' },
        { url: 'https://example.com/{name}', items: { 'hero-basic': false } },
        'hero-basic',
        base,
      ),
    ).toEqual({})
    expect(
      previewFields({ preview: false }, { url: 'https://example.com/{name}' }, 'hero-basic', base),
    ).toEqual({})
    expect(
      previewFields(
        { preview: false },
        { items: { 'hero-basic': { url: 'https://example.com/demo' } } },
        'hero-basic',
        base,
      ),
    ).toEqual({ previewUrl: 'https://example.com/demo' })
  })

  test('unsafe URLs and unknown or repeated template placeholders are rejected', () => {
    for (const url of [
      'javascript:alert(1)',
      'https://user:pass@example.com/demo',
      'https://example.com/{other}',
      'https://example.com/{name}/{name}',
    ])
      expect(() => previewFields({}, { url }, 'hero-basic', base)).toThrow()
  })
})

describe('captured thumbnails', () => {
  const item = {
    ref: '@example/hero',
    name: 'hero',
    title: 'Hero',
    description: '',
    kind: 'block' as const,
    source: '@example',
    previewUrl: 'https://example.com/hero',
  }
  const image = `/registry-previews/${'a'.repeat(64)}-light.webp`
  test('a capture is used only for its matching preview URL', () => {
    expect(capturedImage(item, { [item.ref]: { url: item.previewUrl, image } })).toBe(image)
    expect(
      capturedImage(item, { [item.ref]: { url: 'https://example.com/old', image } }),
    ).toBeUndefined()
    expect(capturedImage(item, {})).toBeUndefined()
    expect(
      capturedImage(item, {
        [item.ref]: { url: item.previewUrl, image: '/registry-previews/../../secret.png' },
      }),
    ).toBeUndefined()
  })
  test('explicit images take priority over captured URLs', () => {
    expect(
      capturedImage(
        { ...item, image: 'https://example.com/image.webp' },
        { [item.ref]: { url: item.previewUrl, image } },
      ),
    ).toBe('https://example.com/image.webp')
  })
})

describe('themed preview metadata', () => {
  test('light/dark image metadata resolves each variant with independent precedence', () => {
    expect(
      previewFields(
        { preview: { image: { light: '/light.webp', dark: '/dark.webp' }, embed: true } },
        undefined,
        'hero',
        base,
      ),
    ).toEqual({
      image: 'https://www.payload-components.xyz/light.webp',
      imageDark: 'https://www.payload-components.xyz/dark.webp',
      previewEmbed: true,
    })
    expect(
      previewFields(
        { image: { light: '/light.webp', dark: '/dark.webp' } },
        {
          image: 'https://example.com/{name}.webp',
          items: {
            hero: { image: { dark: 'https://example.com/custom-dark.webp' }, embed: false },
          },
        },
        'hero',
        base,
      ),
    ).toEqual({
      image: 'https://www.payload-components.xyz/light.webp',
      imageDark: 'https://example.com/custom-dark.webp',
      previewEmbed: false,
    })
    expect(
      previewFields({}, { image: { dark: 'https://example.com/{name}-dark.webp' } }, 'hero', base),
    ).toEqual({ image: 'https://example.com/hero-dark.webp' })
    expect(() => previewFields({ preview: { embed: 'yes' } }, undefined, 'hero', base)).toThrow()
  })
  test('dark captures are selected, while a single available capture works in both themes', () => {
    const item = {
      ref: 'hero',
      name: 'hero',
      title: 'Hero',
      description: '',
      kind: 'block' as const,
      source: 'example',
      previewUrl: 'https://example.com/hero',
    }
    const image = `/registry-previews/${'a'.repeat(64)}-light.webp`
    const imageDark = `/registry-previews/${'a'.repeat(64)}-dark.webp`
    const captures = { hero: { url: item.previewUrl, image, imageDark } }
    expect(capturedImage(item, captures, 'dark')).toBe(imageDark)
    expect(capturedImage(item, { hero: { url: item.previewUrl, image } }, 'dark')).toBe(image)
    expect(
      capturedImage({ ...item, imageDark: 'https://example.com/explicit.webp' }, captures, 'dark'),
    ).toBe('https://example.com/explicit.webp')
  })
})
