# GitHub Repository Setup Guide

## Initial Setup (One-time)

### Step 1: Create Repository on GitHub
1. Go to https://github.com/new
2. Repository name: `ai-context` (or your preferred name)
3. Choose Public or Private
4. **DO NOT** initialize with README, .gitignore, or license (we already have these)
5. Click "Create repository"

### Step 2: Connect Local Repository to GitHub

After creating the repository, you'll see instructions. Use these commands:

```bash
# Add the remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/ai-context.git

# Optionally rename branch from master to main (GitHub's default)
git branch -M main

# Push your code
git push -u origin main
```

If you want to keep using `master` branch:
```bash
git remote add origin https://github.com/YOUR_USERNAME/ai-context.git
git push -u origin master
```

## Daily Workflow (After Initial Setup)

### Using GitHub Desktop (Easiest)
1. Make your changes
2. Open GitHub Desktop
3. Review your changes in the left panel
4. Write a commit message (e.g., "Add new feature")
5. Click "Commit to main" (or "Commit to master")
6. Click "Push origin" to upload to GitHub

### Using Command Line
```bash
# Check what files have changed
git status

# Add all changed files
git add .

# Or add specific files
git add path/to/file

# Commit with a message
git commit -m "Your commit message describing the changes"

# Push to GitHub
git push
```

## Common Commands Reference

```bash
# Check repository status
git status

# View commit history
git log --oneline

# Create a new branch
git checkout -b feature-name

# Switch branches
git checkout branch-name

# Pull latest changes from GitHub
git pull

# View remote repository URL
git remote -v
```

