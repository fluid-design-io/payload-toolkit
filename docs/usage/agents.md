# Agent integration

`--codex` or `--claude` invokes the already installed agent CLI with an integration prompt. Bundled features include a versioned guide. External items can omit guides and toolkit metadata. Their prompt asks the agent to inspect the installed source, imports, upstream documentation, and actual host before adapting the integration. Both flags together are invalid. The toolkit uses the agent's existing account, model, project rules and permission settings. It does not install an agent, bypass permissions or retry a paid invocation.

Codex can refuse a directory outside a trusted Git project. Initialize or select a repository that you trust before using `--codex`; the toolkit retains installed files and leaves Git and Codex trust settings to you.

Headless sessions can deny required edits or commands under the agent's existing policy. Configure the required permissions for the target project in that agent before invoking the flag. Installation may succeed while the agent step fails because permission was denied; the receipt reports those outcomes separately.

Without an agent flag, the result includes a copyable integration prompt. The default exit status reports installation. An agent can fail after installation succeeds. `--require-agent-success` also requires the selected invocation to finish successfully; it still does not prove that the resulting application works. JSON and receipts report installation, agent invocation and verification separately.
