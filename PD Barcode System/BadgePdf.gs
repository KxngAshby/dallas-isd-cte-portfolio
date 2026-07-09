/**
 * Generates printable Dallas ISD CTE staff badges as a PDF.
 *
 * Reads the "Staff Barcodes" sheet, builds a Google Slides deck
 * (4 badges per slide), exports as PDF, and saves both to the
 * same Drive folder as the active spreadsheet.
 *
 * Run "Build Staff Barcodes" first so the source sheet is current.
 */

const BADGE_SHEET_NAME = 'Staff Barcodes';

const BADGE_HEADER_TEXT = 'DALLAS INDEPENDENT SCHOOL DISTRICT';
const BADGE_SUBHEADER_TEXT = 'Career and Technical Education';

const BADGE_COLOR_NAVY = '#0B2C66';
const BADGE_COLOR_RED = '#B22234';
const BADGE_COLOR_WHITE = '#FFFFFF';
const BADGE_COLOR_BORDER = '#9CA3AF';
const BADGE_COLOR_NAME = '#111111';
const BADGE_COLOR_ID = '#4B5563';

const BADGE_PER_SLIDE = 4;
const BADGE_GRID_COLS = 2;
const BADGE_GRID_ROWS = 2;

/**
 * Menu entry point.
 */
function buildStaffBadgesPdf() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(BADGE_SHEET_NAME);

  if (!sheet || sheet.getLastRow() < 2) {
    ui.alert('Staff Barcodes sheet is empty. Run "Build Staff Barcodes" first.');
    return;
  }

  const badges = readBadgeRecords_(sheet);
  if (badges.length === 0) {
    ui.alert('No badge-eligible rows found in Staff Barcodes.');
    return;
  }

  const result = generateBadgeDeckAndPdf_(ss, badges);

  ui.alert(
    'Staff badge PDF generated.\n\n' +
    'Badges: ' + badges.length + '\n' +
    'Slides: ' + result.slideCount + '\n\n' +
    'PDF: ' + result.pdfUrl + '\n' +
    'Editable Slides: ' + result.slidesUrl
  );
}

function readBadgeRecords_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headerMap = getHeaderMap_(values[0]);
  const records = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const staffId = String(getRowValue_(row, headerMap, ['staffid', 'barcodevalue']) || '').trim();
    const lastName = String(getRowValue_(row, headerMap, ['lastname']) || '').trim();
    const firstName = String(getRowValue_(row, headerMap, ['firstname']) || '').trim();
    const department = String(getRowValue_(row, headerMap, ['department', 'cluster']) || '').trim();

    if (!staffId) continue;
    if (!firstName && !lastName) continue;

    records.push({
      staffId: staffId,
      displayName: [firstName, lastName].filter(Boolean).join(' '),
      department: department || BADGE_SUBHEADER_TEXT
    });
  }

  records.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return records;
}

function generateBadgeDeckAndPdf_(ss, badges) {
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH-mm');
  const presentationName = 'PD Staff Badges - ' + timestamp;

  const presentation = SlidesApp.create(presentationName);
  const presentationId = presentation.getId();

  const slideWidth = presentation.getPageWidth();
  const slideHeight = presentation.getPageHeight();
  const badgeWidth = slideWidth / BADGE_GRID_COLS;
  const badgeHeight = slideHeight / BADGE_GRID_ROWS;

  const initialSlides = presentation.getSlides();

  let slideIndex = 0;
  for (let i = 0; i < badges.length; i += BADGE_PER_SLIDE) {
    const slide = slideIndex === 0
      ? initialSlides[0]
      : presentation.appendSlide(SlidesApp.PredefinedLayout.BLANK);

    if (slideIndex === 0) {
      clearSlide_(slide);
    }

    for (let j = 0; j < BADGE_PER_SLIDE; j++) {
      const badgeIndex = i + j;
      if (badgeIndex >= badges.length) break;

      const col = j % BADGE_GRID_COLS;
      const row = Math.floor(j / BADGE_GRID_COLS);
      drawBadge_(slide, badges[badgeIndex], col * badgeWidth, row * badgeHeight, badgeWidth, badgeHeight);
    }

    slideIndex++;
  }

  presentation.saveAndClose();

  const slidesFile = DriveApp.getFileById(presentationId);
  const pdfBlob = slidesFile.getAs('application/pdf').setName(presentationName + '.pdf');

  const ssFile = DriveApp.getFileById(ss.getId());
  const parents = ssFile.getParents();
  const folder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  const pdfFile = folder.createFile(pdfBlob);

  try {
    folder.addFile(slidesFile);
    DriveApp.getRootFolder().removeFile(slidesFile);
  } catch (err) {
    // Non-fatal: slides file remains in My Drive root if move fails.
  }

  return {
    pdfUrl: pdfFile.getUrl(),
    slidesUrl: slidesFile.getUrl(),
    slideCount: slideIndex
  };
}

