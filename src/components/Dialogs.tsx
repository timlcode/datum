import { useEffect, useState } from 'react';
import { Keyboard, Info, X } from 'lucide-react';
import { api } from '../api';
import { useStore } from '../state/store';
import type { FileActions } from '../hooks/useFileActions';
import { shortcutEvents } from '../hooks/useShortcuts';
import { FileDialog } from './FileDialog';
import { AiBuildDialog } from './AiBuildDialog';
import { AiEditDialog } from './AiEditDialog';
import { PrintDialog } from './PrintDialog';
import { SettingsDialog } from './SettingsDialog';
import { CommandPalette } from './CommandPalette';
import { Logo } from './Logo';

const SHORTCUTS: [string, string][] = [
  ['Ctrl+K', 'Command palette'],
  ['Ctrl+N / O / S', 'New / Open / Save'],
  ['Ctrl+Shift+S', 'Save as'],
  ['Ctrl+P', 'Print / PDF'],
  ['Ctrl+Z / Ctrl+Y', 'Undo / Redo'],
  ['Ctrl+1…7', 'Switch views (Gantt through Buyout)'],
  ['Ctrl+F', 'Find task'],
  ['Ctrl+I', 'Task details panel'],
  ['Insert', 'Insert task below'],
  ['Delete', 'Delete selected tasks'],
  ['Enter / F2', 'Edit cell'],
  ['Tab', 'Next cell while editing'],
  ['Alt+Shift+→ / ←', 'Indent / outdent'],
  ['Alt+↑ / ↓', 'Move task up / down'],
  ['Ctrl+L', 'Link selected (finish-to-start)'],
  ['Ctrl+Shift+L', 'Unlink selected'],
  ['Ctrl+M', 'Toggle milestone'],
  ['Ctrl+Shift+A', 'Change schedule with AI'],
  ['Space', 'Collapse / expand summary'],
  ['Shift+click / Ctrl+click', 'Select range / toggle'],
];

export function Dialogs({ files }: { files: FileActions }) {
  const dialog = useStore((s) => s.dialog);
  const openDialog = useStore((s) => s.openDialog);
  const project = useStore((s) => s.project);
  const [palette, setPalette] = useState(false);
  const [version, setVersion] = useState('0.2.0');

  useEffect(() => {
    api.health().then((h) => setVersion(h.version)).catch(() => {});
  }, []);

  useEffect(() => {
    const h = (e: Event) => {
      if ((e as CustomEvent<string>).detail === 'palette') setPalette((p) => !p);
    };
    shortcutEvents.addEventListener('command', h);
    return () => shortcutEvents.removeEventListener('command', h);
  }, []);

  const close = () => openDialog(null);

  return (
    <>
      {dialog === 'open' && <FileDialog mode="open" onClose={close} onOpen={(p) => files.openPath(p)} />}
      {dialog === 'saveAs' && project && <FileDialog mode="save" onClose={close} onSave={(p) => files.saveTo(p)} />}
      {dialog === 'ai-build' && <AiBuildDialog onClose={close} />}
      {dialog === 'ai-edit' && project && <AiEditDialog onClose={close} />}
      {dialog === 'print' && project && <PrintDialog onClose={close} />}
      {dialog === 'settings' && project && <SettingsDialog onClose={close} />}
      {dialog === 'shortcuts' && (
        <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="dialog lg">
            <div className="d-head"><Keyboard /><h2>Keyboard shortcuts</h2><button className="icon-btn x" onClick={close}><X /></button></div>
            <div className="d-body">
              <div className="shortcuts-grid">
                {SHORTCUTS.map(([k, v]) => <div key={k}><span>{v}</span><kbd>{k}</kbd></div>)}
              </div>
            </div>
          </div>
        </div>
      )}
      {dialog === 'about' && (
        <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="dialog">
            <div className="d-head"><Info /><h2>About Datum</h2><button className="icon-btn x" onClick={close}><X /></button></div>
            <div className="d-body" style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <Logo size={56} />
              <div style={{ color: 'var(--fg-1)', lineHeight: 1.55 }}>
                <b style={{ fontSize: 16 }}>Datum {version}</b>
                <p style={{ margin: '6px 0' }}>Construction scheduling with a critical path, a Gantt chart, and a field office attached. Opens Microsoft Project and Primavera files, saves Project XML, and keeps decisions and buyout on the same job.</p>
                <p style={{ margin: '6px 0', color: 'var(--fg-2)', fontSize: 12 }}>Plain-English edits are optional. Point Datum at an OpenAI-compatible endpoint or a local command when you want them. PDF export uses a local Chromium. Licensed AGPL-3.0.</p>
              </div>
            </div>
          </div>
        </div>
      )}
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </>
  );
}
