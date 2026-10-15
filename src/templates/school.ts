import type { BoardCard, Link, LinkType, Project, Task } from '@engine/types';
import { newProject, newTask } from '@engine/project';
import { todayLocal, startOfWeek, addDays, makeDateTime } from '@engine/dates';

interface Spec {
  key: string;
  name: string;
  dur: number;
  preds?: string[]; // "T3", "T3SS+2", "T4FF"
  trade?: string;
  ms?: boolean;
}

interface PhaseSpec {
  name: string;
  tasks: Spec[];
}

/** Fictional CMAR classroom addition. Durations are working days. Names and dollars are made up. */
const PHASES: PhaseSpec[] = [
  {
    name: 'Preconstruction',
    tasks: [
      { key: 'NTP', name: 'Notice to Proceed', dur: 0, ms: true, trade: 'Owner' },
      { key: 'DD', name: 'Design development complete', dur: 20, preds: ['NTP'], trade: 'Architect' },
      { key: 'CD', name: 'Construction documents (100%)', dur: 30, preds: ['DD'], trade: 'Architect' },
      { key: 'GMP', name: 'GMP pricing & subcontractor bids', dur: 15, preds: ['CD'], trade: 'GC' },
      { key: 'GMPA', name: 'GMP approved', dur: 0, ms: true, preds: ['GMP'], trade: 'Owner' },
    ],
  },
  {
    name: 'Permits & Approvals',
    tasks: [
      { key: 'PSUB', name: 'Building permit submittal', dur: 3, preds: ['CD'], trade: 'Architect' },
      { key: 'PLAN', name: 'Plan check & comments', dur: 30, preds: ['PSUB'], trade: 'AHJ' },
      { key: 'PRESP', name: 'Respond to plan check comments', dur: 10, preds: ['PLAN'], trade: 'Architect' },
      { key: 'PERM', name: 'Building permit issued', dur: 0, ms: true, preds: ['PRESP', 'GMPA'], trade: 'AHJ' },
      { key: 'SWPPP', name: 'SWPPP / grading permit', dur: 15, preds: ['PSUB'], trade: 'Civil' },
    ],
  },
  {
    name: 'Procurement & Long-Lead',
    tasks: [
      { key: 'SUB', name: 'Subcontract buyout & awards', dur: 10, preds: ['GMPA'], trade: 'GC' },
      { key: 'STLSUB', name: 'Structural steel shop drawings', dur: 15, preds: ['SUB'], trade: 'Steel fabricator' },
      { key: 'STLFAB', name: 'Steel fabrication & delivery', dur: 30, preds: ['STLSUB'], trade: 'Steel fabricator' },
      { key: 'HVACSUB', name: 'HVAC equipment submittals & release', dur: 15, preds: ['SUB'], trade: 'Mechanical sub' },
      { key: 'HVACDEL', name: 'Rooftop units lead time', dur: 60, preds: ['HVACSUB'], trade: 'Mechanical sub' },
      { key: 'WINSUB', name: 'Storefront & window submittals', dur: 15, preds: ['SUB'], trade: 'Glazing sub' },
      { key: 'WINDEL', name: 'Storefront / windows lead time', dur: 40, preds: ['WINSUB'], trade: 'Glazing sub' },
      { key: 'SWGR', name: 'Electrical switchgear lead time', dur: 70, preds: ['SUB'], trade: 'Electrical sub' },
    ],
  },
  {
    name: 'Mobilization & Sitework',
    tasks: [
      { key: 'MOB', name: 'Mobilize, fencing, temp facilities', dur: 5, preds: ['PERM', 'SWPPP'], trade: 'GC' },
      { key: 'EROS', name: 'Erosion control & tree protection', dur: 3, preds: ['MOB'], trade: 'Sitework sub' },
      { key: 'DEMO', name: 'Demo existing paving & play area', dur: 8, preds: ['EROS'], trade: 'Demo sub' },
      { key: 'GRADE', name: 'Mass grading & building pad', dur: 10, preds: ['DEMO'], trade: 'Sitework sub' },
      { key: 'UTIL', name: 'Underground utilities (storm, sewer, water)', dur: 15, preds: ['GRADE'], trade: 'Sitework sub' },
      { key: 'PADCERT', name: 'Pad certification', dur: 0, ms: true, preds: ['GRADE'], trade: 'Geotech' },
    ],
  },
  {
    name: 'Foundations',
    tasks: [
      { key: 'FTG', name: 'Layout, excavate & form footings', dur: 8, preds: ['PADCERT'], trade: 'Concrete sub' },
      { key: 'FTGR', name: 'Footing rebar & inspection', dur: 4, preds: ['FTG'], trade: 'Concrete sub' },
      { key: 'FTGP', name: 'Pour footings & stem walls', dur: 5, preds: ['FTGR'], trade: 'Concrete sub' },
      { key: 'UGP', name: 'Under-slab plumbing & electrical', dur: 8, preds: ['FTGP', 'UTIL'], trade: 'Plumbing / Electrical' },
      { key: 'SLAB', name: 'Slab prep, vapor barrier & pour', dur: 6, preds: ['UGP'], trade: 'Concrete sub' },
      { key: 'FNDC', name: 'Foundation complete', dur: 0, ms: true, preds: ['SLAB'], trade: 'GC' },
    ],
  },
  {
    name: 'Structure',
    tasks: [
      { key: 'STL', name: 'Erect structural steel', dur: 15, preds: ['FNDC+7', 'STLFAB'], trade: 'Steel erector' },
      { key: 'DECK', name: 'Metal deck & shear studs', dur: 8, preds: ['STL'], trade: 'Steel erector' },
      { key: 'FRAME', name: 'Exterior wall framing', dur: 15, preds: ['DECK'], trade: 'Framing sub' },
      { key: 'TOP', name: 'Structure complete', dur: 0, ms: true, preds: ['FRAME'], trade: 'GC' },
    ],
  },
  {
    name: 'Building Envelope',
    tasks: [
      { key: 'ROOF', name: 'Roofing & sheet metal', dur: 12, preds: ['DECK'], trade: 'Roofing sub' },
      { key: 'SHEATH', name: 'Sheathing & weather barrier', dur: 10, preds: ['FRAME'], trade: 'Framing sub' },
      { key: 'WIN', name: 'Storefront & windows', dur: 10, preds: ['SHEATH', 'WINDEL'], trade: 'Glazing sub' },
      { key: 'DRYIN', name: 'Building dried in', dur: 0, ms: true, preds: ['ROOF', 'WIN'], trade: 'GC' },
      { key: 'SIDING', name: 'Exterior finishes (masonry / panels)', dur: 20, preds: ['SHEATH'], trade: 'Masonry sub' },
    ],
  },
  {
    name: 'MEP Rough-In',
    tasks: [
      { key: 'INTFR', name: 'Interior wall framing', dur: 15, preds: ['TOP'], trade: 'Framing sub' },
      { key: 'OHMEP', name: 'Overhead MEP rough-in', dur: 20, preds: ['INTFR+3', 'DECK'], trade: 'MEP subs' },
      { key: 'WALLMEP', name: 'In-wall MEP rough-in', dur: 15, preds: ['INTFRSS+5'], trade: 'MEP subs' },
      { key: 'FIRE', name: 'Fire sprinkler rough-in', dur: 15, preds: ['OHMEPSS+5'], trade: 'Fire protection sub' },
      { key: 'RTU', name: 'Set rooftop units', dur: 4, preds: ['ROOF', 'HVACDEL'], trade: 'Mechanical sub' },
      { key: 'MEPINSP', name: 'MEP rough-in inspections', dur: 3, preds: ['OHMEP', 'WALLMEP', 'FIRE'], trade: 'AHJ' },
      { key: 'ROUGHC', name: 'MEP rough-in complete', dur: 0, ms: true, preds: ['MEPINSP'], trade: 'GC' },
    ],
  },
  {
    name: 'Interior Finishes',
    tasks: [
      { key: 'INSUL', name: 'Insulation & inspection', dur: 5, preds: ['ROUGHC', 'DRYIN'], trade: 'Insulation sub' },
      { key: 'DRYW', name: 'Drywall hang, tape & finish', dur: 20, preds: ['INSUL'], trade: 'Drywall sub' },
      { key: 'PAINT1', name: 'Prime & first coat paint', dur: 8, preds: ['DRYW'], trade: 'Painting sub' },
      { key: 'CEIL', name: 'Ceiling grid', dur: 8, preds: ['PAINT1'], trade: 'Acoustical sub' },
      { key: 'MEPTRIM', name: 'MEP trim-out above ceiling', dur: 10, preds: ['CEILSS+3'], trade: 'MEP subs' },
      { key: 'CASE', name: 'Casework & millwork', dur: 10, preds: ['PAINT1'], trade: 'Millwork sub' },
      { key: 'FLOOR', name: 'Flooring (VCT, carpet, tile)', dur: 12, preds: ['CASE', 'MEPTRIM'], trade: 'Flooring sub' },
      { key: 'DOORS', name: 'Doors, frames & hardware', dur: 8, preds: ['FLOORSS+5'], trade: 'Carpentry' },
      { key: 'PAINT2', name: 'Final paint & touch-up', dur: 6, preds: ['DOORS', 'FLOOR'], trade: 'Painting sub' },
      { key: 'CEILT', name: 'Ceiling tile & MEP devices', dur: 6, preds: ['PAINT2'], trade: 'Acoustical / MEP' },
      { key: 'TECH', name: 'Low-voltage, data & AV', dur: 10, preds: ['CEILSS+5', 'SWGR'], trade: 'Low-voltage sub' },
    ],
  },
  {
    name: 'Site Finishes',
    tasks: [
      { key: 'CURB', name: 'Curb, gutter & paving', dur: 12, preds: ['SIDING', 'UTIL'], trade: 'Paving sub' },
      { key: 'PLAY', name: 'Playground equipment & surfacing', dur: 10, preds: ['CURB'], trade: 'Playground vendor' },
      { key: 'LAND', name: 'Landscape & irrigation', dur: 10, preds: ['CURB'], trade: 'Landscape sub' },
      { key: 'SITEL', name: 'Site lighting & signage', dur: 6, preds: ['CURB'], trade: 'Electrical sub' },
    ],
  },
  {
    name: 'Commissioning & Closeout',
    tasks: [
      { key: 'TAB', name: 'HVAC start-up, test & balance', dur: 8, preds: ['RTU', 'CEILT'], trade: 'Mechanical sub' },
      { key: 'FA', name: 'Fire alarm & sprinkler final test', dur: 4, preds: ['CEILT', 'TECH'], trade: 'Fire protection sub' },
      { key: 'PUNCH', name: 'Punch list', dur: 10, preds: ['CEILT', 'PAINT2'], trade: 'GC' },
      { key: 'FMI', name: 'Fire marshal inspection', dur: 1, preds: ['FA'], trade: 'AHJ' },
      { key: 'FINAL', name: 'Final building inspection', dur: 2, preds: ['FMI', 'TAB', 'PUNCH', 'PLAY', 'LAND', 'SITEL'], trade: 'AHJ' },
      { key: 'CO', name: 'Certificate of Occupancy', dur: 0, ms: true, preds: ['FINAL'], trade: 'AHJ' },
      { key: 'SC', name: 'Substantial completion', dur: 0, ms: true, preds: ['CO'], trade: 'Owner' },
      { key: 'FFE', name: 'FF&E delivery & install', dur: 10, preds: ['SC'], trade: 'Owner / Vendor' },
      { key: 'CLEAN', name: 'Final clean & owner training', dur: 5, preds: ['FFESS+5'], trade: 'GC' },
      { key: 'CLOSE', name: 'Closeout documents & as-builts', dur: 15, preds: ['SC'], trade: 'GC' },
      { key: 'OCC', name: 'Owner occupancy / first day of school', dur: 0, ms: true, preds: ['FFE', 'CLEAN', 'CLOSE'], trade: 'Owner' },
    ],
  },
];

