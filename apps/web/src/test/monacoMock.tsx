import type { ReactNode } from 'react';
import styles from './monacoMock.module.css';

export type EditorProps = {
  value?: string;
  defaultValue?: string;
  onChange?: (value?: string) => void;
  height?: string | number;
  language?: string;
  options?: Record<string, unknown>;
};

export default function Editor(props: EditorProps): ReactNode {
  return (
    <textarea
      aria-label="steps-editor"
      className={styles.textarea}
      value={props.value ?? props.defaultValue ?? ''}
      onChange={(e) => props.onChange?.(e.target.value)}
    />
  );
}
