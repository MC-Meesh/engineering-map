// Small rule-based highlighters. Classes: k keyword, e entity or element name, s string,
// n number, c comment, a attribute, p punctuation, ref reference (data-ref = key).
import { esc } from './types';

export type Rule = [RegExp, string, ((m: string) => string)?];

/** Builds a tokenizer from sticky regexes, tried in order at each position. */
export function rules(list: Rule[]): (line: string) => string {
  const rs = list.map(([re, cls, key]) => [new RegExp(re.source, re.flags.includes('y') ? re.flags : re.flags + 'y'), cls, key] as const);
  return (line: string) => {
    let out = '';
    let i = 0;
    let plain = '';
    const flush = () => { if (plain) { out += esc(plain); plain = ''; } };
    while (i < line.length) {
      let hit = false;
      for (const [re, cls, key] of rs) {
        re.lastIndex = i;
        const m = re.exec(line);
        if (!m || !m[0].length) continue;
        flush();
        const t = m[0];
        if (cls === 'ref') out += `<span class="ref" data-ref="${esc(key ? key(t) : t)}">${esc(t)}</span>`;
        else if (cls) out += `<span class="${cls}">${esc(t)}</span>`;
        else out += esc(t);
        i += t.length;
        hit = true;
        break;
      }
      if (!hit) { plain += line[i]; i++; }
    }
    flush();
    return out;
  };
}

const NUM: Rule = [/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eEdD][-+]?\d+)?/, 'n'];
const WORD: Rule = [/[A-Za-z_][\w.]*/, ''];

export const TOK = {
  p21: rules([
    [/\/\*.*?(?:\*\/|$)/, 'c'],
    [/'(?:[^']|'')*'?/, 's'],
    [/#\d+/, 'ref'],
    [/\.[A-Z_]+\./, 'k'],
    [/(?:END-)?ISO-10303-21|HEADER|ENDSEC|DATA/, 'k'],
    [/[A-Z][A-Z0-9_]*(?=\s*\()/, 'e'],
    NUM,
    [/[$*]/, 'p'],
  ]),
  keyword: (comment: RegExp, keyword: RegExp) =>
    rules([[comment, 'c'], [/"[^"]*"?/, 's'], [keyword, 'k'], NUM, WORD]),
  code: (kw: string[], comment: RegExp = /\/\/.*|\/\*.*?(?:\*\/|$)/) =>
    rules([[comment, 'c'], [/"(?:[^"\\]|\\.)*"?/, 's'], [new RegExp(`\\b(?:${kw.join('|')})\\b`), 'k'], NUM, WORD]),
  xml: rules([
    [/<!--.*?(?:-->|$)/, 'c'],
    [/<\?[\w-]+|\?>/, 'k'],
    [/<\/?[\w:.-]+|\/?>/, 'e'],
    [/[\w:.-]+(?==)/, 'a'],
    [/"[^"]*"?|'[^']*'?/, 's'],
    NUM,
  ]),
};
