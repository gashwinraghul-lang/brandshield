/**
 * Keyboard support for WAI-ARIA tabs: arrow keys, Home and End move selection
 * and focus between tabs. The caller owns the active key and panel rendering.
 */
export function tabKeyboard(event, keys, active, onSelect, idFor) {
  const index = keys.indexOf(active);
  if (index === -1) return;
  let next = null;
  if (event.key === 'ArrowRight') next = (index + 1) % keys.length;
  else if (event.key === 'ArrowLeft') next = (index - 1 + keys.length) % keys.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = keys.length - 1;
  if (next === null) return;
  event.preventDefault();
  const key = keys[next];
  onSelect(key);
  requestAnimationFrame(() => document.getElementById(idFor(key))?.focus());
}
