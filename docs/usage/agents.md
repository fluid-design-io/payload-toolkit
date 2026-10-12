# Agent integration

`--codex` or `--claude` runs that installed agent CLI with an integration prompt, using its existing account, model, rules and permissions. Pass only one. The toolkit never installs an agent, bypasses permissions or retries a paid run. Without a flag, the result includes the prompt to copy.

Bundled features hand over their `GUIDE.md`. For external items the prompt asks the agent to inspect the installed source, imports, upstream docs and host before wiring.

Codex refuses directories outside a trusted Git project; pick or initialize a trusted repository first. Headless agents may deny edits or commands under their own policy, so configure permissions for the project before running.

Installation and the agent run are reported separately, in output, `--json` and the receipt. The exit status reflects installation unless `--require-agent-success` is set, which also requires the agent run to finish. Neither proves the app works.
