# Project: Fixture Test Project

## What This Is

A minimal PROJECT.md fixture for testing the PBR file format parsers. This file follows the Phase 5 consolidated format where CONTEXT.md is merged into the Context section.

## Core Value

Ensure PBR planning file formats remain stable across versions by providing canonical fixture examples that automated tests validate against production parsers.

## Requirements Summary

| Category | Count | Key Requirements |
|----------|-------|-----------------|
| Setup | 2 | SETUP-01, SETUP-02 |
| Features | 2 | FEAT-01, FEAT-02 |
| Testing | 1 | TEST-01 |

## Context

**Tech stack:** Node.js, CommonJS modules, node:test runner
**Target users:** PBR plugin developers and contributors
**Key constraint:** Zero external dependencies for core parsing

## Key Decisions

| Phase | Decision | Rationale |
|-------|----------|-----------|
| Phase 1 | Use built-in modules only | Zero-dependency operation |
| Phase 2 | CommonJS over ESM | Plugin ecosystem compatibility |
