/* Exam board guide content: boards, how to find yours, and common specification codes.
   Codes are for current GCSE specifications. Always confirm on the board's own website. */
(function () {
  const BOARDS = [
    { name: 'AQA', where: 'England', note: 'The most widely used GCSE board in England, run as an education charity.', site: 'https://www.aqa.org.uk/find-a-qualification' },
    { name: 'Pearson Edexcel', where: 'England, and International GCSE worldwide', note: 'Offers both GCSEs and International GCSEs. Its International GCSEs are popular with home-educated and private candidates because most have no coursework.', site: 'https://qualifications.pearson.com/en/qualifications/edexcel-gcses.html' },
    { name: 'OCR', where: 'England', note: 'Part of Cambridge University Press & Assessment. Science comes in two routes: A (Gateway) and B (Twenty First Century).', site: 'https://www.ocr.org.uk/qualifications/gcse/' },
    { name: 'WJEC Eduqas', where: 'England (Eduqas); Wales (WJEC)', note: 'Eduqas is the brand WJEC uses for its England GCSEs. Schools in Wales take WJEC GCSEs, which follow different Welsh specifications.', site: 'https://www.eduqas.co.uk/qualifications/' },
    { name: 'CCEA', where: 'Northern Ireland', note: 'The main board in Northern Ireland. Its GCSEs are graded A* to G rather than 9 to 1.', site: 'https://ccea.org.uk/' },
    { name: 'Cambridge (CAIE)', where: 'Worldwide', note: 'Cambridge IGCSEs are taken in many international schools and by some private candidates. Tiers are called Core and Extended.', site: 'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse/' },
  ];

  const FIND = [
    ['Your statement of entry', 'The most reliable source. When a school or exam centre enters a student, it gives them a statement listing each subject, the board and the codes.'],
    ['Past papers, mocks and revision guides', 'The board\'s name and logo are on the front of every paper. A specification code such as 8300 or 1MA1 also tells you the board.'],
    ['The school\'s online platform', 'Many schools list exam boards on their website, in course handbooks or on the homework platform.'],
    ['The exams officer', 'Every school and exam centre has one, and they hold the entries for every student.'],
    ['The subject teacher', 'They teach to one specification, so they can tell you straight away.'],
  ];

  const PRIVATE = [
    'Find an exam centre first. Many centres only accept private candidates for certain boards and specifications, so this often decides the board for you.',
    'Check how the centre handles anything that isn\'t a written exam: science practicals, the English spoken language endorsement, or coursework.',
    'Ask about access arrangements early (for example extra time). Centres usually need evidence well before the entry deadline.',
    'Note the entry deadline. For summer exams it is usually in the winter or early spring before, and late entries cost more.',
    'Choose the tier (Foundation or Higher) when you enter. It can usually be changed until the deadline.',
  ];

  // Common GCSE specification codes: subject, AQA, Edexcel, OCR. '' = not offered or not listed here.
  const CODES = [
    ['Mathematics', '8300', '1MA1', 'J560'],
    ['English Language', '8700', '1EN0 (or 1EN2, English Language 2.0)', 'J351'],
    ['English Literature', '8702', '1ET0', 'J352'],
    ['Biology', '8461', '1BI0', 'J247 (A) / J257 (B)'],
    ['Chemistry', '8462', '1CH0', 'J248 (A) / J258 (B)'],
    ['Physics', '8463', '1PH0', 'J249 (A) / J259 (B)'],
    ['Combined Science', '8464 (Trilogy)', '1SC0', 'J250 (A) / J260 (B)'],
    ['Computer Science', '8525', '1CP2', 'J277'],
    ['History', '8145', '1HI0', 'J410 (A) / J411 (B)'],
    ['Geography', '8035', '1GA0 (A) / 1GB0 (B)', 'J383 (A) / J384 (B)'],
    ['Religious Studies', '8062 (A)', '1RA0 (A) / 1RB0 (B)', 'J625'],
    ['Business', '8132', '1BS0', 'J204'],
    ['Psychology', '8182', '1PS0', ''],
    ['Sociology', '8192', '', ''],
    ['Statistics', '', '1ST0', ''],
  ];

  window.BOARD_GUIDE = { BOARDS, FIND, PRIVATE, CODES };
})();
