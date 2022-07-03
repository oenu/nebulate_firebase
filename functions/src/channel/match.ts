import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import Fuse from "fuse.js";
import {NebulaVideo, YoutubeVideo} from "../types";


const match = functions.https.onRequest(
    async (req: functions.Request, res: functions.Response) => {
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
        const channelSlug = req.body.channelSlug;

        // Check if channelSlug is undefined
        if (channelSlug === undefined) {
          res.status(400).send("channelSlug is undefined");
          return;
        }

        // Check if channel exists
        const channelRef = await admin.firestore().collection("channels")
            .doc(channelSlug);
        if (channelRef === undefined) {
          res.status(400).send("Channel not found");
          return;
        }
        const channelDoc = await channelRef.get();
        const channelData = channelDoc.data();

        if (channelData === undefined) {
          res.status(400).send("Channel data is undefined");
          return;
        } else if (channelData.nebulaVideos === undefined ||
           channelData.nebulaVideos.length === 0) {
          res.status(400).send("No nebula videos yet");
          return;
        } else if (channelData.youtubeVideos === undefined ||
           channelData.youtubeVideos.length === 0) {
          res.status(400).send("No youtube videos yet");
          return;
        }

        // Get youtube Videos
        const youtubeVideosArray: YoutubeVideo[] = channelData.youtubeVideos;
        console.log("youtubeVideosArray: ", youtubeVideosArray[0]);
        // Get nebula Videos
        let nebulaVideosArray: NebulaVideo[] = channelData.nebulaVideos;
        console.log("nebulaVideosArray: ", nebulaVideosArray[0]);


        console.info(
            `Match: Matching ${youtubeVideosArray.length
            } youtube videos against ${nebulaVideosArray.length} nebula videos`
        );
        const fuse = new Fuse(youtubeVideosArray, {
          keys: ["title"],
          threshold: 0.2,
          distance: 20,
          shouldSort: true,
          includeScore: true,
        });

        const matchSets = [];
        for (const nebulaVideo of nebulaVideosArray) {
          if (!nebulaVideo.title) return;

          // Match youtube videos to nebula videos using fuse.js sorted by score
          const youtubeMatches = fuse.search(nebulaVideo.title);

          // if there are matches, add them to the matchSets
          if (youtubeMatches.length > 0) {
            matchSets.push({
              nebulaVideo: nebulaVideo,
              youtubeMatches: youtubeMatches.map(
                  (match) => {
                    return {
                      youtubeVideo: match.item,
                      score: match.score,
                    };
                  }
              ),
            });
          }
        }

        // Filter out empty match sets
        const matchedVideos = matchSets.filter(
            (matchSet) => matchSet.youtubeMatches.length > 0 &&
    matchSet.youtubeMatches[0] !== undefined);

        if (matchedVideos.length === 0) {
          res.status(404).send("No matches found");
          return;
        }

        console.log("matchedVideos: ", matchedVideos[0].youtubeMatches[0]);


        // const existingVideos = existingRef.docs.map(doc => doc.data())
        let matchCounter = 0;
        for (const matchSet of matchedVideos) {
          const {nebulaVideo, youtubeMatches} = matchSet;
          console.log("nebulaVideo: ", nebulaVideo.title);
          for (const match of youtubeMatches) {
            console.log("match: ", match.score);
            const {youtubeVideo, score} = match;
            console.log(score);
            if (!score) {
              console.log("No score");
              continue;
            }

            // Check if any other nebula video is matched to this youtube video
            const hasPreviousMatch = nebulaVideosArray.some((nebulaVideo) => {
              return nebulaVideo.youtubeVideoId === youtubeVideo.youtubeVideoId;
            });

            if (hasPreviousMatch) {
              console.log("has previous match");
              // Compare the scores of the two videos
              const previousMatch = nebulaVideosArray.find( (nebulaVideo) => {
                return nebulaVideo.youtubeVideoId === youtubeVideo.
                    youtubeVideoId;
              }
              );

              if (previousMatch !== undefined && previousMatch.
                  matchStrength !== undefined) {
                console.log("previous match");
                if (previousMatch.matchStrength > score ) {
                // This youtube video is better than the previous match
                // Remove youtube details from the previous match
                  console.log("previous match worse");
                  nebulaVideosArray = nebulaVideosArray.map((x) => (x.
                      nebulaVideoId === previousMatch.nebulaVideoId ? {...x,
                        youtubeVideoId: undefined, matched: false,
                        matchStrength: undefined} : x));
                } else {
                  console.log("previous match better");
                  // This youtube video is worse than the previous match
                  continue;
                }
              }
            }
            // No previous match or this youtube video is better
            // Add youtube details to the nebula video
            console.log("setting match");
            nebulaVideosArray = nebulaVideosArray.map((x) => (x.
                nebulaVideoId === nebulaVideo.nebulaVideoId ? {...x,
                  youtubeVideoId: youtubeVideo.youtubeVideoId,
                  matched: true, matchStrength: score} : x));
            matchCounter++;
          }
        }

        if (matchCounter === 0) {
          res.status(200).send("No new matches found");
          return;
        } else {
          await channelRef.update({
            nebulaVideos: admin.firestore.FieldValue.
                arrayUnion(...nebulaVideosArray),
          });
          res.status(200).send(`Match complete: ${matchCounter} matches added`);
          return;
        }
      } catch (error) {
        if (res.headersSent) res.status(500).send(error);
        console.error(error);
      }
    }
);

export default match;
