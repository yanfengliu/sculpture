/**
 * The page chrome (docs/design/spec.md, Page): composes the menus, the timeline bar and the footer over the canvas, and turns the making's step at `t` into the label and the detail line.
 * `?noui=1` skips this module entirely; the keyboard shortcuts (keyboard.ts) are installed by src/main.ts in either case.
 */
import './style.css';

import type { Making, PlayDirection } from '../contracts/making';
import type { RenderedTool, ToolNames } from '../viewer/bundle';
import type { Preset } from '../viewer/presets';
import type { Speed } from '../timeline/player';
import type { Attribution } from './footer';
import { createFooter } from './footer';
import { formatDetail, formatLabel } from './label';
import type { MenuActions } from './menus';
import { createMenus } from './menus';
import type { StageMark, TimelineActions } from './timeline-bar';
import { createTimelineBar } from './timeline-bar';

export type { Attribution } from './footer';

export interface UiOptions {
  readonly making: Making;
  readonly presets: readonly Preset[];
  readonly attribution: Attribution | null;
  readonly toolNames: (tool: RenderedTool) => ToolNames;
  readonly actions: TimelineActions & MenuActions;
}

export interface UiState {
  readonly t: number;
  readonly playing: PlayDirection | null;
  readonly speed: Speed;
  readonly view: string;
  readonly follow: boolean;
  readonly finish: boolean;
}

export interface Ui {
  readonly element: HTMLElement;
  update(state: UiState): void;
}

/** The step the label describes at `t`: step `floor(t)` with its local progress, the last step complete at `t = N`. */
export function stepAt(making: Making, t: number): { index: number; f: number } {
  const index = Math.max(0, Math.min(making.N - 1, Math.floor(t)));
  return { index, f: Math.min(1, Math.max(0, t - index)) };
}

/** Timeline position of each stage's first step, for the scrubber marks and the stage menu. */
export function stageMarks(making: Making): StageMark[] {
  return making.stages.flatMap((stage) => {
    const first = making.steps.findIndex((step) => step.stage === stage.id);
    return first < 0 ? [] : [{ id: stage.id, title: stage.title, t: first }];
  });
}

export function createUi(container: HTMLElement, options: UiOptions): Ui {
  const { making } = options;
  const element = document.createElement('div');
  element.className = 'chrome';
  element.dataset['testid'] = 'chrome';
  const menus = createMenus(making.stages, options.presets, options.actions);
  const bar = createTimelineBar(making.N, stageMarks(making), options.actions);
  element.append(menus.element, menus.legend, bar.element, createFooter(options.attribution));
  container.appendChild(element);

  return {
    element,
    update(state) {
      const { index, f } = stepAt(making, state.t);
      const step = making.steps[index];
      const stageTitle = making.stages.find((stage) => stage.id === step?.stage)?.title ?? step?.stage ?? '';
      bar.update({
        t: state.t,
        N: making.N,
        playing: state.playing,
        speed: state.speed,
        label: step === undefined ? 'No steps' : formatLabel(step, stageTitle, f),
        detail: step === undefined ? '' : formatDetail(step, options.toolNames(step.tool)),
      });
      menus.update({ stage: step?.stage ?? '', view: state.view, follow: state.follow, finish: state.finish });
    },
  };
}
