import { useEffect } from 'react';
import { useStore } from '../state/store';

export const shortcutEvents = new EventTarget();
export function emitCommand(name: string) {
  shortcutEvents.dispatchEvent(new CustomEvent('command', { detail: name }));
}

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'k') {
        e.preventDefault();
        emitCommand('palette');
        return;
      }
      if (e.key === 'Escape') {
        if (st.dialog) {
          st.openDialog(null);
          e.preventDefault();
          return;
        }
      }
      if (mod && key === 'o') {
        e.preventDefault();
        st.openDialog('open');
        return;
      }
      if (mod && key === 'n' && !e.shiftKey) {
        e.preventDefault();
        emitCommand('new');
        return;
      }
      if (!st.project) return;
      if (mod && key === 's') {
        e.preventDefault();
        emitCommand(e.shiftKey ? 'saveAs' : 'save');
        return;
      }
      if (mod && key === 'p') {
        e.preventDefault();
        st.openDialog('print');
        return;
      }
      if (mod && (key === 'z' || key === 'y')) {
        if (isTyping(e)) return;
        e.preventDefault();
        if (key === 'y' || e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if (mod && key === 'f') {
        e.preventDefault();
        emitCommand('search');
        return;
      }
      if (mod && !e.shiftKey && ['1', '2', '3', '4', '5', '6', '7'].includes(e.key)) {
        e.preventDefault();
        st.setView((['gantt', 'sheet', 'lookahead', 'milestones', 'pulse', 'decisions', 'buyout'] as const)[Number(e.key) - 1]);
        return;
      }
      if (mod && key === 'i' && !isTyping(e)) {
        e.preventDefault();
        st.toggleFlag('detailsOpen');
        return;
      }
      if (mod && key === 'l' && !isTyping(e)) {
        e.preventDefault();
        if (e.shiftKey) st.unlinkSelected();
        else st.linkSelected();
        return;
      }
      if (mod && key === 'm' && !isTyping(e)) {
        e.preventDefault();
        st.toggleMilestone(st.selection);
        return;
      }
      if (mod && e.shiftKey && key === 'a' && !isTyping(e)) {
        e.preventDefault();
        st.openDialog('ai-edit');
        return;
      }
      if (e.altKey && e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !isTyping(e)) {
        e.preventDefault();
        if (e.key === 'ArrowRight') st.indent(st.selection);
        else st.outdent(st.selection);
        return;
      }
      if (e.altKey && !e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !isTyping(e)) {
        e.preventDefault();
        st.moveTasks(st.selection, e.key === 'ArrowUp' ? -1 : 1);
        return;
      }
      if (e.key === 'Insert' && !isTyping(e)) {
        e.preventDefault();
        emitCommand('insert');
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
