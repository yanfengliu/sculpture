/**
 * The footer (docs/design/spec.md, Page; Model pipeline): the figure's attribution from the grid header's `source` when the page has one, with its licence linked (CC BY-SA 4.0 asks for the licence to be named and linked wherever the work is shown), and the time-lapse statement.
 */
import { TIME_LAPSE_STATEMENT } from './label';

export interface Attribution {
  /** The one-line credit, for example `Scan the World (Jonathan Beck) via Wikimedia Commons, CC BY-SA 4.0`. */
  readonly text: string;
  readonly url?: string;
  /** The licence's name and its text's URL; shown as a link after the credit when both are given. */
  readonly licence?: string;
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
  if (attribution?.licence !== undefined && attribution.licenceUrl !== undefined) {
    const licence = document.createElement('a');
    licence.href = attribution.licenceUrl;
    licence.rel = 'license noopener';
    licence.target = '_blank';
    licence.dataset['testid'] = 'licence';
    licence.textContent = `${attribution.licence} licence`;
    credit.append(' · ', licence);
  }
  const statement = document.createElement('span');
  statement.dataset['testid'] = 'time-lapse';
  statement.textContent = TIME_LAPSE_STATEMENT;
  footer.append(credit, statement);
  return footer;
}
