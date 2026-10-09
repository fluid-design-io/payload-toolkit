import { Workspace } from './workspace'

/**
 * The configurator. The rail and search narrow the grid, every card toggles
 * one item, and the floating bar holds the project settings, the build and
 * Copy. The command and the prompt are pure derivations of one Setup, which
 * the URL mirrors, so a shared link restores the same build. The rail footer
 * carries the home link and the theme toggle; on phones the rail is a sheet
 * that the toolbar's trigger opens.
 */
export function WorkspaceScreen() {
  return (
    <Workspace>
      <Workspace.Rail>
        <Workspace.Main>
          <Workspace.Intro />
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
      <Workspace.Bar>
        <Workspace.Bar.Content>
          <Workspace.Bar.Settings />
          <Workspace.Bar.Build />
        </Workspace.Bar.Content>
        <Workspace.Bar.Suffix>
          <Workspace.Bar.Copy />
        </Workspace.Bar.Suffix>
      </Workspace.Bar>
    </Workspace>
  )
}
