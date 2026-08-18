/**
 * @typedef {{
 *   x0: number,
 *   y0: number,
 *   x1: number,
 *   y1: number
 * }}
 */
var tesseract_bbox;

/**
 * @typedef {{
 *   text: string,
 *   confidence: number,
 *   bbox: tesseract_bbox
 * }}
 */
var tesseract_symbol;

/**
 * @typedef {{
 *   text: string,
 *   confidence: number,
 *   bbox: tesseract_bbox,
 *   symbols: Array<tesseract_symbol>
 * }}
 */
var tesseract_word;

/**
 * @typedef {{
 *   words: Array<tesseract_word>
 * }}
 */
var tesseract_line;

/**
 * @typedef {{
 *   lines: Array<tesseract_line>
 * }}
 */
var tesseract_paragraph;

/**
 * @typedef {{
 *   paragraphs: Array<tesseract_paragraph>
 * }}
 */
var tesseract_block;

/**
 * @typedef {{
 *   blocks: Array<tesseract_block>
 * }}
 */
var tesseract_data;

/**
 * @typedef {{
 *   setParameters: function(Object): *,
 *   recognize: function(*, *, *): !Promise<{data: tesseract_data}>
 * }}
 */
var tesseract_object;

/**
 * @typedef {{
 *   createWorker: function(*, *, *): !Promise<!tesseract_object>,
 *   OEM: Object,
 *   PSM: Object,
 * }}
 */
var Tesseract;
