/**
 * @typedef {{
 *   setParameters: function(Object): *,
 *   recognize: function(*, *, *): !Promise<!Object>
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
