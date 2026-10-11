/**
 * The stage menu and the view menu (docs/design/spec.md, Page): the stages in order, the camera presets, the follow-tool toggle and the finish toggle, with the finish-code legend shown while the toggle is on.
 * Each control has an accessible name and a `data-testid`; the menus report choices to their actions and reflect the state they are given.
 */
import { FINISH } from '../contracts/grid';
import type { StageDef } from '../contracts/making';
import { FINISH_FLAT_COLOURS, FINISH_NAMES } from '../viewer/marble';
import type { Preset } from '../viewer/presets';

export interface MenuActions {
  readonly chooseStage: (id: string) => void;
  readonly chooseView: (id: string) => void;
  readonly toggleFollow: () => void;
  readonly toggleFinish: () => void;
}

export interface MenuState {
  /** Stage id of the step at `t`. */
  readonly stage: string;
  readonly view: string;
  readonly follow: boolean;
  readonly finish: boolean;
}

export interface Menus {
  readonly element: HTMLElement;
  readonly legend: HTMLElement;
  update(state: MenuState): void;
}

function select(testId: string, name: string, options: readonly { readonly value: string; readonly text: string }[], onChange: (value: string) => void): HTMLSelectElement {
  const element = document.createElement('select');
  element.dataset['testid'] = testId;
  element.setAttribute('aria-label', name);
  for (const { value, text } of options) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    element.appendChild(option);
  }
  element.addEventListener('change', () => {
    onChange(element.value);
  });
  return element;
}

function toggle(testId: string, name: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.dataset['testid'] = testId;
  element.setAttribute('aria-label', name);
  element.setAttribute('aria-pressed', 'false');
  element.textContent = name;
  element.addEventListener('click', onClick);
  return element;
}

function buildLegend(): HTMLElement {
  const legend = document.createElement('div');
  legend.className = 'panel legend';
  legend.dataset['testid'] = 'finish-legend';
  legend.setAttribute('aria-label', 'Finish codes');
  legend.hidden = true;
  for (const [name, code] of Object.entries(FINISH)) {
    const [r, g, b] = FINISH_FLAT_COLOURS[code];
    const entry = document.createElement('span');
    entry.style.setProperty('--swatch', `rgb(${String(Math.round(r * 255))},${String(Math.round(g * 255))},${String(Math.round(b * 255))})`);
    entry.textContent = `${String(code)} ${FINISH_NAMES[code]}`;
    entry.dataset['testid'] = `finish-${name}`;
    legend.appendChild(entry);
  }
  return legend;
}

export function createMenus(stages: readonly StageDef[], presets: readonly Preset[], actions: MenuActions): Menus {
  const element = document.createElement('div');
  element.className = 'panel menus';
  element.dataset['testid'] = 'menus';

  const stageLabel = document.createElement('label');
  stageLabel.textContent = 'Stage';
  const stageMenu = select(
    'stage-menu',
    'Stage',
    stages.map((stage) => ({ value: stage.id, text: stage.title })),
    actions.chooseStage,
  );
  stageLabel.appendChild(stageMenu);

  const viewLabel = document.createElement('label');
  viewLabel.textContent = 'View';
  const viewMenu = select(
    'view-menu',
    'Camera view',
    presets.map((preset) => ({ value: preset.id, text: preset.label })),
    actions.chooseView,
  );
  viewLabel.appendChild(viewMenu);

  const follow = toggle('follow-toggle', 'Follow tool', actions.toggleFollow);
  const finish = toggle('finish-toggle', 'Finish codes', actions.toggleFinish);
  const legend = buildLegend();
  element.append(stageLabel, viewLabel, follow, finish);

  return {
    element,
    legend,
    update(state) {
      if (stageMenu.value !== state.stage) stageMenu.value = state.stage;
      if (viewMenu.value !== state.view) viewMenu.value = state.view;
      follow.setAttribute('aria-pressed', state.follow ? 'true' : 'false');
      finish.setAttribute('aria-pressed', state.finish ? 'true' : 'false');
      legend.hidden = !state.finish;
    },
  };
}
