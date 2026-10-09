import { describe, expect, test } from 'bun:test'
import { imageUrl } from './sync-catalog'

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
