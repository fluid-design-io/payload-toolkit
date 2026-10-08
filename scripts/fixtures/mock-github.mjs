const fixture = JSON.parse(await Bun.file(process.env.TOOLKIT_REPORT_FIXTURE).text())
globalThis.fetch = async (url, options = {}) => {
  const path = new URL(url).pathname
  if (options.method === 'POST' || options.method === 'PATCH') {
    if (!/^\/repos\/fixture\/toolkit\/issues(?:\/comments)?\/\d+(?:\/comments)?$/.test(path))
      throw new Error('Unexpected write endpoint')
    await Bun.write(process.env.TOOLKIT_REPORT_OUTPUT, options.body, { createPath: false })
    return Response.json({ id: 42 })
  }
  if (path.endsWith('/actions/artifacts/1/zip'))
    return new Response(Buffer.from(fixture.zip, 'base64'))
  const data = fixture.responses[path]
  if (!data) throw new Error(`Unexpected fixture request: ${path}`)
  return Response.json(data)
}
