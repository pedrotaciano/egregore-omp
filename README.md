# egregore-omp

Run an [Egregore](https://github.com/egregore-labs/egregore) instance inside [omp (oh-my-pi)](https://github.com/can1357/oh-my-pi).

`create-egregore --pi` sets an instance up for [Pi](https://github.com/earendil-works/pi). omp is a Pi fork, but it reads `.omp/`, not `.pi/`, so the Egregore extension and system-prompt appendix never load. This adds the missing `.omp/` entry points and leaves the generated Pi runtime untouched.

## Install

From inside an instance, or anywhere to cover every instance in `~/.egregore/instances.json`:

```sh
npx -y github:pedrotaciano/egregore-omp
```

Then run `omp` in the instance directory. The status line shows `Egregore · N workflows` and the team card appears on startup.

The instance needs the Pi runtime. If it was created for Claude Code or Codex:

```sh
npx create-egregore@latest --add-harness pi --instance <path>
```

## What it writes

| Path in the instance | What |
|---|---|
| `.omp/extensions/egregore.ts` | Loads `.pi/extensions/egregore.ts` through an adapter (below) |
| `.omp/APPEND_SYSTEM.md` | Symlink to `../.pi/APPEND_SYSTEM.md` |
| `.git/info/exclude` | `/.omp/extensions/` and `/.omp/APPEND_SYSTEM.md`, so they stay out of the shared repo |

Both files point at the generated `.pi/` runtime, so Egregore updates (`/update`, `create-egregore`) flow through without reinstalling.

The adapter bridges two event differences:

- **`session_start`**: Pi sends `reason: "startup"` and the Egregore extension waits for it before showing the team card and binding the session id. omp fires the event once, on initial load, without a reason; the adapter supplies `"startup"`.
- **`agent_settled`** (Pi) is mapped to omp's **`agent_end`**.

omp already handles the rest: it rewrites the `@earendil-works/*` imports to its own packages, reads `AGENTS.md`, and discovers the skills in `.codex/skills`.

## Commands

```sh
npx -y github:pedrotaciano/egregore-omp status
npx -y github:pedrotaciano/egregore-omp uninstall
npx -y github:pedrotaciano/egregore-omp install --force <instance-path>
```

`install` never overwrites a `.omp/extensions/egregore.ts` or `.omp/APPEND_SYSTEM.md` it did not create; `--force` replaces them. `uninstall` removes only its own files.

## Requirements

- Node 18+
- macOS or Linux (`.omp/APPEND_SYSTEM.md` is a symlink)
- Tested with omp 19.1.1 and create-egregore 0.22.2

## License

MIT
