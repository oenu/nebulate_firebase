/* eslint-disable @typescript-eslint/no-explicit-any */
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {youtube} from "@googleapis/youtube";
const yt = youtube("v3");

import type {YoutubeVideo} from "../types";


const videoScrapeLimit = 6000;


const youtubeScrape = functions.https.onRequest(
    async (req: functions.Request, res: functions.Response) => {
      // Check for auth
      const functionAuth = req.body.functionAuth;
      if (!functionAuth) {
        res.status(400).send("Missing functionAuth");
        return;
      } else {
        if (functionAuth !== process.env.functionAuth) {
          res.status(401).send("Invalid functionAuth");
          return;
        }
      }

      try {
        const channelSlug = req.body.channelSlug;
        let deepScrape = req.body.deepScrape;
        if (deepScrape === "true") {
          console.log("Deep scrape enabled - string");
          deepScrape = true;
        } else {
          deepScrape = false;
        }

        // Check channel exists
        const channelDoc = await admin.firestore().collection("channels").
            doc(channelSlug).get();
        if (!channelDoc.exists) {
          res.status(400).send("Channel not found");
          return;
        }

        // Get existing videos
        const existingDoc = await admin.firestore().
            collection("channels").doc(channelSlug).
            collection("youtubeVideos").get();
        const existingMap = existingDoc.docs.map((doc:any) => doc.data());


        // Get auth token
        const videoBuffer: any = [];
        let pagetokenBuffer = "";

        console.log(channelDoc.get("uploadPlaylistId"));
        if (channelDoc.get("uploadPlaylistId") === undefined ||
         channelDoc.get("uploadPlaylistId") === null) {
          res.status(400).send("Channel upload id not found");
          return;
        }

        for (let scrapedVideos = 0; scrapedVideos < videoScrapeLimit; ) {
          const pageToken = pagetokenBuffer ? pagetokenBuffer : "";

          // Get the next page of videos
          const response = await yt.playlistItems.list({
            playlistId: channelDoc.get("uploadPlaylistId"),
            auth: process.env.YOUTUBE_API_KEY as string,
            part: ["snippet", "contentDetails", "status", "id"],
            maxResults: videoScrapeLimit,
            pageToken: pageToken,
          });


          if (response.data.items) {
            // Add the videos to the videoBuffer
            const newEpisodes = response.data.items;
            newEpisodes.forEach(() => {
              scrapedVideos++;
            });

            // Set the pagetokenBuffer to the next page token
            if (response.data.nextPageToken) {
              pagetokenBuffer = response?.data?.nextPageToken;
            } else {
              console.debug("youtube: Reached end of page tokens");
              scrapedVideos = videoScrapeLimit * 2;
            }
            /**
           * If deepScrape is true, check if the video
          * is already in the Video collection
          */

            if (deepScrape === false || deepScrape === undefined) {
              console.debug("youtube: Only scraping new videos");

              // Check if the video is already in the collection
              const existingVideoIds = existingMap.map(
                  (existingVideo:any) => existingVideo.youtubeVideoId);
              console.log(`youtube: ${existingVideoIds.length
              } videos already in collection`);


              // Remove the existing videos from the new episodes
              const newVideos = newEpisodes.filter(
                  (video:any) => !existingVideoIds.includes(
                      video.contentDetails.videoId));

              // // If no new videos were found, break the loop
              if (newVideos.length === 0) {
                console.debug(`youtube: No new videos found for ${
                  channelSlug}`);
                break;
              }

              /**
             * If some videos are new and some not, we are at
            * the end of the new videos, so break the loop
            * */
              if (newVideos.length > 0 && newVideos.
                  length < newEpisodes.length) {
                console.debug(
                    // eslint-disable-next-line max-len
                    `youtube: ${newVideos.length} new videos found for: ${channelSlug}`
                );
                videoBuffer.push(...newVideos);
                break;
              }

              // If all videos are new, continue to the next page
              if (newVideos.length === newEpisodes.length) {
                console.debug(
                    `youtube: All new videos found: ${
                      channelSlug}, scraping again`
                );
                videoBuffer.push(...newVideos);
              }
            }

            // If no next page token, break the loop
            if (!response.data.nextPageToken) {
              console.debug(`youtube: No next page token for ${
                channelSlug}`);
              break;
            }
          }
        }
        if (videoBuffer.length === 0) {
          console.error(`youtube: No videos found for ${channelSlug}`);
          res.send("No new videos found for" + channelSlug);
          return;
        }

        // Remove videos that are already in the database


        // Remove undefined videos
        videoBuffer.filter((video:any) => video !== undefined ||
        video !== null);


        const convertedVideos = videoBuffer.map(
            (video: any): YoutubeVideo => {
              return {
                youtubeVideoId: video.contentDetails.videoId,
                publishedAt: new Date(video.contentDetails.videoPublishedAt),
                playlistId: video.snippet.playlistId,
                channelTitle: video.snippet.channelTitle,
                title: video.snippet.title,
                channelId: video.snippet.channelId,
                etag: video.etag,
                status: video.status.privacyStatus,
                channelSlug: channelSlug,
              };
            }
        );
        console.debug(
            `nebula: Found ${convertedVideos.length} Nebula videos for ${
              channelSlug} with a limit of ${videoScrapeLimit}`
        );

        // Add the videos to the database
        const batch = admin.firestore().batch();
        const channelRef = admin.firestore()
            .collection("channels").doc(channelSlug);

        // Add videos to channel collections
        convertedVideos.forEach(async (video: any) => {
          const videoRef = channelRef.
              collection("youtubeVideos").doc(video.youtubeVideoId);
          batch.create(videoRef, video);
        });

        batch.update(channelRef, {
          lastScrapedYoutube: new Date(),
        });

        await batch.commit();
        console.debug(`youtube: Added ${
          convertedVideos.length} videos to ${
          channelSlug}`);

        res.send(`Scraped ${convertedVideos.
            length} videos for ${channelSlug}`);
        return;
      } catch (error) {
        if (!res.headersSent) {
          res.status(400).send(error);
          return;
        }
        return;
      }
    });


export default youtubeScrape;
