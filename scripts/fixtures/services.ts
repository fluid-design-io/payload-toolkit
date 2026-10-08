import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Blocked, command, type Evidence, hash, waitUntil } from './support.js'

export type Service = { name: string; ownership: 'owned' | 'borrowed'; url: string }
export async function service(
  database: string,
  runId: string,
  directory: string,
  evidence: Evidence,
): Promise<Service> {
  const supplied =
    database === 'mongodb'
      ? process.env.TOOLKIT_TEST_MONGODB_URL
      : process.env.TOOLKIT_TEST_POSTGRES_URL
  if (supplied) {
    if (process.env.TOOLKIT_TEST_DISPOSABLE !== 'yes')
      throw new Blocked(
        'Supplied services require TOOLKIT_TEST_DISPOSABLE=yes. Fixtures write test data; borrowed services are never dropped.',
      )
    const previous = await fs
      .readFile(path.join(directory, 'resources.json'), 'utf8')
      .then(JSON.parse, () => ({}))
    await fs.writeFile(
      path.join(directory, 'resources.json'),
      JSON.stringify(
        {
          ...previous,
          runId,
          services: [{ name: 'supplied-test-service', ownership: 'borrowed' }],
        },
        null,
        2,
      ),
    )
    evidence.identities.databaseOwnership = 'borrowed'
    evidence.identities.databaseURLHash = hash(supplied)
    evidence.identities.databaseVersion = 'unobserved supplied service'
    return { name: 'supplied-test-service', ownership: 'borrowed', url: supplied }
  }
  const docker = await command('docker', ['info', '--format', '{{.ServerVersion}}'], {
    cwd: directory,
    allowFailure: true,
  }).catch(() => null)
  if (!docker || docker.code !== 0)
    throw new Blocked(
      'Docker is unavailable. Supply an explicit disposable test URL or start Docker.',
    )
  const name = `payload-toolkit-${database}-${runId}`
  evidence.identities.databaseOwnership = 'owned'
  // Record ownership before creation so interrupted attempts can remove only their resources.
  const previous = await fs
    .readFile(path.join(directory, 'resources.json'), 'utf8')
    .then(JSON.parse, () => ({}))
  await fs.writeFile(
    path.join(directory, 'resources.json'),
    JSON.stringify({ ...previous, runId, services: [{ name, ownership: 'owned' }] }, null, 2),
  )
  const args = [
    'run',
    '-d',
    '--name',
    name,
    '--label',
    `payload-toolkit.run=${runId}`,
    '-p',
    `127.0.0.1::${database === 'mongodb' ? '27017' : '5432'}`,
  ]
  if (database === 'postgres')
    args.push(
      '-e',
      'POSTGRES_PASSWORD=fixture',
      '-e',
      'POSTGRES_DB=toolkit_fixture',
      'postgres:17.7-alpine',
    )
  else args.push('mongo:8.0.16', '--replSet', 'toolkit', '--bind_ip_all')
  await command('docker', args, { cwd: directory, evidence, directory })
  const image = await command('docker', ['inspect', '--format', '{{.Image}}', name], {
    cwd: directory,
    evidence,
    directory,
  })
  evidence.identities.databaseImageId = image.stdout.trim()
  const digest = await command(
    'docker',
    ['image', 'inspect', '--format', '{{json .RepoDigests}}', image.stdout.trim()],
    { cwd: directory, evidence, directory },
  )
  evidence.identities.databaseImageDigests = digest.stdout.trim()
  const result = await command(
    'docker',
    ['port', name, database === 'mongodb' ? '27017' : '5432'],
    { cwd: directory, evidence, directory },
  )
  const port = result.stdout.trim().split(':').at(-1)
  if (!port || !/^\d+$/.test(port)) throw new Error('Docker did not assign a host port')
  await waitUntil(
    'database',
    async () =>
      (
        await command(
          'docker',
          [
            'exec',
            name,
            ...(database === 'mongodb'
              ? ['mongosh', '--quiet', '--eval', 'db.adminCommand({ping:1}).ok']
              : ['pg_isready', '-U', 'postgres']),
          ],
          { cwd: directory, allowFailure: true },
        )
      ).code === 0,
  )
  if (database === 'mongodb') {
    await command(
      'docker',
      [
        'exec',
        name,
        'mongosh',
        '--quiet',
        '--eval',
        'rs.initiate({_id:"toolkit",members:[{_id:0,host:"127.0.0.1:27017"}]})',
      ],
      { cwd: directory, evidence, directory },
    )
    await waitUntil(
      'Mongo primary',
      async () =>
        (
          await command(
            'docker',
            [
              'exec',
              name,
              'mongosh',
              '--quiet',
              '--eval',
              'if(!db.hello().isWritablePrimary)quit(1)',
            ],
            { cwd: directory, allowFailure: true },
          )
        ).code === 0,
    )
  }
  const version = await command(
    'docker',
    [
      'exec',
      name,
      ...(database === 'mongodb' ? ['mongod', '--version'] : ['postgres', '--version']),
    ],
    { cwd: directory, evidence, directory },
  )
  evidence.identities.databaseVersion = version.stdout.trim()
  return {
    name,
    ownership: 'owned',
    url:
      database === 'mongodb'
        ? `mongodb://127.0.0.1:${port}/toolkit_fixture?directConnection=true`
        : `postgres://postgres:fixture@127.0.0.1:${port}/toolkit_fixture`,
  }
}
export async function cleanupServices(directory: string, runId: string, evidence?: Evidence) {
  const record = await fs
    .readFile(path.join(directory, 'resources.json'), 'utf8')
    .then(JSON.parse, () => ({ services: [] }))
  const removed: string[] = []
  for (const resource of record.services) {
    if (resource.ownership !== 'owned') continue
    const inspection = await command(
      'docker',
      ['inspect', '--format', '{{index .Config.Labels "payload-toolkit.run"}}', resource.name],
      { cwd: directory, allowFailure: true },
    )
    if (inspection.code !== 0) continue
    if (inspection.stdout.trim() !== runId)
      throw new Error('Cleanup refused a Docker resource with different ownership')
    await command('docker', ['rm', '-f', '-v', resource.name], {
      cwd: directory,
      evidence,
      directory,
    })
    removed.push(resource.name)
  }
  return removed
}
