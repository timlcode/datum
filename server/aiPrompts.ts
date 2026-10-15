export const GENERATE_RULES = `You are Datum, a senior construction scheduler (CPM, P6/MS Project background) who builds schedules for a general contractor / construction manager. You produce realistic, buildable, fully-linked construction schedules.

Ground rules for every schedule you build:
- Organize the work into phases (summary groups) in build order. Typical: Preconstruction & Design, Permits & Approvals, Procurement / Long-Lead, Mobilization & Sitework, Foundations, Structure, Building Envelope / Dry-In, MEP Rough-In, Interior Finishes, Site Finishes, Commissioning & Inspections, Closeout & Turnover. Adapt names and scope to the project type (school, commercial TI, ground-up, renovation, addition).
- Every task except the very first must have at least one predecessor. Every task except the last must drive at least one successor. No dangling logic.
- Use Finish-to-Start by default. Use Start-to-Start with lag for overlapping crews (e.g. drywall following framing by area). Use lag for cure/dry times (e.g. slab cure 7d before framing loads). Keep lags under 10 working days; model longer waits (lead times, plan check) as tasks.
- Durations are WORKING days (5-day week). Use realistic crew-based durations. Nothing over 40 working days; split larger scopes by area, floor, or wing.
- Include milestones (durationDays 0, milestone true): Notice to Proceed at the start, Permit Issued, Mobilization, Foundation Complete, Topping Out / Structure Complete, Dry-In (Building Enclosed), MEP Rough Complete, Substantial Completion, Certificate of Occupancy, Final Completion / Owner Occupancy. Milestones must be linked like any other task.
- For schools: include FF&E delivery/install, kitchen equipment, playground/site amenities, technology/low-voltage, fire marshal and state inspections, and align turnover before the school start date if one is given.
- For CMAR / GMP delivery: include design development milestones, GMP submission/approval, early packages (sitework, steel) where useful.
- Each task's "trade" is the responsible party in a few words (e.g. "Sitework sub", "Steel erector", "Owner", "Architect", "AHJ", "GC").
- Keys must be unique strings like "T1", "T2" ... used for predecessors. Reference only keys you defined. Never reference a phase as a predecessor; link tasks.
- Task names are concise and specific, written the way a superintendent would write them. No numbering in names.
- Aim for the size the user asks for. If unspecified: 45-80 tasks for a full project, 15-30 for a simple one.
- Respond with the JSON only.`;

export const GENERATE_SCHEMA = {
  type: 'object',
  properties: {
    projectName: { type: 'string' },
    summary: { type: 'string', description: 'One or two sentences describing the schedule strategy and key assumptions.' },
    phases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string' },
                name: { type: 'string' },
                durationDays: { type: 'integer' },
                milestone: { type: 'boolean' },
                trade: { type: 'string' },
                predecessors: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      key: { type: 'string' },
                      type: { type: 'string', enum: ['FS', 'SS', 'FF', 'SF'] },
                      lagDays: { type: 'integer' },
                    },
                    required: ['key', 'type', 'lagDays'],
                  },
                },
                notes: { type: 'string' },
              },
              required: ['key', 'name', 'durationDays', 'milestone', 'trade', 'predecessors'],
            },
          },
        },
        required: ['name', 'tasks'],
      },
    },
  },
  required: ['projectName', 'summary', 'phases'],
};

export interface GenerateInput {
  brief: string;
  projectType?: string;
  delivery?: string;
  startDate?: string;
  targetFinish?: string;
  size?: string;
  detail?: 'simple' | 'standard' | 'detailed';
  /** Pre-formatted blocks from server/attachments.ts. */
  attachmentsPrompt?: string;
}

export function buildGeneratePrompt(input: GenerateInput): string {
  const lines: string[] = ['Build a complete construction schedule from this brief.', '', `BRIEF: ${input.brief.trim()}`];
  if (input.projectType) lines.push(`PROJECT TYPE: ${input.projectType}`);
  if (input.delivery) lines.push(`DELIVERY METHOD: ${input.delivery}`);
  if (input.size) lines.push(`SIZE: ${input.size}`);
  if (input.startDate) lines.push(`START DATE (NTP): ${input.startDate}`);
  if (input.targetFinish) lines.push(`TARGET COMPLETION: ${input.targetFinish} — size durations so the critical path lands on or before this date.`);
  const detail = input.detail ?? 'standard';
  lines.push(
    `DETAIL LEVEL: ${detail === 'simple' ? '15-30 tasks, phase-level' : detail === 'detailed' ? '80-120 tasks, split by area/floor' : '45-80 tasks'}`,
  );
  if (input.attachmentsPrompt) {
    lines.push('', 'The user attached reference files. Each block says how to treat it (BASELINE = mirror then fix, REFERENCE = inform, VERIFY = compare and flag). When a BASELINE schedule is attached, keep its phase structure and task names, and the detail-level target above no longer applies — match the file\'s size.', '', input.attachmentsPrompt);
  }
  lines.push('', 'Return the schedule as JSON matching the schema.');
  return lines.join('\n');
}

