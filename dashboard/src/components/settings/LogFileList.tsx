interface LogFileListProps {
  files: Array<{ name: string; size: number; modified: string }>;
  selectedFile?: string;
}

function formatBytes(n: number): string {
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export function LogFileList({ files, selectedFile }: LogFileListProps) {
  if (files.length === 0) {
    return <p class="log-empty">No log files found in .planning/logs/</p>;
  }

  return (
    <ul class="log-file-list">
      {files.map((file) => {
        const isSelected = file.name === selectedFile;
        const date = new Date(file.modified).toLocaleDateString();
        return (
          <li key={file.name}>
            <a
              href={`/settings/logs?file=${encodeURIComponent(file.name)}`}
              class={`log-file-item${isSelected ? ' log-file-item--active' : ''}`}
            >
              <span class="log-file-name">{file.name}</span>
              <span class="log-file-size">{formatBytes(file.size)}</span>
              <span class="log-file-date">{date}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
