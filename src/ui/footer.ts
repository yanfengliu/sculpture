/**
 * The footer (docs/design/spec.md, Page; Model pipeline): the figure's attribution from the grid header's `source` when the page has one, and the time-lapse statement.
 */
import { TIME_LAPSE_STATEMENT } from './label';

export interface Attribution {
  /** The one-line credit, for example `Scan the World (Jonathan Beck) via Wikimedia Commons, CC BY-SA 4.0`. */
  readonly text: string;
  readonly url?: string;
  readonly licenceUrl?: string;
}

export function createFooter(attribution: Attribution | null): HTMLElement {
  const footer = document.createElement('footer');
  footer.className = 'footer';
  footer.dataset['testid'] = 'footer';
  const credit = document.createElement('span');
  credit.dataset['testid'] = 'attribution';
  if (attribution === null) {
    credit.textContent = 'Figure: no grid loaded.';
  } else if (attribution.url === undefined) {
    credit.textContent = `Figure: ${attribution.text}`;
  } else {
    const link = document.createElement('a');
    link.href = attribution.url;
    link.rel = 'noopener';
    link.target = '_blank';
    link.textContent = attribution.text;
    credit.append('Figure: ', link);
  }
  const statement = document.createElement('span');
  statement.dataset['testid'] = 'time-lapse';
  statement.textContent = TIME_LAPSE_STATEMENT;
  footer.append(credit, statement);
  return footer;
}
