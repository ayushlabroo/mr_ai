// Render the small Markdown subset our local templates produce. Text stays escaped
// by React; neither raw HTML nor user-supplied URLs are executed.
export function DocumentPreview({ markdown }: { markdown: string }) {
  const blocks = markdown
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean);
  return (
    <article className="document-content">
      {blocks.map((block, i) => {
        if (block.startsWith('# ')) return <h2 key={i}>{block.slice(2)}</h2>;
        if (block.startsWith('## ')) return <h3 key={i}>{block.slice(3)}</h3>;
        if (block.startsWith('> ')) return <blockquote key={i}>{block.slice(2)}</blockquote>;
        if (block.startsWith('|')) {
          const rows = block.split('\n').filter((line) => !/^\|[\s:|-]+\|$/.test(line));
          const cells = (row: string) =>
            row
              .split('|')
              .slice(1, -1)
              .map((cell) => cell.trim());
          return (
            <div className="document-table-wrap" key={i}>
              <table>
                <thead>
                  <tr>
                    {cells(rows[0]).map((cell, j) => (
                      <th key={j}>{cell}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(1).map((row, j) => (
                    <tr key={j}>
                      {cells(row).map((cell, k) => (
                        <td key={k}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.startsWith('- '))
          return (
            <ul key={i}>
              {block.split('\n').map((line, j) => (
                <li key={j}>{line.replace(/^- /, '')}</li>
              ))}
            </ul>
          );
        if (/^\d+\. /.test(block))
          return (
            <ol key={i}>
              {block.split('\n').map((line, j) => (
                <li key={j}>{line.replace(/^\d+\. /, '')}</li>
              ))}
            </ol>
          );
        return <p key={i}>{block}</p>;
      })}
    </article>
  );
}