function parsePred(s: string): { key: string; type: LinkType; lag: number } {
  const m = s.match(/^([A-Z0-9]+?)(FS|SS|FF|SF)?([+-]\d+)?$/);
  if (!m) throw new Error(`bad pred ${s}`);
  return { key: m[1], type: (m[2] as LinkType) || 'FS', lag: m[3] ? Number(m[3]) : 0 };
}

export function buildFromPhases(phases: PhaseSpec[], name: string, startDay?: string): Project {
  const p = newProject(name, startDay ?? addDays(startOfWeek(todayLocal()), 7));
  const uidByKey = new Map<string, number>();
  let uid = 1;
  const tasks: Task[] = [];
  for (const ph of phases) {
    tasks.push(newTask(uid++, { name: ph.name, outlineLevel: 1 }));
    for (const t of ph.tasks) {
      uidByKey.set(t.key, uid);
      tasks.push(newTask(uid++, { name: t.name, outlineLevel: 2, durationDays: t.dur, milestone: !!t.ms, resourceNames: t.trade ?? '' }));
    }
  }
  const byUid = new Map(tasks.map((t) => [t.uid, t]));
  for (const ph of phases) {
    for (const t of ph.tasks) {
      const task = byUid.get(uidByKey.get(t.key)!)!;
      const links: Link[] = [];
      for (const ps of t.preds ?? []) {
        const { key, type, lag } = parsePred(ps);
        const pu = uidByKey.get(key);
        if (pu === undefined) throw new Error(`unknown pred ${key}`);
        links.push({ predUid: pu, type, lagDays: lag });
      }
      task.predecessors = links;
    }
  }
  p.tasks = tasks;
  p.nextUid = uid;
  return p;
}

