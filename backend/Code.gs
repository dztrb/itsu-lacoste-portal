/**
 * ITSU LACOSTE VERIFICATION & COLLECTION PORTAL
 * Main Entry Point (Web App Controller)
 * Takoradi Technical University - Department of Computer Science
 */

/**
 * Handles HTTP GET requests to serve the web application
 */
function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');
  
  // Set parameters if needed
  template.initialView = (e && e.parameter && e.parameter.view) ? e.parameter.view : 'portal';

  const output = template.evaluate();
  output.setTitle('lacoste verification');
  output.addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
  output.addMetaTag('theme-color', '#1E40AF');
  output.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  return output;
}

/**
 * Helper function to include HTML sub-files
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

