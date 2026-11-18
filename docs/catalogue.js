/* Exam boards, qualifications, subjects and topic lists for the course-plan wizard.
   Topic lists follow the main sections of each specification (written from knowledge of the
   specifications; check details against the board's current specification). */
(function () {
  const MATHS_F = ['Place value, ordering and rounding', 'Negative numbers and order of operations', 'Factors, multiples and primes', 'Fractions', 'Decimals', 'Percentages', 'Powers, roots and standard form', 'Algebra: notation and simplifying', 'Expanding and factorising', 'Solving linear equations', 'Formulae and substitution', 'Sequences', 'Coordinates and straight-line graphs', 'Inequalities', 'Simultaneous equations', 'Ratio and proportion', 'Speed, density and compound measures', 'Percentage change and interest', 'Angles and polygons', 'Perimeter and area', 'Circles', '3D shapes, volume and surface area', 'Transformations', 'Constructions, loci and bearings', 'Pythagoras and trigonometry', 'Vectors', 'Probability', 'Collecting and representing data', 'Averages and spread'];
  const MATHS_H_EXTRA = ['Surds and indices', 'Quadratics and the quadratic formula', 'Functions and graph transformations', 'Iteration', 'Algebraic proof', 'Direct and inverse proportion', 'Circle theorems', 'Sine and cosine rules', 'Similarity and congruence', 'Histograms and cumulative frequency', 'Conditional probability and tree diagrams'];
  const EDX_EN1EN2 = ['Paper 1 Q1 and Q4: finding information', 'Reading 19th-century non-fiction', 'Paper 1 Q2 and Q5: evaluating how successfully', 'Paper 1 Q3: language analysis', 'Paper 1 Q4(b): implied meaning', 'Paper 1 Q6: how far do you agree', 'Transactional writing: letters, articles, speeches', 'Paper 2 Q2: language in modern texts', 'Paper 2 Q4: language and structure', 'Paper 2 Q5: similarities', 'Paper 2 Q6: comparing perspectives', 'Imaginative writing: stories and personal writing', 'Spelling, punctuation and sentences (AO6)', 'Spoken Language endorsement'];
  const EDX_EN1EN0 = ['Paper 1 Q1 to Q2: retrieval and language', 'Paper 1 Q3: language and structure', 'Paper 1 Q4: evaluating a statement', 'Reading 19th-century fiction', 'Imaginative writing', 'Paper 2 Q1 to Q3: non-fiction reading', 'Paper 2 Q4 to Q6: language, structure and evaluation', 'Paper 2 Q7: synthesis and comparison', 'Transactional writing', 'Spelling, punctuation and sentences (AO6)', 'Spoken Language endorsement'];
  const AQA_EN = ['Paper 1 Q1: listing information', 'Paper 1 Q2: language analysis', 'Paper 1 Q3: structure', 'Paper 1 Q4: evaluation', 'Paper 1 Q5: descriptive and narrative writing', 'Paper 2 Q1: true or false statements', 'Paper 2 Q2: summary of differences', 'Paper 2 Q3: language analysis', 'Paper 2 Q4: comparing viewpoints', 'Paper 2 Q5: writing to present a viewpoint', 'Spelling, punctuation and grammar', 'Spoken Language endorsement'];
  const EDX_PH = ['Key concepts of physics', 'Motion and forces', 'Conservation of energy', 'Waves', 'Light and the electromagnetic spectrum', 'Radioactivity', 'Astronomy', 'Energy: forces doing work', 'Forces and their effects', 'Electricity and circuits', 'Static electricity', 'Magnetism and the motor effect', 'Electromagnetic induction', 'Particle model', 'Forces and matter', 'Core practicals'];
  const EDX_CH = ['Key concepts in chemistry', 'States of matter and mixtures', 'Chemical changes', 'Extracting metals and equilibria', 'Separate chemistry 1', 'Groups in the periodic table', 'Rates of reaction and energy changes', 'Fuels and Earth science', 'Separate chemistry 2', 'Core practicals'];
  const EDX_BI = ['Key concepts in biology', 'Cells and control', 'Genetics', 'Natural selection and genetic modification', 'Health, disease and medicines', 'Plant structures and their functions', 'Animal coordination, control and homeostasis', 'Exchange and transport in animals', 'Ecosystems and material cycles', 'Core practicals'];
  const AQA_BI = ['Cell biology', 'Organisation', 'Infection and response', 'Bioenergetics', 'Homeostasis and response', 'Inheritance, variation and evolution', 'Ecology', 'Required practicals'];
  const AQA_CH = ['Atomic structure and the periodic table', 'Bonding, structure and properties of matter', 'Quantitative chemistry', 'Chemical changes', 'Energy changes', 'Rate and extent of chemical change', 'Organic chemistry', 'Chemical analysis', 'Chemistry of the atmosphere', 'Using resources', 'Required practicals'];
  const AQA_PH = ['Energy', 'Electricity', 'Particle model of matter', 'Atomic structure', 'Forces', 'Waves', 'Magnetism and electromagnetism', 'Space physics', 'Required practicals'];
  const OCR_GATEWAY_BI = ['Cell level systems', 'Scaling up', 'Organism level systems', 'Community level systems', 'Genes, inheritance and selection', 'Global challenges', 'Practical skills'];

  const B = {
    edexcel: 'Pearson Edexcel', aqa: 'AQA', ocr: 'OCR', eduqas: 'WJEC Eduqas', cie: 'Cambridge (CAIE)',
  };

  // Each entry: board, qualification, subject, code, tiers, topics (by tier when tiered).
  const SPECS = [
    { board: B.edexcel, qual: 'GCSE', subject: 'Mathematics', code: '1MA1', tiers: ['Foundation', 'Higher'], topics: { Foundation: MATHS_F, Higher: MATHS_F.concat(MATHS_H_EXTRA) } },
    { board: B.edexcel, qual: 'GCSE', subject: 'English Language 2.0', code: '1EN2', topics: EDX_EN1EN2 },
    { board: B.edexcel, qual: 'GCSE', subject: 'English Language', code: '1EN0', topics: EDX_EN1EN0 },
    { board: B.edexcel, qual: 'GCSE', subject: 'Physics', code: '1PH0', tiers: ['Foundation', 'Higher'], topics: EDX_PH },
    { board: B.edexcel, qual: 'GCSE', subject: 'Chemistry', code: '1CH0', tiers: ['Foundation', 'Higher'], topics: EDX_CH },
    { board: B.edexcel, qual: 'GCSE', subject: 'Biology', code: '1BI0', tiers: ['Foundation', 'Higher'], topics: EDX_BI },
    { board: B.edexcel, qual: 'GCSE', subject: 'Combined Science', code: '1SC0', tiers: ['Foundation', 'Higher'], topics: EDX_BI.slice(0, 9).concat(EDX_CH.slice(0, 4), EDX_CH.slice(5, 8), EDX_PH.slice(0, 6), EDX_PH.slice(7, 14)) },
    { board: B.edexcel, qual: 'International GCSE', subject: 'Mathematics A', code: '4MA1', tiers: ['Foundation', 'Higher'], topics: { Foundation: MATHS_F, Higher: MATHS_F.concat(MATHS_H_EXTRA) } },
    { board: B.edexcel, qual: 'International GCSE', subject: 'English Language A', code: '4EA1', topics: ['Paper 1: non-fiction reading (anthology and unseen)', 'Paper 1: transactional writing', 'Paper 2: poetry and prose texts', 'Paper 2: imaginative writing', 'Spelling, punctuation and grammar'] },
    { board: B.aqa, qual: 'GCSE', subject: 'Mathematics', code: '8300', tiers: ['Foundation', 'Higher'], topics: { Foundation: MATHS_F, Higher: MATHS_F.concat(MATHS_H_EXTRA) } },
    { board: B.aqa, qual: 'GCSE', subject: 'English Language', code: '8700', topics: AQA_EN },
    { board: B.aqa, qual: 'GCSE', subject: 'Biology', code: '8461', tiers: ['Foundation', 'Higher'], topics: AQA_BI },
    { board: B.aqa, qual: 'GCSE', subject: 'Chemistry', code: '8462', tiers: ['Foundation', 'Higher'], topics: AQA_CH },
    { board: B.aqa, qual: 'GCSE', subject: 'Physics', code: '8463', tiers: ['Foundation', 'Higher'], topics: AQA_PH },
    { board: B.ocr, qual: 'GCSE', subject: 'Mathematics', code: 'J560', tiers: ['Foundation', 'Higher'], topics: { Foundation: MATHS_F, Higher: MATHS_F.concat(MATHS_H_EXTRA) } },
    { board: B.ocr, qual: 'GCSE', subject: 'Biology A (Gateway)', code: 'J247', tiers: ['Foundation', 'Higher'], topics: OCR_GATEWAY_BI },
    { board: B.cie, qual: 'IGCSE', subject: 'Mathematics', code: '0580', tiers: ['Core', 'Extended'], topics: { Core: MATHS_F, Extended: MATHS_F.concat(MATHS_H_EXTRA) } },
  ];

  const BOARDS = Object.values(B);
  const QUALS = ['GCSE', 'International GCSE', 'IGCSE', 'A level'];

  // Exam series for the next few years. Summer exams run mid-May to late June.
  function examSeries(fromIso) {
    const y0 = new Date(fromIso + 'T12:00:00').getFullYear();
    const out = [];
    for (let y = y0; y <= y0 + 3; y++) {
      out.push({ label: `May/June ${y}`, date: `${y}-05-15`, last: `${y}-06-20` });
      out.push({ label: `November ${y} (Maths and English resits)`, date: `${y}-11-05`, last: `${y}-11-20` });
    }
    return out.filter((s) => s.date > fromIso);
  }

  function topicsFor(spec, tier) {
    if (!spec) return [];
    if (Array.isArray(spec.topics)) return spec.topics.slice();
    return (spec.topics[tier] || Object.values(spec.topics)[0]).slice();
  }

  /* Build a week-by-week plan.
     Teaching weeks cover every topic in order; every sixth week is a review week;
     the last part before the exam is revision and past papers. School holidays are skipped. */
  function buildPlan({ start, exam, topics, hoursPerWeek }) {
    const DAY = 864e5;
    const d0 = new Date(start + 'T12:00:00'); d0.setDate(d0.getDate() - ((d0.getDay() + 6) % 7)); // Monday
    const end = new Date(exam + 'T12:00:00');
    const weeks = [];
    for (let d = new Date(d0); d < end; d = new Date(d.getTime() + 7 * DAY)) {
      const iso = d.toISOString().slice(0, 10);
      const md = iso.slice(5);
      const holiday = (md >= '12-21' || md <= '01-03') ? 'Christmas break'
        : (md >= '08-01' && md <= '08-24') ? 'Summer break' : null;
      weeks.push({ start: iso, holiday });
    }
    const usable = weeks.filter((w) => !w.holiday);
    if (!usable.length) return [];
    const revision = Math.min(Math.max(2, Math.round(usable.length * 0.15)), 10);
    const teach = Math.max(1, usable.length - revision);
    const reviewEvery = 6;
    const teachingSlots = teach - Math.floor(teach / reviewEvery);
    const list = topics.length ? topics : ['Topic work'];
    let ti = 0; let count = 0; let sinceReview = []; let n = 0;
    for (const w of weeks) {
      if (w.holiday) { w.kind = 'break'; w.title = w.holiday; continue; }
      n++;
      if (n > teach) { w.kind = 'revision'; w.title = n === usable.length ? 'Final revision: weakest topics' : 'Revision and timed past papers'; continue; }
      count++;
      if (count % reviewEvery === 0) { w.kind = 'review'; w.title = 'Review and re-test'; w.topics = sinceReview.slice(); sinceReview = []; continue; }
      // spread topics evenly over the teaching slots
      const per = list.length / teachingSlots;
      const from = Math.floor(ti * per); const to = Math.max(from + 1, Math.floor((ti + 1) * per));
      const t = list.slice(from, Math.min(to, list.length));
      ti++;
      w.kind = 'teach';
      w.topics = t.length ? t : [list[Math.min(from, list.length - 1)] + ' (practice)'];
      w.title = w.topics.join(' · ');
      sinceReview.push(...t);
    }
    weeks.forEach((w, i) => { w.n = i + 1; w.hours = w.kind === 'break' ? 0 : hoursPerWeek; delete w.holiday; });
    return weeks;
  }

  window.CATALOGUE = { BOARDS, QUALS, SPECS, examSeries, topicsFor, buildPlan };
})();
