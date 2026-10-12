# Git changes and recovery

Existing Git changes stop installation by default. `--allow-dirty` permits those changes and records the actual starting index, working files and relevant untracked files. It does not permit overwriting edited feature files. The toolkit never stashes, resets, stages or commits.

Attempts live outside the app in the user state directory. Interrupted and partial installs remain available for inspection; no automatic rollback deletes work.

An existing target lease always blocks another toolkit run, even when its recorded parent process has exited. Normal completion releases its own lease. After a crash or unconfirmed process termination, inspect the recorded attempt and verify that its owned child processes have stopped before manually removing the exact lease path reported by the error. Preserve application files and attempt evidence during recovery.
