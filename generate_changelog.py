import subprocess

def get_first_commit():
    # Retrieve the first commit in the repository
    first_commit = subprocess.check_output(
        ["git", "rev-list", "--max-parents=0", "HEAD"]
    ).strip().decode("utf-8")
    return first_commit

# Get the first commit hash
first_commit = get_first_commit()

# Generate a diff between the first commit and the latest commit (HEAD)
diff = subprocess.check_output(["git", "diff", first_commit, "HEAD"]).decode("utf-8")

# Write the diff to a file for further analysis
with open("changelog.txt", "w") as f:
    f.write(f"=== Diff from {first_commit} to HEAD ===\n")
    f.write(diff)

print("Changelog generated in 'changelog.txt'")
