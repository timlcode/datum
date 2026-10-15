import { useCallback, useMemo } from 'react';
import { api } from '../api';
import { blankProject, clearAutosave, useStore } from '../state/store';
import type { Project } from '@engine/types';
import { schoolTemplate } from '../templates/school';

export interface FileActions {
  openPath: (path: string) => Promise<void>;
  save: () => Promise<void>;
  saveAs: () => void;
  saveTo: (path: string) => Promise<void>;
  newBlank: () => void;
  newFromTemplate: () => void;
  close: () => void;
}

export function useFileActions(): FileActions {
  const openPath = useCallback(async (path: string) => {
    const st = useStore.getState();
    if (st.dirty && !confirm('You have unsaved changes. Discard them and open the file?')) return;
    st.setBusy('Opening…');
    try {
      const { project } = await api.open(path);
      useStore.getState().setProject(project);
      useStore.getState().openDialog(null);
      const ext = path.split('.').pop()?.toLowerCase();
      useStore.getState().toast(
        ext === 'mpp' ? `Opened ${project.tasks.length} tasks from Project. Saving writes MS Project XML.` : `Opened ${project.tasks.length} tasks.`,
        'success',
      );
    } catch (err) {
      useStore.getState().toast((err as Error).message, 'error');
    } finally {
      useStore.getState().setBusy(null);
    }
  }, []);

  const saveTo = useCallback(async (path: string) => {
    const st = useStore.getState();
    if (!st.project) return;
    st.setBusy('Saving…');
    try {
      const { path: saved } = await api.save(st.project, path);
      useStore.getState().markSaved(saved);
      useStore.getState().openDialog(null);
      useStore.getState().toast(`Saved to ${saved.split('/').pop()}`, 'success');
    } catch (err) {
      useStore.getState().toast((err as Error).message, 'error');
    } finally {
      useStore.getState().setBusy(null);
    }
  }, []);

  const save = useCallback(async () => {
    const st = useStore.getState();
    if (!st.project) return;
    const fp = st.project.filePath;
    if (!fp || fp.toLowerCase().endsWith('.mpp') || !/\.(xml|mspdi)$/i.test(fp)) {
      st.openDialog('saveAs');
      return;
    }
    await saveTo(fp);
  }, [saveTo]);

  const saveAs = useCallback(() => useStore.getState().openDialog('saveAs'), []);

  const newBlank = useCallback(() => {
    const st = useStore.getState();
    if (st.dirty && !confirm('You have unsaved changes. Discard them?')) return;
    st.setProject(blankProject(), { dirty: true });
    st.openDialog('settings');
  }, []);

  const newFromTemplate = useCallback(() => {
    const st = useStore.getState();
    if (st.dirty && !confirm('You have unsaved changes. Discard them?')) return;
    const p: Project = schoolTemplate();
    st.setProject(p, { dirty: true });
    st.toast('School expansion template loaded. Set your start date in Project Settings.', 'info');
  }, []);

  const close = useCallback(() => {
    const st = useStore.getState();
    if (st.dirty && !confirm('You have unsaved changes. Close anyway?')) return;
    clearAutosave();
    st.setProject(null);
  }, []);

  return useMemo(() => ({ openPath, save, saveAs, saveTo, newBlank, newFromTemplate, close }), [openPath, save, saveAs, saveTo, newBlank, newFromTemplate, close]);
}
