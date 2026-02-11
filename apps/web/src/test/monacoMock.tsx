import type { ReactNode } from 'react';

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
      style={{ width: '100%', minHeight: 200 }}
      value={props.value ?? props.defaultValue ?? ''}
      onChange={(e) => props.onChange?.(e.target.value)}
    />
  );
}