function clearSlide_(slide) {
  const elements = slide.getPageElements();
  for (let i = 0; i < elements.length; i++) {
    elements[i].remove();
  }
}

function drawBadge_(slide, badge, x, y, width, height) {
  const pad = 6;
  const headerH = 26;
  const subHeaderH = 20;
  const deptH = 18;
  const barcodeH = 60;
  const idH = 14;

  const innerX = x + pad;
  const innerW = width - pad * 2;

  const border = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, x + 4, y + 4, width - 8, height - 8);
  border.getFill().setTransparent();
  border.getBorder().getLineFill().setSolidFill(BADGE_COLOR_BORDER);
  border.getBorder().setWeight(0.75);

  let cursorY = y + pad + 4;

  const header = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, innerX, cursorY, innerW, headerH);
  header.getFill().setSolidFill(BADGE_COLOR_NAVY);
  header.getBorder().setTransparent();
  styleShapeText_(header, BADGE_HEADER_TEXT, {
    color: BADGE_COLOR_WHITE,
    bold: true,
    size: 10,
    alignment: SlidesApp.ParagraphAlignment.CENTER
  });
  cursorY += headerH;

  const sub = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, innerX, cursorY, innerW, subHeaderH);
  sub.getFill().setSolidFill(BADGE_COLOR_RED);
  sub.getBorder().setTransparent();
  styleShapeText_(sub, BADGE_SUBHEADER_TEXT, {
    color: BADGE_COLOR_WHITE,
    bold: true,
    italic: true,
    size: 9,
    alignment: SlidesApp.ParagraphAlignment.CENTER
  });
  cursorY += subHeaderH + 6;

  const nameH = (y + height - pad) - cursorY - deptH - barcodeH - idH - 6;
  const name = slide.insertTextBox(badge.displayName, innerX, cursorY, innerW, nameH);
  styleShapeText_(name, badge.displayName, {
    color: BADGE_COLOR_NAME,
    bold: true,
    size: 18,
    alignment: SlidesApp.ParagraphAlignment.CENTER
  });
  cursorY += nameH;

  const dept = slide.insertTextBox(badge.department.toUpperCase(), innerX, cursorY, innerW, deptH);
  styleShapeText_(dept, badge.department.toUpperCase(), {
    color: BADGE_COLOR_RED,
    bold: true,
    size: 10,
    alignment: SlidesApp.ParagraphAlignment.CENTER
  });
  cursorY += deptH + 2;

  const barcode = slide.insertTextBox('*' + badge.staffId + '*', innerX, cursorY, innerW, barcodeH);
  styleShapeText_(barcode, '*' + badge.staffId + '*', {
    color: BADGE_COLOR_NAME,
    fontFamily: 'Libre Barcode 39',
    size: 36,
    alignment: SlidesApp.ParagraphAlignment.CENTER
  });
  cursorY += barcodeH;

  const idLabel = slide.insertTextBox('ID ' + badge.staffId, innerX, cursorY, innerW, idH);
  styleShapeText_(idLabel, 'ID ' + badge.staffId, {
    color: BADGE_COLOR_ID,
    size: 8,
    alignment: SlidesApp.ParagraphAlignment.CENTER
  });
}

function styleShapeText_(shape, text, opts) {
  const range = shape.getText();
  range.setText(text);

  const textStyle = range.getTextStyle();
  if (opts.color) textStyle.setForegroundColor(opts.color);
  if (opts.bold !== undefined) textStyle.setBold(opts.bold);
  if (opts.italic !== undefined) textStyle.setItalic(opts.italic);
  if (opts.size) textStyle.setFontSize(opts.size);
  if (opts.fontFamily) textStyle.setFontFamily(opts.fontFamily);

  if (opts.alignment) {
    const paragraphs = range.getParagraphs();
    for (let i = 0; i < paragraphs.length; i++) {
      paragraphs[i].getRange().getParagraphStyle().setParagraphAlignment(opts.alignment);
    }
  }
}
