# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**node-torrent** (published as "nt") is a Node.js library for working with BitTorrent files. It provides functionality for reading torrent files, creating torrents from directories/files, and hash checking torrents against existing data.

## Development Commands

```bash
# Run tests with coverage
npm test

# Tests are located in test/ directory with pattern *-test.js
# Uses mocha/chai (BDD framework) with nyc for coverage
```

## Code Architecture

### Core Structure

The library is organized in the `lib/` directory with modular components:

- **`index.js`** - Main entry point and public API exports
- **`torrent.js`** - Torrent class handling metadata and core operations
- **`read.js`** - Torrent file parsing and reading functionality
- **`make.js`** - Torrent creation from files/directories
- **`hasher.js`** - Stream-based piece hashing engine (most complex component)
- **`schema.js`** - Torrent metadata validation
- **`util.js`** - Shared utility functions
- **`queue.js`** - Task queue for managing concurrent operations

### Key Architecture Patterns

1. **Stream-Based Design**: The library heavily uses Node.js streams, particularly in the `Hasher` class which extends Stream for piece hashing operations.

2. **Event-Driven Operations**: Core operations emit events for progress tracking:
   - `Hasher` events: `ready`, `hash`, `progress`, `match`, `matcherror`, `error`, `end`
   - Uses `ordered-emitter` to ensure proper event ordering

3. **Modular API Design**: Three main functions:
   - `read()` - Parse torrent files with validation
   - `make()` - Create torrents from file directories (returns stream)
   - `makeWrite()` - Create torrents and write directly to file

### Key Classes

- **Torrent**: Primary class representing torrent metadata with methods like `infoHash()`, `createReadStream()`, `createWriteStream()`, `hashCheck()`
- **Hasher**: Stream-based hashing engine with pause/resume, progress tracking, and file I/O management

## Testing

- **Framework**: mocha/chai (modern BDD framework)
- **Coverage**: nyc with codecov integration
- **Test Files**: Located in `test/` directory following `*-test.js` pattern
- **Test Data**: Sample torrents and test files in `test/torrents/`, `test/files/`, and `test/result/`

## Dependencies

### Runtime
- `bncode` - Bencoding/decoding for BitTorrent protocol
- `async` - Asynchronous control flow
- `ordered-emitter` - Event ordering guarantees
- `streamspeed` - Stream speed monitoring
- `underscore` - Utilities (legacy, could be modernized)

### Development
- `mocha` - Testing framework (BDD)
- `chai` - Assertion library
- `nyc` - Code coverage

## Development Notes

- **Node.js Version**: Currently supports >=6 (quite conservative, could be updated)
- **TypeScript**: Definitions provided in `lib/index.d.ts`
- **Publishing**: Only the `lib/` directory is included in npm package
- **Concurrency**: File operations limited to 250 concurrent files by default (configurable via `maxFiles`)

## Current State

- **Main Branch**: `master`
- **Development Branch**: `mocha` (completed migration from vows to mocha/chai testing)
- **CI/CD**: Travis CI configured with codecov integration

When working with this codebase, pay attention to the stream-based architecture and event-driven patterns, particularly in the hashing engine which is the most complex component.