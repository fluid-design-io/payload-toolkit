import { expect, test } from 'bun:test'
import { mocks } from '@/routes/lab/-lab/lab.mocks'
import { factoryScene } from '../workspace.constants'

test('the factory view names a mock the lab registers', () => {
  expect(mocks.map((mock) => mock.id)).toContain(factoryScene)
})
