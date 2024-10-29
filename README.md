# Hackmd Plugin
A plugin for pushing and fetching note contents between Obsidian and HackMD.

Commands:
* hackmd-push - pushes a note to hackmd, creating it, if it doesn't exist. Sets sharing settings to defaluts, as configured in the plugin settings. If the note already exists, check if the remote note has been edited since the last push. If it has, return an error. Otherwise, overwrite the remote note.
* hackmd-pull - pull the changes from the remote into the local obsidian note. If the local has changes since the last pull, error.
* hackmd-force push - overwrite remote
* hackmd force pull - overwrite local
* hackmd copy url - copy the remote url
