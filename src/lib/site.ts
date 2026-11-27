// Where the project lives, for "edit this record" and "report a problem" links.
export const REPO = 'https://github.com/MC-Meesh/engineering-map';
export const BRANCH = 'main';

export const editUrl = (file: string) => `${REPO}/edit/${BRANCH}/${file}`;

export const reportUrl = (id: string, name: string) =>
  `${REPO}/issues/new?${new URLSearchParams({ template: 'correction.yml', title: `Correction: ${name}`, record: id })}`;
