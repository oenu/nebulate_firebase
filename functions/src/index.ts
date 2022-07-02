
// Register Channel
import register = require("./channel/register");

// Scrape Nebula videos
import scrapeNebula = require("./scrape/nebula");

// Scrape YouTube videos
import scrapeYoutube = require("./scrape/youtube");

// Match videos
import match = require("./channel/match");

// Generate lookup table
import generateTable = require("./lookup/generateTable");

// Exports
exports.register = register;
exports.scrapeNebula = scrapeNebula;
exports.scrapeYoutube = scrapeYoutube;
exports.match = match;
exports.generateTable = generateTable;
