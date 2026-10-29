---
name: react-useeffect
description: React useEffect best practices. Use when writing or reviewing useEffect, derived useState, data fetching, or state sync. Teaches when not to use Effect. Prefer Photokin useLiveQuery for SQLite.
---

# You Might Not Need an Effect

Effects are an **escape hatch**. They synchronize with external systems. If
there is no external system, you shouldn’t need an Effect.

## Photokin first

For **SQLite-backed lists and aggregates**, do not invent `useEffect` +
`setState` fetch loops. Use:

- `useLiveQuery` in `src/db/connection/useLiveQuery.tsx`
- Domain services in `src/db/api/services/`
- `useLiveAsset` when a single asset should stay in sync

`useLiveQuery` already subscribes to RxJS table observables after `executeInDB`
writes. A second Effect that refetches the same query will race and double-work.

Use Effects for true externals: Tauri window events, DOM/leaflet maps, shortcut
plugins, non-React widgets. Prefer existing hooks (`useWindowControls`,
selection shortcuts) when they already wrap that.

## Quick Reference

| Situation                      | DON'T                          | DO                                    |
| ------------------------------ | ------------------------------ | ------------------------------------- |
| Derived state from props/state | `useState` + `useEffect`       | Calculate during render               |
| Expensive calculations         | `useEffect` to cache           | `useMemo`                             |
| Reset state on prop change     | `useEffect` with `setState`    | `key` prop                            |
| User event responses           | `useEffect` watching state     | Event handler directly                |
| Notify parent of changes       | `useEffect` calling `onChange` | Call in event handler                 |
| Photokin DB collections        | `useEffect` + service call     | `useLiveQuery`                        |
| Other fetch                    | `useEffect` without cleanup    | `useEffect` with cleanup              |

## When You DO Need Effects

- Sync with **external systems** (browser APIs, maps, Tauri events)
- Subscriptions when `useLiveQuery` / `useSyncExternalStore` don’t fit
- Logging because a view appeared (avoid logging photo EXIF/GPS)

## When You DON'T Need Effects

1. Transforming data for rendering — calculate at top level
2. Handling user events — event handlers
3. Deriving state — `const fullName = firstName + ' ' + lastName`
4. Chaining state updates — compute next state in the handler
5. Reloading after a mutation you already did via `executeInDB` — observables
   will refresh `useLiveQuery`

## Decision Tree

```
Need to respond to something?
├── User interaction (click, submit, drag)?
│   └── EVENT HANDLER
├── SQLite query should stay live?
│   └── useLiveQuery / useLiveAsset
├── Component appeared / true external sync?
│   └── EFFECT (with cleanup)
├── Props/state changed and need derived value?
│   └── CALCULATE DURING RENDER (useMemo if expensive)
└── Reset state when identity prop changes?
    └── KEY PROP
```

## Detailed Guidance

- [Anti-Patterns](anti-patterns.md) — common mistakes with fixes
- [Alternatives](alternatives.md) — useMemo, key, lifting state, stores
