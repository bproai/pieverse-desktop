```markdown
# Developer Manual: Integrating a Subproject Using Git Subtree

This section describes how to incorporate the `chatgpt-playbook-extension` repository as a subtree into the `pieverse-desktop` repository. This approach lets you maintain separate development in the subproject while keeping it logically connected within the parent project.

## Prerequisites

- **Git Installed:** Ensure Git is installed on your development machine.
- **Repository Access:**
  - Primary Project: [pieverse-desktop](https://github.com/bproai/pieverse-desktop)
  - Subproject: [chatgpt-playbook-extension](https://github.com/bproai/chatgpt-playbook-extension)
- **Supported Branches:** Confirm the default branch (e.g., `main`) for both repositories.

## Steps to Add the Subproject as a Subtree

### 1. Clone the Primary Repository

If you haven't already cloned the primary project, do so with:

```bash
git clone https://github.com/bproai/pieverse-desktop.git
cd pieverse-desktop
```

### 2. Add the Subproject as a Subtree

Run the following command to add the subproject into a subdirectory called `chatgpt-playbook-extension`:

```bash
git subtree add --prefix=chatgpt-playbook-extension https://github.com/bproai/chatgpt-playbook-extension.git main --squash
```

- **`--prefix=chatgpt-playbook-extension`**: Specifies the subdirectory in which the subproject will reside.
- **Repository URL**: `https://github.com/bproai/chatgpt-playbook-extension.git` is the location of the subproject.
- **Branch**: `main` is the branch to integrate. Adjust if your subproject uses a different branch.
- **`--squash`**: This option consolidates the subproject's commit history into a single commit within the parent repository. Omit this flag if you prefer to keep the full history.

### 3. Updating the Subtree

When changes are made in the subproject repository and you want to update your primary project, run:

```bash
git subtree pull --prefix=chatgpt-playbook-extension https://github.com/bproai/chatgpt-playbook-extension.git main --squash
```

This command fetches and merges updates from the subproject into the specified subdirectory.

## Additional Notes

- **History Preservation:** If you prefer not to squash the history, simply remove the `--squash` flag from the commands.
- **Commit Before Pulling:** Always commit or stash your changes in the primary repository before performing a subtree pull to avoid conflicts.
- **Further Reading:** For more details, refer to the [Git subtree documentation](https://www.atlassian.com/git/tutorials/git-subtree).
- **Tauri Documentation:** For additional resources, refer to the [Tauri documentation](https://v2.tauri.app/).

By following these instructions, you can maintain both projects separately while integrating them logically under a single parent project.
```