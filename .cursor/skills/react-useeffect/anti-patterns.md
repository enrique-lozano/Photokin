# useEffect Anti-Patterns

Adapted from [Wealthfolio](https://github.com/wealthfolio/wealthfolio/tree/main/.claude/skills/react-useeffect).

## 1. Redundant State for Derived Values

```tsx
// BAD
function Form() {
  const [firstName, setFirstName] = useState("Taylor");
  const [lastName, setLastName] = useState("Swift");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    setFullName(firstName + " " + lastName);
  }, [firstName, lastName]);
}

// GOOD
function Form() {
  const [firstName, setFirstName] = useState("Taylor");
  const [lastName, setLastName] = useState("Swift");
  const fullName = firstName + " " + lastName;
}
```

**Why**: Extra render with a stale value, then another render.

---

## 2. Filtering/Transforming Data in Effect

```tsx
// BAD
function TodoList({ todos, filter }) {
  const [visibleTodos, setVisibleTodos] = useState([]);

  useEffect(() => {
    setVisibleTodos(getFilteredTodos(todos, filter));
  }, [todos, filter]);
}

// GOOD
function TodoList({ todos, filter }) {
  const visibleTodos = useMemo(
    () => getFilteredTodos(todos, filter),
    [todos, filter],
  );
}
```

---

## 3. Resetting State on Prop Change

```tsx
// BAD
function ProfilePage({ userId }) {
  const [comment, setComment] = useState("");

  useEffect(() => {
    setComment("");
  }, [userId]);
}

// GOOD
function ProfilePage({ userId }) {
  return <Profile userId={userId} key={userId} />;
}
```

---

## 4. Event-Specific Logic in Effect

```tsx
// BAD — fires on refresh if already in cart
function ProductPage({ product, addToCart }) {
  useEffect(() => {
    if (product.isInCart) {
      showNotification(`Added ${product.name}!`);
    }
  }, [product]);

  function handleBuyClick() {
    addToCart(product);
  }
}

// GOOD
function ProductPage({ product, addToCart }) {
  function handleBuyClick() {
    addToCart(product);
    showNotification(`Added ${product.name}!`);
  }
}
```

---

## 5. Chains of Effects

Don’t chain Effects that only exist to update other state. Compute the next
state in the event handler. Derive booleans during render (`round > 5`).

---

## 6. Notifying Parent via Effect

Call `onChange` in the same event as `setState`, or make the component
controlled. Don’t `useEffect(() => onChange(value), [value])`.

---

## 7. Passing Data Up to Parent

Data flows down. Parent loads (or `useLiveQuery`s); children receive props.
Don’t have a child fetch and push up through an Effect.

---

## 8. Fetching Without Cleanup (Race Condition)

If you must fetch in an Effect, ignore stale responses:

```tsx
useEffect(() => {
  let ignore = false;
  fetchResults(query).then((json) => {
    if (!ignore) setResults(json);
  });
  return () => {
    ignore = true;
  };
}, [query]);
```

In Photokin, prefer `useLiveQuery` so this pattern stays rare.

---

## 9. App Initialization in Effect

Module-level guards or existing bootstrap (DB open in `dbInstance`) beat
`useEffect(() => init(), [])` that runs twice in Strict Mode.
