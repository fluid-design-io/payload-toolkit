import { Workspace } from './workspace'

/**
 * The configurator. The rail and search narrow the grid; every card toggles
 * one item and morphs into its detail. The floating bar holds the build and
 * Install, and either one morphs the bar into a card, where Install adds to
 * an existing project or starts a new one. The command and the prompt are
 * pure derivations of one Setup, which the URL mirrors, so a shared link
 * restores the same build. The rail footer carries the home link and the
 * theme toggle; on phones the rail is a sheet that the toolbar's trigger
 * opens.
 */
export function WorkspaceScreen() {
  return (
    <Workspace>
      <Workspace.Rail>
        <Workspace.Main>
          <Workspace.Toolbar>
            <Workspace.Rail.Trigger />
            <Workspace.Rail.Current />
            <Workspace.Registry.Search />
          </Workspace.Toolbar>
          <Workspace.Results>
            <Workspace.Registry.Grid />
          </Workspace.Results>
          <Workspace.NoMatch />
        </Workspace.Main>
      </Workspace.Rail>
      <Workspace.Registry.Detail />
      <Workspace.Bar>
        <Workspace.Bar.Build />
        <Workspace.Bar.Install />
      </Workspace.Bar>
    </Workspace>
  )
}
