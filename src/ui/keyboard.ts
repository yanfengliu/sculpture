/**
 * Keyboard shortcuts (docs/design/spec.md, Page): Space play/pause, → step forward, ← step back, Shift+Space play backward, Home start, End end.
 * Keys typed into a text field or a select, and Space or Enter on a focused button (which the button handles itself), are left alone. On the focused scrubber (a range input) only its own keys are, the arrows, Home, End and the page keys: Space, which a range input does nothing with, still plays and pauses.
 */

export interface KeyboardActions {
  readonly playPause: () => void;
  readonly playBackward: () => void;
  readonly stepForward: () => void;
  readonly stepBack: () => void;
  readonly start: () => void;
  readonly end: () => void;
}

function leaveAlone(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement && target.type === 'range') return key !== ' ';
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement || target.isContentEditable) return true;
  return target instanceof HTMLButtonElement && (key === ' ' || key === 'Enter');
}

/** Installs the shortcuts on the window; returns the uninstaller. */
export function installKeyboard(actions: KeyboardActions, target: Window = window): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || leaveAlone(event.target, event.key)) return;
    const handled = dispatch(actions, event.key, event.shiftKey);
    if (handled) event.preventDefault();
  };
  target.addEventListener('keydown', onKeyDown);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
  };
}

/** Runs the action for `key`; false when the key is not a shortcut. */
export function dispatch(actions: KeyboardActions, key: string, shift: boolean): boolean {
  switch (key) {
    case ' ':
      if (shift) actions.playBackward();
      else actions.playPause();
      return true;
    case 'ArrowRight':
      actions.stepForward();
      return true;
    case 'ArrowLeft':
      actions.stepBack();
      return true;
    case 'Home':
      actions.start();
      return true;
    case 'End':
      actions.end();
      return true;
    default:
      return false;
  }
}
