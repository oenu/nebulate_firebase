import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import Fuse from "fuse.js";


const match = functions.https.onRequest(
    async (req: functions.Request, res: functions.Response) => {
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

        // Get youtube Videos
        const youtubeVideos = await channelRef.collection("youtubeVideos")
            .get();
        const youtubeVideosArray = youtubeVideos.docs.map((doc) => doc.data());

        // Get nebula Videos
        const nebulaVideos = await channelRef.collection("nebulaVideos").get();
        const nebulaVideosArray = nebulaVideos.docs.map((doc) => doc.data());

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

        const existingRef = await admin.firestore().collection("channels").
            doc(channelSlug).collection("nebulaVideos");
        // const existingVideos = existingRef.docs.map(doc => doc.data())
        let matchCounter = 0;
        for (const matchSet of matchedVideos) {
          const {nebulaVideo, youtubeMatches} = matchSet;

          for (const match of youtubeMatches) {
            const {youtubeVideo, score} = match;
            if (!score) continue;

            // Check if any other nebula video is matched to this youtube video
            const snapshot = await existingRef.where("youtubeVideoId", "==",
                youtubeVideo.youtubeVideoId).get();
            if (snapshot.empty) {
            // If no other nebula video is matched to this youtube video,
            // add it to the database
              const videoRef = existingRef.doc(nebulaVideo.nebulaVideoId);
              await videoRef.update({youtubeVideoId: youtubeVideo.
                  youtubeVideoId, matchStrength: score, matched: true});
              matchCounter++;
            } else {
            // If another nebula video is matched to this youtube video, compare
            // the scores and update the database if the new score is lower
              const videoRef = existingRef.doc(nebulaVideo.nebulaVideoId);
              const existingVideo = snapshot.docs[0].data();
              if (existingVideo.matchStrength > score) {
                await videoRef.update({youtubeVideoId: youtubeVideo.
                    youtubeVideoId, matchStrength: score, matched: true});
                matchCounter++;
              }
            }
          }
        }

        console.info(`Match: ${matchCounter} matches added`);
        res.status(200).send(`Match complete: ${matchCounter} matches added`);
      } catch (error) {
        if (res.headersSent) res.status(500).send(error);
        console.error(error);
      }
    }
);

export default match;
