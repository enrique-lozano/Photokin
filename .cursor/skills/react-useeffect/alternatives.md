# Better Alternatives to useEffect

Adapted from [Wealthfolio](https://github.com/wealthfolio/wealthfolio/tree/main/.claude/skills/react-useeffect).

## 1. Calculate During Render

```tsx
const fullName = firstName + " " + lastName;
const isValid = firstName.length > 0 && lastName.length > 0;
```

## 2. useMemo for Expensive Calculations

Memoize if filtering/layout of large galleries is actually slow. Don’t
`useMemo` by default.

## 3. Key Prop to Reset State

Reset all local state when an identity changes (`assetId`, `personId`) by
passing `key={id}` to the child.

## 4. Store ID Instead of Object

Keep `selectedId` in state; derive the entity from the live list so selection
survives list refresh.

## 5. Event Handlers for User Actions

Clicks, shortcuts, and form submits belong in handlers (see selection bar /
lightbox), not Effects that watch the result.

## 6. Photokin: useLiveQuery / Zustand / useSyncExternalStore

- **SQLite**: `useLiveQuery` (table observables)
- **Session UI**: Zustand in `src/stores/appState.ts`
- **Browser/OS subscriptions**: `useSyncExternalStore` when wrapping
  `navigator` / window events; otherwise existing system hooks

## 7. Lifting State Up

Shared selection, lightbox scope, and toolbar state live in context or Zustand
already — extend those instead of syncing siblings with Effects.

## 8. Custom Hooks for Non-DB Async

If you fetch something that isn’t SQLite, extract a hook with ignore/cleanup.
Don’t copy that pattern for `AlbumsService.getAll()`.

## Summary

| Need | Solution |
| ------------------------------ | ------------------------------------ |
| Value from props/state | Calculate during render |
| Expensive calculation | `useMemo` |
| Reset all state on prop change | `key` prop |
| Respond to user action | Event handler |
| Live SQLite | `useLiveQuery` / `useLiveAsset` |
| Sync with other external system | `useEffect` with cleanup |
| Subscribe to external store | `useSyncExternalStore` or Zustand |
| Share state between components | Lift / existing store |
