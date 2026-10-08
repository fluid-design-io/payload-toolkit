import assert from 'node:assert/strict'
import { renderToString } from 'react-dom/server'
import { useForm } from '@tanstack/react-form'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { createStore, useSelector } from '@tanstack/react-store'
import { useVirtualizer } from '@tanstack/react-virtual'

// This integration probe never becomes an application route or UI.
const store = createStore({ count: 0 })
store.setState((state) => ({ count: state.count + 1 }))
assert.equal(store.get().count, 1)

const queryClient = new QueryClient()
await queryClient.ensureQueryData({
  queryKey: ['bootstrap'],
  queryFn: async () => 'ready',
})

function StackProbe() {
  const count = useSelector(store, (state) => state.count)
  const form = useForm({ defaultValues: { search: '' } })
  const query = useQuery({ queryKey: ['bootstrap'], queryFn: async () => 'ready' })
  const virtualizer = useVirtualizer({
    count: 100,
    getScrollElement: () => null,
    estimateSize: () => 40,
    initialRect: { width: 800, height: 400 },
  })

  assert.equal(count, 1)
  assert.equal(form.state.values.search, '')
  assert.equal(query.data, 'ready')
  assert.equal(virtualizer.getTotalSize(), 4000)
  assert.ok(virtualizer.getVirtualItems().length > 0)
  assert.ok(virtualizer.getVirtualItems().length < 100)
  return null
}

try {
  assert.equal(
    renderToString(
      <QueryClientProvider client={queryClient}>
        <StackProbe />
      </QueryClientProvider>,
    ),
    '',
  )
  console.log('Query cache, Form, Store and Virtual React SSR integration passed.')
} finally {
  queryClient.clear()
}
