# HackMD Sync
A plugin for pushing and fetching note contents between Obsidian and HackMD.

## Commands
* hackmd-push - pushes a note to hackmd, creating it, if it doesn't exist. Sets sharing settings to defaults, as configured in the plugin settings. If the note already exists, check if the remote note has been edited since the last push. If it has, return an error. Otherwise, overwrite the remote note.
* hackmd-pull - pull the changes from the remote into the local obsidian note. If the local has changes since the last pull, error.
* hackmd-force push - overwrite remote
* hackmd force pull - overwrite local
* hackmd copy url - copy the remote url
* hackmd delete - delete the remote copy

## Release Process

1. Update `CHANGELOG.md` with changes under the `[Unreleased]` section as you work
2. When ready to release:
   - Rename `[Unreleased]` to `[x.y.z]` (the version you're releasing)
   - Add a fresh `## [Unreleased]` section at the top
3. Run `npm version x.y.z` (automatically bumps `manifest.json` and `versions.json`)
4. Push the changes and tags: `git push && git push --tags`
5. GitHub Actions will build the plugin and create a draft release with the changelog notes
6. Review and publish the draft release on GitHub
