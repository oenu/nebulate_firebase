
import {initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
initializeApp();

export const db = getFirestore();


// Register Channel
import register = require("./channel/register");

// Scrape Nebula videos
import scrapeNebula = require("./scrape/nebula");

// Scrape YouTube videos
import scrapeYoutube = require("./scrape/youtube");

// Match videos
import match = require("./channel/match");

// Exports
exports.register = register;
exports.scrapeNebula = scrapeNebula;
exports.scrapeYoutube = scrapeYoutube;
exports.match = match;
