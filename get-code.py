#!/usr/bin/env python3

import sys
import os
import subprocess
from pathspec import PathSpec
from pathspec.patterns.gitwildmatch import GitWildMatchPattern

def load_gitignore_patterns(directory):
    gitignore_path = os.path.join(directory, '.gitignore')
    patterns = []
    if os.path.exists(gitignore_path):
        with open(gitignore_path, 'r', encoding='utf-8', errors='replace') as f:
            patterns = f.read().splitlines()

    # Add forced ignores regardless of .gitignore
    patterns.append('.git/')
    patterns.append('.github/')
    patterns.append('.venv/')

    spec = PathSpec.from_lines(GitWildMatchPattern, patterns)

    # Also extract simple patterns that can be used with the tree command
    tree_exclude_patterns = []
    for pattern in patterns:
        # Skip comments and empty lines
        if not pattern or pattern.startswith('#'):
            continue
        # Extract simple names without wildcards or complex patterns
        if '/' not in pattern and '*' not in pattern and '!' not in pattern:
            tree_exclude_patterns.append(pattern)
        # Add directories with trailing slashes
        elif pattern.endswith('/'):
            tree_exclude_patterns.append(pattern[:-1])  # Remove trailing slash

    return spec, tree_exclude_patterns

def is_ignored(spec, base_dir, rel_path):
    if spec is None:
        return False
    # Convert path to Unix style for matching
    rel_path_unix = rel_path.replace('\\', '/')
    return spec.match_file(rel_path_unix)

def main():
    if len(sys.argv) < 2:
        print("Usage: python combine_files.py <directory>")
        sys.exit(1)

    directory = sys.argv[1]
    if not os.path.isdir(directory):
        print(f"Error: {directory} is not a directory or does not exist.")
        sys.exit(1)

    spec, tree_ignore_patterns = load_gitignore_patterns(directory)
    output_file = 'combined_output.txt'

    with open(output_file, 'w', encoding='utf-8', errors='replace') as out:
        for root, dirs, files in os.walk(directory):
            # Compute relative path
            relative_root = os.path.relpath(root, directory)
            if relative_root == '.':
                relative_root = ''

            # Filter directories based on ignore rules
            dirs[:] = [d for d in dirs if not is_ignored(spec, directory, os.path.join(relative_root, d))]

            for filename in files:
                rel_path = os.path.join(relative_root, filename) if relative_root else filename
                if is_ignored(spec, directory, rel_path):
                    continue

                full_path = os.path.join(root, filename)

                # Write file content with filename header
                out.write(f"<FILENAME: {rel_path}>\n\n")
                try:
                    with open(full_path, 'r', encoding='utf-8', errors='replace') as f:
                        content = f.read()
                    out.write(content)
                except Exception as e:
                    out.write(f"[Error reading file: {e}]\n")

                out.write("\n################################################################################\n")

        # Append the tree output using gitignore patterns
        if tree_ignore_patterns:
            ignore_pattern = '|'.join(tree_ignore_patterns)
            try:
                tree_proc = subprocess.run(
                    ["tree", directory, "--prune", "-I", ignore_pattern],
                    capture_output=True,
                    text=True
                )
                out.write(tree_proc.stdout)
            except FileNotFoundError:
                out.write("[tree command not found]\n")
            except subprocess.SubprocessError as e:
                out.write(f"[Error running tree command: {e}]\n")
                # Fallback to simpler pattern if command line is too long
                try:
                    tree_proc = subprocess.run(
                        ["tree", directory, "--prune", "-I", "node_modules|.git|venv"],
                        capture_output=True,
                        text=True
                    )
                    out.write(tree_proc.stdout)
                except:
                    out.write("[Could not run tree command with fallback patterns]\n")
        else:
            try:
                tree_proc = subprocess.run(
                    ["tree", directory, "--prune", "-I", "node_modules|.git|venv"],
                    capture_output=True,
                    text=True
                )
                out.write(tree_proc.stdout)
            except FileNotFoundError:
                out.write("[tree command not found]\n")

if __name__ == "__main__":
    main()