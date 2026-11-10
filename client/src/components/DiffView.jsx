import { useMemo } from 'react';
import styles from './DiffView.module.css';

function tokenize(value) {
  return String(value || '').split(/(\s+)/).filter((token) => token.length > 0);
}

function sameToken(left, right) {
  if (!left.trim() || !right.trim()) return left === right;
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function diff(original, proposed) {
  const left = tokenize(original).slice(0, 400);
  const right = tokenize(proposed).slice(0, 400);
  const rows = left.length + 1;
  const columns = right.length + 1;
  const table = Array.from({ length: rows }, () => new Uint16Array(columns));
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < columns; j += 1) {
      table[i][j] = sameToken(left[i - 1], right[j - 1])
        ? table[i - 1][j - 1] + 1
        : Math.max(table[i - 1][j], table[i][j - 1]);
    }
  }
  const operations = [];
  let i = left.length;
  let j = right.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && sameToken(left[i - 1], right[j - 1])) {
      operations.push({ type: 'same', value: left[i - 1] });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || table[i][j - 1] >= table[i - 1][j])) {
      operations.push({ type: 'add', value: right[j - 1] });
      j -= 1;
    } else {
      operations.push({ type: 'remove', value: left[i - 1] });
      i -= 1;
    }
  }
  return operations.reverse();
}

export default function DiffView({ original, proposed, label = 'Proposed replacement' }) {
  const operations = useMemo(() => diff(original, proposed), [original, proposed]);
  if (!proposed) return null;
  return (
    <div className={styles.wrap}>
      <div className={styles.columns}>
        <div>
          <p className={styles.label}>Original</p>
          <p className={styles.original}>{original || '—'}</p>
        </div>
        <div>
          <p className={styles.label}>{label}</p>
          <p className={styles.proposed}>{proposed}</p>
        </div>
      </div>
      <div className={styles.inline} aria-label="Word-level difference">
        {operations.map((operation, index) => (
          <span
            key={index}
            className={operation.type === 'add' ? styles.add : operation.type === 'remove' ? styles.remove : undefined}
          >
            {operation.value}
          </span>
        ))}
      </div>
      <p className={styles.legend}>
        <span className={styles.removeKey}>Removed</span>
        <span className={styles.addKey}>Added</span>
      </p>
    </div>
  );
}
