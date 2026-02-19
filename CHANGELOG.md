# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-02-19

### Added
- Created `CHANGELOG.md` to track project changes.
- Log filtering in background script to suppress noisy `cart_items` and `[object Object]` errors from the page console.

### Fixed
- Fixed TypeScript import error: consolidated `@eko-ai/eko` and `@eko-ai/eko/types` imports into the root package.

### Changed
- Synchronized extension version across `package.json` and `manifest.json` to 1.1.0.
