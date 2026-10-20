import type { Workspace } from './tasks';
import type { DraftRequest, GatewayReply, GatewayStatus } from './gateway-types';

declare global {
  interface Window {
    ayra?: {
      platform: string;
      gatewayStatus: () => Promise<GatewayStatus>;
      startDraft: (request: DraftRequest) => Promise<GatewayReply>;
      getDraft: (id: string) => Promise<GatewayReply>;
      cancelDraft: (id: string) => Promise<GatewayReply>;
      selectWorkspace: () => Promise<Workspace | null>;
      exportDocument: (document: {
        title: string;
        markdown: string;
      }) => Promise<{ saved: boolean; name?: string }>;
    };
  }
}

export async function exportMarkdown(title: string, markdown: string): Promise<boolean> {
  if (window.ayra) return (await window.ayra.exportDocument({ title, markdown })).saved;
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 80) || 'MrAI brief'}.md`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}