export function schoolTemplate(): Project {
  const start = addDays(startOfWeek(todayLocal()), -63);
  const p = buildFromPhases(PHASES, 'Cedar Ridge Elementary — Classroom Addition', start);
  p.company = 'Fieldline Constructors';
  p.manager = 'A. Okonkwo';
  p.notes = 'Sample job for Datum. Cedar Ridge is fictional. Use it to click around, then replace it with a real schedule.';
  const ntp = p.tasks.find((t) => t.name === 'Notice to Proceed');
  if (ntp) {
    ntp.percentComplete = 100;
    const geo = newTask(p.nextUid++, {
      name: 'Geotech memo accepted',
      outlineLevel: 2,
      durationDays: 0,
      milestone: true,
      resourceNames: 'Geotech',
      predecessors: [{ predUid: ntp.uid, type: 'FS', lagDays: 0 }],
      constraintType: 'MFO',
      constraintDate: makeDateTime(addDays(todayLocal(), -12), 17),
    });
    const at = p.tasks.findIndex((t) => t.uid === ntp.uid);
    p.tasks.splice(at + 1, 0, geo);
  }
  const today = todayLocal();
  const decision = (partial: Omit<BoardCard, 'priority' | 'description' | 'tags'> & Partial<BoardCard>): BoardCard => ({
    priority: 'normal',
    description: '',
    tags: [],
    ...partial,
  });
  p.decisions = [
    decision({ id: 'd-brick', column: 'Owner Review', title: 'Brick blend at the classroom wing', priority: 'high', owner: 'Owner', dueDate: addDays(today, -4), description: 'Three samples are in the trailer. The gym is 1998 brick and the owner can tell.', tags: ['envelope'] }),
    decision({ id: 'd-gear', column: 'Pending Decision', title: 'Switchgear manufacturer', priority: 'high', owner: 'Electrical sub', dueDate: addDays(today, 6), description: 'Two bids. The shorter lead misses the preferred vendor by six weeks.', tags: ['long-lead'] }),
    decision({ id: 'd-play', column: 'Info Provided', title: 'Play surface at the new court', owner: 'Owner', dueDate: addDays(today, 11), description: 'Poured rubber versus tile. Maintenance has already picked a side.', tags: ['site'] }),
    decision({ id: 'd-lock', column: 'Decided', title: 'Classroom lockset finish', priority: 'low', owner: 'Architect', dueDate: addDays(today, -18), description: 'Satin chrome, to match the existing corridors.', tags: ['interiors'] }),
    decision({ id: 'd-road', column: 'Implemented', title: 'Temporary access road', owner: 'GC', dueDate: addDays(today, -40), description: 'East of the kitchen, off the bus loop. In the drawings.', tags: ['site'] }),
  ];
  p.buyout = [
    decision({ id: 'b-kitchen', column: 'Scope Defined', title: 'Kitchen equipment', owner: 'GC', dueDate: addDays(today, 20), description: 'Narrative is drafted. Waiting on the food-service consultant.', tags: ['interiors'], budgetConcept: 180000 }),
    decision({ id: 'b-steel', column: 'Bidding', title: 'Structural steel', priority: 'high', owner: 'GC', dueDate: addDays(today, 8), description: 'Three fabricators invited. Drawings are at 100%.', tags: ['structure'], budgetConcept: 640000 }),
    decision({ id: 'b-glass', column: 'Leveling', title: 'Glazing and storefront', priority: 'high', owner: 'GC', dueDate: addDays(today, 3), description: 'Two bids. One of them quietly excludes interior borrowed lites.', tags: ['envelope'], budgetConcept: 210000, budgetProposal: 228000 }),
    decision({ id: 'b-site', column: 'Awarded', title: 'Sitework and utilities', owner: 'GC', dueDate: addDays(today, -2), description: 'Award letter is out. The contract is with legal.', tags: ['site'], budgetConcept: 390000, budgetProposal: 405000 }),
    decision({ id: 'b-conc', column: 'Contract Executed', title: 'Concrete', owner: 'GC', dueDate: addDays(today, -15), description: 'Executed. Mix designs are still pending.', tags: ['structure'], budgetConcept: 310000, budgetProposal: 298000 }),
    decision({ id: 'b-demo', column: 'Mobilized', title: 'Demolition', priority: 'low', owner: 'GC', dueDate: addDays(today, -30), description: 'On site for the old play area.', tags: ['site'], budgetConcept: 75000, budgetProposal: 68000 }),
  ];
  p.buyoutTarget = 2100000;
  return p;
}
