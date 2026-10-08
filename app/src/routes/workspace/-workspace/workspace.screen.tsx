import { Workspace } from './workspace'

/**
 * The configurator. Every control writes one Setup, and the command and the
 * prompt are pure derivations of it, so what is copied always matches what
 * the CLI accepts. The template is never chosen: no items means minimal.
 */
export function WorkspaceScreen() {
  return (
    <Workspace>
      <Workspace.Main>
        <Workspace.Header />
        <Workspace.Registry.Toolbar>
          <Workspace.Registry.Search />
          <Workspace.Registry.Filter />
        </Workspace.Registry.Toolbar>
        <Workspace.Registry.Count />
        <Workspace.Results>
          <Workspace.Registry.Grid />
        </Workspace.Results>
        <Workspace.NoMatch />
      </Workspace.Main>
      <Workspace.Setup>
        <Workspace.Setup.Body>
          <Workspace.Setup.Name />
          <Workspace.Setup.Framework />
          <Workspace.Setup.Database />
          <Workspace.Setup.PackageManager />
          <Workspace.Setup.Agent />
          <Workspace.Setup.Items />
        </Workspace.Setup.Body>
        <Workspace.Setup.Output />
      </Workspace.Setup>
    </Workspace>
  )
}
