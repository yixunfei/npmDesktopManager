# Contributing to npmDesktopManager

Thank you for your interest in contributing to npmDesktopManager! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors.

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm 9+
- Git
- ImageMagick (for icon generation, optional)

### Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/npmDesktopManager.git
   cd npmDesktopManager
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Generate icons (requires ImageMagick):
   ```bash
   npm run build:icons
   ```

5. Start development server:
   ```bash
   npm run dev
   ```

## Development Workflow

1. Create a new branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes

3. Test your changes thoroughly

4. Commit your changes:
   ```bash
   git commit -m "type: description"
   ```

5. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

6. Create a Pull Request

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Define proper types and interfaces
- Avoid using `any` unless absolutely necessary
- Use functional components with Hooks

### Code Style

- Use 2 spaces for indentation
- Use single quotes for strings
- Use semicolons
- Maximum line length: 100 characters
- Use meaningful variable and function names

### Components

- One component per file
- Use functional components
- Use CSS Modules for styling
- Keep components small and focused

### File Structure

```
ComponentName/
├── ComponentName.tsx
├── ComponentName.module.css
└── index.ts (optional, for barrel exports)
```

## Commit Guidelines

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

### Format

```
type(scope): subject

body

footer
```

### Types

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools

### Examples

```
feat(search): add package version filter

fix(project): resolve dependency tree display issue
docs(readme): update installation instructions
```

## Pull Request Process

1. Update the README.md with details of changes if applicable
2. Update the CHANGELOG.md with your changes
3. Ensure all tests pass (if applicable)
4. Request review from maintainers
5. Address review comments promptly

### PR Title Format

Use the same format as commit messages:

```
type(scope): description
```

## Reporting Issues

When reporting issues, please include:

1. Your operating system and version
2. Node.js and npm versions
3. Steps to reproduce the issue
4. Expected behavior
5. Actual behavior
6. Screenshots (if applicable)

## Feature Requests

Feature requests are welcome! Please provide:

1. A clear description of the feature
2. Use cases and benefits
3. Possible implementation approach (if you have ideas)

## Questions?

Feel free to open an issue with your question, and we'll be happy to help!

---

Thank you for contributing to npmDesktopManager! 🎉