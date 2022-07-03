import * as functions from "firebase-functions";
import {Octokit,
  // App
} from "octokit";
import Base64 from "js-base64";
import crypto from "crypto";

// import axios from "axios";
// import {LookupTable} from "./generateTable";
// https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents


// import {LookupTable} from "./generateTable";

const uploadTable = functions.https.onRequest(async (
    req: functions.Request, res: functions.Response) => {
  // Check for auth
  const functionAuth = req.body.functionAuth;
  if (!functionAuth) {
    res.status(400).send("Missing functionAuth");
    return;
  } else {
    if (functionAuth !== process.env.FUNCTION_AUTH) {
      res.status(401).send("Invalid functionAuth");
      return;
    }
  }
  try {
    const octokit = new Octokit({
      auth: process.env.HOST_TOKEN,
    });

    const table = {
      matched: ["thing1", "thing2", "thing3"],
      not_matched: [""],
      id: "string2",
    };

    // Generate the a string version of the table
    const tableString = JSON.stringify(table);

    // Generate base64 encoded string for transmission
    const encoded = Base64.encode(tableString);

    // Get byte length of string
    const length = (new TextEncoder().encode(tableString)).length;
    // Combine with git properties to create SHA1
    const fullString = `blob ${length}\0` + tableString;
    const hash = crypto.createHash("sha1").
        update(fullString).digest("hex");

    // Get the current file
    const currentTable = await octokit.rest.repos.getContent({
      owner: "oenu",
      repo: "lookup-table",
      path: "lookup-table.json",
    });
    console.log("Current table fetched");


    if ("content" in currentTable.data) {
      console.log(currentTable.data.sha, hash);
      if (currentTable.data.sha === hash) {
        console.log("No change");
        res.send("No change");
        return;
      }
      console.log("sending new table");
      const newTable = await octokit.rest.repos.createOrUpdateFileContents({
        owner: "oenu",
        repo: "lookup-table",
        path: "lookup-table.json",
        message: "Update lookup table",
        content: encoded,
        sha: currentTable.data.sha,
      });

      if (newTable.status === 200) {
        console.log("Table updated");
        res.send("Table updated");
      }
      console.log(newTable);
    } else {
      console.log("sending new table");
      const newTable = await octokit.rest.repos.createOrUpdateFileContents({
        owner: "oenu",
        repo: "lookup-table",
        path: "lookup-table.json",
        message: "Update lookup table",
        content: encoded,
      });

      if (newTable.status === 201) {
        res.status(200).send("Table sent");
        return;
      } else {
        res.status(500).send("Error sending table");
        return;
      }
    }
  } catch (e) {
    console.log(e);
    res.status(500).send("Error sending table");
    return;
  }
  if (!res.headersSent) res.send("catch");
  return;
});


export default uploadTable;
