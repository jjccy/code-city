/**
 * Mocha setup: registers ts-node and intercepts the 'vscode' module
 * so game logic can be tested without a live VS Code instance.
 */
const path = require('path');

// 1. Register ts-node so mocha can load .ts files directly
require('ts-node').register({ project: path.join(__dirname, '..', 'tsconfig.test.json') });

// 2. Intercept 'vscode' imports → redirect to our mock
const Module = require('module');
const original = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'vscode') {
    return path.join(__dirname, 'vscode.mock.ts');
  }
  return original.call(this, request, parent, isMain, options);
};
