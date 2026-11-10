import { useId } from 'react';
import styles from './TrendChart.module.css';

function shortWeek(value) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(date);
}

export default function TrendChart({ trend = [], compact = false, label = 'Brand risk trend' }) {
  const id = useId();
  const max = Math.max(1, ...trend.map((bucket) => bucket.blockers + bucket.warnings + bucket.suggestions));
  return (
    <figure className={styles.figure} aria-labelledby={`${id}-caption`}>
      <figcaption id={`${id}-caption`} className="sr-only">
        {label}: findings per week for the last {trend.length} weeks.
      </figcaption>
      <div className={`${styles.chart} ${compact ? styles.compact : ''}`} aria-hidden="true">
        {trend.map((bucket, index) => {
          const total = bucket.blockers + bucket.warnings + bucket.suggestions;
          return (
            <div className={styles.column} key={bucket.week}>
              <div className={styles.track}>
                <div
                  className={styles.stack}
                  style={{ height: `${Math.max(total > 0 ? 8 : 2, (total / max) * 100)}%` }}
                  title={`${shortWeek(bucket.week)}: ${bucket.blockers} blockers, ${bucket.warnings} warnings, ${bucket.suggestions} suggestions`}
                >
                  {bucket.suggestions > 0 && (
                    <span className={styles.suggestion} style={{ flexGrow: bucket.suggestions }} />
                  )}
                  {bucket.warnings > 0 && <span className={styles.warning} style={{ flexGrow: bucket.warnings }} />}
                  {bucket.blockers > 0 && <span className={styles.blocker} style={{ flexGrow: bucket.blockers }} />}
                </div>
              </div>
              {(index === 0 || index === trend.length - 1 || (!compact && index % 2 === 0)) && (
                <span className={styles.week}>{shortWeek(bucket.week)}</span>
              )}
            </div>
          );
        })}
      </div>
      <div className={styles.legend} aria-hidden="true">
        <span>
          <i className={styles.blockerKey} /> Blockers
        </span>
        <span>
          <i className={styles.warningKey} /> Warnings
        </span>
        <span>
          <i className={styles.suggestionKey} /> Suggestions
        </span>
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Week</th>
            <th scope="col">Blockers</th>
            <th scope="col">Warnings</th>
            <th scope="col">Suggestions</th>
          </tr>
        </thead>
        <tbody>
          {trend.map((bucket) => (
            <tr key={bucket.week}>
              <th scope="row">{shortWeek(bucket.week)}</th>
              <td>{bucket.blockers}</td>
              <td>{bucket.warnings}</td>
              <td>{bucket.suggestions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