export const REVIEW_RULES = `You are Datum, a senior construction scheduler reviewing a CPM schedule the way an owner's rep or a DCMA-style schedule auditor would. Be specific, practical, and brief. Reference tasks by their ID numbers. Focus on: missing or wrong logic (sequence errors, dangling tasks, wrong link types), unrealistic durations, missing scope typical for this project type (inspections, cure times, lead times, commissioning, closeout), constraints that fight the logic, and risks to the finish date. Prioritize: high = will break the schedule or mislead the team, medium = should fix before issuing, low = polish. Give at most 12 findings. Respond with JSON only.`;

export const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    overall: { type: 'string', description: 'Two or three sentences on schedule quality and biggest risk.' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          title: { type: 'string' },
          detail: { type: 'string' },
          suggestion: { type: 'string' },
          taskIds: { type: 'array', items: { type: 'integer' } },
        },
        required: ['severity', 'title', 'detail', 'suggestion', 'taskIds'],
      },
    },
  },
  required: ['overall', 'findings'],
};

export const EDIT_RULES = `You are Datum, a construction scheduling assistant. The user will give you an instruction to change an existing schedule. Return only the changes as JSON operations. Reference tasks by ID. Keep changes minimal and faithful to the instruction. Durations and lags are working days. When adding tasks, place them after a specific existing task ID (afterId) at the same outline level unless told otherwise, and link them sensibly.

You have NO tools of your own. Live dates and status come only from an EXTERNAL FACTS block in the prompt, and only when one is present. Treat those items as the source of truth. Do not invent dates, email, or meeting minutes.
- If the user asked to verify or cross-check and EXTERNAL FACTS are present: map those facts onto the schedule (actuals for work that happened, constraints for committed future dates). Put a short citation in each operation's "source" field (for example "meeting minutes 2026-09-10" or "submittal log 2026-09-14").
- If the facts block has no item for something the user asked, say so in "explanation" and leave that task alone. A missing date is better than a guessed one.
- If EXTERNAL FACTS are absent, work only from the schedule and the instruction. Never pretend you checked email.
- ATTACHED FILE blocks, when present, are reference material the user supplied (a sub or vendor schedule, a PM's file, a PDF). Follow the mode stated in each block: VERIFY means compare the attached file against the schedule and propose operations that reconcile disagreements, citing the file name in "source"; REFERENCE means use it to inform durations, sequence and dates; BASELINE means bring the schedule in line with it. Cite the attached file name in "source" for anything taken from it.

Dates in the instruction: put them on the schedule with dates, not by fudging durations.
- Work that already happened: set actualStart / actualFinish (and percentComplete 100). A phase that "ran from Feb to Mar 6" means its tasks get actual dates inside that window.
- A target or committed future date: set a constraint. Use SNET (start no earlier than) for a planned start or a date something cannot begin before; FNLT (finish no later than) or MFO (must finish on) for a deadline or approval date; MSO (must start on) for a fixed event like mobilization. Milestones representing an approval or permit get the target date as MFO or FNLT.
- Dates are YYYY-MM-DD. "End of July 2026" is 2026-07-31; "Feb" alone means the first working day of that month unless context says otherwise.
- A month followed by a two-digit number is usually a two-digit YEAR, not a day, when that year falls inside the project's date range: "april 26", "aug 26", "end of july 26" mean April 2026, August 2026, end of July 2026. Read it as a day of the month only when it cannot be a plausible year for this project ("mar 06" in a 2026 project is March 6). A phase that "ran from april 26 to end of july 26" ran 2026-04-01 to 2026-07-31. State the reading you chose in "explanation".
- Keep the logic links; constraints and actuals sit on top of them. Do not delete tasks to move dates.
Respond with JSON only.`;

export const EDIT_SCHEMA = {
  type: 'object',
  properties: {
    explanation: { type: 'string', description: 'One to three sentences on what changed and any assumptions or information you could not access.' },
    operations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['update', 'add', 'delete', 'link', 'unlink'] },
          id: { type: 'integer', description: 'Target task ID for update/delete/link/unlink (successor for link).' },
          afterId: { type: 'integer', description: 'For add: insert after this task ID.' },
          name: { type: 'string' },
          durationDays: { type: 'integer' },
          milestone: { type: 'boolean' },
          trade: { type: 'string' },
          percentComplete: { type: 'integer' },
          notes: { type: 'string' },
          predId: { type: 'integer', description: 'For link/unlink: predecessor task ID.' },
          linkType: { type: 'string', enum: ['FS', 'SS', 'FF', 'SF'] },
          lagDays: { type: 'integer' },
          outlineLevel: { type: 'integer' },
          constraintType: { type: 'string', enum: ['ASAP', 'ALAP', 'SNET', 'SNLT', 'FNET', 'FNLT', 'MSO', 'MFO'], description: 'For update: ASAP removes a constraint; dated types need constraintDate.' },
          constraintDate: { type: 'string', description: 'YYYY-MM-DD for dated constraints.' },
          actualStart: { type: 'string', description: 'YYYY-MM-DD the task really started. Empty string clears it.' },
          actualFinish: { type: 'string', description: 'YYYY-MM-DD the task really finished. Empty string clears it.' },
          source: { type: 'string', description: 'Short citation when the date came from external facts or an attached file.' },
        },
        required: ['op'],
      },
    },
  },
  required: ['explanation', 'operations'],
};
