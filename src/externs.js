/**
 * @typedef {Object} tesseract_
 * @property {(Object) => *} setParameters
 * @property {(image: *, options: *, output: *) => Promise<Object>} recognize
 */

/** @type {Object} */
var Tesseract = {};
/** @return {Promise<tesseract_>} */
Tesseract.createWorker = function(lang, oem, config) {};
Tesseract.OEM = {};
Tesseract.PSM = {};
