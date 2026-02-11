import Editor from '@monaco-editor/react';
import type { ReactNode } from 'react';

export function StepsEditor(props: {
  value: string;
  onChange: (next: string) => void;
}): ReactNode {
  return (
    <Editor
      language="json"
      height={320}
      value={props.value}
      onChange={(v) => props.onChange(v ?? '')}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        wordWrap: 'on',
        scrollBeyondLastLine: false,
      }}
    />
  );
}
