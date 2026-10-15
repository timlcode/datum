import { schoolTemplate } from '../src/templates/school';
import { writeFileSync } from 'node:fs';

const project = schoolTemplate();
// Mark some progress and set a baseline so the reports have something to show.
project.tasks[1].percentComplete = 100;
project.tasks[2].percentComplete = 60;
project.tasks[3].percentComplete = 20;
for (const t of project.tasks) { t.baselineStart = undefined; }
writeFileSync('/tmp/school-template.json', JSON.stringify(project));

const views = [
  { view: 'gantt', paper: 'tabloid', orientation: 'landscape', columns: ['id', 'name', 'dur', 'start', 'finish', 'pred'], chartShare: 0.6, showLinks: true, showLabels: false, legend: true, notes: 'Preliminary schedule for discussion. Durations in working days; 5-day week, US holidays excluded.' },
  { view: 'sheet', paper: 'letter', orientation: 'landscape', columns: ['id', 'wbs', 'name', 'dur', 'start', 'finish', 'pred', 'resource', 'pct', 'slack'], legend: false },
  { view: 'lookahead', paper: 'letter', orientation: 'landscape', weeks: 3, legend: true },
  { view: 'milestones', paper: 'letter', orientation: 'portrait', legend: false },
];
for (const options of views) {
  const res = await fetch('http://127.0.0.1:4517/api/print/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, options: { ...options, outPath: `/tmp/datum-shots/${options.view}.pdf` } }),
  });
  console.log(options.view, await res.text());
}
