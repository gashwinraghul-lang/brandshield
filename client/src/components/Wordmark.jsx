import styles from './Wordmark.module.css';

export default function Wordmark({ as: Tag = 'span', className = '', showBy = true }) {
  return (
    <Tag className={`${styles.wordmark} ${className}`} aria-label="BrandShield.ai by Inkloom AI">
      <span>BrandShield</span>
      <span className={styles.accent}>.ai</span>
      {showBy && <span className={styles.by}>by Inkloom AI</span>}
    </Tag>
  );
}
