# Git changes and recovery

Uncommitted Git changes stop installation. `--allow-dirty` proceeds and records the starting index and files, but never overwrites edited feature files. The toolkit never stashes, resets, stages or commits.

Attempts and receipts live in the user state directory, outside the project. Interrupted or partial installs are kept for inspection; nothing is rolled back.

A target lease blocks any other run on that project, even if its process has exited. After a crash, inspect the recorded attempt, confirm its child processes have stopped, then remove the exact lease path the error reports. Keep project files and attempt evidence.
