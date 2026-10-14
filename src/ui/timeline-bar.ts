/**
 * The timeline bar (docs/design/spec.md, Page): start, step back, play backward, play/pause, step forward, end; the speed control; the scrubber over `[0, N]` with the stage boundaries marked; the label and the detail line.
 * Every control has an accessible name and a `data-testid`. The bar only reports input to its actions and reflects the state it is given; the player owns the position.
 */
import type { PlayDirection } from '../contracts/making';
import type { Speed } from '../timeline/player';
import { SPEEDS } from '../timeline/player';

export interface StageMark {
  readonly id: string;
  readonly title: string;
  /** Timeline position of the stage's first step. */
  readonly t: number;
}

export interface TimelineActions {
  readonly start: () => void;
  readonly stepBack: () => void;
  readonly playBackward: () => void;
  readonly playPause: () => void;
  readonly stepForward: () => void;
  readonly end: () => void;
  readonly seek: (t: number) => void;
  readonly setSpeed: (speed: Speed) => void;
}

export interface TimelineState {
  readonly t: number;
  readonly N: number;
  readonly playing: PlayDirection | null;
  readonly speed: Speed;
  readonly label: string;
  readonly detail: string;
}

export interface TimelineBar {
  readonly element: HTMLElement;
  update(state: TimelineState): void;
}

const SCRUBBER_STEP = 0.001;

function button(testId: string, name: string, text: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.dataset['testid'] = testId;
  element.setAttribute('aria-label', name);
  element.title = name;
  element.textContent = text;
  element.addEventListener('click', onClick);
  return element;
}

export function createTimelineBar(N: number, marks: readonly StageMark[], actions: TimelineActions): TimelineBar {
  const element = document.createElement('div');
  element.className = 'panel bar';
  element.dataset['testid'] = 'timeline-bar';

  const label = document.createElement('div');
  label.className = 'label';
  label.dataset['testid'] = 'label';
  // The label's date changes several times a second while playing, so it is not a live region: screen readers hear the step, from this status line, when the step changes.
  const status = document.createElement('div');
  status.className = 'sr-only';
  status.setAttribute('role', 'status');
  status.dataset['testid'] = 'step-status';
  const detail = document.createElement('div');
  detail.className = 'detail';
  detail.dataset['testid'] = 'detail';

  const scrub = document.createElement('div');
  scrub.className = 'scrub';
  const markRow = document.createElement('div');
  markRow.className = 'marks';
  markRow.dataset['testid'] = 'stage-marks';
  marks.forEach((mark, index) => {
    const tick = document.createElement('span');
    tick.className = 'mark';
    tick.dataset['testid'] = `stage-mark-${mark.id}`;
    tick.title = mark.title;
    const next = marks[index + 1]?.t ?? N;
    tick.style.left = `${String(N > 0 ? (100 * mark.t) / N : 0)}%`;
    // Each title is clipped at the next stage's mark, so long titles do not run into each other.
    tick.style.width = `${String(N > 0 ? (100 * (next - mark.t)) / N : 100)}%`;
    tick.textContent = mark.title;
    markRow.appendChild(tick);
  });
  const scrubber = document.createElement('input');
  scrubber.type = 'range';
  scrubber.className = 'scrubber';
  scrubber.dataset['testid'] = 'scrubber';
  scrubber.setAttribute('aria-label', 'Timeline position');
  scrubber.min = '0';
  scrubber.max = String(N);
  scrubber.step = String(SCRUBBER_STEP);
  scrubber.value = '0';
  scrubber.addEventListener('input', () => {
    actions.seek(Number(scrubber.value));
  });
  // A mouse scrub hands the keys back to the page, so Space and the arrows play and step instead of nudging the thumb; a scrubber focused from the keyboard keeps its arrows.
  scrubber.addEventListener('pointerup', () => {
    scrubber.blur();
  });
  scrub.append(markRow, scrubber);

  const buttons = document.createElement('div');
  buttons.className = 'buttons';
  const playPause = button('play-pause', 'Play', '▶', actions.playPause);
  const playBackward = button('play-backward', 'Play backward', '◀', actions.playBackward);
  playBackward.setAttribute('aria-pressed', 'false');
  const speedLabel = document.createElement('label');
  speedLabel.textContent = 'Speed';
  const speed = document.createElement('select');
  speed.dataset['testid'] = 'speed';
  speed.setAttribute('aria-label', 'Playback speed');
  for (const value of SPEEDS) {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = `${String(value)}×`;
    speed.appendChild(option);
  }
  speed.value = '1';
  speed.addEventListener('change', () => {
    const chosen = SPEEDS.find((value) => String(value) === speed.value);
    if (chosen !== undefined) actions.setSpeed(chosen);
  });
  speedLabel.appendChild(speed);
  const time = document.createElement('span');
  time.className = 'time';
  time.dataset['testid'] = 'time';
  buttons.append(
    button('start', 'Go to start', '⏮', actions.start),
    button('step-back', 'Step back', '⏴', actions.stepBack),
    playBackward,
    playPause,
    button('step-forward', 'Step forward', '⏵', actions.stepForward),
    button('end', 'Go to end', '⏭', actions.end),
    speedLabel,
    time,
  );
  element.append(label, status, detail, scrub, buttons);

  let lastLabel = '';
  let lastDetail = '';
  let lastStatus = '';
  return {
    element,
    update(state) {
      if (state.label !== lastLabel) {
        lastLabel = state.label;
        label.textContent = state.label;
        // `<stage> — <title>`, the label's last part: it changes only with the step.
        const step = state.label.slice(state.label.lastIndexOf(' · ') + ' · '.length);
        if (step !== lastStatus) {
          lastStatus = step;
          status.textContent = step;
        }
      }
      if (state.detail !== lastDetail) {
        lastDetail = state.detail;
        detail.textContent = state.detail;
      }
      const value = String(Math.round(state.t / SCRUBBER_STEP) * SCRUBBER_STEP);
      if (scrubber.value !== value) scrubber.value = value;
      scrubber.setAttribute('aria-valuetext', `${state.t.toFixed(2)} of ${String(state.N)}`);
      const pauseable = state.playing !== null;
      playPause.textContent = pauseable ? '⏸' : '▶';
      playPause.setAttribute('aria-label', pauseable ? 'Pause' : 'Play');
      playPause.title = pauseable ? 'Pause' : 'Play';
      playBackward.setAttribute('aria-pressed', state.playing === 'backward' ? 'true' : 'false');
      if (speed.value !== String(state.speed)) speed.value = String(state.speed);
      time.textContent = `t = ${state.t.toFixed(2)} / ${String(state.N)}`;
    },
  };
}
