# Contributing to anyx

Thanks for taking the time to contribute!

## Getting started

```bash
git clone https://github.com/adrienj/npxall.git
cd npxall
npm install
```

## Project structure

```
npxall/
├── cli.js              # CLI entry point
├── test/
│   └── cli.test.js     # CLI integration tests
└── web/                # GitHub Pages web UI (Vite + TypeScript)
    ├── src/
    │   ├── registry.ts # npm registry fetcher
    │   ├── fetcher.ts  # .d.ts recursive fetcher
    │   ├── parser.ts   # TypeScript AST parser
    │   ├── template.ts # type → CLI arg template rules
    │   ├── lookup.ts   # orchestrator
    │   └── main.ts     # UI rendering
    └── test/           # web unit tests
```

## Running tests

```bash
# CLI tests
npm test

# Web tests
cd web && npm test
```

All tests must pass before submitting a pull request.

## Submitting changes

1. Fork the repository and create a branch from `main`.
2. Make your changes. Add or update tests where relevant.
3. Run `npm test` (and `cd web && npm test` for web changes) and confirm everything passes.
4. Open a pull request with a clear description of what changed and why.

## Reporting bugs

Use [GitHub Issues](https://github.com/adrienj/npxall/issues). Include:
- The exact command you ran
- The actual output
- The expected output
- Your Node.js version (`node --version`)

## Code style

- CLI code: vanilla Node.js ESM, no build step, no dependencies at runtime.
- Web code: TypeScript, no runtime dependencies beyond TypeScript itself (bundled by Vite).
- Keep functions small and focused.
- Prefer `process.stderr.write` over `console.error` in the CLI so stdout stays clean.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
